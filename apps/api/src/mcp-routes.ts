import {
  AuthorizationError,
  requireScope,
  type Authenticator,
  type Principal,
  type RateLimitPolicy,
  type AuditService,
} from "@knownpath/auth";
import type { ApiConfig, AuthConfig, SearchConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import {
  createKnownPathMcpAuthInfo,
  createKnownPathMcpHttpHandler,
  mcpStatusResponseSchema,
} from "@knownpath/mcp";
import type { KnowledgeAccessService } from "@knownpath/search";
import type { ContributionService } from "@knownpath/contributions";
import type { OutcomeService } from "@knownpath/outcomes";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { errorEnvelopeSchema } from "./schemas.js";
import { ServiceKnowledgeMcpGateway } from "./mcp-gateway.js";

const MCP_BODY_LIMIT = 64 * 1_024;

export function registerMcpRoutes(
  api: FastifyInstance,
  options: {
    readonly apiConfig: ApiConfig;
    readonly authConfig: AuthConfig;
    readonly authenticator: Authenticator;
    readonly database: KnownPathDatabase;
    readonly knowledge: KnowledgeAccessService;
    readonly contributions: ContributionService;
    readonly outcomes: OutcomeService;
    readonly audit: AuditService;
    readonly rateLimitPolicy: RateLimitPolicy;
    readonly searchConfig: SearchConfig;
  },
): void {
  const handler = createKnownPathMcpHttpHandler();
  const nodeHandler = toNodeHandler(handler);
  const allowedHosts = allowedHostnames(options.apiConfig, options.authConfig);
  const allowedOrigins = allowedOriginHostnames(options.apiConfig, options.authConfig);

  api.addHook("onClose", async () => handler.close());

  api.get(
    "/api/v1/mcp/status",
    {
      schema: {
        tags: ["mcp"],
        summary: "Inspect MCP authentication and backend status",
        description:
          "Returns credential-free status for a knowledge:read API key. This is used by the thin stdio MCP bridge.",
        security: [{ bearerApiKey: [] }],
        response: {
          200: mcpStatusResponseSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
      },
      config: {
        knownPathRateLimitPolicy: options.rateLimitPolicy.name,
        rateLimit: {
          max: options.rateLimitPolicy.max,
          timeWindow: options.rateLimitPolicy.timeWindowMs,
        },
      },
    },
    async (request) => {
      const principal = await requireKnowledgeApiKey(request, options.authenticator);
      return new ServiceKnowledgeMcpGateway({
        database: options.database,
        knowledge: options.knowledge,
        contributions: options.contributions,
        outcomes: options.outcomes,
        audit: options.audit,
        principal,
        requestId: request.id,
        ipAddress: request.ip,
        searchConfig: options.searchConfig,
      }).status(requestAbortSignal(request));
    },
  );

  api.all(
    "/mcp",
    {
      bodyLimit: MCP_BODY_LIMIT,
      schema: { hide: true },
      config: {
        knownPathRateLimitPolicy: options.rateLimitPolicy.name,
        rateLimit: {
          max: options.rateLimitPolicy.max,
          timeWindow: options.rateLimitPolicy.timeWindowMs,
        },
      },
    },
    async (request, reply) => {
      assertTransportOrigin(request, allowedHosts, allowedOrigins);
      const principal = await requireKnowledgeApiKey(request, options.authenticator);
      const token = bearerToken(request);
      const gateway = new ServiceKnowledgeMcpGateway({
        database: options.database,
        knowledge: options.knowledge,
        contributions: options.contributions,
        outcomes: options.outcomes,
        audit: options.audit,
        principal,
        requestId: request.id,
        ipAddress: request.ip,
        searchConfig: options.searchConfig,
      });
      const rawRequest = Object.assign(request.raw, {
        method: request.method,
        url: request.raw.url ?? request.url,
        auth: createKnownPathMcpAuthInfo({
          token,
          clientId: principal.key._id,
          scopes: principal.key.scopes,
          gateway,
        }),
      });
      return nodeHandler(rawRequest, reply.raw, request.body);
    },
  );
}

async function requireKnowledgeApiKey(
  request: FastifyRequest,
  authenticator: Authenticator,
): Promise<Extract<Principal, { kind: "api_key" }>> {
  const principal = requireScope(
    await authenticator.authenticate(request.headers),
    "knowledge:read",
  );
  if (principal.kind !== "api_key") {
    throw new AuthorizationError("A KnownPath API key is required for MCP access");
  }
  return principal;
}

function bearerToken(request: FastifyRequest): string {
  const value = request.headers.authorization;
  const match = value === undefined ? null : /^Bearer ([^\s]+)$/u.exec(value);
  if (match === null) throw new AuthorizationError("A bearer API key is required for MCP access");
  return match[1]!;
}

function allowedHostnames(apiConfig: ApiConfig, authConfig: AuthConfig): ReadonlySet<string> {
  const hosts = new Set<string>([
    new URL(authConfig.baseUrl).hostname.toLowerCase(),
    ...authConfig.trustedOrigins.map((origin) => new URL(origin).hostname.toLowerCase()),
    ...apiConfig.corsOrigins.map((origin) => new URL(origin).hostname.toLowerCase()),
  ]);
  if (["127.0.0.1", "localhost", "::1"].includes(apiConfig.host)) {
    hosts.add("127.0.0.1");
    hosts.add("localhost");
    hosts.add("::1");
  }
  return hosts;
}

function allowedOriginHostnames(apiConfig: ApiConfig, authConfig: AuthConfig): ReadonlySet<string> {
  return new Set(
    [...apiConfig.corsOrigins, ...authConfig.trustedOrigins].map((origin) =>
      new URL(origin).hostname.toLowerCase(),
    ),
  );
}

function assertTransportOrigin(
  request: FastifyRequest,
  allowedHosts: ReadonlySet<string>,
  allowedOrigins: ReadonlySet<string>,
): void {
  const hostHeader = request.headers.host;
  if (hostHeader === undefined || !allowedHosts.has(parseHostname(hostHeader))) {
    throw new AuthorizationError("The MCP Host header is not allowed");
  }
  const origin = request.headers.origin;
  if (origin !== undefined) {
    let hostname: string;
    try {
      hostname = new URL(origin).hostname.toLowerCase();
    } catch {
      throw new AuthorizationError("The MCP Origin header is invalid");
    }
    if (!allowedOrigins.has(hostname)) {
      throw new AuthorizationError("The MCP Origin header is not allowed");
    }
  }
}

function parseHostname(host: string): string {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    throw new AuthorizationError("The MCP Host header is invalid");
  }
}

function requestAbortSignal(request: FastifyRequest): AbortSignal {
  const controller = new AbortController();
  if (request.raw.aborted) {
    controller.abort();
  } else {
    request.raw.once("aborted", () => controller.abort());
  }
  return controller.signal;
}
