import { z } from "zod";

import {
  apiKeyIdSchema,
  auditMetadataSchema,
  schemaVersionSchema,
  sha256Schema,
  shortStringSchema,
  timestampSchema,
  userIdSchema,
} from "./common.js";

export const userStatusSchema = z.enum(["active", "suspended", "deleted"]);

export const userSchema = z.strictObject({
  _id: userIdSchema,
  schemaVersion: schemaVersionSchema,
  email: z.email().max(320),
  normalizedEmail: z.email().max(320),
  displayName: shortStringSchema,
  status: userStatusSchema,
  audit: auditMetadataSchema,
});

export const apiKeyStatusSchema = z.enum(["active", "revoked", "expired"]);

export const apiKeySchema = z.strictObject({
  _id: apiKeyIdSchema,
  schemaVersion: schemaVersionSchema,
  userId: userIdSchema,
  name: shortStringSchema,
  prefix: z.string().trim().min(4).max(32),
  keyHash: sha256Schema,
  hashVersion: z.int().positive(),
  scopes: z.array(shortStringSchema).max(64),
  status: apiKeyStatusSchema,
  expiresAt: timestampSchema.optional(),
  lastUsedAt: timestampSchema.optional(),
  revokedAt: timestampSchema.optional(),
  audit: auditMetadataSchema,
});

export type User = z.infer<typeof userSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
