import { z } from "zod";

import {
  auditMetadataSchema,
  ingestionRunIdSchema,
  schemaVersionSchema,
  shortStringSchema,
  sourceRegistryIdSchema,
  timestampSchema,
  versionedKeySchema,
} from "./common.js";

export const ingestionRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const ingestionTriggerSchema = z.enum(["manual", "scheduled", "webhook", "retry"]);

export const ingestionCountersSchema = z
  .object({
    discovered: z.int().nonnegative().default(0),
    created: z.int().nonnegative().default(0),
    updated: z.int().nonnegative().default(0),
    unchanged: z.int().nonnegative().default(0),
    failed: z.int().nonnegative().default(0),
    rateLimited: z.int().nonnegative().default(0),
  })
  .catchall(z.int().nonnegative());

export const ingestionRunSchema = z.strictObject({
  _id: ingestionRunIdSchema,
  schemaVersion: schemaVersionSchema,
  sourceRegistryId: sourceRegistryIdSchema,
  trigger: ingestionTriggerSchema,
  deduplicationKey: versionedKeySchema,
  status: ingestionRunStatusSchema,
  stage: shortStringSchema,
  attempt: z.int().positive(),
  maxAttempts: z.int().positive(),
  nextAttemptAt: timestampSchema.optional(),
  leaseExpiresAt: timestampSchema.optional(),
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  counters: ingestionCountersSchema.default({
    discovered: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    rateLimited: 0,
  }),
  failure: z
    .strictObject({
      code: shortStringSchema,
      message: z.string().trim().min(1).max(4_000),
      retryable: z.boolean(),
    })
    .optional(),
  audit: auditMetadataSchema,
});

export type IngestionRun = z.infer<typeof ingestionRunSchema>;
export type IngestionCounters = z.infer<typeof ingestionCountersSchema>;
