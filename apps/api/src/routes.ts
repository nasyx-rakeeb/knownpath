import {
  requireScope,
  requireSession,
  type ApiKeyService,
  type Authenticator,
  type RateLimitPolicy,
} from "@knownpath/auth";
import type { KnownPathDatabase } from "@knownpath/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  apiKeyIdParamsSchema,
  apiKeyMetadataSchema,
  errorEnvelopeSchema,
  issueApiKeyBodySchema,
  toApiKeyMetadata,
} from "./schemas.js";

const accountResponseSchema = z.object({
  user: z.object({
    id: z.uuidv4(),
    email: z.email(),
    displayName: z.string(),
    role: z.enum(["user", "admin"]),
    status: z.enum(["active", "suspended", "deleted"]),
  }),
  authentication: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("session") }),
    z.object({
      kind: z.literal("api_key"),
      keyId: z.uuidv4(),
      prefix: z.string(),
      scopes: z.array(z.string()),
    }),
  ]),
});

const issuedApiKeyResponseSchema = z.object({
  apiKey: apiKeyMetadataSchema,
  plaintext: z.string(),
  warning: z.string(),
});

const apiKeyListResponseSchema = z.object({ apiKeys: z.array(apiKeyMetadataSchema) });

const protectedErrors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
} as const;

export function registerSystemRoutes(api: FastifyInstance, database: KnownPathDatabase): void {
  api.get(
    "/health/live",
    { schema: { tags: ["system"], summary: "Process liveness" } },
    async () => ({ service: "knownpath-api", status: "ok" }),
  );

  api.get(
    "/health/ready",
    { schema: { tags: ["system"], summary: "Dependency readiness" } },
    async (_request, reply) => {
      try {
        await database.ping();
        return {
          service: "knownpath-api",
          status: "ready",
          components: { mongodb: "ok", auth: "ok" },
        };
      } catch {
        return reply.status(503).send({
          service: "knownpath-api",
          status: "not_ready",
          components: { mongodb: "unavailable", auth: "ok" },
        });
      }
    },
  );
}

export function registerAccountRoutes(api: FastifyInstance, authenticator: Authenticator): void {
  api.get(
    "/api/v1/account/me",
    {
      schema: {
        tags: ["account"],
        summary: "Get the authenticated account",
        security: [{ bearerApiKey: [] }, { cookieSession: [] }],
        response: { 200: accountResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const principal = requireScope(
        await authenticator.authenticate(request.headers),
        "account:read",
      );
      return {
        user: {
          id: principal.user._id,
          email: principal.user.email,
          displayName: principal.user.displayName,
          role: principal.user.role,
          status: principal.user.status,
        },
        authentication:
          principal.kind === "session"
            ? { kind: "session" as const }
            : {
                kind: "api_key" as const,
                keyId: principal.key._id,
                prefix: principal.key.prefix,
                scopes: principal.key.scopes,
              },
      };
    },
  );
}

export function registerApiKeyRoutes(
  api: FastifyInstance,
  authenticator: Authenticator,
  apiKeys: ApiKeyService,
  mutationPolicy: RateLimitPolicy,
): void {
  api.get(
    "/api/v1/api-keys",
    {
      schema: {
        tags: ["api keys"],
        summary: "List API-key metadata",
        security: [{ cookieSession: [] }],
        response: { 200: apiKeyListResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      return { apiKeys: (await apiKeys.list(session.user._id)).map(toApiKeyMetadata) };
    },
  );

  api.post(
    "/api/v1/api-keys",
    {
      schema: {
        tags: ["api keys"],
        summary: "Issue an API key",
        security: [{ cookieSession: [] }],
        body: issueApiKeyBodySchema,
        response: { 201: issuedApiKeyResponseSchema, ...protectedErrors },
      },
      config: {
        rateLimit: { max: mutationPolicy.max, timeWindow: mutationPolicy.timeWindowMs },
      },
    },
    async (request, reply) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const body = issueApiKeyBodySchema.parse(request.body);
      const issued = await apiKeys.issue({
        userId: session.user._id,
        name: body.name,
        scopes: body.scopes,
        actor: { kind: "user", userId: session.user._id },
        ...(body.expiresAt === undefined ? {} : { expiresAt: new Date(body.expiresAt) }),
        ...requestContext(request),
      });
      return reply.status(201).send({
        apiKey: toApiKeyMetadata(issued.key),
        plaintext: issued.plaintext,
        warning: "Store this key now. KnownPath will not show it again.",
      });
    },
  );

  api.post(
    "/api/v1/api-keys/:id/rotate",
    {
      schema: {
        tags: ["api keys"],
        summary: "Rotate an active API key",
        security: [{ cookieSession: [] }],
        params: apiKeyIdParamsSchema,
        response: { 200: issuedApiKeyResponseSchema, ...protectedErrors },
      },
      config: {
        rateLimit: { max: mutationPolicy.max, timeWindow: mutationPolicy.timeWindowMs },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const params = apiKeyIdParamsSchema.parse(request.params);
      const issued = await apiKeys.rotate(params.id, session.user._id, {
        actor: { kind: "user", userId: session.user._id },
        ...requestContext(request),
      });
      return {
        apiKey: toApiKeyMetadata(issued.key),
        plaintext: issued.plaintext,
        warning: "Store this key now. KnownPath will not show it again.",
      };
    },
  );

  api.post(
    "/api/v1/api-keys/:id/revoke",
    {
      schema: {
        tags: ["api keys"],
        summary: "Revoke an active API key",
        security: [{ cookieSession: [] }],
        params: apiKeyIdParamsSchema,
        response: { 200: z.object({ apiKey: apiKeyMetadataSchema }), ...protectedErrors },
      },
      config: {
        rateLimit: { max: mutationPolicy.max, timeWindow: mutationPolicy.timeWindowMs },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const params = apiKeyIdParamsSchema.parse(request.params);
      const revoked = await apiKeys.revoke(params.id, session.user._id, {
        actor: { kind: "user", userId: session.user._id },
        ...requestContext(request),
      });
      return { apiKey: toApiKeyMetadata(revoked) };
    },
  );
}

function requestContext(request: FastifyRequest) {
  return { requestId: request.id, ipAddress: request.ip };
}
