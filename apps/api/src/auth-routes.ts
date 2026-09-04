import {
  getKnownPathSession,
  type AuditService,
  type KnownPathAuth,
  type RateLimitPolicy,
} from "@knownpath/auth";
import { userIdSchema } from "@knownpath/domain";
import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from "fastify";
import type { z } from "zod";

import {
  authChangePasswordBodySchema,
  authDeviceCodeBodySchema,
  authDeviceDecisionBodySchema,
  authDeviceTokenBodySchema,
  authDeviceVerifyQuerySchema,
  authRevokeSessionBodySchema,
  authSignInBodySchema,
  authSignUpBodySchema,
  errorEnvelopeSchema,
} from "./schemas.js";

interface AuthRoute {
  readonly body?: z.ZodType;
  readonly method: HTTPMethods;
  readonly path: string;
  readonly protected: boolean;
  readonly query?: z.ZodType;
  readonly ratePolicy?: "approval" | "code" | "poll" | "signIn";
  readonly summary: string;
}

const authRoutes: readonly AuthRoute[] = [
  {
    method: "POST",
    path: "/sign-in/email",
    body: authSignInBodySchema,
    protected: false,
    ratePolicy: "signIn",
    summary: "Sign in with email and password",
  },
  {
    method: "POST",
    path: "/sign-up/email",
    body: authSignUpBodySchema,
    protected: false,
    ratePolicy: "signIn",
    summary: "Create an account when registration is open",
  },
  {
    method: "POST",
    path: "/device/code",
    body: authDeviceCodeBodySchema,
    protected: false,
    ratePolicy: "code",
    summary: "Begin CLI device authorization",
  },
  {
    method: "POST",
    path: "/device/token",
    body: authDeviceTokenBodySchema,
    protected: false,
    ratePolicy: "poll",
    summary: "Poll CLI device authorization",
  },
  {
    method: "GET",
    path: "/device",
    protected: true,
    query: authDeviceVerifyQuerySchema,
    ratePolicy: "approval",
    summary: "Claim and inspect a CLI device authorization",
  },
  {
    method: "POST",
    path: "/device/approve",
    body: authDeviceDecisionBodySchema,
    protected: true,
    ratePolicy: "approval",
    summary: "Approve a claimed CLI device authorization",
  },
  {
    method: "POST",
    path: "/device/deny",
    body: authDeviceDecisionBodySchema,
    protected: true,
    ratePolicy: "approval",
    summary: "Deny a claimed CLI device authorization",
  },
  { method: "POST", path: "/sign-out", protected: true, summary: "Sign out the current session" },
  { method: "GET", path: "/get-session", protected: false, summary: "Get the current session" },
  {
    method: "POST",
    path: "/change-password",
    body: authChangePasswordBodySchema,
    protected: true,
    summary: "Change the current user's password",
  },
  {
    method: "GET",
    path: "/list-sessions",
    protected: true,
    summary: "List the current user's sessions",
  },
  {
    method: "POST",
    path: "/revoke-session",
    body: authRevokeSessionBodySchema,
    protected: true,
    summary: "Revoke one session",
  },
  {
    method: "POST",
    path: "/revoke-other-sessions",
    protected: true,
    summary: "Revoke all other sessions",
  },
  { method: "POST", path: "/revoke-sessions", protected: true, summary: "Revoke all sessions" },
];

export function registerAuthRoutes(
  api: FastifyInstance,
  auth: KnownPathAuth,
  baseUrl: string,
  audit: AuditService,
  policies: {
    readonly approval: RateLimitPolicy;
    readonly code: RateLimitPolicy;
    readonly poll: RateLimitPolicy;
    readonly signIn: RateLimitPolicy;
  },
): void {
  for (const route of authRoutes) {
    api.route({
      method: route.method,
      url: `/api/v1/auth${route.path}`,
      schema: {
        tags: ["authentication"],
        summary: route.summary,
        ...(route.body === undefined ? {} : { body: route.body }),
        ...(route.query === undefined ? {} : { querystring: route.query }),
        ...(route.protected ? { security: [{ cookieSession: [] }] } : {}),
        response: {
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
      },
      ...(route.ratePolicy === undefined
        ? {}
        : {
            config: {
              rateLimit: {
                max: policies[route.ratePolicy].max,
                timeWindow: policies[route.ratePolicy].timeWindowMs,
              },
            },
          }),
      handler: async (request, reply) => {
        if (
          route.path === "/device" &&
          (await getKnownPathSession(auth, request.headers)) === null
        ) {
          return reply.status(401).send({
            error: {
              code: "authentication_required",
              message: "Sign in before reviewing this device authorization",
            },
            requestId: request.id,
          });
        }
        const result = await proxyAuthRequest(request, reply, auth, baseUrl);
        await recordDeviceResult(request, auth, audit, route.path, result.status, result.payload);
        return result.reply;
      },
    });
  }
}

async function proxyAuthRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: KnownPathAuth,
  baseUrl: string,
): Promise<{ readonly payload: unknown; readonly reply: FastifyReply; readonly status: number }> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await auth.handler(
    new Request(new URL(request.url, baseUrl), {
      method: request.method,
      headers,
      ...(request.method === "GET" || request.method === "HEAD"
        ? {}
        : { body: JSON.stringify(request.body ?? {}) }),
    }),
  );

  for (const [name, value] of response.headers) {
    if (!["content-length", "content-encoding", "set-cookie"].includes(name.toLowerCase())) {
      reply.header(name, value);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);

  const text = await response.text();
  const payload = text.length === 0 ? null : parseResponseBody(text);
  if (response.status >= 400) {
    if (response.status >= 500) {
      request.log.error({ authStatus: response.status }, "Authentication provider request failed");
      const safePayload = {
        error: {
          code: "authentication_unavailable",
          message: "Authentication is temporarily unavailable",
        },
        requestId: request.id,
      };
      return { payload: safePayload, reply: reply.status(503).send(safePayload), status: 503 };
    }
    const source =
      typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const code =
      typeof source["code"] === "string"
        ? source["code"].toLowerCase()
        : typeof source["error"] === "string"
          ? source["error"].toLowerCase()
          : "authentication_failed";
    const message =
      typeof source["message"] === "string"
        ? source["message"]
        : typeof source["error_description"] === "string"
          ? source["error_description"]
          : "Authentication request failed";
    const safePayload = { error: { code, message }, requestId: request.id };
    return {
      payload: safePayload,
      reply: reply.status(response.status).send(safePayload),
      status: response.status,
    };
  }

  return { payload, reply: reply.status(response.status).send(payload), status: response.status };
}

async function recordDeviceResult(
  request: FastifyRequest,
  auth: KnownPathAuth,
  audit: AuditService,
  path: string,
  status: number,
  payload: unknown,
): Promise<void> {
  if (path === "/device/token" && status === 400 && readErrorCode(payload) === "expired_token") {
    await audit.record({
      actor: { kind: "system" },
      eventType: "device_authorization.expired",
      outcome: "failure",
      target: { kind: "device_authorization", id: "knownpath-cli" },
      requestId: request.id,
    });
    return;
  }
  if (status >= 400 || (path !== "/device/approve" && path !== "/device/deny")) return;
  const session = await getKnownPathSession(auth, request.headers);
  if (session === null) return;
  await audit.record({
    actor: { kind: "user", userId: userIdSchema.parse(session.user.id) },
    eventType:
      path === "/device/approve" ? "device_authorization.approved" : "device_authorization.denied",
    outcome: "success",
    target: { kind: "device_authorization", id: "knownpath-cli" },
    requestId: request.id,
  });
}

function readErrorCode(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = payload as { error?: unknown };
  if (typeof value.error === "string") return value.error;
  if (typeof value.error !== "object" || value.error === null) return undefined;
  const nested = value.error as { code?: unknown };
  return typeof nested.code === "string" ? nested.code : undefined;
}

function parseResponseBody(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
