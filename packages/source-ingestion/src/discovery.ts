import type { KnownPathDatabase } from "@knownpath/database";
import { normalizeUrl, type SourceRegistry } from "@knownpath/domain";

import { SafeSourceHttpClient } from "./http-client.js";
import type {
  DocumentationSourceDefinition,
  OfficialSourceDefinition,
  ReleaseFeedSourceDefinition,
} from "./manifest.js";
import { parseLlmsIndex, parseReleaseFeed, parseSitemap } from "./parsers.js";
import { createCatalogSnapshot } from "./snapshots.js";
import {
  persistSourceItemState,
  persistUnchangedState,
  validatorsFromState,
} from "./state-store.js";
import type { SourceCandidate } from "./types.js";

export interface OfficialSourceDiscovery {
  readonly authoritativeChanged: boolean;
  readonly candidates: readonly SourceCandidate[];
  readonly feedContents: ReadonlyMap<string, string>;
}

interface CatalogResult {
  readonly body: string;
  readonly changed: boolean;
}

export async function discoverOfficialSource(
  database: KnownPathDatabase,
  http: SafeSourceHttpClient,
  source: OfficialSourceDefinition,
  registry: SourceRegistry | null,
  persist: boolean,
): Promise<OfficialSourceDiscovery> {
  return source.adapter === "documentation_site"
    ? discoverDocumentation(database, http, source, registry, persist)
    : discoverFeed(database, http, source, registry, persist);
}

async function discoverDocumentation(
  database: KnownPathDatabase,
  http: SafeSourceHttpClient,
  source: DocumentationSourceDefinition,
  registry: SourceRegistry | null,
  persist: boolean,
): Promise<OfficialSourceDiscovery> {
  const index = await fetchCatalog(
    database,
    http,
    source,
    registry,
    "catalog:index",
    source.indexUrl,
    ["text/plain"],
    persist,
  );
  let sitemap = new Map<string, string>();
  if (source.sitemapUrl !== undefined) {
    const sitemapResult = await fetchCatalog(
      database,
      http,
      source,
      registry,
      "catalog:sitemap",
      source.sitemapUrl,
      ["application/xml", "text/xml"],
      persist,
    );
    sitemap = new Map(parseSitemap(sitemapResult.body));
  }
  return {
    authoritativeChanged: index.changed,
    candidates: parseLlmsIndex(source, index.body, sitemap),
    feedContents: new Map(),
  };
}

async function discoverFeed(
  database: KnownPathDatabase,
  http: SafeSourceHttpClient,
  source: ReleaseFeedSourceDefinition,
  registry: SourceRegistry | null,
  persist: boolean,
): Promise<OfficialSourceDiscovery> {
  const feed = await fetchCatalog(
    database,
    http,
    source,
    registry,
    "catalog:feed",
    source.feedUrl,
    ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"],
    persist,
  );
  const entries = parseReleaseFeed(source, feed.body);
  return {
    authoritativeChanged: feed.changed,
    candidates: entries.map((entry) => entry.candidate),
    feedContents: new Map(
      entries.map((entry) => [entry.candidate.sourceIdentity, entry.rawContent]),
    ),
  };
}

async function fetchCatalog(
  database: KnownPathDatabase,
  http: SafeSourceHttpClient,
  source: OfficialSourceDefinition,
  registry: SourceRegistry | null,
  identity: string,
  url: string,
  allowedContentTypes: readonly string[],
  persist: boolean,
): Promise<CatalogResult> {
  const state =
    registry === null
      ? null
      : await database.repositories.sourceItemStates.findBySourceIdentity(registry._id, identity);
  const result = await http.getText(url, {
    allowedContentTypes,
    allowedOrigins: source.allowedOrigins,
    ...(state === null ? {} : { validators: validatorsFromState(state) }),
  });
  const fetchedAt = new Date();

  if (result.notModified) {
    if (state?.latestSourceItemId === undefined || registry === null) {
      throw new Error("Official source returned 304 without a persisted catalog snapshot");
    }
    const latest = await database.repositories.sourceItems.findById(state.latestSourceItemId);
    if (latest?.content.text === undefined) throw new Error("Persisted source catalog has no text");
    if (persist) await persistUnchangedState(database, state, result, fetchedAt);
    return { body: latest.content.text, changed: false };
  }

  if (result.body === undefined) throw new Error("Official source catalog returned no body");
  let changed = true;
  if (registry !== null) {
    const snapshot = createCatalogSnapshot(registry, source, identity, result, fetchedAt);
    changed = state?.contentDigest !== snapshot.deduplicationKey.value;
    if (persist) {
      let latestSourceItemId = state?.latestSourceItemId;
      if (changed) {
        const inserted = await database.repositories.sourceItems.createIfAbsent(snapshot);
        const persisted =
          inserted ??
          (await database.repositories.sourceItems.findByDeduplicationKey(
            snapshot.deduplicationKey,
          ));
        if (persisted === null) throw new Error("Source catalog snapshot was not persisted");
        latestSourceItemId = persisted._id;
      }
      await persistSourceItemState(database, {
        previous: state,
        registry,
        identity,
        canonicalUrl: normalizeUrl(url),
        itemType: "other",
        lifecycleStatus: "active",
        fetchedAt,
        result,
        ...(latestSourceItemId === undefined ? {} : { latestSourceItemId }),
        contentDigest: snapshot.deduplicationKey.value,
        sourceQuality: source.sourceQuality,
        changed,
      });
    }
  }
  return { body: result.body, changed };
}
