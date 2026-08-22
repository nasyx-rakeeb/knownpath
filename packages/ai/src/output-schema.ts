import { z } from "zod";

const evidenceIdSchema = z.uuidv4();
const evidenceIdsSchema = z.array(evidenceIdSchema).min(1).max(32);
const optionalNonEmptyString = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(maximum).optional(),
  );

const modelEvidenceSchema = z.strictObject({
  sourceItemId: evidenceIdSchema,
  relationship: z.enum([
    "supports_problem",
    "supports_solution",
    "verifies_outcome",
    "conflicts",
    "context",
  ]),
  excerpt: z.string().trim().min(1).max(10_000),
  locator: z.string().trim().min(1).max(1_000).optional(),
});

export const extractionOutputSchema = z
  .strictObject({
    classification: z.enum([
      "reusable",
      "irrelevant",
      "insufficient_evidence",
      "conflicting_evidence",
    ]),
    conciseReason: z.string().trim().min(1).max(2_000),
    problemStatement: optionalNonEmptyString(10_000),
    ecosystems: z.array(z.string().trim().min(1).max(256)).max(16).default([]),
    packages: z
      .array(
        z.strictObject({
          ecosystem: z.string().trim().min(1).max(256),
          name: z.string().trim().min(1).max(256),
          version: z.string().trim().min(1).max(256).optional(),
          role: z.enum(["affected", "solution", "environment", "unknown"]),
        }),
      )
      .max(64)
      .default([]),
    platforms: z.array(z.string().trim().min(1).max(256)).max(32).default([]),
    versions: z.array(z.string().trim().min(1).max(256)).max(64).default([]),
    symptoms: z
      .array(
        z.strictObject({
          summary: z.string().trim().min(1).max(10_000),
          errorMessage: z.string().trim().min(1).max(20_000).optional(),
          evidenceSourceItemIds: evidenceIdsSchema,
        }),
      )
      .max(64)
      .default([]),
    rootCause: z
      .strictObject({
        summary: z.string().trim().min(1).max(10_000),
        evidenceSourceItemIds: evidenceIdsSchema,
      })
      .optional(),
    attemptedApproaches: z
      .array(
        z.strictObject({
          summary: z.string().trim().min(1).max(10_000),
          outcome: z.enum(["failed", "partial", "unknown"]),
          reason: z.string().trim().min(1).max(10_000).optional(),
          evidenceSourceItemIds: evidenceIdsSchema,
        }),
      )
      .max(32)
      .default([]),
    solutionSummary: optionalNonEmptyString(10_000),
    solutionSteps: z
      .array(
        z.strictObject({
          instruction: z.string().trim().min(1).max(10_000),
          title: z.string().trim().min(1).max(256).optional(),
          code: z.string().max(50_000).optional(),
          language: z.string().trim().min(1).max(256).optional(),
          verification: z.string().trim().min(1).max(10_000).optional(),
          evidenceSourceItemIds: evidenceIdsSchema,
        }),
      )
      .max(64)
      .default([]),
    caveats: z.array(z.string().trim().min(1).max(10_000)).max(64).default([]),
    evidence: z.array(modelEvidenceSchema).max(128).default([]),
    conflicts: z.array(modelEvidenceSchema).max(64).default([]),
    verificationLabels: z
      .array(
        z.strictObject({
          label: z.enum(["author_confirmed", "maintainer_confirmed", "official_doc_supported"]),
          evidenceSourceItemIds: evidenceIdsSchema,
        }),
      )
      .max(32)
      .default([]),
  })
  .superRefine((value, context) => {
    if (value.classification !== "reusable") return;
    if (value.problemStatement === undefined) {
      context.addIssue({ code: "custom", message: "reusable output requires problemStatement" });
    }
    if (value.solutionSummary === undefined || value.solutionSteps.length === 0) {
      context.addIssue({
        code: "custom",
        message: "reusable output requires a solution and steps",
      });
    }
    if (value.symptoms.length === 0 || value.evidence.length === 0) {
      context.addIssue({
        code: "custom",
        message: "reusable output requires symptoms and evidence",
      });
    }
  });

export const EXTRACTION_OUTPUT_SCHEMA_VERSION = 2;

const stringArray = { type: "array", items: { type: "string" } } as const;
const evidenceReferenceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sourceItemId", "relationship", "excerpt"],
  properties: {
    sourceItemId: { type: "string" },
    relationship: {
      type: "string",
      enum: ["supports_problem", "supports_solution", "verifies_outcome", "conflicts", "context"],
    },
    excerpt: { type: "string" },
    locator: { type: "string" },
  },
} as const;

export const extractionOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "classification",
    "conciseReason",
    "ecosystems",
    "packages",
    "platforms",
    "versions",
    "symptoms",
    "attemptedApproaches",
    "solutionSteps",
    "caveats",
    "evidence",
    "conflicts",
    "verificationLabels",
  ],
  properties: {
    classification: {
      type: "string",
      enum: ["reusable", "irrelevant", "insufficient_evidence", "conflicting_evidence"],
    },
    conciseReason: { type: "string" },
    problemStatement: { type: "string" },
    ecosystems: stringArray,
    packages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ecosystem", "name", "role"],
        properties: {
          ecosystem: { type: "string" },
          name: { type: "string" },
          version: { type: "string" },
          role: { type: "string", enum: ["affected", "solution", "environment", "unknown"] },
        },
      },
    },
    platforms: stringArray,
    versions: stringArray,
    symptoms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "evidenceSourceItemIds"],
        properties: {
          summary: { type: "string" },
          errorMessage: { type: "string" },
          evidenceSourceItemIds: stringArray,
        },
      },
    },
    rootCause: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "evidenceSourceItemIds"],
      properties: { summary: { type: "string" }, evidenceSourceItemIds: stringArray },
    },
    attemptedApproaches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "outcome", "evidenceSourceItemIds"],
        properties: {
          summary: { type: "string" },
          outcome: { type: "string", enum: ["failed", "partial", "unknown"] },
          reason: { type: "string" },
          evidenceSourceItemIds: stringArray,
        },
      },
    },
    solutionSummary: { type: "string" },
    solutionSteps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["instruction", "evidenceSourceItemIds"],
        properties: {
          instruction: { type: "string" },
          title: { type: "string" },
          code: { type: "string" },
          language: { type: "string" },
          verification: { type: "string" },
          evidenceSourceItemIds: stringArray,
        },
      },
    },
    caveats: stringArray,
    evidence: { type: "array", items: evidenceReferenceJsonSchema },
    conflicts: { type: "array", items: evidenceReferenceJsonSchema },
    verificationLabels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "evidenceSourceItemIds"],
        properties: {
          label: {
            type: "string",
            enum: ["author_confirmed", "maintainer_confirmed", "official_doc_supported"],
          },
          evidenceSourceItemIds: stringArray,
        },
      },
    },
  },
} as const;

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
