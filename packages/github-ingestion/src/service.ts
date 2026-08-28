import type { GitHubConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import { recordIngestionItems } from "@knownpath/observability";
import {
  createIngestionRunId,
  createSourceRegistryId,
  createVersionedKey,
  normalizeUrl,
  type IngestionCounters,
  type IngestionRun,
  type SourceRegistry,
} from "@knownpath/domain";

import { createGitHubClient } from "./client.js";
import { collectDiscussions } from "./discussion-collector.js";
import { GitHubIngestionError, normalizeGitHubError } from "./errors.js";
import { GitHubGraphQlClient } from "./graphql-client.js";
import { collectIssues } from "./issue-collector.js";
import { loadGitHubSourceManifest, selectGitHubSources } from "./manifest.js";
import { createSourceItemSnapshot } from "./normalize.js";
import { GitHubRestClient } from "./rest-client.js";
import type {
  GitHubIngestionLogger,
  GitHubIngestionRequest,
  GitHubRepositoryIdentity,
  GitHubSourceDefinition,
  GitHubSourceType,
  NormalizedGitHubObject,
  SourceCollectionResult,
} from "./types.js";

const FAILURE_THRESHOLD = 10;

export class GitHubIngestionService {
  private activeCounters: MutableCounters | undefined;
  private readonly graphql: GitHubGraphQlClient | undefined;
  private readonly rest: GitHubRestClient;

  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly config: GitHubConfig,
    private readonly logger: GitHubIngestionLogger,
    private readonly signal?: AbortSignal,
  ) {
    const client = createGitHubClient({
      config,
      logger,
      onRateLimited: () => {
        if (this.activeCounters !== undefined) this.activeCounters.rateLimited += 1;
      },
      ...(signal === undefined ? {} : { signal }),
    });
    this.rest = new GitHubRestClient(client, config);
    this.graphql = config.token === undefined ? undefined : new GitHubGraphQlClient(client, logger);
  }

  public async run(request: GitHubIngestionRequest): Promise<SourceCollectionResult[]> {
    const manifest = await loadGitHubSourceManifest(this.config.sourceRegistryPath);
    const sources = selectGitHubSources(manifest, request);
    const results: SourceCollectionResult[] = [];
    for (const source of sources) results.push(await this.collectSource(source, request));
    return results;
  }

  private async collectSource(
    source: GitHubSourceDefinition,
    request: GitHubIngestionRequest,
  ): Promise<SourceCollectionResult> {
    const selectedTypes = selectTypes(source, request.types);
    const counters = createCounters();
    this.activeCounters = counters;
    let registry: SourceRegistry | null = null;
    let run: IngestionRun | null = null;
    let stage = "repository-discovery";

    try {
      this.signal?.throwIfAborted();
      if (!request.dryRun) {
        registry = await this.ensureRegistry(source);
        await this.database.repositories.sourceRegistries.recordAttempt(registry._id, new Date());
        run = await this.createRun(registry, source, selectedTypes, request, counters);
        const started = await this.database.repositories.ingestionRuns.start(run._id);
        if (started === null) throw new Error("Ingestion run could not transition to running");
        run = started;
      }

      const repository = await this.rest.getRepository(source.owner, source.repositoryName);
      verifyRepository(source, repository, selectedTypes);
      this.logger.info("GitHub source capabilities verified", {
        source: source.key,
        repository: repository.nameWithOwner,
        authenticated: this.config.token !== undefined,
        types: selectedTypes,
      });

      const cursor = { ...(registry?.cursor ?? {}) };
      if (request.dryRun) {
        await this.discoverOnly(source, repository, selectedTypes, request, counters, cursor);
      } else {
        if (registry === null || run === null)
          throw new Error("Ingestion persistence was not initialized");
        if (selectedTypes.includes("issues")) {
          stage = "issues";
          const since = resolveSince(
            source,
            cursor,
            "issues",
            request,
            this.config.incrementalOverlapMs,
          );
          const issueResult = await collectIssues({
            rest: this.rest,
            ...(this.graphql === undefined ? {} : { graphql: this.graphql }),
            source,
            repository,
            since,
            ...(request.until === undefined ? {} : { until: request.until }),
            limit: request.limit,
            ...(request.backfill ? {} : { etag: cursor["github.issues.etag"] }),
            ...(request.backfill ? {} : { etagSince: cursor["github.issues.etagSince"] }),
            onObject: async (object) => this.persistObject(registry!, object, counters),
            onFailure: async (error, identity) =>
              this.recordObjectFailure(error, identity, counters),
          });
          counters["issues"] = (counters["issues"] ?? 0) + issueResult.topLevelCount;
          if (issueResult.conditionalNotModified) {
            counters["conditionalNotModified"] = (counters["conditionalNotModified"] ?? 0) + 1;
            counters.unchanged += parseCursorInteger(cursor["github.issues.etagObjectCount"]);
          } else {
            if (issueResult.etag !== undefined) {
              cursor["github.issues.etag"] = issueResult.etag;
              cursor["github.issues.etagSince"] = since.toISOString();
              cursor["github.issues.etagObjectCount"] = String(issueResult.observedObjectCount);
            }
            advanceCursor(cursor, "issues", issueResult.maxUpdatedAt);
          }
        }

        if (selectedTypes.includes("discussions")) {
          stage = "discussions";
          if (this.graphql === undefined) {
            counters["capabilitySkipped"] = (counters["capabilitySkipped"] ?? 0) + 1;
            this.logger.warn(
              "GitHub Discussions collection skipped because GITHUB_TOKEN is absent",
              {
                source: source.key,
                repository: source.repository,
              },
            );
          } else {
            const since = resolveSince(
              source,
              cursor,
              "discussions",
              request,
              this.config.incrementalOverlapMs,
            );
            const discussionResult = await collectDiscussions({
              graphql: this.graphql,
              source,
              repository,
              since,
              ...(request.until === undefined ? {} : { until: request.until }),
              limit: request.limit,
              onObject: async (object) => this.persistObject(registry!, object, counters),
              onFailure: async (error, identity) =>
                this.recordObjectFailure(error, identity, counters),
            });
            counters["discussions"] =
              (counters["discussions"] ?? 0) + discussionResult.topLevelCount;
            advanceCursor(cursor, "discussions", discussionResult.maxUpdatedAt);
          }
        }

        if (counters.failed > 0) {
          throw new GitHubIngestionError(
            "One or more GitHub objects failed validation or collection",
            "github_objects_failed",
            true,
          );
        }

        stage = "persisting-cursor";
        await this.database.repositories.sourceRegistries.recordSuccess(
          registry._id,
          new Date(),
          cursor,
        );
        const completed = await this.database.repositories.ingestionRuns.succeed(run._id, counters);
        if (completed === null) throw new Error("Ingestion run could not transition to succeeded");
      }

      this.logger.info(
        request.dryRun ? "GitHub discovery completed" : "GitHub ingestion completed",
        {
          source: source.key,
          repository: repository.nameWithOwner,
          dryRun: request.dryRun,
          counters,
        },
      );
      return { counters, cursor, registry, source };
    } catch (error) {
      const normalized = normalizeGitHubError(error);
      if (normalized.code !== "github_objects_failed") {
        if (normalized.rateLimited) counters.rateLimited += 1;
        counters.failed += 1;
      }
      if (run !== null) {
        await this.database.repositories.ingestionRuns.fail(run._id, counters, {
          code: normalized.code,
          message: `GitHub ingestion failed during ${stage}`,
          retryable: normalized.retryable,
        });
      }
      this.logger.error("GitHub ingestion failed", {
        source: source.key,
        repository: source.repository,
        stage,
        code: normalized.code,
        retryable: normalized.retryable,
        rateLimited: normalized.rateLimited,
      });
      throw normalized;
    } finally {
      recordCounters(counters);
      this.activeCounters = undefined;
    }
  }

  private async discoverOnly(
    source: GitHubSourceDefinition,
    _repository: GitHubRepositoryIdentity,
    types: readonly GitHubSourceType[],
    request: GitHubIngestionRequest,
    counters: MutableCounters,
    cursor: Readonly<Record<string, string>>,
  ): Promise<void> {
    this.signal?.throwIfAborted();
    if (types.includes("issues")) {
      const since = resolveSince(
        source,
        cursor,
        "issues",
        request,
        this.config.incrementalOverlapMs,
      );
      let page = 1;
      let remaining = request.limit;
      while (remaining > 0) {
        const result = await this.rest.listIssuesPage({
          owner: source.owner,
          repo: source.repositoryName,
          page,
          since,
        });
        const discovered = result.issues.filter(
          (issue) =>
            issue.pull_request === undefined &&
            (request.until === undefined || new Date(issue.updated_at) <= request.until),
        );
        const accepted = Math.min(discovered.length, remaining);
        counters.discovered += accepted;
        counters["issues"] = (counters["issues"] ?? 0) + accepted;
        remaining -= accepted;
        if (!result.hasNextPage || accepted < discovered.length) break;
        page += 1;
      }
    }
    if (types.includes("discussions")) {
      if (this.graphql === undefined) {
        counters["capabilitySkipped"] = (counters["capabilitySkipped"] ?? 0) + 1;
        this.logger.warn("GitHub Discussions discovery skipped because GITHUB_TOKEN is absent", {
          source: source.key,
          repository: source.repository,
        });
      } else {
        const since = resolveSince(
          source,
          cursor,
          "discussions",
          request,
          this.config.incrementalOverlapMs,
        );
        const discussions = await this.graphql.discoverDiscussions({
          owner: source.owner,
          repo: source.repositoryName,
          since,
          ...(request.until === undefined ? {} : { until: request.until }),
          limit: request.limit,
        });
        counters.discovered += discussions.length;
        counters["discussions"] = (counters["discussions"] ?? 0) + discussions.length;
      }
    }
  }

  private async ensureRegistry(source: GitHubSourceDefinition): Promise<SourceRegistry> {
    const identityKey = createVersionedKey([
      "github_repository",
      normalizeUrl(source.canonicalUrl),
    ]);
    const existing =
      await this.database.repositories.sourceRegistries.findByIdentityKey(identityKey);
    const now = new Date();
    const definition = {
      kind: "github_repository" as const,
      name: source.name,
      originalUrl: source.canonicalUrl,
      canonicalUrl: source.canonicalUrl,
      enabled: source.enabled,
      ecosystemHints: [...source.ecosystemHints],
      configuration: {
        "github.sourceKey": source.key,
        "github.owner": source.owner,
        "github.repository": source.repositoryName,
        "github.types": source.types.join(","),
        "github.defaultLookbackDays": String(source.defaultLookbackDays),
        "github.manifestVersion": "2",
        "source.publisher": source.sourceQuality.publisher,
        "source.attributionUrl": source.attributionUrl,
        "source.licenseIdentifier": source.licenseIdentifier,
        ...(source.licenseUrl === undefined ? {} : { "source.licenseUrl": source.licenseUrl }),
      },
      visibility: { scope: "public" as const },
    };
    if (existing !== null) {
      const updated = await this.database.repositories.sourceRegistries.updateDefinition(
        existing._id,
        definition,
      );
      if (updated === null) throw new Error(`GitHub source registry ${source.key} disappeared`);
      return updated;
    }
    return this.database.repositories.sourceRegistries.create({
      _id: createSourceRegistryId(),
      schemaVersion: 1,
      identityKey,
      ...definition,
      audit: { createdAt: now, updatedAt: now },
    });
  }

  private async createRun(
    registry: SourceRegistry,
    source: GitHubSourceDefinition,
    types: readonly GitHubSourceType[],
    request: GitHubIngestionRequest,
    counters: IngestionCounters,
  ): Promise<IngestionRun> {
    const now = new Date();
    const id = createIngestionRunId();
    return this.database.repositories.ingestionRuns.create({
      _id: id,
      schemaVersion: 1,
      sourceRegistryId: registry._id,
      trigger: "manual",
      deduplicationKey: createVersionedKey([
        registry._id,
        id,
        source.key,
        types.join(","),
        request.since?.toISOString() ?? "incremental",
        request.until?.toISOString() ?? "open",
      ]),
      status: "queued",
      stage: "queued",
      attempt: 1,
      maxAttempts: 3,
      counters,
      audit: { createdAt: now, updatedAt: now },
    });
  }

  private async persistObject(
    registry: SourceRegistry,
    object: NormalizedGitHubObject,
    counters: MutableCounters,
  ): Promise<void> {
    counters.discovered += 1;
    const snapshot = createSourceItemSnapshot(registry, object, new Date());
    const latest = await this.database.repositories.sourceItems.findLatestBySourceIdentity(
      registry._id,
      object.sourceItemIdentity,
    );
    if (latest?.deduplicationKey.value === snapshot.deduplicationKey.value) {
      counters.unchanged += 1;
      return;
    }
    const inserted = await this.database.repositories.sourceItems.createIfAbsent(snapshot);
    if (inserted === null) {
      counters.unchanged += 1;
    } else if (latest === null) {
      counters.created += 1;
    } else {
      counters.updated += 1;
    }
  }

  private async recordObjectFailure(
    error: unknown,
    identity: string,
    counters: MutableCounters,
  ): Promise<void> {
    const normalized = normalizeGitHubError(error);
    if (normalized.rateLimited) counters.rateLimited += 1;
    counters.failed += 1;
    this.logger.warn("GitHub object collection failed", {
      identity,
      code: normalized.code,
      retryable: normalized.retryable,
      rateLimited: normalized.rateLimited,
    });
    if (counters.failed >= FAILURE_THRESHOLD) {
      throw new GitHubIngestionError(
        "GitHub object failure threshold reached",
        "github_objects_failed",
        true,
      );
    }
  }
}

interface MutableCounters extends IngestionCounters {
  [name: string]: number;
}

function createCounters(): MutableCounters {
  return { discovered: 0, created: 0, updated: 0, unchanged: 0, failed: 0, rateLimited: 0 };
}

function recordCounters(counters: IngestionCounters): void {
  for (const state of ["discovered", "created", "updated", "unchanged", "failed"] as const) {
    recordIngestionItems("github", state, counters[state]);
  }
}

function selectTypes(
  source: GitHubSourceDefinition,
  requested: readonly GitHubSourceType[] | undefined,
): GitHubSourceType[] {
  if (requested === undefined) return [...source.types];
  const unsupported = requested.filter((type) => !source.types.includes(type));
  if (unsupported.length > 0) {
    throw new Error(`Source ${source.key} does not enable: ${unsupported.join(", ")}`);
  }
  return [...new Set(requested)];
}

function verifyRepository(
  source: GitHubSourceDefinition,
  repository: GitHubRepositoryIdentity,
  types: readonly GitHubSourceType[],
): void {
  if (repository.nameWithOwner.toLowerCase() !== source.repository.toLowerCase()) {
    throw new Error(
      `GitHub source ${source.key} resolves to ${repository.nameWithOwner}; update the registry manifest`,
    );
  }
  if (normalizeUrl(repository.canonicalUrl) !== normalizeUrl(source.canonicalUrl)) {
    throw new Error(`GitHub source ${source.key} canonical URL no longer matches GitHub`);
  }
  if (types.includes("issues") && !repository.hasIssues) {
    throw new Error(`GitHub source ${source.key} does not have Issues enabled`);
  }
  if (types.includes("discussions") && !repository.hasDiscussions) {
    throw new Error(`GitHub source ${source.key} does not have Discussions enabled`);
  }
}

function resolveSince(
  source: GitHubSourceDefinition,
  cursor: Readonly<Record<string, string>>,
  type: GitHubSourceType,
  request: GitHubIngestionRequest,
  overlapMs: number,
): Date {
  if (request.since !== undefined) return request.since;
  const checkpoint = cursor[`github.${type}.updatedAt`];
  if (checkpoint !== undefined) return new Date(new Date(checkpoint).getTime() - overlapMs);
  return new Date(Date.now() - source.defaultLookbackDays * 24 * 60 * 60 * 1_000);
}

function advanceCursor(
  cursor: Record<string, string>,
  type: GitHubSourceType,
  candidate: Date | undefined,
): void {
  if (candidate === undefined) return;
  const key = `github.${type}.updatedAt`;
  const existing = cursor[key];
  if (existing === undefined || candidate > new Date(existing))
    cursor[key] = candidate.toISOString();
  cursor["github.cursorVersion"] = "1";
}

function parseCursorInteger(value: string | undefined): number {
  if (value === undefined) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
