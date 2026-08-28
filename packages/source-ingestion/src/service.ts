import type { SourceIngestionConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import { recordIngestionItems } from "@knownpath/observability";
import { type IngestionCounters, type IngestionRun, type SourceRegistry } from "@knownpath/domain";

import { discoverOfficialSource } from "./discovery.js";
import { SafeSourceHttpClient } from "./http-client.js";
import {
  loadSourceManifest,
  selectOfficialSources,
  type DocumentationSourceDefinition,
  type OfficialSourceDefinition,
  type ReleaseFeedSourceDefinition,
} from "./manifest.js";
import { normalizeFeedDocument, normalizeMarkdownDocument, selectCandidates } from "./parsers.js";
import {
  createOfficialIngestionRun,
  ensureOfficialSourceRegistry,
  findOfficialSourceRegistry,
} from "./registry-store.js";
import { createDocumentMetadata, createDocumentSnapshot } from "./snapshots.js";
import {
  persistSourceItemState,
  persistUnchangedState,
  validatorsFromState,
} from "./state-store.js";
import type {
  NormalizedSourceDocument,
  OfficialSourceCollectionResult,
  SafeFetchResult,
  SourceCandidate,
  SourceIngestionLogger,
  SourceIngestionRequest,
} from "./types.js";

const MANIFEST_VERSION = "2";

interface MutableCounters extends IngestionCounters {
  [name: string]: number;
}

export class OfficialSourceIngestionService {
  private readonly http: SafeSourceHttpClient;
  private activeCounters: MutableCounters | undefined;

  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly config: SourceIngestionConfig,
    private readonly logger: SourceIngestionLogger,
    private readonly signal?: AbortSignal,
  ) {
    this.http = new SafeSourceHttpClient(config, logger, signal, () => {
      if (this.activeCounters !== undefined) this.activeCounters.rateLimited += 1;
    });
  }

  public async run(request: SourceIngestionRequest): Promise<OfficialSourceCollectionResult[]> {
    const manifest = await loadSourceManifest(this.config.sourceRegistryPath);
    const sources = selectOfficialSources(manifest, request);
    const results: OfficialSourceCollectionResult[] = [];
    for (const source of sources) results.push(await this.collectSource(source, request));
    return results;
  }

  private async collectSource(
    source: OfficialSourceDefinition,
    request: SourceIngestionRequest,
  ): Promise<OfficialSourceCollectionResult> {
    const counters = createCounters();
    this.activeCounters = counters;
    let registry = await findOfficialSourceRegistry(this.database, source);
    let run: IngestionRun | null = null;
    let stage = "source-validation";

    try {
      this.signal?.throwIfAborted();
      const mutating = request.action === "sync" && !request.dryRun;
      if (mutating) {
        registry = await ensureOfficialSourceRegistry(this.database, source);
        await this.database.repositories.sourceRegistries.recordAttempt(registry._id, new Date());
        run = await createOfficialIngestionRun(this.database, registry, source, request, counters);
        const started = await this.database.repositories.ingestionRuns.start(run._id);
        if (started === null)
          throw new Error("Official source run could not transition to running");
        run = started;
      }

      await this.assertSourcePolicy(source);
      stage = "discovery";
      const discovery = await discoverOfficialSource(
        this.database,
        this.http,
        source,
        registry,
        mutating,
      );
      counters.discovered = discovery.candidates.length;
      const selected = selectCandidates(source, discovery.candidates, request);
      counters["selected"] = selected.length;

      this.logger.info("Official source discovery completed", {
        source: source.key,
        adapter: source.adapter,
        discovered: counters.discovered,
        selected: selected.length,
        scope: request.scope,
        page: request.page === undefined ? undefined : safeUrl(request.page),
        version: request.version,
      });

      if (request.action === "discover") {
        return { counters, registry, source };
      }

      stage = "items";
      if (source.adapter === "documentation_site") {
        await this.syncDocumentationItems(source, registry, selected, request.dryRun, counters);
        if (
          mutating &&
          registry !== null &&
          discovery.authoritativeChanged &&
          request.page === undefined &&
          request.version === undefined
        ) {
          await this.markMissingDocumentationDeleted(
            registry,
            new Set(discovery.candidates.map((candidate) => candidate.sourceIdentity)),
            counters,
          );
        }
      } else {
        await this.syncFeedItems(
          source,
          registry,
          selected,
          discovery.feedContents,
          request.dryRun,
          counters,
        );
      }

      if (counters.failed > 0) throw new Error("One or more official source items failed");

      if (mutating && registry !== null && run !== null) {
        stage = "persisting-cursor";
        const completedAt = new Date();
        await this.database.repositories.sourceRegistries.recordSuccess(registry._id, completedAt, {
          ...(registry.cursor ?? {}),
          "official.lastDiscoveryAt": completedAt.toISOString(),
          "official.candidateCount": String(discovery.candidates.length),
          "official.manifestVersion": MANIFEST_VERSION,
        });
        const completed = await this.database.repositories.ingestionRuns.succeed(run._id, counters);
        if (completed === null)
          throw new Error("Official source run could not transition to succeeded");
      }

      this.logger.info("Official source synchronization completed", {
        source: source.key,
        dryRun: request.dryRun,
        counters,
      });
      return { counters, registry, source };
    } catch (error) {
      if (counters.failed === 0) counters.failed = 1;
      if (run !== null) {
        await this.database.repositories.ingestionRuns.fail(run._id, counters, {
          code: "official_source_failed",
          message: `Official source ingestion failed during ${stage}`,
          retryable: isRetryable(error),
        });
      }
      this.logger.error("Official source ingestion failed", {
        source: source.key,
        adapter: source.adapter,
        stage,
        code: "official_source_failed",
        retryable: isRetryable(error),
      });
      throw error;
    } finally {
      recordCounters(counters);
      this.activeCounters = undefined;
    }
  }

  private async assertSourcePolicy(source: OfficialSourceDefinition): Promise<void> {
    const targetUrls =
      source.adapter === "documentation_site"
        ? [source.indexUrl, ...(source.sitemapUrl === undefined ? [] : [source.sitemapUrl])]
        : [source.feedUrl];
    await this.http.assertRobotsAllowed(source.robotsUrl, targetUrls, source.allowedOrigins);
  }

  private async syncDocumentationItems(
    source: DocumentationSourceDefinition,
    registry: SourceRegistry | null,
    candidates: readonly SourceCandidate[],
    dryRun: boolean,
    counters: MutableCounters,
  ): Promise<void> {
    for (const candidate of candidates) {
      try {
        this.signal?.throwIfAborted();
        const state =
          registry === null
            ? null
            : await this.database.repositories.sourceItemStates.findBySourceIdentity(
                registry._id,
                candidate.sourceIdentity,
              );
        const result = await this.http.getText(candidate.fetchUrl, {
          allowedContentTypes: ["text/markdown", "text/plain"],
          allowedOrigins: source.allowedOrigins,
          allowedPathPrefixes: source.allowedPathPrefixes,
          ...(state === null ? {} : { validators: validatorsFromState(state) }),
        });
        if (result.notModified) {
          counters.unchanged += 1;
          if (!dryRun && state !== null) {
            await persistUnchangedState(this.database, state, result, new Date());
          }
          continue;
        }
        if (result.body === undefined) throw new Error("Documentation page returned no body");
        const document = normalizeMarkdownDocument(candidate, result.body);
        await this.persistDocument(source, registry, document, result, dryRun, counters);
      } catch (error) {
        counters.failed += 1;
        this.logger.warn("Official documentation item failed", {
          source: source.key,
          identity: candidate.sourceIdentity,
          url: safeUrl(candidate.canonicalUrl),
          code: "document_item_failed",
        });
        if (this.signal?.aborted === true) throw error;
      }
    }
  }

  private async syncFeedItems(
    source: ReleaseFeedSourceDefinition,
    registry: SourceRegistry | null,
    candidates: readonly SourceCandidate[],
    contents: ReadonlyMap<string, string>,
    dryRun: boolean,
    counters: MutableCounters,
  ): Promise<void> {
    for (const candidate of candidates) {
      try {
        const rawContent = contents.get(candidate.sourceIdentity);
        if (rawContent === undefined) throw new Error("Selected feed entry content is missing");
        const document = normalizeFeedDocument(candidate, rawContent, source.contentPolicy);
        const syntheticResult: SafeFetchResult = {
          finalUrl: source.feedUrl,
          notModified: false,
          status: 200,
        };
        await this.persistDocument(source, registry, document, syntheticResult, dryRun, counters);
      } catch (error) {
        counters.failed += 1;
        this.logger.warn("Official release-feed item failed", {
          source: source.key,
          identity: candidate.sourceIdentity,
          url: safeUrl(candidate.canonicalUrl),
          code: "feed_item_failed",
        });
        if (this.signal?.aborted === true) throw error;
      }
    }
  }

  private async persistDocument(
    source: OfficialSourceDefinition,
    registry: SourceRegistry | null,
    document: NormalizedSourceDocument,
    result: SafeFetchResult,
    dryRun: boolean,
    counters: MutableCounters,
  ): Promise<void> {
    const fetchedAt = new Date();
    const documentMetadata = createDocumentMetadata(source, document.candidate);
    if (dryRun || registry === null) {
      counters["wouldPersist"] = (counters["wouldPersist"] ?? 0) + 1;
      return;
    }
    const state = await this.database.repositories.sourceItemStates.findBySourceIdentity(
      registry._id,
      document.candidate.sourceIdentity,
    );
    const snapshot = createDocumentSnapshot(
      registry,
      source,
      document,
      documentMetadata,
      result,
      fetchedAt,
    );
    const changed = state?.contentDigest !== snapshot.deduplicationKey.value;
    let latestSourceItemId = state?.latestSourceItemId;
    if (changed) {
      const inserted = await this.database.repositories.sourceItems.createIfAbsent(snapshot);
      const persisted =
        inserted ??
        (await this.database.repositories.sourceItems.findByDeduplicationKey(
          snapshot.deduplicationKey,
        ));
      if (persisted === null) throw new Error("Official source snapshot was not persisted");
      latestSourceItemId = persisted._id;
      if (state === null) counters.created += 1;
      else counters.updated += 1;
    } else {
      counters.unchanged += 1;
    }
    await persistSourceItemState(this.database, {
      previous: state,
      registry,
      identity: document.candidate.sourceIdentity,
      canonicalUrl: document.candidate.canonicalUrl,
      itemType: source.adapter === "documentation_site" ? "documentation_page" : "release_note",
      lifecycleStatus: "active",
      fetchedAt,
      result,
      ...(latestSourceItemId === undefined ? {} : { latestSourceItemId }),
      contentDigest: snapshot.deduplicationKey.value,
      ...(document.candidate.observedRevision === undefined
        ? {}
        : { observedRevision: document.candidate.observedRevision }),
      sourceQuality: source.sourceQuality,
      documentMetadata,
      changed,
    });
  }

  private async markMissingDocumentationDeleted(
    registry: SourceRegistry,
    discoveredIdentities: ReadonlySet<string>,
    counters: MutableCounters,
  ): Promise<void> {
    const states = await this.database.repositories.sourceItemStates.listByRegistry(registry._id);
    const now = new Date();
    for (const state of states) {
      if (
        state.sourceItemIdentity.startsWith("catalog:") ||
        state.itemType !== "documentation_page" ||
        state.lifecycleStatus === "deleted" ||
        discoveredIdentities.has(state.sourceItemIdentity)
      ) {
        continue;
      }
      await this.database.repositories.sourceItemStates.upsert({
        ...state,
        lifecycleStatus: "deleted",
        lastObservedAt: now,
        audit: { ...state.audit, updatedAt: now },
      });
      counters["deleted"] = (counters["deleted"] ?? 0) + 1;
    }
  }
}

function createCounters(): MutableCounters {
  return { discovered: 0, created: 0, updated: 0, unchanged: 0, failed: 0, rateLimited: 0 };
}

function recordCounters(counters: IngestionCounters): void {
  for (const state of ["discovered", "created", "updated", "unchanged", "failed"] as const) {
    recordIngestionItems("official_docs", state, counters[state]);
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  return error instanceof TypeError;
}

function safeUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}
