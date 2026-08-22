import { z } from "zod";

import {
  auditMetadataSchema,
  candidateExperienceIdSchema,
  extractionAttemptIdSchema,
  knownPathIdSchema,
  moderationStateSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  SCORE_VERSION,
  sha256Schema,
  shortStringSchema,
  sourceItemIdSchema,
  timestampSchema,
  versionedKeySchema,
  visibilitySchema,
} from "./common.js";

export const packageCoordinateSchema = z.strictObject({
  ecosystem: shortStringSchema,
  name: shortStringSchema,
  normalizedName: shortStringSchema,
  version: z.string().trim().min(1).max(256).optional(),
  role: z.enum(["affected", "solution", "environment", "unknown"]),
});

export const knowledgeMetadataSchema = z.strictObject({
  primaryEcosystem: shortStringSchema,
  primaryPackageName: shortStringSchema.optional(),
  packages: z.array(packageCoordinateSchema).max(64),
  platforms: z.array(shortStringSchema).max(32),
  versionStrings: z.array(z.string().trim().min(1).max(256)).max(64),
  environment: z
    .strictObject({
      runtimes: z.array(shortStringSchema).max(16),
      operatingSystems: z.array(shortStringSchema).max(16),
      architectures: z.array(shortStringSchema).max(16),
      frameworks: z.array(shortStringSchema).max(32),
      toolchain: z.array(shortStringSchema).max(32),
      extensions: z.record(z.string(), z.string().max(1_000)).default({}),
    })
    .default({
      runtimes: [],
      operatingSystems: [],
      architectures: [],
      frameworks: [],
      toolchain: [],
      extensions: {},
    }),
});

export const symptomSchema = z.strictObject({
  summary: nonEmptyStringSchema,
  normalizedText: nonEmptyStringSchema,
  category: shortStringSchema.optional(),
  evidenceSourceItemIds: z.array(sourceItemIdSchema).max(32).default([]),
});

export const errorSignatureSchema = z.strictObject({
  original: z.string().trim().min(1).max(20_000),
  normalized: z.string().trim().min(1).max(20_000),
  fingerprint: versionedKeySchema,
});

export const solutionStepSchema = z.strictObject({
  order: z.int().positive(),
  title: shortStringSchema.optional(),
  instruction: nonEmptyStringSchema,
  code: z.string().max(50_000).optional(),
  language: shortStringSchema.optional(),
  verification: z.string().trim().min(1).max(10_000).optional(),
  evidenceSourceItemIds: z.array(sourceItemIdSchema).max(32).default([]),
});

export const evidenceReferenceSchema = z.strictObject({
  sourceItemId: sourceItemIdSchema,
  relationship: z.enum([
    "supports_problem",
    "supports_solution",
    "verifies_outcome",
    "conflicts",
    "context",
  ]),
  canonicalUrl: z.url().optional(),
  contentDigest: sha256Schema.optional(),
  locator: z.string().trim().min(1).max(1_000).optional(),
  excerpt: z.string().trim().min(1).max(10_000).optional(),
});

export const confidenceSchema = z.strictObject({
  aggregate: z.number().min(0).max(1),
  components: z.record(z.string(), z.number().min(0).max(1)),
  scoreVersion: z.literal(SCORE_VERSION),
  calculatedAt: timestampSchema,
  verificationSignals: z.array(shortStringSchema).max(64).default([]),
});

export const freshnessSchema = z.strictObject({
  lastVerifiedAt: timestampSchema.optional(),
  nextReviewAt: timestampSchema.optional(),
  staleAfter: timestampSchema.optional(),
});

export const searchMetadataSchema = z.strictObject({
  lexicalStatus: z.enum(["pending", "ready", "stale", "failed"]),
  indexedContentDigest: sha256Schema.optional(),
  embedding: z
    .strictObject({
      status: z.enum(["pending", "ready", "stale", "failed"]),
      modelIdentifier: shortStringSchema.optional(),
      dimensions: z.int().positive().optional(),
      contentDigest: sha256Schema.optional(),
      generatedAt: timestampSchema.optional(),
    })
    .optional(),
});

export const extractionProvenanceSchema = z.strictObject({
  attemptId: extractionAttemptIdSchema,
  extractorIdentifier: shortStringSchema,
  extractorVersion: shortStringSchema,
  modelIdentifier: shortStringSchema,
  promptVersion: z.int().positive(),
  schemaVersion: z.int().positive(),
  sourceContentHashes: z.array(sha256Schema).min(1).max(256),
  extractedAt: timestampSchema,
});

export const attemptedApproachSchema = z.strictObject({
  summary: nonEmptyStringSchema,
  outcome: z.enum(["failed", "partial", "unknown"]),
  reason: z.string().trim().min(1).max(10_000).optional(),
  evidenceSourceItemIds: z.array(sourceItemIdSchema).min(1).max(32),
});

export const candidateVerificationLabelSchema = z.strictObject({
  label: z.enum(["author_confirmed", "maintainer_confirmed", "official_doc_supported"]),
  evidenceSourceItemIds: z.array(sourceItemIdSchema).min(1).max(32),
  verificationStatus: z.literal("unverified"),
});

const knowledgeContentShape = {
  problemSummary: nonEmptyStringSchema,
  symptoms: z.array(symptomSchema).min(1).max(64),
  errorSignatures: z.array(errorSignatureSchema).max(64),
  errorFingerprints: z.array(sha256Schema).max(64),
  solutionSummary: nonEmptyStringSchema,
  solutionSteps: z.array(solutionStepSchema).min(1).max(64),
  metadata: knowledgeMetadataSchema,
  evidence: z.array(evidenceReferenceSchema).min(1).max(128),
  visibility: visibilitySchema,
  moderation: moderationStateSchema,
  audit: auditMetadataSchema,
} as const;

export const candidateExperienceStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "superseded",
  "failed",
]);

export const candidateExperienceSchema = z
  .strictObject({
    _id: candidateExperienceIdSchema,
    schemaVersion: schemaVersionSchema,
    status: candidateExperienceStatusSchema,
    deduplicationKey: versionedKeySchema,
    ...knowledgeContentShape,
    rootCause: z
      .strictObject({
        summary: nonEmptyStringSchema,
        evidenceSourceItemIds: z.array(sourceItemIdSchema).min(1).max(32),
      })
      .optional(),
    attemptedApproaches: z.array(attemptedApproachSchema).max(32).default([]),
    caveats: z.array(nonEmptyStringSchema).max(64).default([]),
    conflicts: z.array(evidenceReferenceSchema).max(64).default([]),
    candidateVerificationLabels: z.array(candidateVerificationLabelSchema).max(32).default([]),
    extraction: extractionProvenanceSchema,
  })
  .superRefine(validateErrorFingerprintProjection);

export const knownPathStatusSchema = z.enum([
  "draft",
  "published",
  "deprecated",
  "superseded",
  "archived",
]);

export const knownPathSchema = z
  .strictObject({
    _id: knownPathIdSchema,
    schemaVersion: schemaVersionSchema,
    canonicalKey: versionedKeySchema,
    status: knownPathStatusSchema,
    title: shortStringSchema,
    ...knowledgeContentShape,
    confidence: confidenceSchema,
    freshness: freshnessSchema,
    search: searchMetadataSchema,
    supersededByKnownPathId: knownPathIdSchema.optional(),
  })
  .superRefine(validateErrorFingerprintProjection);

function validateErrorFingerprintProjection(
  experience: {
    readonly errorFingerprints: readonly string[];
    readonly errorSignatures: readonly { readonly fingerprint: { readonly value: string } }[];
  },
  context: z.RefinementCtx,
): void {
  const projected = [
    ...new Set(experience.errorSignatures.map(({ fingerprint }) => fingerprint.value)),
  ].sort();
  const supplied = [...new Set(experience.errorFingerprints)].sort();

  if (
    projected.length !== supplied.length ||
    projected.some((value, index) => value !== supplied[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "errorFingerprints must exactly project the error signature fingerprint values",
      path: ["errorFingerprints"],
    });
  }
}

export type PackageCoordinate = z.infer<typeof packageCoordinateSchema>;
export type KnowledgeMetadata = z.infer<typeof knowledgeMetadataSchema>;
export type CandidateExperience = z.infer<typeof candidateExperienceSchema>;
export type KnownPath = z.infer<typeof knownPathSchema>;
