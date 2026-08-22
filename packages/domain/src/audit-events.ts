import { z } from "zod";

import {
  apiKeyIdSchema,
  auditEventIdSchema,
  schemaVersionSchema,
  shortStringSchema,
  timestampSchema,
  userIdSchema,
} from "./common.js";

export const auditEventTypeSchema = z.enum([
  "user.created",
  "session.created",
  "session.revoked",
  "api_key.issued",
  "api_key.rotated",
  "api_key.revoked",
  "api_key.authentication_failed",
  "knowledge.review_searched",
  "knowledge.review_read",
]);

export const auditActorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("system") }),
  z.strictObject({ kind: z.literal("user"), userId: userIdSchema }),
  z.strictObject({
    kind: z.literal("api_key"),
    userId: userIdSchema,
    apiKeyId: apiKeyIdSchema,
  }),
]);

export const auditTargetSchema = z.strictObject({
  kind: z.enum(["user", "session", "api_key", "knowledge_search", "known_path"]),
  id: shortStringSchema,
});

export const auditEventSchema = z.strictObject({
  _id: auditEventIdSchema,
  schemaVersion: schemaVersionSchema,
  eventType: auditEventTypeSchema,
  occurredAt: timestampSchema,
  actor: auditActorSchema,
  target: auditTargetSchema,
  outcome: z.enum(["success", "failure"]),
  requestId: z.string().trim().min(8).max(128).optional(),
  ipAddress: z.string().trim().min(2).max(128).optional(),
  metadata: z.record(z.string().trim().min(1).max(64), z.string().trim().max(512)).optional(),
});

export type AuditActor = z.infer<typeof auditActorSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;
