import { apiKeyScopeSchema, type ApiKeyScope } from "@knownpath/domain";
import { z } from "zod";

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
  requestId: z.string(),
});

export const apiKeyMetadataSchema = z.object({
  id: z.uuidv4(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  status: z.enum(["active", "revoked", "expired"]),
  binding: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("personal") }),
    z.strictObject({ kind: z.literal("workspace"), workspaceId: z.uuidv4() }),
  ]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().optional(),
  lastUsedAt: z.iso.datetime().optional(),
  revokedAt: z.iso.datetime().optional(),
});

export const issueApiKeyBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(256),
  scopes: z.array(apiKeyScopeSchema).min(1).max(32),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export const apiKeyIdParamsSchema = z.strictObject({ id: z.uuidv4() });

export const authSignInBodySchema = z.strictObject({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional(),
});

export const authChangePasswordBodySchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
  revokeOtherSessions: z.boolean().optional(),
});

export const authRevokeSessionBodySchema = z.strictObject({
  token: z.string().min(1).max(512),
});

export function toApiKeyMetadata(key: {
  readonly _id: string;
  readonly audit: { readonly createdAt: Date; readonly updatedAt: Date };
  readonly expiresAt?: Date | undefined;
  readonly lastUsedAt?: Date | undefined;
  readonly name: string;
  readonly prefix: string;
  readonly revokedAt?: Date | undefined;
  readonly scopes: readonly ApiKeyScope[];
  readonly status: "active" | "revoked" | "expired";
  readonly binding:
    { readonly kind: "personal" } | { readonly kind: "workspace"; readonly workspaceId: string };
}) {
  return {
    id: key._id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    status: key.status,
    binding: key.binding,
    createdAt: key.audit.createdAt.toISOString(),
    updatedAt: key.audit.updatedAt.toISOString(),
    ...(key.expiresAt === undefined ? {} : { expiresAt: key.expiresAt.toISOString() }),
    ...(key.lastUsedAt === undefined ? {} : { lastUsedAt: key.lastUsedAt.toISOString() }),
    ...(key.revokedAt === undefined ? {} : { revokedAt: key.revokedAt.toISOString() }),
  };
}
