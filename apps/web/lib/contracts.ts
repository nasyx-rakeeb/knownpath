import { apiKeyScopeSchema } from "@knownpath/domain";
import { z } from "zod";

export const accountSchema = z.strictObject({
  user: z.strictObject({
    id: z.uuidv4(),
    email: z.email(),
    displayName: z.string(),
    role: z.enum(["user", "admin"]),
    status: z.enum(["active", "suspended", "deleted"]),
  }),
  authentication: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("session") }),
    z.strictObject({
      kind: z.literal("api_key"),
      keyId: z.uuidv4(),
      prefix: z.string(),
      scopes: z.array(z.string()),
    }),
  ]),
});

export const apiKeyMetadataSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  status: z.enum(["active", "revoked", "expired"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().optional(),
  expiresAt: z.iso.datetime().optional(),
  revokedAt: z.iso.datetime().optional(),
});

export const apiKeyListSchema = z.strictObject({ apiKeys: z.array(apiKeyMetadataSchema) });
export const issuedApiKeySchema = z.strictObject({
  apiKey: apiKeyMetadataSchema,
  plaintext: z.string().min(1),
  warning: z.string().min(1),
});
export const contributionSettingsSchema = z.strictObject({
  contributionMode: z.enum(["ask", "disabled"]),
});

export type Account = z.infer<typeof accountSchema>;
export type ApiKeyMetadata = z.infer<typeof apiKeyMetadataSchema>;
