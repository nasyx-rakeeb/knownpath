import { z } from "zod";

import {
  candidateExperienceIdSchema,
  knownPathIdSchema,
  pipelineStepIdSchema,
  shortStringSchema,
  sourceRegistryIdSchema,
  timestampSchema,
  userIdSchema,
} from "./common.js";
import { pipelineQueueNameSchema } from "./jobs.js";

export const ADMIN_CONTRACT_VERSION = 1 as const;
export const ADMIN_FRESH_SESSION_SECONDS = 30 * 60;

export const adminCapabilitySchema = z.enum([
  "operations:read",
  "operations:write",
  "sources:read",
  "sources:write",
  "knowledge:read",
  "knowledge:moderate",
  "contributions:read",
  "contributions:moderate",
  "private_content:read",
  "users:read",
  "users:write",
  "audit:read",
]);

export const adminResourceSchema = z.enum([
  "sources",
  "source-items",
  "jobs",
  "extractions",
  "candidates",
  "known-paths",
  "contributions",
  "outcomes",
  "users",
  "audit",
]);

export const adminSensitiveActionSchema = z.enum([
  "canonical.merge",
  "canonical.split",
  "canonical.reassign",
  "moderation.approve",
  "moderation.quarantine",
  "moderation.reject",
  "moderation.deprecate",
  "moderation.restore",
  "queue.pause",
  "queue.resume",
  "job.retry",
  "source.update",
  "source.sync",
  "user.suspend",
  "user.restore",
  "private_content.reveal",
]);

export const adminConfirmationSchema = z.strictObject({
  version: z.literal(ADMIN_CONTRACT_VERSION),
  action: adminSensitiveActionSchema,
  target: z.string().trim().min(1).max(512),
  reason: z.string().trim().min(8).max(2_000),
  phrase: z.string().trim().min(1).max(1_024),
});

export const adminListQuerySchema = z.strictObject({
  cursor: z.string().trim().min(8).max(2_048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().min(2).max(256).optional(),
});

const adminFactValueSchema = z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]);

export const adminListItemSchema = z.strictObject({
  id: z.string().trim().min(1).max(512),
  kind: adminResourceSchema,
  title: z.string().trim().min(1).max(1_000),
  status: z.string().trim().min(1).max(128),
  summary: z.string().trim().max(2_000).optional(),
  visibility: z.enum(["public", "private", "team"]).optional(),
  occurredAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional(),
  facts: z.record(z.string().trim().min(1).max(64), adminFactValueSchema).default({}),
});

export const adminListResponseSchema = z.strictObject({
  contractVersion: z.literal(ADMIN_CONTRACT_VERSION),
  resource: adminResourceSchema,
  items: z.array(adminListItemSchema).max(100),
  nextCursor: z.string().max(2_048).optional(),
});

export const adminDetailFieldSchema = z.strictObject({
  label: shortStringSchema,
  value: z.string().max(20_000),
  tone: z.enum(["neutral", "positive", "warning", "critical"]).default("neutral"),
});

export const adminDetailSectionSchema = z.strictObject({
  title: shortStringSchema,
  fields: z.array(adminDetailFieldSchema).max(256).default([]),
  text: z.string().max(200_000).optional(),
});

export const adminDetailResponseSchema = z.strictObject({
  contractVersion: z.literal(ADMIN_CONTRACT_VERSION),
  resource: adminResourceSchema,
  id: z.string().trim().min(1).max(512),
  title: z.string().trim().min(1).max(1_000),
  status: z.string().trim().min(1).max(128),
  visibility: z.enum(["public", "private", "team"]).optional(),
  sections: z.array(adminDetailSectionSchema).max(64),
  references: z.array(z.strictObject({ label: shortStringSchema, url: z.url() })).max(256),
  privateContentAvailable: z.boolean().default(false),
});

export const adminOverviewResponseSchema = z.strictObject({
  contractVersion: z.literal(ADMIN_CONTRACT_VERSION),
  admin: z.strictObject({ id: userIdSchema, displayName: shortStringSchema }),
  capabilities: z.array(adminCapabilitySchema),
  freshUntil: timestampSchema,
  counts: z.record(z.string().trim().min(1).max(64), z.int().nonnegative()),
  queues: z.strictObject({
    status: z.enum(["ok", "disabled", "unavailable"]),
    activeWorkers: z.int().nonnegative(),
    counts: z.record(z.string().trim().min(1).max(64), z.int().nonnegative()),
  }),
  providers: z.strictObject({
    gemini: z.enum(["configured", "unconfigured"]),
    embeddingModel: shortStringSchema,
    searchBackend: z.enum(["local", "atlas"]),
  }),
});

export const adminModerationRequestSchema = z.strictObject({
  resource: z.enum(["candidate", "contribution", "known_path"]),
  id: z.string().trim().min(1).max(512),
  action: z.enum(["approve", "quarantine", "reject", "deprecate", "restore"]),
  expectedStatus: z.string().trim().min(1).max(128),
  confirmation: adminConfirmationSchema,
});

export const adminQueueControlRequestSchema = z.strictObject({
  queue: pipelineQueueNameSchema,
  action: z.enum(["pause", "resume"]),
  confirmation: adminConfirmationSchema,
});

export const adminJobRetryRequestSchema = z.strictObject({
  stepId: pipelineStepIdSchema,
  confirmation: adminConfirmationSchema,
});

export const adminSourceActionRequestSchema = z.strictObject({
  sourceRegistryId: sourceRegistryIdSchema,
  action: z.enum(["enable", "disable", "sync"]),
  confirmation: adminConfirmationSchema,
});

export const adminPrivateRevealRequestSchema = z.strictObject({
  contributionId: z.uuidv4(),
  confirmation: adminConfirmationSchema,
});

export const adminPrivateRevealResponseSchema = z.strictObject({
  contractVersion: z.literal(ADMIN_CONTRACT_VERSION),
  contributionId: z.uuidv4(),
  sanitizedPayload: z.record(z.string(), z.unknown()),
  sanitization: z.strictObject({
    status: z.enum(["clean", "sanitized", "quarantined"]),
    findingCategories: z.array(shortStringSchema).max(64),
    redactedCharacters: z.int().nonnegative(),
  }),
});

export const adminCanonicalPreviewRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("merge"),
    candidateIds: z.array(candidateExperienceIdSchema).min(1).max(32),
    targetKnownPathId: knownPathIdSchema.optional(),
    alternativeSolution: z.boolean().default(false),
  }),
  z.strictObject({ action: z.literal("split"), candidateId: candidateExperienceIdSchema }),
  z.strictObject({
    action: z.literal("reassign"),
    candidateId: candidateExperienceIdSchema,
    targetKnownPathId: knownPathIdSchema,
  }),
]);

export const adminCanonicalPreviewResponseSchema = z.strictObject({
  contractVersion: z.literal(ADMIN_CONTRACT_VERSION),
  previewDigest: z.hash("sha256"),
  action: z.enum(["merge", "split", "reassign"]),
  candidateIds: z.array(candidateExperienceIdSchema).max(32),
  affectedKnownPathIds: z.array(knownPathIdSchema).max(64),
  warnings: z.array(z.string().trim().min(1).max(2_000)).max(32),
  expiresAt: timestampSchema,
});

export const adminCanonicalExecuteRequestSchema = z.strictObject({
  preview: adminCanonicalPreviewRequestSchema,
  previewDigest: z.hash("sha256"),
  confirmation: adminConfirmationSchema,
});

export const adminUserActionRequestSchema = z.strictObject({
  userId: userIdSchema,
  action: z.enum(["suspend", "restore"]),
  expectedStatus: z.enum(["active", "suspended"]),
  confirmation: adminConfirmationSchema,
});

export type AdminCapability = z.infer<typeof adminCapabilitySchema>;
export type AdminConfirmation = z.infer<typeof adminConfirmationSchema>;
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type AdminResource = z.infer<typeof adminResourceSchema>;
export type AdminSensitiveAction = z.infer<typeof adminSensitiveActionSchema>;
