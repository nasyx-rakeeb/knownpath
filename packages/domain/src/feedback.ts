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
  outcomeAssessmentIdSchema,
  safetyEventIdSchema,
  knownPathRevisionIdSchema,
  workspaceIdSchema,
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
    workspaceId: workspaceIdSchema.optional(),
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
    if (submission.visibility === "team" && submission.workspaceId === undefined)
      context.addIssue({
        code: "custom",
        message: "team contributions require workspaceId",
        path: ["workspaceId"],
      });
    if (submission.visibility !== "team" && submission.workspaceId !== undefined)
      context.addIssue({
        code: "custom",
        message: "workspaceId is valid only for team contributions",
        path: ["workspaceId"],
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
  intent: z.enum([
    "private_backend_storage",
    "workspace_backend_storage",
    "public_submission_and_future_publication",
  ]),
  confirmedAt: timestampSchema,
  confirmedByUserId: userIdSchema,
  visibility: z.enum(["public", "private", "team"]),
  workspaceId: workspaceIdSchema.optional(),
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
    apiKeyId: apiKeyIdSchema.optional(),
    channel: z.enum(["agent_api", "dashboard_share"]).default("agent_api"),
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
  visibility: z.enum(["public", "private", "team"]),
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
  visibility: z.enum(["public", "private", "team"]),
  consent: contributionConsentSchema,
  payload: contributionPayloadSchema,
  sanitization: contributionSanitizationReportSchema,
  status: contributionStatusSchema,
  trustState: z.literal("self_reported_unverified"),
  processing: contributionProcessingSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const legacyAgentOutcomeSchema = z.strictObject({
  _id: agentOutcomeIdSchema,
  schemaVersion: schemaVersionSchema,
  knownPathId: knownPathIdSchema,
  reporter: contributorIdentitySchema,
  outcome: z.enum(["helpful", "not_helpful", "partially_helpful", "unknown"]),
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

export const OUTCOME_CONTRACT_VERSION = 1 as const;
export const OUTCOME_SCHEMA_VERSION = 2 as const;
export const OUTCOME_ALGORITHM_VERSION = 1 as const;
export const OUTCOME_POLICY_VERSION = 1 as const;

export const outcomeTargetScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("public") }),
  z.strictObject({ kind: z.literal("personal") }),
  z.strictObject({ kind: z.literal("workspace"), workspaceId: workspaceIdSchema }),
]);
export const outcomeAggregationScopeSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("public") }),
  z.strictObject({ scope: z.literal("private"), ownerUserId: userIdSchema }),
  z.strictObject({ scope: z.literal("team"), workspaceId: workspaceIdSchema }),
]);

export const agentOutcomeValueSchema = z.enum([
  "solved",
  "partially_helped",
  "attempted_failed",
  "incompatible_environment",
  "stale_or_outdated",
  "misleading_or_unsafe",
  "not_used",
]);

export const outcomeEnvironmentSchema = z.strictObject({
  ecosystem: shortStringSchema.optional(),
  packages: z
    .array(z.strictObject({ name: shortStringSchema, version: shortStringSchema.optional() }))
    .max(24)
    .default([]),
  platforms: z.array(shortStringSchema).max(12).default([]),
  versions: z.array(shortStringSchema).max(24).default([]),
  runtime: shortStringSchema.optional(),
  toolchain: z.array(shortStringSchema).max(16).default([]),
});

export const outcomeSubmissionRequestSchema = z
  .strictObject({
    contractVersion: z.literal(OUTCOME_CONTRACT_VERSION).default(OUTCOME_CONTRACT_VERSION),
    clientOutcomeId: z.uuidv4(),
    clientExecutionId: z.uuidv4(),
    knownPathId: knownPathIdSchema,
    scope: outcomeTargetScopeSchema.default({ kind: "public" }),
    searchId: z.uuidv4().optional(),
    solutionVariantId: shortStringSchema.optional(),
    outcome: agentOutcomeValueSchema,
    attemptedAt: timestampSchema.optional(),
    agentClient: z.strictObject({ name: shortStringSchema, version: shortStringSchema.optional() }),
    environment: outcomeEnvironmentSchema,
    note: z.string().trim().min(1).max(800).optional(),
    includeReview: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.outcome === "not_used" && value.attemptedAt !== undefined)
      context.addIssue({
        code: "custom",
        path: ["attemptedAt"],
        message: "not_used must not claim an attempt",
      });
    if (value.outcome !== "not_used" && value.attemptedAt === undefined)
      context.addIssue({
        code: "custom",
        path: ["attemptedAt"],
        message: "attempted outcomes require attemptedAt",
      });
  });

export const agentOutcomeV2Schema = z.strictObject({
  _id: agentOutcomeIdSchema,
  schemaVersion: z.literal(OUTCOME_SCHEMA_VERSION),
  knownPathId: knownPathIdSchema,
  knownPathRevisionId: knownPathRevisionIdSchema,
  clientOutcomeId: z.uuidv4(),
  clientExecutionId: z.uuidv4(),
  reporter: z.strictObject({ userId: userIdSchema, apiKeyId: apiKeyIdSchema }),
  agentClient: z.strictObject({ name: shortStringSchema, version: shortStringSchema.optional() }),
  outcome: agentOutcomeValueSchema,
  attemptedAt: timestampSchema.optional(),
  receivedAt: timestampSchema,
  environment: outcomeEnvironmentSchema,
  versionBucket: shortStringSchema,
  solutionVariantId: shortStringSchema.optional(),
  searchId: z.uuidv4().optional(),
  note: z.string().trim().min(1).max(800).optional(),
  sanitization: z.strictObject({
    status: z.enum(["clean", "sanitized"]),
    findingCategories: z.array(shortStringSchema).max(16),
  }),
  requestDigest: sha256Schema,
  idempotencyKey: versionedKeySchema,
  executionKey: versionedKeySchema,
  influence: z.strictObject({
    status: z.enum(["eligible", "duplicate_window", "not_evidence"]),
    reasonCode: shortStringSchema,
  }),
  anomalySignals: z.array(shortStringSchema).max(16),
  visibility: visibilitySchema,
  aggregationScope: outcomeAggregationScopeSchema.default({ scope: "public" }),
  audit: auditMetadataSchema,
});

export const agentOutcomeSchema = z.union([legacyAgentOutcomeSchema, agentOutcomeV2Schema]);

const outcomeIntervalSchema = z.strictObject({
  observedRate: z.number().min(0).max(1),
  lowerBound: z.number().min(0).max(1),
  upperBound: z.number().min(0).max(1),
});

export const outcomeAssessmentSchema = z.strictObject({
  _id: outcomeAssessmentIdSchema,
  schemaVersion: schemaVersionSchema,
  knownPathId: knownPathIdSchema,
  knownPathRevisionId: knownPathRevisionIdSchema,
  aggregationScope: outcomeAggregationScopeSchema.default({ scope: "public" }),
  idempotencyKey: versionedKeySchema,
  algorithm: z.strictObject({
    identifier: z.literal("knownpath-outcome-confidence"),
    version: z.literal(OUTCOME_ALGORITHM_VERSION),
  }),
  policy: z.strictObject({
    identifier: z.literal("knownpath-outcome-policy"),
    version: z.literal(OUTCOME_POLICY_VERSION),
    digest: sha256Schema,
  }),
  calculatedAt: timestampSchema,
  inputOutcomeIds: z.array(agentOutcomeIdSchema).max(10_000),
  counts: z.strictObject({
    total: z.int().nonnegative(),
    eligible: z.int().nonnegative(),
    effective: z.int().nonnegative(),
    excluded: z.int().nonnegative(),
    uniqueUsers: z.int().nonnegative(),
    uniqueApiKeys: z.int().nonnegative(),
    solved: z.int().nonnegative(),
    partiallyHelped: z.int().nonnegative(),
    attemptedFailed: z.int().nonnegative(),
    incompatibleEnvironment: z.int().nonnegative(),
    staleOrOutdated: z.int().nonnegative(),
    misleadingOrUnsafe: z.int().nonnegative(),
    notUsed: z.int().nonnegative(),
    recentSuccesses: z.int().nonnegative(),
  }),
  recency: z.strictObject({
    graceDays: z.literal(30),
    halfLifeDays: z.literal(180),
    totalWeight: z.number().nonnegative(),
    effectiveSampleSize: z.number().nonnegative(),
  }),
  intervals: z.strictObject({ anyHelp: outcomeIntervalSchema, fullSolve: outcomeIntervalSchema }),
  confidence: z.strictObject({
    status: z.enum(["unobserved", "observed"]),
    score: z.int().min(0).max(100),
    grade: z.enum(["unobserved", "very_low", "low", "moderate", "high", "very_high"]),
  }),
  lastSuccessfulAt: timestampSchema.optional(),
  lastFailedAt: timestampSchema.optional(),
  versionDistribution: z
    .array(
      z.strictObject({
        bucket: shortStringSchema,
        count: z.int().positive(),
        solved: z.int().nonnegative(),
        failed: z.int().nonnegative(),
      }),
    )
    .max(128),
  trend: z.strictObject({
    status: z.enum(["insufficient_data", "stable", "declining"]),
    recentEffectiveSampleSize: z.number().nonnegative(),
    baselineEffectiveSampleSize: z.number().nonnegative(),
    lowerBoundDrop: z.number().min(0).max(1),
  }),
  penalties: z.array(z.enum(["corroborated_safety", "outcome_degradation"])).max(2),
  reasonCodes: z.array(shortStringSchema).max(128),
  explanations: z.array(z.string().trim().min(1).max(1_000)).max(128),
  audit: auditMetadataSchema,
});

export const safetyEventSchema = z.strictObject({
  _id: safetyEventIdSchema,
  schemaVersion: schemaVersionSchema,
  knownPathId: knownPathIdSchema,
  aggregationScope: outcomeAggregationScopeSchema.default({ scope: "public" }),
  sourceOutcomeId: agentOutcomeIdSchema.optional(),
  idempotencyKey: versionedKeySchema,
  eventType: z.enum([
    "review_queued",
    "review_started",
    "review_resolved",
    "visibility_restricted",
  ]),
  fromStatus: z.enum(["clear", "review_queued", "under_review", "resolved", "restricted"]),
  toStatus: z.enum(["clear", "review_queued", "under_review", "resolved", "restricted"]),
  reasonCode: shortStringSchema,
  actor: z.strictObject({ kind: z.enum(["system", "user"]), userId: userIdSchema.optional() }),
  occurredAt: timestampSchema,
  audit: auditMetadataSchema,
});

export const outcomeSubmissionResponseSchema = z.strictObject({
  contractVersion: z.literal(OUTCOME_CONTRACT_VERSION),
  outcomeId: agentOutcomeIdSchema,
  reused: z.boolean(),
  outcome: agentOutcomeValueSchema,
  influence: agentOutcomeV2Schema.shape.influence,
  safetyReviewQueued: z.boolean(),
  assessmentId: outcomeAssessmentIdSchema,
  aggregate: z.strictObject({
    effectiveSampleSize: z.number().nonnegative(),
    confidenceScore: z.int().min(0).max(100),
    confidenceGrade: outcomeAssessmentSchema.shape.confidence.shape.grade,
  }),
});

export type ContributionSubmissionRequest = z.infer<typeof contributionSubmissionRequestSchema>;
export type ContributionPayload = z.infer<typeof contributionPayloadSchema>;
export type ContributionSanitizationReport = z.infer<typeof contributionSanitizationReportSchema>;
export type ContributionSubmissionResponse = z.infer<typeof contributionSubmissionResponseSchema>;
export type ContributionInspectionResponse = z.infer<typeof contributionInspectionResponseSchema>;
export type AgentContributionV2 = z.infer<typeof agentContributionV2Schema>;
export type AgentContribution = z.infer<typeof agentContributionSchema>;
export type AgentOutcome = z.infer<typeof agentOutcomeSchema>;
export type AgentOutcomeV2 = z.infer<typeof agentOutcomeV2Schema>;
export type OutcomeSubmissionRequest = z.infer<typeof outcomeSubmissionRequestSchema>;
export type OutcomeSubmissionResponse = z.infer<typeof outcomeSubmissionResponseSchema>;
export type OutcomeAssessment = z.infer<typeof outcomeAssessmentSchema>;
export type SafetyEvent = z.infer<typeof safetyEventSchema>;
export type OutcomeAggregationScope = z.infer<typeof outcomeAggregationScopeSchema>;
export type OutcomeTargetScope = z.infer<typeof outcomeTargetScopeSchema>;
