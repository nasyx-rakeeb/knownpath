import { z } from "zod";

import {
  agentContributionIdSchema,
  agentOutcomeIdSchema,
  apiKeyIdSchema,
  auditMetadataSchema,
  candidateAssessmentIdSchema,
  candidateExperienceIdSchema,
  knownPathIdSchema,
  moderationStateSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  similarityProfileIdSchema,
  sourceItemIdSchema,
  timestampSchema,
  userIdSchema,
  versionedKeySchema,
  visibilitySchema,
} from "./common.js";

export const CONTRIBUTION_CONTRACT_VERSION = 1 as const;
export const CONTRIBUTION_CONSENT_POLICY_VERSION = 1 as const;
export const CONTRIBUTION_SCHEMA_VERSION = 2 as const;

export const contributorIdentitySchema = z
  .strictObject({
    kind: z.enum(["user", "agent", "anonymous"]),
    userId: userIdSchema.optional(),
    agentIdentifier: shortStringSchema.optional(),
  })
  .superRefine((identity, context) => {
    if (identity.kind === "user" && identity.userId === undefined)
      context.addIssue({
        code: "custom",
        message: "user contributor requires userId",
        path: ["userId"],
      });
    if (identity.kind === "agent" && identity.agentIdentifier === undefined)
      context.addIssue({
        code: "custom",
        message: "agent contributor requires agentIdentifier",
        path: ["agentIdentifier"],
      });
  });

export const contributionKindSchema = z.enum([
  "new_lesson",
  "correction",
  "additional_evidence",
  "freshness_update",
]);
export const contributionVisibilityInputSchema = z.enum(["public", "private", "team"]);
export const contributionModeSchema = z.enum(["ask", "disabled"]);
export const contributionStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "superseded",
  "quarantined",
]);

const contributionPackageSchema = z.strictObject({
  ecosystem: shortStringSchema,
  name: shortStringSchema,
  version: z.string().trim().min(1).max(128).optional(),
});
const contributionStepSchema = z.strictObject({
  instruction: z.string().trim().min(1).max(1_500),
  verification: z.string().trim().min(1).max(800).optional(),
});
const contributionKnownPathReferenceSchema = z.strictObject({
  knownPathId: knownPathIdSchema,
  influence: z.enum(["consulted", "materially_applied"]),
});

export const contributionPayloadSchema = z.strictObject({
  problem: z.string().trim().min(1).max(3_000),
  ecosystem: shortStringSchema,
  packages: z.array(contributionPackageSchema).max(24).default([]),
  platforms: z.array(shortStringSchema).max(12).default([]),
  versions: z.array(shortStringSchema).max(24).default([]),
  toolchain: z.array(shortStringSchema).max(24).default([]),
  symptoms: z.array(z.string().trim().min(1).max(1_000)).min(1).max(16),
  errors: z.array(z.string().trim().min(1).max(2_000)).max(12).default([]),
  solutionSummary: z.string().trim().min(1).max(3_000),
  steps: z.array(contributionStepSchema).min(1).max(16),
  caveats: z.array(z.string().trim().min(1).max(1_000)).max(16).default([]),
  successEvidence: z.strictObject({
    summary: z.string().trim().min(1).max(1_500),
    checks: z.array(z.string().trim().min(1).max(500)).min(1).max(16),
  }),
  consultedKnownPaths: z.array(contributionKnownPathReferenceSchema).max(16).default([]),
});

export const contributionSubmissionRequestSchema = z
  .strictObject({
    contractVersion: z
      .literal(CONTRIBUTION_CONTRACT_VERSION)
      .default(CONTRIBUTION_CONTRACT_VERSION),
    clientSubmissionId: z.uuidv4(),
    kind: contributionKindSchema.default("new_lesson"),
    knownPathId: knownPathIdSchema.optional(),
    visibility: contributionVisibilityInputSchema,
    consent: z.strictObject({
      policyVersion: z.literal(CONTRIBUTION_CONSENT_POLICY_VERSION),
      confirmed: z.literal(true),
    }),
    agentClient: z.strictObject({
      name: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9][A-Za-z0-9 ._+-]*$/u),
      version: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9][A-Za-z0-9 ._+-]*$/u)
        .optional(),
    }),
    payload: contributionPayloadSchema,
  })
  .superRefine((submission, context) => {
    if (submission.kind !== "new_lesson" && submission.knownPathId === undefined)
      context.addIssue({
        code: "custom",
        message: "non-new contributions require knownPathId",
        path: ["knownPathId"],
      });
  });

export const contributionSanitizationFindingSchema = z.strictObject({
  category: z.enum([
    "secret",
    "email",
    "home_path",
    "credential_url",
    "sensitive_query",
    "control_character",
    "prompt_injection",
    "excessive_private_content",
  ]),
  fieldPath: z.string().trim().min(1).max(256),
  ruleId: z.string().trim().min(1).max(256).optional(),
  count: z.int().positive(),
});
export const contributionSanitizationReportSchema = z.strictObject({
  sanitizerIdentifier: z.literal("knownpath-contribution-sanitizer"),
  sanitizerVersion: z.int().positive(),
  secretScanner: z.strictObject({
    identifier: z.literal("secretlint-recommended"),
    version: shortStringSchema,
  }),
  status: z.enum(["clean", "sanitized", "quarantined"]),
  findings: z.array(contributionSanitizationFindingSchema).max(256),
  originalCharacters: z.int().nonnegative(),
  sanitizedCharacters: z.int().nonnegative(),
  redactedCharacters: z.int().nonnegative(),
  reasonCodes: z.array(shortStringSchema).max(32).default([]),
});
export const contributionConsentSchema = z.strictObject({
  policyIdentifier: z.literal("knownpath-contribution-consent"),
  policyVersion: z.literal(CONTRIBUTION_CONSENT_POLICY_VERSION),
  intent: z.enum(["private_backend_storage", "public_submission_and_future_publication"]),
  confirmedAt: timestampSchema,
  confirmedByUserId: userIdSchema,
  visibility: z.enum(["public", "private"]),
});
export const contributionProcessingSchema = z.strictObject({
  stage: z.enum([
    "stored",
    "source_created",
    "candidate_created",
    "assessed",
    "profiled",
    "complete",
    "failed",
  ]),
  sourceItemId: sourceItemIdSchema.optional(),
  candidateExperienceId: candidateExperienceIdSchema.optional(),
  assessmentId: candidateAssessmentIdSchema.optional(),
  similarityProfileId: similarityProfileIdSchema.optional(),
  failureCode: shortStringSchema.optional(),
  failureMessage: z.string().trim().min(1).max(1_000).optional(),
  completedAt: timestampSchema.optional(),
});

const legacyAgentContributionSchema = z.strictObject({
  _id: agentContributionIdSchema,
  schemaVersion: schemaVersionSchema,
  contributor: contributorIdentitySchema,
  knownPathId: knownPathIdSchema.optional(),
  kind: contributionKindSchema,
  deduplicationKey: versionedKeySchema,
  summary: nonEmptyStringSchema,
  proposedContent: z.string().trim().min(1).max(100_000),
  evidenceSourceItemIds: z.array(sourceItemIdSchema).max(128),
  status: z.enum(["pending", "accepted", "rejected", "superseded"]),
  visibility: visibilitySchema,
  moderation: moderationStateSchema,
  audit: auditMetadataSchema,
});

export const agentContributionV2Schema = z.strictObject({
  _id: agentContributionIdSchema,
  schemaVersion: z.literal(CONTRIBUTION_SCHEMA_VERSION),
  clientSubmissionId: z.uuidv4(),
  contributor: z.strictObject({
    userId: userIdSchema,
    apiKeyId: apiKeyIdSchema,
    agentClient: z.strictObject({ name: shortStringSchema, version: shortStringSchema.optional() }),
  }),
  knownPathId: knownPathIdSchema.optional(),
  kind: contributionKindSchema,
  deduplicationKey: versionedKeySchema,
  originalRequestDigest: z.strictObject({ value: sha256Schema, version: z.int().positive() }),
  sanitizedContentDigest: sha256Schema,
  payload: contributionPayloadSchema,
  consent: contributionConsentSchema,
  sanitization: contributionSanitizationReportSchema,
  status: contributionStatusSchema,
  trustState: z.literal("self_reported_unverified"),
  processing: contributionProcessingSchema,
  visibility: visibilitySchema,
  moderation: moderationStateSchema,
  audit: auditMetadataSchema,
});
export const agentContributionSchema = z.union([
  legacyAgentContributionSchema,
  agentContributionV2Schema,
]);

export const contributionSubmissionResponseSchema = z.strictObject({
  contractVersion: z.literal(CONTRIBUTION_CONTRACT_VERSION),
  contributionId: agentContributionIdSchema,
  reused: z.boolean(),
  visibility: z.enum(["public", "private"]),
  status: contributionStatusSchema,
  trustState: z.literal("self_reported_unverified"),
  processingStage: contributionProcessingSchema.shape.stage,
  sanitization: z.strictObject({
    status: contributionSanitizationReportSchema.shape.status,
    categories: z.array(contributionSanitizationFindingSchema.shape.category).max(16),
    findingCount: z.int().nonnegative(),
  }),
  candidateExperienceId: candidateExperienceIdSchema.optional(),
  assessmentId: candidateAssessmentIdSchema.optional(),
});
export const contributionInspectionResponseSchema = z.strictObject({
  contributionId: agentContributionIdSchema,
  clientSubmissionId: z.uuidv4(),
  kind: contributionKindSchema,
  knownPathId: knownPathIdSchema.optional(),
  visibility: z.enum(["public", "private"]),
  consent: contributionConsentSchema,
  payload: contributionPayloadSchema,
  sanitization: contributionSanitizationReportSchema,
  status: contributionStatusSchema,
  trustState: z.literal("self_reported_unverified"),
  processing: contributionProcessingSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const agentOutcomeValueSchema = z.enum([
  "helpful",
  "not_helpful",
  "partially_helpful",
  "unknown",
]);
export const agentOutcomeSchema = z.strictObject({
  _id: agentOutcomeIdSchema,
  schemaVersion: schemaVersionSchema,
  knownPathId: knownPathIdSchema,
  reporter: contributorIdentitySchema,
  outcome: agentOutcomeValueSchema,
  failureCategory: shortStringSchema.optional(),
  notes: z.string().trim().min(1).max(10_000).optional(),
  context: z.strictObject({
    agentName: shortStringSchema.optional(),
    agentVersion: shortStringSchema.optional(),
    taskCategory: shortStringSchema.optional(),
    environment: z.record(z.string(), z.string().max(1_000)).default({}),
  }),
  deduplicationKey: versionedKeySchema,
  visibility: visibilitySchema,
  audit: auditMetadataSchema,
});

export type ContributionSubmissionRequest = z.infer<typeof contributionSubmissionRequestSchema>;
export type ContributionPayload = z.infer<typeof contributionPayloadSchema>;
export type ContributionSanitizationReport = z.infer<typeof contributionSanitizationReportSchema>;
export type ContributionSubmissionResponse = z.infer<typeof contributionSubmissionResponseSchema>;
export type ContributionInspectionResponse = z.infer<typeof contributionInspectionResponseSchema>;
export type AgentContributionV2 = z.infer<typeof agentContributionV2Schema>;
export type AgentContribution = z.infer<typeof agentContributionSchema>;
export type AgentOutcome = z.infer<typeof agentOutcomeSchema>;
