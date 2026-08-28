import type { KnownPathAuth, RateLimitPolicy } from "@knownpath/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from "fastify";
import type { z } from "zod";

import {
  authChangePasswordBodySchema,
  authRevokeSessionBodySchema,
  authSignInBodySchema,
  errorEnvelopeSchema,
} from "./schemas.js";

interface AuthRoute {
  readonly body?: z.ZodType;
  readonly method: HTTPMethods;
  readonly path: string;
  readonly protected: boolean;
  readonly summary: string;
}

const authRoutes: readonly AuthRoute[] = [
  {
    method: "POST",
    path: "/sign-in/email",
    body: authSignInBodySchema,
    protected: false,
    summary: "Sign in with email and password",
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
  signInPolicy: RateLimitPolicy,
): void {
  for (const route of authRoutes) {
    api.route({
      method: route.method,
      url: `/api/v1/auth${route.path}`,
      schema: {
        tags: ["authentication"],
        summary: route.summary,
        ...(route.body === undefined ? {} : { body: route.body }),
        ...(route.protected ? { security: [{ cookieSession: [] }] } : {}),
        response: {
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
      },
      ...(route.path === "/sign-in/email"
        ? {
            config: {
              rateLimit: { max: signInPolicy.max, timeWindow: signInPolicy.timeWindowMs },
            },
          }
        : {}),
      handler: async (request, reply) => proxyAuthRequest(request, reply, auth, baseUrl),
    });
  }
}

async function proxyAuthRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: KnownPathAuth,
  baseUrl: string,
) {
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
      return reply.status(503).send({
        error: {
          code: "authentication_unavailable",
          message: "Authentication is temporarily unavailable",
        },
        requestId: request.id,
      });
    }
    const source =
      typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const code =
      typeof source["code"] === "string" ? source["code"].toLowerCase() : "authentication_failed";
    const message =
      typeof source["message"] === "string" ? source["message"] : "Authentication request failed";
    return reply.status(response.status).send({ error: { code, message }, requestId: request.id });
  }

  return reply.status(response.status).send(payload);
}

function parseResponseBody(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
