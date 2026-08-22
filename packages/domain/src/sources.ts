import { z } from "zod";

import {
  auditMetadataSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  sourceItemIdSchema,
  sourceRegistryIdSchema,
  timestampSchema,
  versionedKeySchema,
  visibilitySchema,
} from "./common.js";

export const sourceKindSchema = z.enum(["github_repository", "documentation"]);

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
  "discussion",
  "pull_request",
  "documentation_page",
  "release_note",
  "other",
]);

export const sourceProvenanceSchema = z.strictObject({
  canonicalUrl: z.url(),
  sourceItemIdentity: shortStringSchema,
  observedRevision: z.string().trim().min(1).max(512).optional(),
  author: z.string().trim().min(1).max(512).optional(),
  publishedAt: timestampSchema.optional(),
  observedAt: timestampSchema,
});

export const sourceContentSchema = z.strictObject({
  digest: sha256Schema,
  mediaType: z.string().trim().min(1).max(128),
  text: z.string().max(2_000_000).optional(),
  externalReference: z.url().optional(),
  byteLength: z.int().nonnegative(),
});

export const sourceItemSchema = z.strictObject({
  _id: sourceItemIdSchema,
  schemaVersion: schemaVersionSchema,
  sourceRegistryId: sourceRegistryIdSchema,
  itemType: sourceItemTypeSchema,
  title: nonEmptyStringSchema.optional(),
  provenance: sourceProvenanceSchema,
  content: sourceContentSchema,
  deduplicationKey: versionedKeySchema,
  capturedAt: timestampSchema,
  visibility: visibilitySchema,
  audit: auditMetadataSchema,
});

export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;
export type SourceItem = z.infer<typeof sourceItemSchema>;
