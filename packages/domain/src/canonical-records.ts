import { z } from "zod";

import {
  auditMetadataSchema,
  candidateAssessmentIdSchema,
  candidateEmbeddingIdSchema,
  candidateExperienceIdSchema,
  candidatePairAssessmentIdSchema,
  canonicalMembershipIdSchema,
  canonicalizationEventIdSchema,
  canonicalizationOperationIdSchema,
  knownPathIdSchema,
  knownPathRevisionIdSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  similarityProfileIdSchema,
  timestampSchema,
  userIdSchema,
  versionedKeySchema,
  visibilityScopeSchema,
} from "./common.js";
import {
  canonicalMembershipSummarySchema,
  canonicalSolutionVariantSchema,
  canonicalTrustProjectionSchema,
  evidenceReferenceSchema,
  freshnessSchema,
  knowledgeMetadataSchema,
} from "./knowledge.js";

export const blockingKeyTypeSchema = z.enum([
  "error_fingerprint",
  "error_identifier",
  "problem_solution",
  "package_problem",
  "package_solution",
]);

export const similarityBlockingKeySchema = z.strictObject({
  type: blockingKeyTypeSchema,
  value: sha256Schema,
  strength: z.enum(["moderate", "strong"]),
});

export const candidateSimilarityProfileSchema = z.strictObject({
  _id: similarityProfileIdSchema,
  schemaVersion: schemaVersionSchema,
  candidateExperienceId: candidateExperienceIdSchema,
  idempotencyKey: versionedKeySchema,
  candidateDigest: sha256Schema,
  normalizer: z.strictObject({ identifier: shortStringSchema, version: z.int().positive() }),
  profileVersion: z.int().positive(),
  ecosystem: shortStringSchema,
  packages: z.array(shortStringSchema).max(64),
  platforms: z.array(shortStringSchema).max(32),
  versions: z.array(shortStringSchema).max(64),
  errorCodes: z.array(shortStringSchema).max(64),
  exceptionClasses: z.array(shortStringSchema).max(64),
  normalizedErrors: z.array(nonEmptyStringSchema).max(64),
  errorFingerprints: z.array(sha256Schema).max(64),
  normalizedProblem: nonEmptyStringSchema,
  normalizedRootCause: nonEmptyStringSchema.optional(),
  normalizedSolution: nonEmptyStringSchema,
  normalizedSteps: z.array(nonEmptyStringSchema).max(64),
  problemSolutionFingerprint: sha256Schema,
  problemShingles: z.array(sha256Schema).max(4_096),
  solutionShingles: z.array(sha256Schema).max(4_096),
  blockingKeys: z.array(similarityBlockingKeySchema).min(1).max(256),
  normalizationReasonCodes: z.array(shortStringSchema).max(128),
  generatedAt: timestampSchema,
  audit: auditMetadataSchema,
});

export const candidateEmbeddingSchema = z
  .strictObject({
    _id: candidateEmbeddingIdSchema,
    schemaVersion: schemaVersionSchema,
    candidateExperienceId: candidateExperienceIdSchema,
    similarityProfileId: similarityProfileIdSchema,
    idempotencyKey: versionedKeySchema,
    inputDigest: sha256Schema,
    inputVersion: z.int().positive(),
    visibilityScope: visibilityScopeSchema,
    provider: z.strictObject({
      identifier: shortStringSchema,
      capability: z.enum(["public_only", "approved_private"]),
    }),
    modelIdentifier: shortStringSchema,
    modelVersion: shortStringSchema,
    dimensions: z.int().min(128).max(3_072),
    task: z.literal("semantic_similarity"),
    values: z.array(z.number().finite()).min(128).max(3_072),
    generatedAt: timestampSchema,
    latencyMs: z.int().nonnegative(),
    usage: z.record(z.string(), z.number().nonnegative()).optional(),
    audit: auditMetadataSchema,
  })
  .superRefine((embedding, context) => {
    if (embedding.values.length !== embedding.dimensions) {
      context.addIssue({
        code: "custom",
        message: "embedding vector length must equal dimensions",
        path: ["values"],
      });
    }
    if (embedding.provider.capability === "public_only" && embedding.visibilityScope !== "public") {
      context.addIssue({
        code: "custom",
        message: "public-only embeddings require public visibility",
        path: ["visibilityScope"],
      });
    }
  });

export const pairDecisionSchema = z.enum(["auto_merge", "review", "separate"]);

export const candidatePairAssessmentSchema = z
  .strictObject({
    _id: candidatePairAssessmentIdSchema,
    schemaVersion: schemaVersionSchema,
    candidateIds: z.tuple([candidateExperienceIdSchema, candidateExperienceIdSchema]),
    profileIds: z.tuple([similarityProfileIdSchema, similarityProfileIdSchema]),
    idempotencyKey: versionedKeySchema,
    policy: z.strictObject({
      identifier: shortStringSchema,
      version: z.int().positive(),
      digest: sha256Schema,
    }),
    blockingReasons: z.array(similarityBlockingKeySchema).min(1).max(256),
    deterministic: z.strictObject({
      exactErrorFingerprint: z.boolean(),
      exactProblemSolutionFingerprint: z.boolean(),
      errorIdentifierOverlap: z.number().min(0).max(1),
      packageOverlap: z.number().min(0).max(1),
      platformCompatible: z.boolean(),
      versionCompatible: z.boolean(),
      ecosystemCompatible: z.boolean(),
      problemSimilarity: z.number().min(0).max(1),
      solutionSimilarity: z.number().min(0).max(1),
      hardIncompatibilities: z.array(shortStringSchema).max(32),
    }),
    semantic: z.strictObject({
      status: z.enum(["not_requested", "ready", "unavailable", "forbidden"]),
      embeddingIds: z.tuple([candidateEmbeddingIdSchema, candidateEmbeddingIdSchema]).optional(),
      cosineSimilarity: z.number().min(-1).max(1).optional(),
    }),
    decision: pairDecisionSchema,
    reasonCodes: z.array(shortStringSchema).min(1).max(128),
    explanations: z.array(nonEmptyStringSchema).min(1).max(128),
    evaluatedAt: timestampSchema,
    audit: auditMetadataSchema,
  })
  .superRefine((assessment, context) => {
    if (assessment.candidateIds[0] >= assessment.candidateIds[1]) {
      context.addIssue({
        code: "custom",
        message: "candidate IDs must be sorted",
        path: ["candidateIds"],
      });
    }
    if (
      assessment.semantic.status === "ready" &&
      assessment.semantic.cosineSimilarity === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "ready semantic comparison requires cosine similarity",
        path: ["semantic"],
      });
    }
  });

export const canonicalMembershipDispositionSchema = z.enum([
  "supporting",
  "conflicting",
  "rejected",
]);

export const canonicalMembershipSchema = z
  .strictObject({
    _id: canonicalMembershipIdSchema,
    schemaVersion: schemaVersionSchema,
    knownPathId: knownPathIdSchema,
    candidateExperienceId: candidateExperienceIdSchema,
    disposition: canonicalMembershipDispositionSchema,
    solutionKey: versionedKeySchema.optional(),
    active: z.boolean(),
    reasonCode: shortStringSchema,
    pairAssessmentId: candidatePairAssessmentIdSchema.optional(),
    operationId: canonicalizationOperationIdSchema,
    assignedAt: timestampSchema,
    endedAt: timestampSchema.optional(),
    audit: auditMetadataSchema,
  })
  .superRefine((membership, context) => {
    if (!membership.active && membership.endedAt === undefined) {
      context.addIssue({
        code: "custom",
        message: "inactive memberships require endedAt",
        path: ["endedAt"],
      });
    }
    if (membership.disposition === "supporting" && membership.solutionKey === undefined) {
      context.addIssue({
        code: "custom",
        message: "supporting memberships require solutionKey",
        path: ["solutionKey"],
      });
    }
  });

export const canonicalizationEventTypeSchema = z.enum([
  "operation_requested",
  "known_path_created",
  "candidate_merged",
  "candidate_rejected",
  "candidate_marked_conflicting",
  "candidate_split",
  "candidate_reassigned",
  "known_paths_merged",
  "known_path_rebuilt",
  "operation_completed",
]);

export const canonicalizationEventSchema = z.strictObject({
  _id: canonicalizationEventIdSchema,
  schemaVersion: schemaVersionSchema,
  idempotencyKey: versionedKeySchema,
  operationId: canonicalizationOperationIdSchema,
  sequence: z.int().nonnegative(),
  eventType: canonicalizationEventTypeSchema,
  actor: z.strictObject({ kind: z.enum(["system", "user"]), userId: userIdSchema.optional() }),
  reason: nonEmptyStringSchema,
  knownPathIds: z.array(knownPathIdSchema).max(32),
  candidateExperienceIds: z.array(candidateExperienceIdSchema).max(512),
  membershipIds: z.array(canonicalMembershipIdSchema).max(512),
  facts: z.record(z.string(), z.json()).default({}),
  occurredAt: timestampSchema,
  audit: auditMetadataSchema,
});

export const knownPathRevisionSchema = z.strictObject({
  _id: knownPathRevisionIdSchema,
  schemaVersion: schemaVersionSchema,
  knownPathId: knownPathIdSchema,
  revisionNumber: z.int().positive(),
  idempotencyKey: versionedKeySchema,
  builder: z.strictObject({ identifier: shortStringSchema, version: z.int().positive() }),
  snapshotDigest: sha256Schema,
  membershipIds: z.array(canonicalMembershipIdSchema).min(1).max(2_048),
  candidateExperienceIds: z.array(candidateExperienceIdSchema).min(1).max(2_048),
  assessmentIds: z.array(candidateAssessmentIdSchema).min(1).max(2_048),
  title: shortStringSchema,
  problemSummary: nonEmptyStringSchema,
  metadata: knowledgeMetadataSchema,
  solutionVariants: z.array(canonicalSolutionVariantSchema).min(1).max(32),
  evidence: z.array(evidenceReferenceSchema).min(1).max(2_048),
  trust: canonicalTrustProjectionSchema,
  freshness: freshnessSchema,
  membershipSummary: canonicalMembershipSummarySchema,
  createdAt: timestampSchema,
  audit: auditMetadataSchema,
});

export type CandidateSimilarityProfile = z.infer<typeof candidateSimilarityProfileSchema>;
export type SimilarityBlockingKey = z.infer<typeof similarityBlockingKeySchema>;
export type CandidateEmbedding = z.infer<typeof candidateEmbeddingSchema>;
export type CandidatePairAssessment = z.infer<typeof candidatePairAssessmentSchema>;
export type CanonicalMembership = z.infer<typeof canonicalMembershipSchema>;
export type CanonicalizationEvent = z.infer<typeof canonicalizationEventSchema>;
export type KnownPathRevision = z.infer<typeof knownPathRevisionSchema>;
