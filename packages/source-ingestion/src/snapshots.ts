import {
  createSourceItemId,
  createVersionedKey,
  sourceItemSchema,
  type SourceDocumentMetadata,
  type SourceItem,
  type SourceRegistry,
} from "@knownpath/domain";

import { canonicalizeJson, sha256 } from "./canonical-json.js";
import type { OfficialSourceDefinition } from "./manifest.js";
import type { NormalizedSourceDocument, SafeFetchResult, SourceCandidate } from "./types.js";

export function createDocumentSnapshot(
  registry: SourceRegistry,
  source: OfficialSourceDefinition,
  document: NormalizedSourceDocument,
  documentMetadata: SourceDocumentMetadata,
  result: SafeFetchResult,
  capturedAt: Date,
): SourceItem {
  const providerMetadata = {
    provider: source.adapter === "documentation_site" ? "official_documentation" : "official_feed",
    formatVersion: 1,
    payload: {
      sourceKey: source.key,
      adapter: source.adapter,
      fetchUrl: document.candidate.fetchUrl,
      representation: document.providerMetadata,
      etag: result.etag ?? null,
      lastModified: result.lastModified ?? null,
    },
  } as const;
  const snapshotDigest = sha256(
    canonicalizeJson({
      body: document.body,
      blocks: document.blocks,
      documentMetadata,
      sourceQuality: source.sourceQuality,
      title: document.candidate.title,
    }),
  );
  return sourceItemSchema.parse({
    _id: createSourceItemId(),
    schemaVersion: 1,
    sourceRegistryId: registry._id,
    itemType: source.adapter === "documentation_site" ? "documentation_page" : "release_note",
    title: document.candidate.title,
    provenance: {
      canonicalUrl: document.candidate.canonicalUrl,
      sourceItemIdentity: document.candidate.sourceIdentity,
      ...(document.candidate.observedRevision === undefined
        ? {}
        : { observedRevision: document.candidate.observedRevision }),
      ...(document.candidate.publishedAt === undefined
        ? {}
        : { publishedAt: document.candidate.publishedAt }),
      observedAt: capturedAt,
    },
    providerMetadata,
    sourceQuality: source.sourceQuality,
    documentMetadata,
    structuredBlocks: document.blocks,
    content: {
      digest: sha256(document.body),
      mediaType: document.mediaType,
      text: document.body,
      byteLength: Buffer.byteLength(document.body, "utf8"),
    },
    deduplicationKey: createVersionedKey([
      registry._id,
      document.candidate.sourceIdentity,
      snapshotDigest,
    ]),
    capturedAt,
    visibility: { scope: "public" },
    audit: { createdAt: capturedAt, updatedAt: capturedAt },
  });
}

export function createCatalogSnapshot(
  registry: SourceRegistry,
  source: OfficialSourceDefinition,
  identity: string,
  result: SafeFetchResult,
  capturedAt: Date,
): SourceItem {
  if (result.body === undefined) throw new Error("Cannot persist an empty source catalog");
  const digest = sha256(result.body);
  return sourceItemSchema.parse({
    _id: createSourceItemId(),
    schemaVersion: 1,
    sourceRegistryId: registry._id,
    itemType: "other",
    title: `${source.name} source catalog`,
    provenance: {
      canonicalUrl: result.finalUrl,
      sourceItemIdentity: identity,
      observedRevision: result.lastModified ?? result.etag ?? digest,
      observedAt: capturedAt,
    },
    providerMetadata: {
      provider: source.adapter,
      formatVersion: 1,
      payload: { role: "source_catalog", sourceKey: source.key },
    },
    sourceQuality: source.sourceQuality,
    content: {
      digest,
      mediaType: `${result.contentType ?? "text/plain"}; charset=utf-8`,
      text: result.body,
      byteLength: Buffer.byteLength(result.body, "utf8"),
    },
    deduplicationKey: createVersionedKey([registry._id, identity, digest]),
    capturedAt,
    visibility: { scope: "public" },
    audit: { createdAt: capturedAt, updatedAt: capturedAt },
  });
}

export function createDocumentMetadata(
  source: OfficialSourceDefinition,
  candidate: SourceCandidate,
): SourceDocumentMetadata {
  return {
    documentType: candidate.documentType,
    ecosystem: source.ecosystemHints[0]!,
    framework: source.framework,
    versions: [...candidate.versions],
    ...(candidate.sourceSection === undefined ? {} : { sourceSection: candidate.sourceSection }),
    attributionUrl: source.attributionUrl,
    licenseIdentifier: source.licenseIdentifier,
    ...(source.licenseUrl === undefined ? {} : { licenseUrl: source.licenseUrl }),
  };
}
