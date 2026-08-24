import {
  apiKeyIdSchema,
  apiKeyScopeSchema,
  knowledgeSearchEventIdSchema,
  knownPathIdSchema,
  retrievalCapabilityStateSchema,
  versionFitSchema,
  contributionSubmissionRequestSchema,
  contributionSubmissionResponseSchema,
  outcomeSubmissionRequestSchema,
  outcomeSubmissionResponseSchema,
} from "@knownpath/domain";
import { z } from "zod";

export const KNOWNPATH_MCP_CONTRACT_VERSION = 1 as const;
export const KNOWNPATH_MCP_SERVER_NAME = "knownpath";
export const KNOWNPATH_MCP_SERVER_VERSION = "0.3.0";

const boundedString = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalReviewSchema = z.boolean().default(false);

export const knownPathMcpSearchInputSchema = z.strictObject({
  task: boundedString(5_000).describe("The technical problem or coding task to solve."),
  errors: z
    .array(boundedString(2_000))
    .max(8)
    .default([])
    .describe("Exact or partial error messages, without secrets."),
  ecosystem: boundedString(256).optional().describe("For example expo or react-native."),
  packages: z.array(boundedString(256)).max(16).default([]),
  versions: z
    .array(
      z.strictObject({
        subject: boundedString(256).describe("Package, framework, SDK, or runtime name."),
        value: boundedString(256).describe("Exact version or version range."),
      }),
    )
    .max(16)
    .default([]),
  platforms: z.array(boundedString(256)).max(12).default([]),
  environment: z.array(boundedString(256)).max(32).default([]),
  context: z
    .string()
    .trim()
    .max(5_000)
    .default("")
    .describe("Optional source-code-independent technical context."),
  semanticMode: z.enum(["disabled", "optional", "required"]).default("optional"),
  limit: z.int().min(1).max(10).default(5),
  minimumScore: z.int().min(0).max(100).default(35),
  includeReview: optionalReviewSchema.describe(
    "Explicitly include review records. Requires an admin-owned API key.",
  ),
});

export const knownPathMcpGetInputSchema = z.strictObject({
  id: knownPathIdSchema.describe("KnownPath ID returned by knownpath_search."),
  searchId: knowledgeSearchEventIdSchema
    .optional()
    .describe("Search ID to record selection as usage, not as a successful outcome."),
  includeReview: optionalReviewSchema,
});

export const knownPathMcpAlternativesInputSchema = z.strictObject({
  id: knownPathIdSchema,
  cursor: boundedString(2_048).optional(),
  limit: z.int().min(1).max(5).default(3),
  includeReview: optionalReviewSchema,
});

export const knownPathMcpStatusInputSchema = z.strictObject({});
export const knownPathMcpContributeInputSchema = contributionSubmissionRequestSchema.describe(
  "A generalized, privacy-minimized lesson submitted only after observable success and explicit user consent.",
);
export const knownPathMcpContributeSuccessSchema = contributionSubmissionResponseSchema.extend({
  ok: z.literal(true),
});
export const knownPathMcpReportOutcomeInputSchema = outcomeSubmissionRequestSchema.describe(
  "Report an observable result only after a KnownPath solution was actually attempted. not_used is zero-weight usage metadata.",
);
export const knownPathMcpReportOutcomeSuccessSchema = outcomeSubmissionResponseSchema.extend({
  ok: z.literal(true),
});

const compactApplicabilitySchema = z.strictObject({
  ecosystem: boundedString(256),
  packages: z.array(boundedString(512)).max(16),
  platforms: z.array(boundedString(256)).max(12),
  versions: z.array(boundedString(256)).max(16),
});

const compactTrustSchema = z.strictObject({
  score: z.int().min(0).max(100),
  grade: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
  explanation: boundedString(1_000),
});

const compactFreshnessSchema = z.strictObject({
  status: z.enum(["current", "aging", "stale", "unknown"]),
  lastVerifiedAt: z.iso.datetime().optional(),
  staleAfter: z.iso.datetime().optional(),
});

const compactOutcomesSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unobserved"), explanation: boundedString(500) }),
  z.strictObject({
    status: z.literal("limited"),
    effectiveSampleSize: z.number().nonnegative(),
    explanation: boundedString(500),
  }),
  z.strictObject({
    status: z.literal("observed"),
    confidenceScore: z.int().min(0).max(100),
    confidenceGrade: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
    effectiveSampleSize: z.number().nonnegative(),
    recentSuccesses: z.int().nonnegative(),
    trend: z.enum(["insufficient_data", "stable", "declining"]),
    explanation: boundedString(500),
  }),
]);

const compactProvenanceSchema = z.strictObject({
  sourceItemId: z.uuidv4(),
  url: z.url(),
  title: boundedString(300).optional(),
  authority: z.enum(["first_party_official", "maintainer", "community", "general_public"]),
  relationship: z.enum([
    "supports_problem",
    "supports_solution",
    "verifies_outcome",
    "conflicts",
    "context",
  ]),
  excerpt: boundedString(500).optional(),
});

const compactSolutionStepSchema = z.strictObject({
  order: z.int().positive(),
  title: boundedString(256).optional(),
  instruction: boundedString(800),
  code: z.string().max(1_500).optional(),
  language: boundedString(128).optional(),
  verification: boundedString(400).optional(),
});

const compactSolutionSchema = z.strictObject({
  id: boundedString(128),
  summary: boundedString(1_200),
  steps: z.array(compactSolutionStepSchema).max(8),
  caveats: z.array(boundedString(600)).max(8),
  applicability: compactApplicabilitySchema,
  trust: compactTrustSchema,
  truncated: z.boolean(),
});

export const mcpToolErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    code: z.string().trim().min(1).max(128),
    message: z.string().trim().min(1).max(1_000),
    requestId: z.string().trim().min(1).max(128).optional(),
  }),
});

export const knownPathMcpSearchSuccessSchema = z.strictObject({
  ok: z.literal(true),
  contractVersion: z.literal(KNOWNPATH_MCP_CONTRACT_VERSION),
  searchId: knowledgeSearchEventIdSchema,
  accessMode: z.enum(["published", "review"]),
  semantic: z.strictObject({
    state: retrievalCapabilityStateSchema,
    reason: boundedString(1_000),
  }),
  results: z
    .array(
      z.strictObject({
        id: knownPathIdSchema,
        title: boundedString(500),
        problem: boundedString(700),
        solution: boundedString(900),
        status: z.enum(["review", "published", "deprecated"]),
        applicability: compactApplicabilitySchema,
        caveats: z.array(boundedString(500)).max(5),
        trust: compactTrustSchema,
        freshness: compactFreshnessSchema,
        outcomes: compactOutcomesSchema,
        match: z.strictObject({
          score: z.int().min(0).max(100),
          versionCompatibility: versionFitSchema,
          channels: z
            .array(z.enum(["exact", "lexical", "semantic"]))
            .min(1)
            .max(3),
          reasons: z.array(boundedString(500)).max(5),
        }),
        provenance: z.array(compactProvenanceSchema.omit({ excerpt: true })).max(3),
        truncated: z.boolean(),
      }),
    )
    .max(10),
});

export const knownPathMcpGetSuccessSchema = z.strictObject({
  ok: z.literal(true),
  contractVersion: z.literal(KNOWNPATH_MCP_CONTRACT_VERSION),
  id: knownPathIdSchema,
  title: boundedString(500),
  problem: boundedString(3_000),
  status: z.enum(["review", "published", "deprecated"]),
  symptoms: z.array(boundedString(1_000)).max(12),
  errors: z.array(boundedString(1_000)).max(12),
  applicability: compactApplicabilitySchema,
  solutions: z.array(compactSolutionSchema).max(2),
  trust: compactTrustSchema,
  freshness: compactFreshnessSchema,
  outcomes: compactOutcomesSchema,
  evidence: z.array(compactProvenanceSchema).max(8),
  selectionRecorded: z.boolean(),
  truncated: z.strictObject({
    symptoms: z.boolean(),
    errors: z.boolean(),
    solutions: z.boolean(),
    evidence: z.boolean(),
    text: z.boolean(),
  }),
});

export const knownPathMcpAlternativesSuccessSchema = z.strictObject({
  ok: z.literal(true),
  contractVersion: z.literal(KNOWNPATH_MCP_CONTRACT_VERSION),
  knownPathId: knownPathIdSchema,
  items: z.array(compactSolutionSchema).max(5),
  nextCursor: boundedString(2_048).nullable(),
  truncated: z.boolean(),
});

export const mcpStatusResponseSchema = z.strictObject({
  contractVersion: z.literal(KNOWNPATH_MCP_CONTRACT_VERSION),
  service: z.literal("knownpath-api"),
  status: z.enum(["ready", "not_ready"]),
  authentication: z.strictObject({
    keyId: apiKeyIdSchema,
    prefix: boundedString(128),
    scopes: z.array(apiKeyScopeSchema).max(32),
    ownerRole: z.enum(["user", "admin"]),
    ownerStatus: z.enum(["active", "suspended", "deleted"]),
  }),
  capabilities: z.strictObject({
    publishedRead: z.literal(true),
    reviewRead: z.boolean(),
    searchBackend: z.enum(["local", "atlas"]),
    contribute: z.boolean(),
    reportOutcome: z.boolean(),
  }),
});

export const knownPathMcpStatusSuccessSchema = mcpStatusResponseSchema.extend({
  ok: z.literal(true),
  server: z.strictObject({
    name: z.literal(KNOWNPATH_MCP_SERVER_NAME),
    version: boundedString(64),
    supportedProtocolEras: z.tuple([z.literal("2026-07-28"), z.literal("2025-compatible")]),
  }),
});

export const knownPathMcpSearchOutputSchema = z.union([
  knownPathMcpSearchSuccessSchema,
  mcpToolErrorSchema,
]);
export const knownPathMcpGetOutputSchema = z.union([
  knownPathMcpGetSuccessSchema,
  mcpToolErrorSchema,
]);
export const knownPathMcpAlternativesOutputSchema = z.union([
  knownPathMcpAlternativesSuccessSchema,
  mcpToolErrorSchema,
]);
export const knownPathMcpStatusOutputSchema = z.union([
  knownPathMcpStatusSuccessSchema,
  mcpToolErrorSchema,
]);
export const knownPathMcpContributeOutputSchema = z.union([
  knownPathMcpContributeSuccessSchema,
  mcpToolErrorSchema,
]);
export const knownPathMcpReportOutcomeOutputSchema = z.union([
  knownPathMcpReportOutcomeSuccessSchema,
  mcpToolErrorSchema,
]);

export type KnownPathMcpSearchInput = z.infer<typeof knownPathMcpSearchInputSchema>;
export type KnownPathMcpGetInput = z.infer<typeof knownPathMcpGetInputSchema>;
export type KnownPathMcpAlternativesInput = z.infer<typeof knownPathMcpAlternativesInputSchema>;
export type KnownPathMcpStatus = z.infer<typeof mcpStatusResponseSchema>;
export type KnownPathMcpContributeInput = z.infer<typeof knownPathMcpContributeInputSchema>;
export type KnownPathMcpReportOutcomeInput = z.infer<typeof knownPathMcpReportOutcomeInputSchema>;
