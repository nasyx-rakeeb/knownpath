import { createHmac, randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  ApiKeyService,
  type AbuseRateGate,
  AuditService,
  Authenticator,
  UserDashboardService,
  createKnownPathAuth,
  createRateLimitPolicies,
} from "@knownpath/auth";
import { CREDENTIAL_REDACTION_PATHS } from "@knownpath/config";
import type { ApiConfig, AuthConfig } from "@knownpath/config";
import type { EmbeddingConfig, SearchConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import type { AgentContributionV2 } from "@knownpath/domain";
import type { JobProducer, QueueRegistry } from "@knownpath/jobs";
import {
  activeTraceFields,
  finishServerSpan,
  recordSecurityDenial,
  runWithSpan,
  startServerSpan,
} from "@knownpath/observability";
import {
  GeminiEmbeddingProvider,
  KnowledgeAccessService,
  RetrievalService,
} from "@knownpath/search";
import { ContributionService, PublicKnowledgeShareService } from "@knownpath/contributions";
import { OutcomeService } from "@knownpath/outcomes";
import { WorkspaceService } from "@knownpath/workspaces";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
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
import { registerWorkspaceRoutes } from "./workspace-routes.js";

export interface BuildApiOptions {
  readonly apiConfig: ApiConfig;
  readonly authConfig: AuthConfig;
  readonly database: KnownPathDatabase;
  readonly embeddingConfig: EmbeddingConfig;
  readonly searchConfig: SearchConfig;
  readonly jobProducer?: JobProducer;
  readonly queueRegistry?: QueueRegistry;
  readonly rateLimitRedis?: Redis;
  readonly abuseRateGate?: AbuseRateGate;
}

export async function buildApi(options: BuildApiOptions): Promise<FastifyInstance> {
  const api = Fastify({
    bodyLimit: options.apiConfig.bodyLimitBytes,
    connectionTimeout: options.apiConfig.connectionTimeoutMs,
    genReqId: () => randomUUID(),
    keepAliveTimeout: options.apiConfig.keepAliveTimeoutMs,
    routerOptions: { maxParamLength: options.apiConfig.maxParamLength },
    requestTimeout: options.apiConfig.requestTimeoutMs,
    trustProxy: options.apiConfig.trustProxy,
    logger: {
      level: options.apiConfig.logLevel,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: safeRequestPath(request.url),
          };
        },
        res(reply) {
          return { statusCode: reply.statusCode };
        },
      },
      redact: {
        paths: [...CREDENTIAL_REDACTION_PATHS],
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
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
    ...(options.apiConfig.runtimeMode === "production" ? {} : { hsts: false }),
  });
  await api.register(rateLimit, {
    global: true,
    max: options.apiConfig.rateLimitMax,
    timeWindow: options.apiConfig.rateLimitWindowMs,
    ...(options.rateLimitRedis === undefined ? {} : { redis: options.rateLimitRedis }),
    skipOnError: false,
    keyGenerator: (request) => rateLimitSubject(request, options.authConfig.apiKeyPepper),
    enableDraftSpec: true,
    onExceeded: (request) =>
      recordSecurityDenial("rate_limit", request.url.startsWith("/mcp") ? "mcp" : "api"),
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error("Request rate limit exceeded"), {
        code: "RATE_LIMIT_EXCEEDED",
        statusCode: context.statusCode,
      }),
  });

  const requestSpans = new WeakMap<object, ReturnType<typeof startServerSpan>>();
  const requestStartedAt = new WeakMap<object, number>();
  api.addHook("onRequest", (request, reply, done) => {
    const span = startServerSpan("knownpath.http.request", {
      "http.request.method": request.method,
    });
    requestSpans.set(request, span);
    requestStartedAt.set(request, performance.now());
    runWithSpan(span, () => {
      const traceFields = activeTraceFields();
      request.log = request.log.child({ requestId: request.id, ...traceFields });
      reply.header("x-request-id", request.id);
      if (traceFields.traceId !== undefined) reply.header("traceparent", traceParent(traceFields));
      done();
    });
  });
  api.addHook("preHandler", async (request) => {
    enforceSessionMutationOrigin(request, options.authConfig);
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
  api.addHook("onResponse", async (request, reply) => {
    const span = requestSpans.get(request);
    if (span === undefined) return;
    finishServerSpan(span, {
      durationMs: performance.now() - (requestStartedAt.get(request) ?? performance.now()),
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      statusCode: reply.statusCode,
    });
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
  const workspaces = new WorkspaceService(options.database, audit);
  const publicShares = new PublicKnowledgeShareService(options.database, contributions, audit);

  registerSystemRoutes(
    api,
    options.database,
    options.queueRegistry,
    options.abuseRateGate,
    options.apiConfig.rateLimitStore,
  );
  registerAuthRoutes(api, auth, options.authConfig.baseUrl, rateLimitPolicies.signIn);
  registerAccountRoutes(api, authenticator);
  registerDashboardRoutes(api, authenticator, dashboard);
  registerWorkspaceRoutes(
    api,
    authenticator,
    workspaces,
    apiKeys,
    rateLimitPolicies.apiKeyMutation,
  );
  registerAdminRoutes(api, authenticator, admin, audit, {
    read: rateLimitPolicies.adminRead,
    sensitive: rateLimitPolicies.adminSensitive,
  });
  registerApiKeyRoutes(api, authenticator, apiKeys, rateLimitPolicies.apiKeyMutation);
  registerOperationalRoutes(api, authenticator, options.database, options.queueRegistry);
  registerKnowledgeRoutes(
    api,
    authenticator,
    knowledge,
    options.database,
    {
      read: rateLimitPolicies.knowledgeRead,
      search: rateLimitPolicies.knowledgeSearch,
      usage: rateLimitPolicies.knowledgeUsage,
      providerHeavy: rateLimitPolicies.providerHeavy,
    },
    options.abuseRateGate,
  );
  registerContributionRoutes(
    api,
    authenticator,
    contributions,
    options.database,
    audit,
    rateLimitPolicies.contributionSubmit,
    options.jobProducer,
    publicShares,
  );
  registerOutcomeRoutes(
    api,
    authenticator,
    outcomes,
    audit,
    rateLimitPolicies.outcomeSubmit,
    options.database,
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
    mutationRateLimitPolicy: rateLimitPolicies.mcpMutation,
    providerRateLimitPolicy: rateLimitPolicies.providerHeavy,
    ...(options.abuseRateGate === undefined ? {} : { abuseRateGate: options.abuseRateGate }),
    searchConfig: options.searchConfig,
  });
  api.get("/api/v1/openapi.json", { schema: { hide: true } }, async (_request, reply) =>
    reply.send(api.swagger()),
  );

  return api;
}

function safeRequestPath(url: string | undefined): string {
  if (url === undefined) return "/";
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

function enforceSessionMutationOrigin(
  request: {
    readonly headers: Record<string, unknown>;
    readonly method: string;
    readonly url: string;
  },
  authConfig: AuthConfig,
): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
  if (request.headers["cookie"] === undefined || request.headers["authorization"] !== undefined)
    return;
  const origin = request.headers["origin"];
  if (typeof origin !== "string") throw new Error("session_mutation_origin_required");
  const allowed = new Set([authConfig.baseUrl, ...authConfig.trustedOrigins]);
  if (!allowed.has(origin.replace(/\/$/u, ""))) throw new Error("session_mutation_origin_denied");
}

function traceParent(fields: { traceId?: string; spanId?: string }): string {
  return `00-${fields.traceId ?? "0".repeat(32)}-${fields.spanId ?? "0".repeat(16)}-01`;
}

function rateLimitSubject(
  request: { readonly headers: Record<string, unknown>; readonly ip: string },
  pepper: string,
): string {
  const authorization = request.headers["authorization"];
  if (typeof authorization === "string") {
    const match = /^Bearer ([^\s]+)$/u.exec(authorization);
    if (match !== null) {
      return `key:${createHmac("sha256", pepper).update(match[1]!).digest("base64url").slice(0, 32)}`;
    }
  }
  return `ip:${request.ip}`;
}
