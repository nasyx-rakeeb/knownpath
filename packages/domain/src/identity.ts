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
export const userRoleSchema = z.enum(["user", "admin"]);

export const userSchema = z.strictObject({
  _id: userIdSchema,
  schemaVersion: schemaVersionSchema,
  email: z.email().max(320),
  normalizedEmail: z.email().max(320),
  displayName: shortStringSchema,
  emailVerified: z.boolean(),
  image: z.url().nullable().optional(),
  role: userRoleSchema,
  banned: z.boolean().optional(),
  banReason: z.string().trim().max(2_000).nullable().optional(),
  banExpires: timestampSchema.nullable().optional(),
  status: userStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const apiKeyStatusSchema = z.enum(["active", "revoked", "expired"]);
export const apiKeyScopeSchema = z.enum([
  "account:read",
  "api-keys:read",
  "api-keys:write",
  "knowledge:read",
  "knowledge:contribute",
]);

export const apiKeySchema = z.strictObject({
  _id: apiKeyIdSchema,
  schemaVersion: schemaVersionSchema,
  userId: userIdSchema,
  name: shortStringSchema,
  prefix: z.string().regex(/^kp_[a-zA-Z0-9]{12}$/u),
  keyHash: sha256Schema,
  hashVersion: z.int().positive(),
  scopes: z.array(apiKeyScopeSchema).max(32),
  status: apiKeyStatusSchema,
  expiresAt: timestampSchema.optional(),
  lastUsedAt: timestampSchema.optional(),
  revokedAt: timestampSchema.optional(),
  audit: auditMetadataSchema,
});

export type User = z.infer<typeof userSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
