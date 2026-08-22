import type { KnownPathDatabase } from "@knownpath/database";
import {
  createIngestionRunId,
  createSourceRegistryId,
  createVersionedKey,
  normalizeUrl,
  type IngestionCounters,
  type IngestionRun,
  type SourceRegistry,
} from "@knownpath/domain";

import type { OfficialSourceDefinition } from "./manifest.js";
import type { SourceIngestionRequest } from "./types.js";

const MANIFEST_VERSION = "2";

export async function findOfficialSourceRegistry(
  database: KnownPathDatabase,
  source: OfficialSourceDefinition,
): Promise<SourceRegistry | null> {
  return database.repositories.sourceRegistries.findByIdentityKey(
    createVersionedKey([source.adapter, normalizeUrl(source.canonicalUrl)]),
  );
}

export async function ensureOfficialSourceRegistry(
  database: KnownPathDatabase,
  source: OfficialSourceDefinition,
): Promise<SourceRegistry> {
  const identityKey = createVersionedKey([source.adapter, normalizeUrl(source.canonicalUrl)]);
  const existing = await database.repositories.sourceRegistries.findByIdentityKey(identityKey);
  const now = new Date();
  const definition = {
    kind: source.adapter,
    name: source.name,
    originalUrl: source.canonicalUrl,
    canonicalUrl: source.canonicalUrl,
    enabled: source.enabled,
    ecosystemHints: [...source.ecosystemHints],
    configuration: {
      "source.key": source.key,
      "source.adapter": source.adapter,
      "source.publisher": source.sourceQuality.publisher,
      "source.authority": source.sourceQuality.authority,
      "source.classificationBasis": source.sourceQuality.classificationBasis,
      "source.attributionUrl": source.attributionUrl,
      "source.licenseIdentifier": source.licenseIdentifier,
      "source.manifestVersion": MANIFEST_VERSION,
      ...(source.licenseUrl === undefined ? {} : { "source.licenseUrl": source.licenseUrl }),
      ...(source.adapter === "documentation_site"
        ? { "source.indexUrl": source.indexUrl }
        : { "source.feedUrl": source.feedUrl }),
    },
    visibility: { scope: "public" as const },
  };
  if (existing !== null) {
    const updated = await database.repositories.sourceRegistries.updateDefinition(
      existing._id,
      definition,
    );
    if (updated === null) throw new Error(`Official source registry ${source.key} disappeared`);
    return updated;
  }
  return database.repositories.sourceRegistries.create({
    _id: createSourceRegistryId(),
    schemaVersion: 1,
    identityKey,
    ...definition,
    audit: { createdAt: now, updatedAt: now },
  });
}

export async function createOfficialIngestionRun(
  database: KnownPathDatabase,
  registry: SourceRegistry,
  source: OfficialSourceDefinition,
  request: SourceIngestionRequest,
  counters: IngestionCounters,
): Promise<IngestionRun> {
  const now = new Date();
  const id = createIngestionRunId();
  return database.repositories.ingestionRuns.create({
    _id: id,
    schemaVersion: 1,
    sourceRegistryId: registry._id,
    trigger: "manual",
    deduplicationKey: createVersionedKey([
      registry._id,
      id,
      source.key,
      request.scope,
      request.page ?? "catalog",
      request.version ?? "all-versions",
    ]),
    status: "queued",
    stage: "queued",
    attempt: 1,
    maxAttempts: 3,
    counters,
    audit: { createdAt: now, updatedAt: now },
  });
}
