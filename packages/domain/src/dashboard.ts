import { z } from "zod";

import {
  agentContributionIdSchema,
  agentOutcomeIdSchema,
  candidateAssessmentIdSchema,
  candidateExperienceIdSchema,
  knownPathIdSchema,
  shortStringSchema,
} from "./common.js";
import {
  agentOutcomeValueSchema,
  contributionKindSchema,
  contributionProcessingSchema,
  contributionStatusSchema,
} from "./feedback.js";

export const DASHBOARD_API_CONTRACT_VERSION = 1 as const;

const dashboardCursorSchema = z.string().trim().min(16).max(2_048);

function queryNumber(defaultValue: number, maximum: number) {
  return z.coerce.number().int().min(1).max(maximum).default(defaultValue);
}

export const dashboardPageQuerySchema = z.strictObject({
  cursor: dashboardCursorSchema.optional(),
  limit: queryNumber(20, 50),
});

export const contributionHistoryQuerySchema = dashboardPageQuerySchema.extend({
  status: contributionStatusSchema.optional(),
  visibility: z.enum(["public", "private", "team"]).optional(),
});

export const outcomeHistoryQuerySchema = dashboardPageQuerySchema.extend({
  outcome: agentOutcomeValueSchema.optional(),
});

export const accountProfileUpdateSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(256),
});

export const accountProfileResponseSchema = z.strictObject({
  contractVersion: z.literal(DASHBOARD_API_CONTRACT_VERSION),
  displayName: z.string().trim().min(1).max(256),
  updatedAt: z.iso.datetime(),
});

export const accountSessionIdParamsSchema = z.strictObject({ id: z.uuidv4() });

export const accountSessionSchema = z.strictObject({
  id: z.uuidv4(),
  current: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  userAgent: z.string().trim().min(1).max(1_000).optional(),
});

export const accountSessionListResponseSchema = z.strictObject({
  contractVersion: z.literal(DASHBOARD_API_CONTRACT_VERSION),
  sessions: z.array(accountSessionSchema).max(100),
});

export const accountSessionRevokeResponseSchema = z.strictObject({
  contractVersion: z.literal(DASHBOARD_API_CONTRACT_VERSION),
  revokedSessionId: z.uuidv4(),
  revokedCurrentSession: z.boolean(),
});

const activityKindSchema = z.enum(["api_key", "search", "contribution", "outcome"]);

export const dashboardActivityItemSchema = z.strictObject({
  kind: activityKindSchema,
  id: z.string().trim().min(1).max(256),
  occurredAt: z.iso.datetime(),
  label: z.string().trim().min(1).max(500),
  status: shortStringSchema,
  knownPathId: knownPathIdSchema.optional(),
});

export const accountDashboardResponseSchema = z.strictObject({
  contractVersion: z.literal(DASHBOARD_API_CONTRACT_VERSION),
  generatedAt: z.iso.datetime(),
  windowDays: z.literal(30),
  apiKeys: z.strictObject({
    active: z.int().nonnegative(),
    revoked: z.int().nonnegative(),
    expired: z.int().nonnegative(),
    lastUsedAt: z.iso.datetime().optional(),
  }),
  searches: z.strictObject({
    total: z.int().nonnegative(),
    selected: z.int().nonnegative(),
  }),
  contributions: z.strictObject({
    total: z.int().nonnegative(),
    public: z.int().nonnegative(),
    private: z.int().nonnegative(),
    team: z.int().nonnegative(),
    pending: z.int().nonnegative(),
    complete: z.int().nonnegative(),
    quarantined: z.int().nonnegative(),
    withCandidate: z.int().nonnegative(),
    withAssessment: z.int().nonnegative(),
  }),
  outcomes: z.strictObject({
    total: z.int().nonnegative(),
    solved: z.int().nonnegative(),
    partiallyHelped: z.int().nonnegative(),
    attemptedFailed: z.int().nonnegative(),
    incompatibleEnvironment: z.int().nonnegative(),
    staleOrOutdated: z.int().nonnegative(),
    misleadingOrUnsafe: z.int().nonnegative(),
    notUsed: z.int().nonnegative(),
  }),
  recentActivity: z.array(dashboardActivityItemSchema).max(12),
});

export const searchActivityItemSchema = z.strictObject({
  searchId: z.uuidv4(),
  createdAt: z.iso.datetime(),
  ecosystem: shortStringSchema.optional(),
  packageCount: z.int().nonnegative(),
  versionCount: z.int().nonnegative(),
  platformCount: z.int().nonnegative(),
  errorCount: z.int().nonnegative(),
  semanticMode: z.enum(["disabled", "optional", "required"]),
  resultCount: z.int().nonnegative(),
  selected: z
    .strictObject({
      knownPathId: knownPathIdSchema,
      rank: z.int().positive(),
      recordedAt: z.iso.datetime(),
    })
    .optional(),
});

export const searchActivityResponseSchema = z.strictObject({
  contractVersion: z.literal(DASHBOARD_API_CONTRACT_VERSION),
  items: z.array(searchActivityItemSchema).max(50),
  nextCursor: dashboardCursorSchema.nullable(),
});

export const contributionHistoryItemSchema = z.strictObject({
  contributionId: agentContributionIdSchema,
  knownPathId: knownPathIdSchema.optional(),
  candidateExperienceId: candidateExperienceIdSchema.optional(),
  assessmentId: candidateAssessmentIdSchema.optional(),
  kind: contributionKindSchema,
  problem: z.string().trim().min(1).max(3_000),
  solutionSummary: z.string().trim().min(1).max(3_000),
  visibility: z.enum(["public", "private", "team"]),
  consentIntent: z.enum([
    "private_backend_storage",
    "workspace_backend_storage",
    "public_submission_and_future_publication",
  ]),
  consentConfirmedAt: z.iso.datetime(),
  sanitization: z.strictObject({
    status: z.enum(["clean", "sanitized", "quarantined"]),
    findingCount: z.int().nonnegative(),
  }),
  trustState: z.literal("self_reported_unverified"),
  status: contributionStatusSchema,
  processingStage: contributionProcessingSchema.shape.stage,
  failureCode: shortStringSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const contributionHistoryResponseSchema = z.strictObject({
  contractVersion: z.literal(DASHBOARD_API_CONTRACT_VERSION),
  items: z.array(contributionHistoryItemSchema).max(50),
  nextCursor: dashboardCursorSchema.nullable(),
});

export const outcomeHistoryItemSchema = z.strictObject({
  outcomeId: agentOutcomeIdSchema,
  knownPathId: knownPathIdSchema,
  knownPathTitle: shortStringSchema.optional(),
  outcome: agentOutcomeValueSchema,
  attemptedAt: z.iso.datetime().optional(),
  receivedAt: z.iso.datetime(),
  environment: z.strictObject({
    ecosystem: shortStringSchema.optional(),
    packages: z
      .array(z.strictObject({ name: shortStringSchema, version: shortStringSchema.optional() }))
      .max(24),
    platforms: z.array(shortStringSchema).max(12),
    versions: z.array(shortStringSchema).max(24),
    runtime: shortStringSchema.optional(),
    toolchain: z.array(shortStringSchema).max(16),
  }),
  note: z.string().trim().min(1).max(800).optional(),
  influence: z.enum(["eligible", "duplicate_window", "not_evidence", "originator_non_independent"]),
  safetyReviewQueued: z.boolean(),
});

export const outcomeHistoryResponseSchema = z.strictObject({
  contractVersion: z.literal(DASHBOARD_API_CONTRACT_VERSION),
  items: z.array(outcomeHistoryItemSchema).max(50),
  nextCursor: dashboardCursorSchema.nullable(),
});

export type DashboardPageQuery = z.infer<typeof dashboardPageQuerySchema>;
export type ContributionHistoryQuery = z.infer<typeof contributionHistoryQuerySchema>;
export type OutcomeHistoryQuery = z.infer<typeof outcomeHistoryQuerySchema>;
export type AccountDashboardResponse = z.infer<typeof accountDashboardResponseSchema>;
export type SearchActivityResponse = z.infer<typeof searchActivityResponseSchema>;
export type ContributionHistoryResponse = z.infer<typeof contributionHistoryResponseSchema>;
export type OutcomeHistoryResponse = z.infer<typeof outcomeHistoryResponseSchema>;
export type AccountSession = z.infer<typeof accountSessionSchema>;
export type AccountSessionListResponse = z.infer<typeof accountSessionListResponseSchema>;
