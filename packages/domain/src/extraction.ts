import { z } from "zod";

import {
  auditMetadataSchema,
  candidateExperienceIdSchema,
  extractionAttemptIdSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  sourceItemIdSchema,
  sourceRegistryIdSchema,
  timestampSchema,
  versionedKeySchema,
} from "./common.js";

export const aiProviderCapabilitySchema = z.enum(["public_only", "approved_private"]);

export const extractionStrategySchema = z.enum(["github_thread", "official_document"]);

export const extractionAttemptStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "irrelevant",
  "insufficient_evidence",
  "conflicting_evidence",
  "quarantined",
  "blocked",
  "failed",
]);

export const extractionUsageSchema = z.strictObject({
  inputTokens: z.int().nonnegative().optional(),
  outputTokens: z.int().nonnegative().optional(),
  thoughtTokens: z.int().nonnegative().optional(),
  cachedTokens: z.int().nonnegative().optional(),
  toolTokens: z.int().nonnegative().optional(),
  totalTokens: z.int().nonnegative().optional(),
});

export const extractionPromptReferenceSchema = z.strictObject({
  identifier: shortStringSchema,
  version: z.int().positive(),
  digest: sha256Schema,
});

export const extractionValidationIssueSchema = z.strictObject({
  code: shortStringSchema,
  message: z.string().trim().min(1).max(2_000),
  path: z.string().trim().max(1_000).optional(),
});

export const extractionAttemptSchema = z.strictObject({
  _id: extractionAttemptIdSchema,
  schemaVersion: schemaVersionSchema,
  idempotencyKey: versionedKeySchema,
  status: extractionAttemptStatusSchema,
  sourceRegistryId: sourceRegistryIdSchema,
  targetSourceItemId: sourceItemIdSchema,
  sourceItemIds: z.array(sourceItemIdSchema).min(1).max(256),
  sourceContentDigests: z.array(sha256Schema).min(1).max(256),
  contextVersion: z.int().positive(),
  contextDigest: sha256Schema,
  strategy: extractionStrategySchema,
  provider: shortStringSchema,
  model: shortStringSchema,
  providerCapability: aiProviderCapabilitySchema,
  prompts: z.array(extractionPromptReferenceSchema).min(1).max(8),
  extractionSchemaVersion: z.int().positive(),
  generationConfigDigest: sha256Schema,
  estimatedInputTokens: z.int().nonnegative(),
  retryCount: z.int().nonnegative().default(0),
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  latencyMs: z.int().nonnegative().optional(),
  providerInteractionId: z.string().trim().min(1).max(512).optional(),
  usage: extractionUsageSchema.optional(),
  classification: z
    .enum(["reusable", "irrelevant", "insufficient_evidence", "conflicting_evidence"])
    .optional(),
  classificationReason: z.string().trim().min(1).max(2_000).optional(),
  candidateExperienceId: candidateExperienceIdSchema.optional(),
  failureCode: shortStringSchema.optional(),
  failureMessage: z.string().trim().min(1).max(2_000).optional(),
  responseDigest: sha256Schema.optional(),
  validationIssues: z.array(extractionValidationIssueSchema).max(32).default([]),
  audit: auditMetadataSchema,
});

export type AiProviderCapability = z.infer<typeof aiProviderCapabilitySchema>;
export type ExtractionAttempt = z.infer<typeof extractionAttemptSchema>;
export type ExtractionAttemptStatus = z.infer<typeof extractionAttemptStatusSchema>;
export type ExtractionPromptReference = z.infer<typeof extractionPromptReferenceSchema>;
export type ExtractionStrategy = z.infer<typeof extractionStrategySchema>;
export type ExtractionUsage = z.infer<typeof extractionUsageSchema>;
export type ExtractionValidationIssue = z.infer<typeof extractionValidationIssueSchema>;
