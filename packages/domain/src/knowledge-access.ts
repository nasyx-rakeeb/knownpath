import { z } from "zod";

import {
  apiKeyIdSchema,
  auditMetadataSchema,
  knowledgeSearchEventIdSchema,
  knownPathIdSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  sourceItemIdSchema,
  timestampSchema,
  userIdSchema,
} from "./common.js";
import { retrievalCapabilityStateSchema, versionFitSchema } from "./search.js";
import { sourceAuthoritySchema, sourceItemTypeSchema, sourceKindSchema } from "./sources.js";

export const KNOWLEDGE_API_CONTRACT_VERSION = 1 as const;

export const knowledgeAccessModeSchema = z.enum(["published", "review"]);

export const knowledgeSearchRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(5_000),
  errors: z.array(z.string().trim().min(1).max(2_000)).max(8).default([]),
  ecosystem: shortStringSchema.optional(),
  packages: z.array(shortStringSchema).max(16).default([]),
  versions: z
    .array(z.strictObject({ subject: shortStringSchema, value: shortStringSchema }))
    .max(16)
    .default([]),
  platforms: z.array(shortStringSchema).max(12).default([]),
  environment: z.array(shortStringSchema).max(32).default([]),
  context: z.string().trim().max(5_000).default(""),
  semanticMode: z.enum(["disabled", "optional", "required"]).default("optional"),
  limit: z.int().min(1).max(25).default(10),
  minimumScore: z.int().min(0).max(100).default(35),
  includeReview: z.boolean().default(false),
});

export const safeProvenanceSchema = z.strictObject({
  sourceItemId: sourceItemIdSchema,
  canonicalUrl: z.url(),
  title: z.string().trim().min(1).max(500).optional(),
  itemType: sourceItemTypeSchema,
  sourceKind: sourceKindSchema,
  authority: sourceAuthoritySchema,
  publisher: shortStringSchema,
  relationship: z.enum([
    "supports_problem",
    "supports_solution",
    "verifies_outcome",
    "conflicts",
    "context",
  ]),
  locator: z.string().trim().min(1).max(500).optional(),
  excerpt: z.string().trim().min(1).max(1_000).optional(),
});

export const safeApplicabilitySchema = z.strictObject({
  ecosystem: shortStringSchema,
  packages: z
    .array(
      z.strictObject({
        name: shortStringSchema,
        version: z.string().trim().min(1).max(256).optional(),
        role: z.enum(["affected", "solution", "environment", "unknown"]),
      }),
    )
    .max(64),
  platforms: z.array(shortStringSchema).max(32),
  versions: z.array(z.string().trim().min(1).max(256)).max(64),
  runtimes: z.array(shortStringSchema).max(16),
  operatingSystems: z.array(shortStringSchema).max(16),
  frameworks: z.array(shortStringSchema).max(32),
  toolchain: z.array(shortStringSchema).max(32),
});

export const safeTrustSchema = z.strictObject({
  score: z.int().min(0).max(100),
  grade: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
  explanation: nonEmptyStringSchema,
});

export const safeFreshnessSchema = z.strictObject({
  status: z.enum(["current", "aging", "stale", "unknown"]),
  lastVerifiedAt: z.iso.datetime().optional(),
  staleAfter: z.iso.datetime().optional(),
});

export const safeOutcomeVerificationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("unobserved"),
    explanation: nonEmptyStringSchema,
  }),
  z.strictObject({
    status: z.literal("limited"),
    effectiveSampleSize: z.number().nonnegative(),
    explanation: nonEmptyStringSchema,
  }),
  z.strictObject({
    status: z.literal("observed"),
    confidenceScore: z.int().min(0).max(100),
    confidenceGrade: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
    effectiveSampleSize: z.number().nonnegative(),
    recentSuccesses: z.int().nonnegative(),
    solved: z.int().nonnegative(),
    partiallyHelped: z.int().nonnegative(),
    attemptedFailed: z.int().nonnegative(),
    incompatibleEnvironment: z.int().nonnegative(),
    staleOrOutdated: z.int().nonnegative(),
    lastSuccessfulAt: z.iso.datetime().optional(),
    trend: z.enum(["insufficient_data", "stable", "declining"]),
    explanation: nonEmptyStringSchema,
  }),
]);

export const safeRelevanceSchema = z.strictObject({
  score: z.int().min(0).max(100),
  versionCompatibility: versionFitSchema,
  matchedBy: z
    .array(z.enum(["exact", "lexical", "semantic"]))
    .min(1)
    .max(3),
  components: z.strictObject({
    exactError: z.int(),
    lexical: z.int(),
    semantic: z.int(),
    metadataFit: z.int(),
    versionFit: z.int(),
    trust: z.int(),
    freshness: z.int(),
    outcomes: z.int(),
  }),
  penalties: z
    .array(z.strictObject({ code: shortStringSchema, points: z.int().nonpositive() }))
    .max(32),
  reasonCodes: z.array(shortStringSchema).max(128),
  explanations: z.array(nonEmptyStringSchema).max(128),
});

export const knowledgeSearchResultSchema = z.strictObject({
  id: knownPathIdSchema,
  title: shortStringSchema,
  problemSummary: nonEmptyStringSchema,
  solutionSummary: nonEmptyStringSchema,
  status: z.enum(["review", "published", "deprecated"]),
  applicability: safeApplicabilitySchema,
  caveats: z.array(nonEmptyStringSchema).max(64),
  trust: safeTrustSchema,
  freshness: safeFreshnessSchema,
  outcomes: safeOutcomeVerificationSchema,
  relevance: safeRelevanceSchema,
  provenance: z.array(safeProvenanceSchema).max(64),
});

export const retrievalCapabilitySchema = z.strictObject({
  state: retrievalCapabilityStateSchema,
  reason: nonEmptyStringSchema,
});

export const knowledgeSearchResponseSchema = z.strictObject({
  contractVersion: z.literal(KNOWLEDGE_API_CONTRACT_VERSION),
  searchId: knowledgeSearchEventIdSchema,
  accessMode: knowledgeAccessModeSchema,
  capabilities: z.strictObject({
    exact: retrievalCapabilitySchema,
    lexical: retrievalCapabilitySchema,
    semantic: retrievalCapabilitySchema,
  }),
  results: z.array(knowledgeSearchResultSchema).max(25),
});

export const safeSolutionStepSchema = z.strictObject({
  order: z.int().positive(),
  title: shortStringSchema.optional(),
  instruction: nonEmptyStringSchema,
  code: z.string().max(20_000).optional(),
  language: shortStringSchema.optional(),
  verification: z.string().trim().min(1).max(5_000).optional(),
});

export const safeSolutionVariantSchema = z.strictObject({
  id: z.string().trim().min(16).max(128),
  summary: nonEmptyStringSchema,
  steps: z.array(safeSolutionStepSchema).min(1).max(64),
  caveats: z.array(nonEmptyStringSchema).max(64),
  applicability: safeApplicabilitySchema,
  trust: safeTrustSchema,
});

export const knownPathDetailResponseSchema = z.strictObject({
  contractVersion: z.literal(KNOWLEDGE_API_CONTRACT_VERSION),
  id: knownPathIdSchema,
  title: shortStringSchema,
  problemSummary: nonEmptyStringSchema,
  status: z.enum(["review", "published", "deprecated"]),
  symptoms: z
    .array(
      z.strictObject({ summary: nonEmptyStringSchema, category: shortStringSchema.optional() }),
    )
    .max(64),
  errors: z.array(z.strictObject({ normalized: nonEmptyStringSchema })).max(64),
  applicability: safeApplicabilitySchema,
  solutions: z.array(safeSolutionVariantSchema).min(1).max(32),
  trust: safeTrustSchema,
  freshness: safeFreshnessSchema,
  outcomes: safeOutcomeVerificationSchema,
  provenance: z.array(safeProvenanceSchema).max(512),
});

export const knownPathIdParamsSchema = z.strictObject({ id: knownPathIdSchema });

export const alternativesQuerySchema = z.strictObject({
  cursor: z.string().trim().min(1).max(2_048).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  includeReview: queryBooleanSchema().default(false),
});

export const knownPathAlternativesResponseSchema = z.strictObject({
  contractVersion: z.literal(KNOWLEDGE_API_CONTRACT_VERSION),
  knownPathId: knownPathIdSchema,
  items: z.array(safeSolutionVariantSchema).max(25),
  nextCursor: z.string().trim().min(1).max(2_048).nullable(),
});

export const knownPathDetailQuerySchema = z.strictObject({
  includeReview: queryBooleanSchema().default(false),
});

export const knowledgeSelectionRequestSchema = z.strictObject({
  knownPathId: knownPathIdSchema,
});

export const knowledgeSearchIdParamsSchema = z.strictObject({
  searchId: knowledgeSearchEventIdSchema,
});

export const knowledgeSelectionResponseSchema = z.strictObject({
  contractVersion: z.literal(KNOWLEDGE_API_CONTRACT_VERSION),
  searchId: knowledgeSearchEventIdSchema,
  knownPathId: knownPathIdSchema,
  recordedAt: z.iso.datetime(),
});

export const knowledgeSearchPrincipalSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("session"), userId: userIdSchema }),
  z.strictObject({ kind: z.literal("api_key"), userId: userIdSchema, apiKeyId: apiKeyIdSchema }),
]);

export const knowledgeSearchEventSchema = z.strictObject({
  _id: knowledgeSearchEventIdSchema,
  schemaVersion: schemaVersionSchema,
  principal: knowledgeSearchPrincipalSchema,
  accessMode: knowledgeAccessModeSchema,
  requestId: z.string().trim().min(8).max(128),
  queryDigest: sha256Schema,
  digestVersion: z.int().positive(),
  querySummary: z.strictObject({
    ecosystem: shortStringSchema.optional(),
    packageCount: z.int().nonnegative(),
    versionCount: z.int().nonnegative(),
    platformCount: z.int().nonnegative(),
    errorCount: z.int().nonnegative(),
    semanticMode: z.enum(["disabled", "optional", "required"]),
  }),
  results: z
    .array(
      z.strictObject({ knownPathId: knownPathIdSchema, rank: z.int().positive(), score: z.int() }),
    )
    .max(25),
  selected: z
    .strictObject({
      knownPathId: knownPathIdSchema,
      rank: z.int().positive(),
      recordedAt: timestampSchema,
      requestId: z.string().trim().min(8).max(128),
    })
    .optional(),
  createdAt: timestampSchema,
  audit: auditMetadataSchema,
});

export type KnowledgeAccessMode = z.infer<typeof knowledgeAccessModeSchema>;
export type KnowledgeSearchRequest = z.infer<typeof knowledgeSearchRequestSchema>;
export type KnowledgeSearchResponse = z.infer<typeof knowledgeSearchResponseSchema>;
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;
export type KnownPathDetailResponse = z.infer<typeof knownPathDetailResponseSchema>;
export type KnownPathAlternativesResponse = z.infer<typeof knownPathAlternativesResponseSchema>;
export type SafeProvenance = z.infer<typeof safeProvenanceSchema>;
export type SafeApplicability = z.infer<typeof safeApplicabilitySchema>;
export type SafeTrust = z.infer<typeof safeTrustSchema>;
export type SafeFreshness = z.infer<typeof safeFreshnessSchema>;
export type SafeOutcomeVerification = z.infer<typeof safeOutcomeVerificationSchema>;
export type SafeSolutionVariant = z.infer<typeof safeSolutionVariantSchema>;
export type KnowledgeSearchPrincipal = z.infer<typeof knowledgeSearchPrincipalSchema>;
export type KnowledgeSearchEvent = z.infer<typeof knowledgeSearchEventSchema>;

function queryBooleanSchema() {
  return z.preprocess((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }, z.boolean());
}
