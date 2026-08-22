import { z } from "zod";

import {
  auditMetadataSchema,
  candidateAssessmentIdSchema,
  candidateExperienceIdSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  sourceItemIdSchema,
  sourceRegistryIdSchema,
  timestampSchema,
  versionedKeySchema,
} from "./common.js";
import { sourceAuthoritySchema, sourceItemTypeSchema } from "./sources.js";

const scoreSchema = z.int().min(0).max(100);

export const evidenceSignalTypeSchema = z.enum([
  "evidence_integrity",
  "grounded_extraction",
  "official_solution_guidance",
  "maintainer_solution",
  "accepted_discussion_answer",
  "author_confirmed",
  "merged_closing_pull_request",
  "closed_after_solution",
  "solution_popularity",
  "negative_popularity",
  "independent_source_convergence",
  "authoritative_conflict",
  "community_conflict",
  "unsupported_candidate_label",
  "weak_confirmation",
  "stale_applicability",
]);

export const evidenceSignalSchema = z.strictObject({
  type: evidenceSignalTypeSchema,
  polarity: z.enum(["positive", "negative", "neutral"]),
  strength: z.enum(["weak", "moderate", "strong", "decisive"]),
  verificationStatus: z.enum(["verified", "rejected", "not_applicable"]),
  points: z.int().min(-100).max(100),
  reasonCode: shortStringSchema,
  explanation: nonEmptyStringSchema,
  sourceItemIds: z.array(sourceItemIdSchema).max(32).default([]),
  sourceContentDigests: z.array(sha256Schema).max(32).default([]),
  observedAt: timestampSchema.optional(),
  facts: z.record(z.string(), z.json()).default({}),
});

export const assessmentSourceInputSchema = z.strictObject({
  sourceItemId: sourceItemIdSchema,
  sourceRegistryId: sourceRegistryIdSchema,
  contentDigest: sha256Schema,
  itemType: sourceItemTypeSchema,
  authority: sourceAuthoritySchema.optional(),
  observedAt: timestampSchema,
  publishedAt: timestampSchema.optional(),
});

export const assessmentPolicyReferenceSchema = z.strictObject({
  identifier: shortStringSchema,
  version: z.int().positive(),
  digest: sha256Schema,
});

export const sourceEvidenceComponentSchema = z.strictObject({
  score: scoreSchema,
  positivePoints: z.int().nonnegative(),
  penaltyPoints: z.int().nonpositive(),
  appliedCaps: z.array(shortStringSchema).max(16).default([]),
});

export const freshnessComponentSchema = z.strictObject({
  score: scoreSchema,
  status: z.enum(["current", "aging", "stale", "unknown"]),
  referenceAt: timestampSchema.optional(),
  ageDays: z.int().nonnegative().optional(),
  graceDays: z.int().nonnegative(),
  halfLifeDays: z.int().positive(),
  nextReviewAt: timestampSchema.optional(),
});

export const versionFitComponentSchema = z.strictObject({
  score: scoreSchema,
  status: z.enum(["explicit", "general", "partial", "unknown", "conflicting"]),
  candidateVersions: z.array(shortStringSchema).max(64).default([]),
  sourceVersions: z.array(shortStringSchema).max(128).default([]),
  reasonCode: shortStringSchema,
});

export const outcomeConfidenceComponentSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("unobserved"),
    successes: z.literal(0),
    failures: z.literal(0),
    sampleSize: z.literal(0),
  }),
  z.strictObject({
    status: z.literal("observed"),
    successes: z.int().nonnegative(),
    failures: z.int().nonnegative(),
    sampleSize: z.int().positive(),
    observedProportion: z.number().min(0).max(1),
    wilsonLowerBound: z.number().min(0).max(1),
    wilsonUpperBound: z.number().min(0).max(1),
    methodIdentifier: shortStringSchema,
    methodVersion: z.int().positive(),
    calculatedAt: timestampSchema,
  }),
]);

export const assessmentFinalScoreSchema = z.strictObject({
  kind: z.literal("seed_evidence_score"),
  score: scoreSchema,
  grade: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
  positivePoints: z.int().nonnegative(),
  penaltyPoints: z.int().nonpositive(),
  appliedCaps: z.array(shortStringSchema).max(16).default([]),
});

export const candidateAssessmentSchema = z
  .strictObject({
    _id: candidateAssessmentIdSchema,
    schemaVersion: schemaVersionSchema,
    candidateExperienceId: candidateExperienceIdSchema,
    idempotencyKey: versionedKeySchema,
    status: z.enum(["completed", "ineligible"]),
    algorithm: z.strictObject({ identifier: shortStringSchema, version: z.int().positive() }),
    policy: assessmentPolicyReferenceSchema,
    verifierVersion: z.int().positive(),
    evaluatedAt: timestampSchema,
    candidateDigest: sha256Schema,
    inputs: z.strictObject({
      sourceItems: z.array(assessmentSourceInputSchema).max(512),
    }),
    signals: z.array(evidenceSignalSchema).max(256),
    components: z.strictObject({
      sourceEvidence: sourceEvidenceComponentSchema,
      freshness: freshnessComponentSchema,
      versionFit: versionFitComponentSchema,
      outcomeConfidence: outcomeConfidenceComponentSchema,
    }),
    finalScore: assessmentFinalScoreSchema,
    reasonCodes: z.array(shortStringSchema).max(256),
    explanations: z.array(nonEmptyStringSchema).max(256),
    audit: auditMetadataSchema,
  })
  .superRefine((assessment, context) => {
    if (assessment.status === "ineligible" && assessment.finalScore.score !== 0) {
      context.addIssue({
        code: "custom",
        message: "ineligible assessments must have a final score of zero",
        path: ["finalScore", "score"],
      });
    }
    if (
      assessment.components.outcomeConfidence.status === "observed" &&
      assessment.components.outcomeConfidence.sampleSize !==
        assessment.components.outcomeConfidence.successes +
          assessment.components.outcomeConfidence.failures
    ) {
      context.addIssue({
        code: "custom",
        message: "outcome sampleSize must equal successes plus failures",
        path: ["components", "outcomeConfidence", "sampleSize"],
      });
    }
  });

export type CandidateAssessment = z.infer<typeof candidateAssessmentSchema>;
export type EvidenceSignal = z.infer<typeof evidenceSignalSchema>;
export type EvidenceSignalType = z.infer<typeof evidenceSignalTypeSchema>;
export type FreshnessComponent = z.infer<typeof freshnessComponentSchema>;
export type VersionFitComponent = z.infer<typeof versionFitComponentSchema>;
