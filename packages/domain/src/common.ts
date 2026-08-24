import { randomUUID } from "node:crypto";

import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 1 as const;
export const NORMALIZATION_VERSION = 1 as const;
export const SCORE_VERSION = 1 as const;

export const schemaVersionSchema = z.literal(CURRENT_SCHEMA_VERSION);
export const nonEmptyStringSchema = z.string().trim().min(1).max(10_000);
export const shortStringSchema = z.string().trim().min(1).max(256);
export const sha256Schema = z.hash("sha256");

const timestampStringSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const timestampSchema = z
  .union([z.date(), timestampStringSchema])
  .refine((value) => Number.isFinite(value.getTime()), "must be a valid timestamp");

function brandedIdSchema<Brand extends string>() {
  return z.uuidv4().brand<Brand>();
}

export const userIdSchema = brandedIdSchema<"UserId">();
export const apiKeyIdSchema = brandedIdSchema<"ApiKeyId">();
export const auditEventIdSchema = brandedIdSchema<"AuditEventId">();
export const sourceRegistryIdSchema = brandedIdSchema<"SourceRegistryId">();
export const sourceItemIdSchema = brandedIdSchema<"SourceItemId">();
export const sourceItemStateIdSchema = brandedIdSchema<"SourceItemStateId">();
export const ingestionRunIdSchema = brandedIdSchema<"IngestionRunId">();
export const extractionAttemptIdSchema = brandedIdSchema<"ExtractionAttemptId">();
export const candidateExperienceIdSchema = brandedIdSchema<"CandidateExperienceId">();
export const candidateAssessmentIdSchema = brandedIdSchema<"CandidateAssessmentId">();
export const knownPathIdSchema = brandedIdSchema<"KnownPathId">();
export const similarityProfileIdSchema = brandedIdSchema<"SimilarityProfileId">();
export const candidateEmbeddingIdSchema = brandedIdSchema<"CandidateEmbeddingId">();
export const candidatePairAssessmentIdSchema = brandedIdSchema<"CandidatePairAssessmentId">();
export const canonicalMembershipIdSchema = brandedIdSchema<"CanonicalMembershipId">();
export const canonicalizationEventIdSchema = brandedIdSchema<"CanonicalizationEventId">();
export const knownPathRevisionIdSchema = brandedIdSchema<"KnownPathRevisionId">();
export const canonicalizationOperationIdSchema = brandedIdSchema<"CanonicalizationOperationId">();
export const knownPathSearchDocumentIdSchema = brandedIdSchema<"KnownPathSearchDocumentId">();
export const knowledgeSearchEventIdSchema = brandedIdSchema<"KnowledgeSearchEventId">();
export const agentContributionIdSchema = brandedIdSchema<"AgentContributionId">();
export const agentOutcomeIdSchema = brandedIdSchema<"AgentOutcomeId">();
export const outcomeAssessmentIdSchema = brandedIdSchema<"OutcomeAssessmentId">();
export const safetyEventIdSchema = brandedIdSchema<"SafetyEventId">();

export type UserId = z.infer<typeof userIdSchema>;
export type ApiKeyId = z.infer<typeof apiKeyIdSchema>;
export type AuditEventId = z.infer<typeof auditEventIdSchema>;
export type SourceRegistryId = z.infer<typeof sourceRegistryIdSchema>;
export type SourceItemId = z.infer<typeof sourceItemIdSchema>;
export type SourceItemStateId = z.infer<typeof sourceItemStateIdSchema>;
export type IngestionRunId = z.infer<typeof ingestionRunIdSchema>;
export type ExtractionAttemptId = z.infer<typeof extractionAttemptIdSchema>;
export type CandidateExperienceId = z.infer<typeof candidateExperienceIdSchema>;
export type CandidateAssessmentId = z.infer<typeof candidateAssessmentIdSchema>;
export type KnownPathId = z.infer<typeof knownPathIdSchema>;
export type SimilarityProfileId = z.infer<typeof similarityProfileIdSchema>;
export type CandidateEmbeddingId = z.infer<typeof candidateEmbeddingIdSchema>;
export type CandidatePairAssessmentId = z.infer<typeof candidatePairAssessmentIdSchema>;
export type CanonicalMembershipId = z.infer<typeof canonicalMembershipIdSchema>;
export type CanonicalizationEventId = z.infer<typeof canonicalizationEventIdSchema>;
export type KnownPathRevisionId = z.infer<typeof knownPathRevisionIdSchema>;
export type CanonicalizationOperationId = z.infer<typeof canonicalizationOperationIdSchema>;
export type KnownPathSearchDocumentId = z.infer<typeof knownPathSearchDocumentIdSchema>;
export type KnowledgeSearchEventId = z.infer<typeof knowledgeSearchEventIdSchema>;
export type AgentContributionId = z.infer<typeof agentContributionIdSchema>;
export type AgentOutcomeId = z.infer<typeof agentOutcomeIdSchema>;
export type OutcomeAssessmentId = z.infer<typeof outcomeAssessmentIdSchema>;
export type SafetyEventId = z.infer<typeof safetyEventIdSchema>;

export function createUserId(): UserId {
  return userIdSchema.parse(randomUUID());
}

export function createApiKeyId(): ApiKeyId {
  return apiKeyIdSchema.parse(randomUUID());
}

export function createAuditEventId(): AuditEventId {
  return auditEventIdSchema.parse(randomUUID());
}

export function createSourceRegistryId(): SourceRegistryId {
  return sourceRegistryIdSchema.parse(randomUUID());
}

export function createSourceItemId(): SourceItemId {
  return sourceItemIdSchema.parse(randomUUID());
}

export function createSourceItemStateId(): SourceItemStateId {
  return sourceItemStateIdSchema.parse(randomUUID());
}

export function createIngestionRunId(): IngestionRunId {
  return ingestionRunIdSchema.parse(randomUUID());
}

export function createExtractionAttemptId(): ExtractionAttemptId {
  return extractionAttemptIdSchema.parse(randomUUID());
}

export function createCandidateExperienceId(): CandidateExperienceId {
  return candidateExperienceIdSchema.parse(randomUUID());
}

export function createCandidateAssessmentId(): CandidateAssessmentId {
  return candidateAssessmentIdSchema.parse(randomUUID());
}

export function createKnownPathId(): KnownPathId {
  return knownPathIdSchema.parse(randomUUID());
}

export function createSimilarityProfileId(): SimilarityProfileId {
  return similarityProfileIdSchema.parse(randomUUID());
}

export function createCandidateEmbeddingId(): CandidateEmbeddingId {
  return candidateEmbeddingIdSchema.parse(randomUUID());
}

export function createCandidatePairAssessmentId(): CandidatePairAssessmentId {
  return candidatePairAssessmentIdSchema.parse(randomUUID());
}

export function createCanonicalMembershipId(): CanonicalMembershipId {
  return canonicalMembershipIdSchema.parse(randomUUID());
}

export function createCanonicalizationEventId(): CanonicalizationEventId {
  return canonicalizationEventIdSchema.parse(randomUUID());
}

export function createKnownPathRevisionId(): KnownPathRevisionId {
  return knownPathRevisionIdSchema.parse(randomUUID());
}

export function createCanonicalizationOperationId(): CanonicalizationOperationId {
  return canonicalizationOperationIdSchema.parse(randomUUID());
}

export function createKnownPathSearchDocumentId(): KnownPathSearchDocumentId {
  return knownPathSearchDocumentIdSchema.parse(randomUUID());
}

export function createKnowledgeSearchEventId(): KnowledgeSearchEventId {
  return knowledgeSearchEventIdSchema.parse(randomUUID());
}

export function createAgentContributionId(): AgentContributionId {
  return agentContributionIdSchema.parse(randomUUID());
}

export function createAgentOutcomeId(): AgentOutcomeId {
  return agentOutcomeIdSchema.parse(randomUUID());
}

export function createOutcomeAssessmentId(): OutcomeAssessmentId {
  return outcomeAssessmentIdSchema.parse(randomUUID());
}

export function createSafetyEventId(): SafetyEventId {
  return safetyEventIdSchema.parse(randomUUID());
}

export const auditMetadataSchema = z.strictObject({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdByUserId: userIdSchema.optional(),
  updatedByUserId: userIdSchema.optional(),
});

export const visibilityScopeSchema = z.enum(["public", "private", "team"]);

export const visibilitySchema = z
  .strictObject({
    scope: visibilityScopeSchema,
    ownerUserId: userIdSchema.optional(),
    teamId: z.uuidv4().optional(),
  })
  .superRefine((visibility, context) => {
    if (visibility.scope === "private" && visibility.ownerUserId === undefined) {
      context.addIssue({
        code: "custom",
        message: "private visibility requires ownerUserId",
        path: ["ownerUserId"],
      });
    }

    if (visibility.scope === "team" && visibility.teamId === undefined) {
      context.addIssue({
        code: "custom",
        message: "team visibility requires teamId",
        path: ["teamId"],
      });
    }
  });

export const moderationStateSchema = z.strictObject({
  status: z.enum(["unreviewed", "approved", "flagged", "rejected"]),
  reason: z.string().trim().max(2_000).optional(),
  reviewedAt: timestampSchema.optional(),
  reviewedByUserId: userIdSchema.optional(),
});

export const versionedKeySchema = z.strictObject({
  value: sha256Schema,
  version: z.int().positive(),
});

export type AuditMetadata = z.infer<typeof auditMetadataSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
export type ModerationState = z.infer<typeof moderationStateSchema>;
export type VersionedKey = z.infer<typeof versionedKeySchema>;
