import { knownPathApiUrl } from "../../../../lib/environment";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1_024;
const exactRoutes = new Set([
  "auth/sign-in/email",
  "auth/sign-out",
  "auth/change-password",
  "account/me",
  "account/dashboard",
  "account/search-activity",
  "account/contributions",
  "account/outcomes",
  "account/profile",
  "account/contribution-settings",
  "account/sessions",
  "api-keys",
  "knowledge/search",
  "admin/overview",
  "admin/moderation",
  "admin/queues/control",
  "admin/jobs/retry",
  "admin/sources/action",
  "admin/canonicalization/preview",
  "admin/canonicalization/execute",
  "admin/users/action",
  "admin/private-content/reveal",
  "workspaces",
]);
const patterns = [
  /^account\/sessions\/[0-9a-f-]+\/revoke$/u,
  /^api-keys\/[0-9a-f-]+\/(rotate|revoke)$/u,
  /^known-paths\/[0-9a-f-]+$/u,
  /^known-paths\/[0-9a-f-]+\/alternatives$/u,
  /^knowledge\/searches\/[0-9a-f-]+\/selections$/u,
  /^contributions\/[0-9a-f-]+$/u,
  /^known-paths\/[0-9a-f-]+\/share-public$/u,
  /^workspaces\/[0-9a-f-]+$/u,
  /^workspaces\/[0-9a-f-]+\/invitations$/u,
  /^workspaces\/[0-9a-f-]+\/members\/[0-9a-f-]+$/u,
  /^workspaces\/[0-9a-f-]+\/members\/[0-9a-f-]+\/remove$/u,
  /^workspaces\/[0-9a-f-]+\/api-keys$/u,
  /^workspaces\/[0-9a-f-]+\/api-keys\/[0-9a-f-]+\/revoke$/u,
  /^workspace-invitations\/[0-9a-f-]+\/(accept|reject|revoke)$/u,
  /^admin\/resources\/(sources|source-items|jobs|extractions|candidates|known-paths|contributions|outcomes|users|audit)$/u,
  /^admin\/resources\/(sources|source-items|jobs|extractions|candidates|known-paths|contributions|outcomes|users|audit)\/[0-9a-f-]+$/u,
];

type BridgeContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: BridgeContext) {
  return forward(request, (await context.params).path, "GET");
}

export async function POST(request: NextRequest, context: BridgeContext) {
  return forward(request, (await context.params).path, "POST");
}

export async function PATCH(request: NextRequest, context: BridgeContext) {
  return forward(request, (await context.params).path, "PATCH");
}

async function forward(
  request: NextRequest,
  segments: string[],
  method: string,
): Promise<Response> {
  const path = segments.join("/");
  if (!isAllowed(path))
    return Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return Response.json(
      { error: { code: "payload_too_large", message: "Payload is too large" } },
      { status: 413 },
    );
  }
  const body = method === "GET" ? undefined : await request.arrayBuffer();
  if (body !== undefined && body.byteLength > MAX_BODY_BYTES) {
    return Response.json(
      { error: { code: "payload_too_large", message: "Payload is too large" } },
      { status: 413 },
    );
  }
  const target = new URL(`/api/v1/${path}${request.nextUrl.search}`, knownPathApiUrl());
  const response = await fetch(target, {
    method,
    redirect: "manual",
    headers: safeRequestHeaders(request.headers, target.origin),
    ...(body === undefined ? {} : { body }),
  });
  const headers = new Headers();
  for (const name of ["content-type", "cache-control", "x-request-id"]) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  for (const cookie of response.headers.getSetCookie()) headers.append("set-cookie", cookie);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

function safeRequestHeaders(source: Headers, apiOrigin: string): Headers {
  const result = new Headers({ accept: "application/json", origin: apiOrigin });
  for (const name of ["cookie", "content-type", "user-agent"]) {
    const value = source.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}

function isAllowed(path: string): boolean {
  return exactRoutes.has(path) || patterns.some((pattern) => pattern.test(path));
}
