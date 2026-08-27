import { z } from "zod";

import {
  auditMetadataSchema,
  candidateAssessmentIdSchema,
  knownPathIdSchema,
  knownPathRevisionIdSchema,
  knownPathSearchDocumentIdSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  timestampSchema,
  versionedKeySchema,
  visibilityScopeSchema,
  workspaceIdSchema,
  outcomeAssessmentIdSchema,
  userIdSchema,
} from "./common.js";
import { knownPathStatusSchema } from "./knowledge.js";

export const searchEmbeddingStatusSchema = z.enum(["ready", "unavailable", "blocked"]);

export const knownPathSearchDocumentSchema = z
  .strictObject({
    _id: knownPathSearchDocumentIdSchema,
    schemaVersion: schemaVersionSchema,
    knownPathId: knownPathIdSchema,
    knownPathRevisionId: knownPathRevisionIdSchema,
    idempotencyKey: versionedKeySchema,
    active: z.boolean(),
    activatedAt: timestampSchema,
    retiredAt: timestampSchema.optional(),
    projectionVersion: z.int().positive(),
    textSchemaVersion: z.int().positive(),
    rankingSchemaVersion: z.int().positive(),
    contentHash: sha256Schema,
    title: shortStringSchema,
    problemSummary: nonEmptyStringSchema,
    searchableText: z.string().trim().min(1).max(200_000),
    symptoms: z.array(nonEmptyStringSchema).max(64),
    solutions: z.array(nonEmptyStringSchema).min(1).max(128),
    caveats: z.array(nonEmptyStringSchema).max(128),
    normalizedErrors: z.array(nonEmptyStringSchema).max(64),
    errorFingerprints: z.array(sha256Schema).max(64),
    errorCodes: z.array(shortStringSchema).max(64),
    exceptionClasses: z.array(shortStringSchema).max(64),
    ecosystem: shortStringSchema,
    packages: z.array(shortStringSchema).max(64),
    platforms: z.array(shortStringSchema).max(32),
    versions: z.array(shortStringSchema).max(64),
    versionConstraints: z
      .array(z.strictObject({ subject: shortStringSchema, value: shortStringSchema }))
      .max(128),
    environmentTokens: z.array(shortStringSchema).max(128),
    visibilityScope: visibilityScopeSchema,
    ownerUserId: z.uuidv4().optional(),
    workspaceId: workspaceIdSchema.optional(),
    knownPathStatus: knownPathStatusSchema,
    moderationStatus: z.enum(["unreviewed", "approved", "flagged", "rejected"]),
    conflictCount: z.int().nonnegative(),
    trust: z.strictObject({
      score: z.int().min(0).max(100),
      grade: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
      assessmentIds: z.array(candidateAssessmentIdSchema).min(1).max(512),
      scoreVersion: z.int().positive(),
    }),
    freshness: z.strictObject({
      status: z.enum(["current", "aging", "stale", "unknown"]),
      lastVerifiedAt: timestampSchema.optional(),
      staleAfter: timestampSchema.optional(),
    }),
    outcome: z.discriminatedUnion("status", [
      z.strictObject({ status: z.literal("unobserved"), sampleSize: z.literal(0) }),
      z.strictObject({
        status: z.literal("observed"),
        assessmentId: outcomeAssessmentIdSchema,
        confidenceScore: z.int().min(0).max(100),
        confidenceGrade: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
        effectiveSampleSize: z.number().nonnegative(),
        solved: z.int().nonnegative(),
        partiallyHelped: z.int().nonnegative(),
        attemptedFailed: z.int().nonnegative(),
        incompatibleEnvironment: z.int().nonnegative(),
        staleOrOutdated: z.int().nonnegative(),
        recentSuccesses: z.int().nonnegative(),
        anyHelpLowerBound: z.number().min(0).max(1),
        fullSolveLowerBound: z.number().min(0).max(1),
        lastSuccessfulAt: timestampSchema.optional(),
        trendStatus: z.enum(["insufficient_data", "stable", "declining"]),
        penalties: z.array(z.enum(["corroborated_safety", "outcome_degradation"])).max(2),
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
      }),
    ]),
    embedding: z.strictObject({
      status: searchEmbeddingStatusSchema,
      providerIdentifier: shortStringSchema,
      providerCapability: z.enum(["public_only", "approved_private"]),
      modelIdentifier: shortStringSchema,
      modelVersion: shortStringSchema,
      dimensions: z.int().min(128).max(3_072),
      inputFormatVersion: z.int().positive(),
      inputHash: sha256Schema,
      values: z.array(z.number().finite()).min(128).max(3_072).optional(),
      generatedAt: timestampSchema.optional(),
      latencyMs: z.int().nonnegative().optional(),
      reasonCode: shortStringSchema.optional(),
    }),
    generatedAt: timestampSchema,
    audit: auditMetadataSchema,
  })
  .superRefine((document, context) => {
    if (
      document.embedding.status === "ready" &&
      document.embedding.values?.length !== document.embedding.dimensions
    ) {
      context.addIssue({
        code: "custom",
        path: ["embedding", "values"],
        message: "ready embedding vector length must equal dimensions",
      });
    }
    if (
      document.embedding.providerCapability === "public_only" &&
      document.visibilityScope !== "public" &&
      document.embedding.status !== "blocked"
    ) {
      context.addIssue({
        code: "custom",
        path: ["visibilityScope"],
        message: "public-only providers require blocked embeddings for non-public visibility",
      });
    }
  });

export const retrievalVersionConstraintSchema = z.strictObject({
  subject: shortStringSchema,
  value: shortStringSchema,
});

export const retrievalAccessSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("public") }),
  z.strictObject({ scope: z.literal("private"), ownerUserId: userIdSchema }),
  z.strictObject({ scope: z.literal("team"), workspaceId: workspaceIdSchema }),
]);

export const retrievalQuerySchema = z.strictObject({
  text: z.string().trim().min(1).max(20_000),
  errors: z.array(z.string().trim().min(1).max(20_000)).max(16).default([]),
  ecosystem: shortStringSchema.optional(),
  packages: z.array(shortStringSchema).max(32).default([]),
  versions: z.array(retrievalVersionConstraintSchema).max(32).default([]),
  platforms: z.array(shortStringSchema).max(16).default([]),
  environment: z.array(shortStringSchema).max(64).default([]),
  context: z.string().trim().max(20_000).default(""),
  access: retrievalAccessSchema.default({ scope: "public" }),
  allowedStatuses: z.array(knownPathStatusSchema).min(1).max(6).default(["published"]),
  semanticMode: z.enum(["disabled", "optional", "required"]).default("optional"),
  limit: z.int().min(1).max(100).default(10),
  minimumScore: z.int().min(0).max(100).default(35),
});

export const versionFitSchema = z.enum(["exact", "compatible", "unknown", "incompatible"]);
export const retrievalCapabilityStateSchema = z.enum([
  "used",
  "unavailable",
  "disabled",
  "blocked",
]);

export const retrievalScoreBreakdownSchema = z.strictObject({
  policyIdentifier: z.literal("knownpath-retrieval-ranking"),
  policyVersion: z.int().positive(),
  policyDigest: sha256Schema,
  components: z.strictObject({
    exactError: z.int().min(0).max(20),
    lexical: z.int().min(0).max(15),
    semantic: z.int().min(0).max(12),
    metadataFit: z.int().min(0).max(15),
    versionFit: z.int().min(0).max(10),
    trust: z.int().min(0).max(8),
    freshness: z.int().min(0).max(5),
    outcomes: z.int().min(0).max(15),
  }),
  penalties: z
    .array(
      z.strictObject({
        code: shortStringSchema,
        points: z.int().nonpositive(),
        explanation: nonEmptyStringSchema,
      }),
    )
    .max(32),
  cap: z.int().min(0).max(100).optional(),
  finalScore: z.int().min(0).max(100),
  versionCompatibility: versionFitSchema,
  reasonCodes: z.array(shortStringSchema).min(1).max(128),
  explanations: z.array(nonEmptyStringSchema).min(1).max(128),
});

export const retrievalResultSchema = z.strictObject({
  knownPathId: knownPathIdSchema,
  searchDocumentId: knownPathSearchDocumentIdSchema,
  title: shortStringSchema,
  problemSummary: nonEmptyStringSchema,
  solutionSummary: nonEmptyStringSchema,
  status: knownPathStatusSchema,
  score: retrievalScoreBreakdownSchema,
  matchedBy: z
    .array(z.enum(["exact", "lexical", "semantic"]))
    .min(1)
    .max(3),
  trustAssessmentIds: z.array(candidateAssessmentIdSchema).min(1).max(512),
});

export type KnownPathSearchDocument = z.infer<typeof knownPathSearchDocumentSchema>;
export type RetrievalQuery = z.infer<typeof retrievalQuerySchema>;
export type RetrievalResult = z.infer<typeof retrievalResultSchema>;
export type RetrievalScoreBreakdown = z.infer<typeof retrievalScoreBreakdownSchema>;
export type VersionFit = z.infer<typeof versionFitSchema>;
export type RetrievalAccess = z.infer<typeof retrievalAccessSchema>;
