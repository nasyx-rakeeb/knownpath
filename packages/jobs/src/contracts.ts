import { createHash } from "node:crypto";

import {
  pipelineJobNameSchema,
  pipelineQueueNameSchema,
  pipelineRunIdSchema,
  pipelineStepIdSchema,
  pipelineTargetSchema,
  pipelineTriggerSchema,
  type PipelineJobName,
  type PipelineQueueName,
} from "@knownpath/domain";
import { z } from "zod";

export const operationalJobDataSchema = z.strictObject({
  contractVersion: z.literal(1),
  pipelineRunId: pipelineRunIdSchema,
  pipelineStepId: pipelineStepIdSchema,
  jobName: pipelineJobNameSchema,
  queueName: pipelineQueueNameSchema,
  target: pipelineTargetSchema,
  trigger: pipelineTriggerSchema,
  chainDepth: z.int().min(0).max(16),
  options: z.record(z.string(), z.unknown()).default({}),
});

export type OperationalJobData = z.infer<typeof operationalJobDataSchema>;

export class PermanentJobError extends Error {}

const emptyOptionsSchema = z.strictObject({});
const sourceOptionsSchema = z.strictObject({
  limit: z.int().min(1).max(1_000).optional(),
  extractionLimit: z.int().min(1).max(1_000).optional(),
  backfill: z.boolean().optional(),
  scope: z.enum(["curated", "all"]).optional(),
  page: z.url({ protocol: /^https$/u }).optional(),
  version: z.string().trim().min(1).max(128).optional(),
});
const extractionOptionsSchema = z.strictObject({ force: z.boolean().optional() });
const canonicalizationOptionsSchema = z.strictObject({ contributionId: z.uuidv4().optional() });
const holdOptionsSchema = z.strictObject({ durationMs: z.int().min(100).max(60_000).optional() });
const failOptionsSchema = z.strictObject({ permanent: z.boolean().optional() });

const jobOptionsSchemas: Readonly<Record<PipelineJobName, z.ZodType>> = {
  "control.sources.discover": emptyOptionsSchema,
  "source.github.sync": sourceOptionsSchema,
  "source.official.sync": sourceOptionsSchema,
  "source.extract": extractionOptionsSchema,
  "candidate.score": emptyOptionsSchema,
  "candidate.canonicalize": canonicalizationOptionsSchema,
  "knownpath.project": emptyOptionsSchema,
  "knownpath.reembed": emptyOptionsSchema,
  "knowledge.freshness.rescore": emptyOptionsSchema,
  "contribution.process": emptyOptionsSchema,
  "outcomes.aggregate": emptyOptionsSchema,
  "maintenance.reconcile": emptyOptionsSchema,
  "maintenance.retry-stale": emptyOptionsSchema,
  "development.hold": holdOptionsSchema,
  "development.fail": failOptionsSchema,
};

export function parseJobOptions(
  jobName: PipelineJobName,
  value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return jobOptionsSchemas[jobName].parse(value ?? {}) as Readonly<Record<string, unknown>>;
}

export const queueForJob: Readonly<Record<PipelineJobName, PipelineQueueName>> = {
  "control.sources.discover": "control",
  "source.github.sync": "github",
  "source.official.sync": "sources",
  "source.extract": "ai",
  "candidate.score": "knowledge",
  "candidate.canonicalize": "knowledge",
  "knownpath.project": "knowledge",
  "knownpath.reembed": "ai",
  "knowledge.freshness.rescore": "knowledge",
  "contribution.process": "feedback",
  "outcomes.aggregate": "feedback",
  "maintenance.reconcile": "control",
  "maintenance.retry-stale": "control",
  "development.hold": "control",
  "development.fail": "control",
};

export function stableDigest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
