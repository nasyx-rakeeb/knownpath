import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  ApiKeyService,
  AuditService,
  Authenticator,
  createKnownPathAuth,
  createRateLimitPolicies,
} from "@knownpath/auth";
import type { ApiConfig, AuthConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

import { registerAuthRoutes } from "./auth-routes.js";
import { registerErrorHandler } from "./error-handler.js";
import { registerAccountRoutes, registerApiKeyRoutes, registerSystemRoutes } from "./routes.js";

export interface BuildApiOptions {
  readonly apiConfig: ApiConfig;
  readonly authConfig: AuthConfig;
  readonly database: KnownPathDatabase;
}

export async function buildApi(options: BuildApiOptions): Promise<FastifyInstance> {
  const api = Fastify({
    genReqId: () => randomUUID(),
    trustProxy: options.apiConfig.trustProxy,
    logger: {
      level: options.apiConfig.logLevel,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "authorization",
          "cookie",
          "password",
          "token",
          "secret",
          "plaintext",
          "apiKey",
        ],
        censor: "[REDACTED]",
      },
    },
  });

  api.setValidatorCompiler(validatorCompiler);
  api.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(api);

  await api.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "KnownPath API",
        description:
          "Authentication and account foundation for the KnownPath shared knowledge network.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerApiKey: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "KnownPath API key",
          },
          cookieSession: {
            type: "apiKey",
            in: "cookie",
            name: "knownpath.session_token",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  if (options.apiConfig.docsEnabled) {
    await api.register(swaggerUi, {
      routePrefix: "/docs",
      staticCSP: true,
      uiConfig: { docExpansion: "list", deepLinking: false },
    });
  }

  await api.register(cors, {
    origin: options.apiConfig.corsOrigins.length === 0 ? false : [...options.apiConfig.corsOrigins],
    credentials: options.apiConfig.corsOrigins.length > 0,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["x-request-id", "retry-after"],
    strictPreflight: true,
  });
  await api.register(helmet, {
    global: true,
    ...(options.apiConfig.runtimeMode === "production" ? {} : { hsts: false }),
  });
  await api.register(rateLimit, {
    global: true,
    max: options.apiConfig.rateLimitMax,
    timeWindow: options.apiConfig.rateLimitWindowMs,
    enableDraftSpec: true,
    errorResponseBuilder: (request) => ({
      error: { code: "rate_limit_exceeded", message: "Too many requests; retry later" },
      requestId: request.id,
    }),
  });

  api.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  api.addHook("onSend", async (request, reply, payload) => {
    if (
      request.url.startsWith("/api/v1/auth") ||
      request.url.startsWith("/api/v1/account") ||
      request.url.startsWith("/api/v1/api-keys")
    ) {
      reply.header("cache-control", "no-store");
      reply.header("pragma", "no-cache");
    }
    return payload;
  });

  const audit = new AuditService(options.database.repositories);
  const auth = createKnownPathAuth(options.authConfig, options.database, audit);
  const apiKeys = new ApiKeyService(
    options.database.repositories,
    audit,
    options.authConfig.apiKeyPepper,
    options.authConfig.apiKeyLastUsedWriteIntervalMs,
  );
  const authenticator = new Authenticator(auth, apiKeys, options.database);
  const rateLimitPolicies = createRateLimitPolicies(
    options.apiConfig.rateLimitMax,
    options.apiConfig.rateLimitWindowMs,
  );

  registerSystemRoutes(api, options.database);
  registerAuthRoutes(api, auth, options.authConfig.baseUrl, rateLimitPolicies.signIn);
  registerAccountRoutes(api, authenticator);
  registerApiKeyRoutes(api, authenticator, apiKeys, rateLimitPolicies.apiKeyMutation);
  api.get("/api/v1/openapi.json", { schema: { hide: true } }, async (_request, reply) =>
    reply.send(api.swagger()),
  );

  return api;
}
