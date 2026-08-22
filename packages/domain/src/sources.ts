import { z } from "zod";

import {
  auditMetadataSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  sourceItemIdSchema,
  sourceItemStateIdSchema,
  sourceRegistryIdSchema,
  timestampSchema,
  versionedKeySchema,
  visibilitySchema,
} from "./common.js";

export const sourceKindSchema = z.enum(["github_repository", "documentation_site", "release_feed"]);

export const sourceRegistrySchema = z.strictObject({
  _id: sourceRegistryIdSchema,
  schemaVersion: schemaVersionSchema,
  kind: sourceKindSchema,
  name: shortStringSchema,
  originalUrl: z.url(),
  canonicalUrl: z.url(),
  identityKey: versionedKeySchema,
  enabled: z.boolean(),
  ecosystemHints: z.array(shortStringSchema).max(32).default([]),
  configuration: z.record(z.string(), z.string().max(2_000)).default({}),
  cursor: z.record(z.string(), z.string().max(2_000)).optional(),
  lastIngestionAttemptAt: timestampSchema.optional(),
  lastSuccessfulIngestionAt: timestampSchema.optional(),
  visibility: visibilitySchema,
  audit: auditMetadataSchema,
});

export const sourceItemTypeSchema = z.enum([
  "issue",
  "issue_comment",
  "discussion",
  "discussion_comment",
  "pull_request",
  "documentation_page",
  "release_note",
  "other",
]);

export const sourceProvenanceSchema = z.strictObject({
  canonicalUrl: z.url(),
  sourceItemIdentity: shortStringSchema,
  rootSourceItemIdentity: shortStringSchema.optional(),
  parentSourceItemIdentity: shortStringSchema.optional(),
  observedRevision: z.string().trim().min(1).max(512).optional(),
  author: z.string().trim().min(1).max(512).optional(),
  publishedAt: timestampSchema.optional(),
  observedAt: timestampSchema,
});

export const sourceProviderMetadataSchema = z.strictObject({
  provider: shortStringSchema,
  formatVersion: z.int().positive(),
  payload: z.json(),
});

export const sourceContentSchema = z.strictObject({
  digest: sha256Schema,
  mediaType: z.string().trim().min(1).max(128),
  text: z.string().max(2_000_000).optional(),
  externalReference: z.url().optional(),
  byteLength: z.int().nonnegative(),
});

export const sourceAuthoritySchema = z.enum([
  "first_party_official",
  "maintainer",
  "community",
  "general_public",
]);

export const sourceClassificationBasisSchema = z.enum([
  "official_domain",
  "official_repository",
  "provider_author_association",
  "unverified",
]);

export const sourceQualitySchema = z.strictObject({
  authority: sourceAuthoritySchema,
  classificationBasis: sourceClassificationBasisSchema,
  publisher: shortStringSchema,
});

export const sourceDocumentTypeSchema = z.enum([
  "upgrade_guide",
  "troubleshooting",
  "release_note",
  "compatibility_reference",
  "migration_guide",
  "deprecation_notice",
  "breaking_change",
  "guide",
  "reference",
  "other",
]);

export const sourceDocumentLifecycleSchema = z.enum(["active", "deprecated", "deleted"]);

export const sourceContentBlockSchema = z.strictObject({
  type: z.enum(["heading", "paragraph", "code", "list", "table", "blockquote", "admonition"]),
  text: z.string().max(100_000),
  level: z.int().min(1).max(6).optional(),
  language: z.string().trim().min(1).max(64).optional(),
});

export const sourceDocumentMetadataSchema = z.strictObject({
  documentType: sourceDocumentTypeSchema,
  ecosystem: shortStringSchema,
  framework: shortStringSchema,
  versions: z.array(shortStringSchema).max(64).default([]),
  sourceSection: shortStringSchema.optional(),
  attributionUrl: z.url(),
  licenseIdentifier: shortStringSchema,
  licenseUrl: z.url().optional(),
});

export const sourceItemSchema = z.strictObject({
  _id: sourceItemIdSchema,
  schemaVersion: schemaVersionSchema,
  sourceRegistryId: sourceRegistryIdSchema,
  itemType: sourceItemTypeSchema,
  title: nonEmptyStringSchema.optional(),
  provenance: sourceProvenanceSchema,
  providerMetadata: sourceProviderMetadataSchema.optional(),
  sourceQuality: sourceQualitySchema.optional(),
  documentMetadata: sourceDocumentMetadataSchema.optional(),
  structuredBlocks: z.array(sourceContentBlockSchema).max(20_000).optional(),
  content: sourceContentSchema,
  deduplicationKey: versionedKeySchema,
  capturedAt: timestampSchema,
  visibility: visibilitySchema,
  audit: auditMetadataSchema,
});

export const sourceItemStateSchema = z.strictObject({
  _id: sourceItemStateIdSchema,
  schemaVersion: schemaVersionSchema,
  sourceRegistryId: sourceRegistryIdSchema,
  sourceItemIdentity: shortStringSchema,
  canonicalUrl: z.url(),
  itemType: sourceItemTypeSchema,
  lifecycleStatus: sourceDocumentLifecycleSchema,
  latestSourceItemId: sourceItemIdSchema.optional(),
  contentDigest: sha256Schema.optional(),
  etag: z.string().trim().min(1).max(2_000).optional(),
  lastModified: z.string().trim().min(1).max(2_000).optional(),
  observedRevision: z.string().trim().min(1).max(512).optional(),
  lastFetchedAt: timestampSchema,
  lastChangedAt: timestampSchema.optional(),
  lastObservedAt: timestampSchema,
  sourceQuality: sourceQualitySchema.optional(),
  documentMetadata: sourceDocumentMetadataSchema.optional(),
  audit: auditMetadataSchema,
});

export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;
export type SourceItem = z.infer<typeof sourceItemSchema>;
export type SourceItemState = z.infer<typeof sourceItemStateSchema>;
export type SourceProviderMetadata = z.infer<typeof sourceProviderMetadataSchema>;
export type SourceQuality = z.infer<typeof sourceQualitySchema>;
export type SourceDocumentMetadata = z.infer<typeof sourceDocumentMetadataSchema>;
export type SourceContentBlock = z.infer<typeof sourceContentBlockSchema>;
