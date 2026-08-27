import {
  authorizeScopedKnowledgeRead,
  type Authenticator,
  type RateLimitPolicy,
} from "@knownpath/auth";
import type { KnownPathDatabase } from "@knownpath/database";
import {
  alternativesQuerySchema,
  knowledgeSearchIdParamsSchema,
  knowledgeSearchRequestSchema,
  knowledgeSearchResponseSchema,
  knowledgeSelectionRequestSchema,
  knowledgeSelectionResponseSchema,
  knownPathAlternativesResponseSchema,
  knownPathDetailQuerySchema,
  knownPathDetailResponseSchema,
  knownPathIdParamsSchema,
} from "@knownpath/domain";
import type { KnowledgeAccessService } from "@knownpath/search";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { errorEnvelopeSchema } from "./schemas.js";

const knowledgeErrors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  413: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
  503: errorEnvelopeSchema,
} as const;

export interface KnowledgeRateLimitPolicies {
  readonly read: RateLimitPolicy;
  readonly search: RateLimitPolicy;
  readonly usage: RateLimitPolicy;
}

export function registerKnowledgeRoutes(
  api: FastifyInstance,
  authenticator: Authenticator,
  knowledge: KnowledgeAccessService,
  database: KnownPathDatabase,
  policies: KnowledgeRateLimitPolicies,
): void {
  api.post(
    "/api/v1/knowledge/search",
    {
      bodyLimit: 32 * 1_024,
      schema: {
        tags: ["knowledge"],
        summary: "Search public KnownPaths",
        description:
          "Searches published public knowledge by default. includeReview requires an admin-owned API key with knowledge:read and is always audited.",
        security: [{ bearerApiKey: [] }, { cookieSession: [] }],
        body: knowledgeSearchRequestSchema.meta({
          examples: [
            {
              text: "Expo EAS build ignores a generated file",
              ecosystem: "expo",
              platforms: ["build"],
              semanticMode: "optional",
              limit: 5,
            },
          ],
        }),
        response: { 200: knowledgeSearchResponseSchema, ...knowledgeErrors },
      },
      config: {
        knownPathRateLimitPolicy: policies.search.name,
        rateLimit: { max: policies.search.max, timeWindow: policies.search.timeWindowMs },
      },
    },
    async (request) => {
      const body = knowledgeSearchRequestSchema.parse(request.body);
      const authorization = await authorizeScopedKnowledgeRead(
        await authenticator.authenticate(request.headers),
        body.scope,
        body.includeReview,
        database,
      );
      return knowledge.search(body, requestContext(request, authorization));
    },
  );

  api.get(
    "/api/v1/known-paths/:id",
    {
      schema: {
        tags: ["knowledge"],
        summary: "Get a safe canonical KnownPath",
        description:
          "Returns generalized knowledge and bounded provenance. Raw sources, embeddings, model internals, and persistence metadata are never returned.",
        security: [{ bearerApiKey: [] }, { cookieSession: [] }],
        params: knownPathIdParamsSchema,
        querystring: knownPathDetailQuerySchema,
        response: { 200: knownPathDetailResponseSchema, ...knowledgeErrors },
      },
      config: {
        knownPathRateLimitPolicy: policies.read.name,
        rateLimit: { max: policies.read.max, timeWindow: policies.read.timeWindowMs },
      },
    },
    async (request) => {
      const params = knownPathIdParamsSchema.parse(request.params);
      const query = knownPathDetailQuerySchema.parse(request.query);
      const scope = scopeFromQuery(query.scope, query.workspaceId);
      const authorization = await authorizeScopedKnowledgeRead(
        await authenticator.authenticate(request.headers),
        scope,
        query.includeReview,
        database,
      );
      return knowledge.getById(params.id, requestContext(request, authorization));
    },
  );

  api.get(
    "/api/v1/known-paths/:id/alternatives",
    {
      schema: {
        tags: ["knowledge"],
        summary: "List alternative solutions for one KnownPath",
        description:
          "Lists additional evidence-backed solution variants for the same canonical problem using an opaque cursor.",
        security: [{ bearerApiKey: [] }, { cookieSession: [] }],
        params: knownPathIdParamsSchema,
        querystring: alternativesQuerySchema,
        response: { 200: knownPathAlternativesResponseSchema, ...knowledgeErrors },
      },
      config: {
        knownPathRateLimitPolicy: policies.read.name,
        rateLimit: { max: policies.read.max, timeWindow: policies.read.timeWindowMs },
      },
    },
    async (request) => {
      const params = knownPathIdParamsSchema.parse(request.params);
      const query = alternativesQuerySchema.parse(request.query);
      const scope = scopeFromQuery(query.scope, query.workspaceId);
      const authorization = await authorizeScopedKnowledgeRead(
        await authenticator.authenticate(request.headers),
        scope,
        query.includeReview,
        database,
      );
      return knowledge.alternatives(
        params.id,
        query.cursor,
        query.limit,
        requestContext(request, authorization),
      );
    },
  );

  api.post(
    "/api/v1/knowledge/searches/:searchId/selections",
    {
      bodyLimit: 4 * 1_024,
      schema: {
        tags: ["knowledge usage"],
        summary: "Record selection of a search result",
        description:
          "Records usage only. A selection is not treated as a successful technical outcome.",
        security: [{ bearerApiKey: [] }, { cookieSession: [] }],
        params: knowledgeSearchIdParamsSchema,
        body: knowledgeSelectionRequestSchema,
        response: { 200: knowledgeSelectionResponseSchema, ...knowledgeErrors },
      },
      config: {
        knownPathRateLimitPolicy: policies.usage.name,
        rateLimit: { max: policies.usage.max, timeWindow: policies.usage.timeWindowMs },
      },
    },
    async (request) => {
      const params = knowledgeSearchIdParamsSchema.parse(request.params);
      const body = knowledgeSelectionRequestSchema.parse(request.body);
      const authorization = await authorizeScopedKnowledgeRead(
        await authenticator.authenticate(request.headers),
        { kind: "public" },
        false,
        database,
      );
      return knowledge.recordSelection(
        params.searchId,
        body.knownPathId,
        requestContext(request, authorization),
      );
    },
  );
}

function requestContext(
  request: FastifyRequest,
  authorization: Awaited<ReturnType<typeof authorizeScopedKnowledgeRead>>,
) {
  return {
    accessMode: authorization.accessMode,
    scope: authorization.scope,
    principal: authorization.principal,
    requestId: request.id,
    ipAddress: request.ip,
  };
}

function scopeFromQuery(
  kind: "public" | "personal" | "workspace" | "workspace_and_public",
  workspaceId: import("@knownpath/domain").WorkspaceId | undefined,
): import("@knownpath/domain").KnowledgeSearchScope {
  if (kind === "public" || kind === "personal") {
    if (workspaceId !== undefined) throw new Error("workspaceId is valid only for workspace scope");
    return { kind };
  }
  if (workspaceId === undefined) throw new Error("workspace scope requires workspaceId");
  return { kind, workspaceId };
}
