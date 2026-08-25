import { requireSession, type Authenticator, type UserDashboardService } from "@knownpath/auth";
import {
  DASHBOARD_API_CONTRACT_VERSION,
  accountDashboardResponseSchema,
  accountProfileResponseSchema,
  accountProfileUpdateSchema,
  accountSessionIdParamsSchema,
  accountSessionListResponseSchema,
  accountSessionRevokeResponseSchema,
  contributionHistoryQuerySchema,
  contributionHistoryResponseSchema,
  dashboardPageQuerySchema,
  outcomeHistoryQuerySchema,
  outcomeHistoryResponseSchema,
  searchActivityResponseSchema,
} from "@knownpath/domain";
import type { FastifyInstance } from "fastify";

import { errorEnvelopeSchema } from "./schemas.js";

const errors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
} as const;

export function registerDashboardRoutes(
  api: FastifyInstance,
  authenticator: Authenticator,
  dashboard: UserDashboardService,
): void {
  api.get(
    "/api/v1/account/dashboard",
    {
      schema: {
        tags: ["account"],
        summary: "Get the current user's dashboard summary",
        security: [{ cookieSession: [] }],
        response: { 200: accountDashboardResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      return dashboard.summary(session.user._id);
    },
  );

  api.get(
    "/api/v1/account/search-activity",
    {
      schema: {
        tags: ["account"],
        summary: "List safe owned search activity",
        description: "Raw search text is not retained or returned.",
        security: [{ cookieSession: [] }],
        querystring: dashboardPageQuerySchema,
        response: { 200: searchActivityResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      return dashboard.searchActivity(
        session.user._id,
        dashboardPageQuerySchema.parse(request.query),
      );
    },
  );

  api.get(
    "/api/v1/account/contributions",
    {
      schema: {
        tags: ["account"],
        summary: "List sanitized owned contributions",
        security: [{ cookieSession: [] }],
        querystring: contributionHistoryQuerySchema,
        response: { 200: contributionHistoryResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      return dashboard.contributions(
        session.user._id,
        contributionHistoryQuerySchema.parse(request.query),
      );
    },
  );

  api.get(
    "/api/v1/account/outcomes",
    {
      schema: {
        tags: ["account"],
        summary: "List private owned outcome history",
        security: [{ cookieSession: [] }],
        querystring: outcomeHistoryQuerySchema,
        response: { 200: outcomeHistoryResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      return dashboard.outcomes(session.user._id, outcomeHistoryQuerySchema.parse(request.query));
    },
  );

  api.patch(
    "/api/v1/account/profile",
    {
      bodyLimit: 2_048,
      schema: {
        tags: ["account"],
        summary: "Update the current user's display name",
        security: [{ cookieSession: [] }],
        body: accountProfileUpdateSchema,
        response: { 200: accountProfileResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const body = accountProfileUpdateSchema.parse(request.body);
      return {
        contractVersion: DASHBOARD_API_CONTRACT_VERSION,
        ...(await dashboard.updateProfile(session.user._id, body.displayName, {
          requestId: request.id,
          ipAddress: request.ip,
        })),
      };
    },
  );

  api.get(
    "/api/v1/account/sessions",
    {
      schema: {
        tags: ["account"],
        summary: "List safe active-session metadata",
        description: "Session tokens are never returned.",
        security: [{ cookieSession: [] }],
        response: { 200: accountSessionListResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      return {
        contractVersion: DASHBOARD_API_CONTRACT_VERSION,
        sessions: await dashboard.sessions(session.user._id, session.sessionId),
      };
    },
  );

  api.post(
    "/api/v1/account/sessions/:id/revoke",
    {
      bodyLimit: 512,
      schema: {
        tags: ["account"],
        summary: "Revoke one owned active session by non-secret ID",
        security: [{ cookieSession: [] }],
        params: accountSessionIdParamsSchema,
        response: { 200: accountSessionRevokeResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const params = accountSessionIdParamsSchema.parse(request.params);
      return {
        contractVersion: DASHBOARD_API_CONTRACT_VERSION,
        ...(await dashboard.revokeSession(session.user._id, session.sessionId, params.id, {
          requestId: request.id,
          ipAddress: request.ip,
        })),
      };
    },
  );
}
