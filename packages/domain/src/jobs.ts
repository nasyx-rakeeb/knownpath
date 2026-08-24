import { z } from "zod";

import {
  apiKeyIdSchema,
  auditMetadataSchema,
  pipelineRunIdSchema,
  pipelineStepIdSchema,
  schemaVersionSchema,
  shortStringSchema,
  timestampSchema,
  userIdSchema,
  versionedKeySchema,
  workerHeartbeatIdSchema,
} from "./common.js";

export const pipelineTriggerSchema = z.enum([
  "api",
  "chained",
  "operator",
  "reconciliation",
  "scheduler",
]);

export const pipelineRunKindSchema = z.enum([
  "contribution",
  "maintenance",
  "outcome",
  "reprocess",
  "source_backfill",
  "source_sync",
]);

export const pipelineRunStatusSchema = z.enum([
  "queued",
  "running",
  "partially_completed",
  "completed",
  "failed",
  "quarantined",
  "cancelled",
]);

export const pipelineStepStatusSchema = z.enum([
  "pending_dispatch",
  "waiting",
  "active",
  "retrying",
  "completed",
  "failed",
  "quarantined",
  "cancelled",
]);

export const pipelineQueueNameSchema = z.enum([
  "control",
  "github",
  "sources",
  "ai",
  "knowledge",
  "feedback",
]);

export const pipelineJobNameSchema = z.enum([
  "control.sources.discover",
  "source.github.sync",
  "source.official.sync",
  "source.extract",
  "candidate.score",
  "candidate.canonicalize",
  "knownpath.project",
  "knownpath.reembed",
  "knowledge.freshness.rescore",
  "contribution.process",
  "outcomes.aggregate",
  "maintenance.reconcile",
  "maintenance.retry-stale",
  "development.hold",
  "development.fail",
]);

export const pipelineTargetSchema = z.strictObject({
  kind: z.enum([
    "all_sources",
    "candidate",
    "contribution",
    "development",
    "knownpath",
    "outcome",
    "source_item",
    "source_registry",
    "system",
  ]),
  id: z.string().trim().min(1).max(512),
});

const safePipelineErrorSchema = z.strictObject({
  code: shortStringSchema,
  message: z.string().trim().min(1).max(1_000),
  occurredAt: timestampSchema,
});

export const pipelineRunSchema = z.strictObject({
  _id: pipelineRunIdSchema,
  schemaVersion: schemaVersionSchema,
  kind: pipelineRunKindSchema,
  trigger: pipelineTriggerSchema,
  status: pipelineRunStatusSchema,
  scope: z.strictObject({
    target: pipelineTargetSchema,
    requestedJobName: pipelineJobNameSchema.optional(),
  }),
  initiator: z
    .strictObject({
      kind: z.enum(["api_key", "system", "user"]),
      userId: userIdSchema.optional(),
      apiKeyId: apiKeyIdSchema.optional(),
    })
    .optional(),
  counters: z.strictObject({
    total: z.int().nonnegative(),
    waiting: z.int().nonnegative(),
    active: z.int().nonnegative(),
    completed: z.int().nonnegative(),
    failed: z.int().nonnegative(),
    quarantined: z.int().nonnegative(),
  }),
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  lastError: safePipelineErrorSchema.optional(),
  audit: auditMetadataSchema,
});

export const pipelineStepSchema = z.strictObject({
  _id: pipelineStepIdSchema,
  schemaVersion: schemaVersionSchema,
  pipelineRunId: pipelineRunIdSchema,
  jobName: pipelineJobNameSchema,
  queueName: pipelineQueueNameSchema,
  target: pipelineTargetSchema,
  idempotencyKey: versionedKeySchema,
  payloadDigest: z.hash("sha256"),
  payload: z.record(z.string(), z.unknown()),
  bullmqJobId: z.string().trim().min(1).max(128),
  trigger: pipelineTriggerSchema,
  chainDepth: z.int().min(0).max(16),
  status: pipelineStepStatusSchema,
  attemptsMade: z.int().nonnegative(),
  maxAttempts: z.int().min(1).max(20),
  processingVersions: z.record(z.string().trim().min(1).max(128), shortStringSchema),
  dispatchedAt: timestampSchema.optional(),
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  lastError: safePipelineErrorSchema.optional(),
  quarantineReason: shortStringSchema.optional(),
  audit: auditMetadataSchema,
});

export const workerHeartbeatSchema = z.strictObject({
  _id: workerHeartbeatIdSchema,
  schemaVersion: schemaVersionSchema,
  workerVersion: shortStringSchema,
  queues: z.array(pipelineQueueNameSchema).min(1).max(16),
  state: z.enum(["starting", "ready", "stopping", "stopped", "failed"]),
  activeJobs: z.int().nonnegative(),
  startedAt: timestampSchema,
  lastHeartbeatAt: timestampSchema,
  stoppingAt: timestampSchema.optional(),
  stoppedAt: timestampSchema.optional(),
  expiresAt: timestampSchema,
  audit: auditMetadataSchema,
});

export type PipelineTrigger = z.infer<typeof pipelineTriggerSchema>;
export type PipelineRun = z.infer<typeof pipelineRunSchema>;
export type PipelineRunKind = z.infer<typeof pipelineRunKindSchema>;
export type PipelineRunStatus = z.infer<typeof pipelineRunStatusSchema>;
export type PipelineStep = z.infer<typeof pipelineStepSchema>;
export type PipelineStepStatus = z.infer<typeof pipelineStepStatusSchema>;
export type PipelineQueueName = z.infer<typeof pipelineQueueNameSchema>;
export type PipelineJobName = z.infer<typeof pipelineJobNameSchema>;
export type PipelineTarget = z.infer<typeof pipelineTargetSchema>;
export type WorkerHeartbeat = z.infer<typeof workerHeartbeatSchema>;
