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
  UserDashboardService,
  createKnownPathAuth,
  createRateLimitPolicies,
} from "@knownpath/auth";
import type { ApiConfig, AuthConfig } from "@knownpath/config";
import type { EmbeddingConfig, SearchConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import type { AgentContributionV2 } from "@knownpath/domain";
import type { JobProducer, QueueRegistry } from "@knownpath/jobs";
import {
  GeminiEmbeddingProvider,
  KnowledgeAccessService,
  RetrievalService,
} from "@knownpath/search";
import { ContributionService } from "@knownpath/contributions";
import { OutcomeService } from "@knownpath/outcomes";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

import { registerAuthRoutes } from "./auth-routes.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { AdminService } from "./admin-service.js";
import { registerErrorHandler } from "./error-handler.js";
import { registerDashboardRoutes } from "./dashboard-routes.js";
import { registerKnowledgeRoutes } from "./knowledge-routes.js";
import { registerContributionRoutes } from "./contribution-routes.js";
import { registerMcpRoutes } from "./mcp-routes.js";
import { registerOutcomeRoutes } from "./outcome-routes.js";
import {
  registerAccountRoutes,
  registerApiKeyRoutes,
  registerOperationalRoutes,
  registerSystemRoutes,
} from "./routes.js";

export interface BuildApiOptions {
  readonly apiConfig: ApiConfig;
  readonly authConfig: AuthConfig;
  readonly database: KnownPathDatabase;
  readonly embeddingConfig: EmbeddingConfig;
  readonly searchConfig: SearchConfig;
  readonly jobProducer?: JobProducer;
  readonly queueRegistry?: QueueRegistry;
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
          "Authenticated account and safe knowledge retrieval API for the KnownPath shared knowledge network.",
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
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
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
      request.url.startsWith("/api/v1/api-keys") ||
      request.url.startsWith("/api/v1/knowledge") ||
      request.url.startsWith("/api/v1/known-paths") ||
      request.url.startsWith("/api/v1/contributions") ||
      request.url.startsWith("/api/v1/outcomes") ||
      request.url.startsWith("/api/v1/mcp") ||
      request.url.startsWith("/api/v1/admin") ||
      request.url.startsWith("/mcp")
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
  const dashboard = new UserDashboardService(
    options.database.repositories,
    audit,
    options.authConfig.apiKeyPepper,
  );
  const admin = new AdminService(
    options.database,
    options.authConfig.apiKeyPepper,
    options.queueRegistry,
    options.jobProducer,
    {
      geminiConfigured: options.embeddingConfig.geminiApiKey !== undefined,
      embeddingModel: options.embeddingConfig.model,
      searchBackend: options.searchConfig.backend,
    },
  );
  const rateLimitPolicies = createRateLimitPolicies(
    options.apiConfig.rateLimitMax,
    options.apiConfig.rateLimitWindowMs,
  );
  const providerFactory =
    options.embeddingConfig.geminiApiKey === undefined
      ? undefined
      : () =>
          new GeminiEmbeddingProvider({
            apiKey: options.embeddingConfig.geminiApiKey ?? "",
            modelIdentifier: options.embeddingConfig.model,
            modelVersion: options.embeddingConfig.modelVersion,
            requestTimeoutMs: options.embeddingConfig.requestTimeoutMs,
          });
  const retrieval = new RetrievalService(options.database, {
    backend: options.searchConfig.backend,
    atlasLexicalIndex: options.searchConfig.atlasLexicalIndex,
    atlasVectorIndex: options.searchConfig.atlasVectorIndex,
    candidatePoolMultiplier: options.searchConfig.candidatePoolMultiplier,
    dimensions: options.embeddingConfig.dimensions,
    modelIdentifier: options.embeddingConfig.model,
    modelVersion: options.embeddingConfig.modelVersion,
    ...(providerFactory === undefined ? {} : { providerFactory }),
  });
  const knowledge = new KnowledgeAccessService(options.database, retrieval, {
    secret: options.authConfig.apiKeyPepper,
  });
  const contributions = new ContributionService(options.database, {
    apiOrigin: options.authConfig.baseUrl,
    digestSecret: options.authConfig.apiKeyPepper,
    ...(options.jobProducer === undefined
      ? {}
      : {
          defaultProcessingMode: "deferred" as const,
          enqueueProcessing: async (contribution: AgentContributionV2) => {
            await options.jobProducer?.enqueue({
              jobName: "contribution.process",
              kind: "contribution",
              target: { kind: "contribution", id: contribution._id },
              trigger: "api",
              idempotencyParts: ["contribution.process", contribution._id],
            });
          },
        }),
  });
  const outcomes = new OutcomeService(options.database);

  registerSystemRoutes(api, options.database, options.queueRegistry);
  registerAuthRoutes(api, auth, options.authConfig.baseUrl, rateLimitPolicies.signIn);
  registerAccountRoutes(api, authenticator);
  registerDashboardRoutes(api, authenticator, dashboard);
  registerAdminRoutes(api, authenticator, admin, audit);
  registerApiKeyRoutes(api, authenticator, apiKeys, rateLimitPolicies.apiKeyMutation);
  registerOperationalRoutes(api, authenticator, options.database, options.queueRegistry);
  registerKnowledgeRoutes(api, authenticator, knowledge, {
    read: rateLimitPolicies.knowledgeRead,
    search: rateLimitPolicies.knowledgeSearch,
    usage: rateLimitPolicies.knowledgeUsage,
  });
  registerContributionRoutes(
    api,
    authenticator,
    contributions,
    options.database,
    audit,
    rateLimitPolicies.contributionSubmit,
    options.jobProducer,
  );
  registerOutcomeRoutes(
    api,
    authenticator,
    outcomes,
    audit,
    rateLimitPolicies.outcomeSubmit,
    options.jobProducer,
  );
  registerMcpRoutes(api, {
    apiConfig: options.apiConfig,
    authConfig: options.authConfig,
    authenticator,
    database: options.database,
    knowledge,
    contributions,
    outcomes,
    audit,
    rateLimitPolicy: rateLimitPolicies.knowledgeSearch,
    searchConfig: options.searchConfig,
  });
  api.get("/api/v1/openapi.json", { schema: { hide: true } }, async (_request, reply) =>
    reply.send(api.swagger()),
  );

  return api;
}
