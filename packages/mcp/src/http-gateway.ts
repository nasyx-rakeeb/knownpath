import {
  knowledgeSearchResponseSchema,
  knowledgeSelectionResponseSchema,
  knownPathAlternativesResponseSchema,
  knownPathDetailResponseSchema,
  type KnowledgeSearchRequest,
} from "@knownpath/domain";
import { z } from "zod";

import {
  mcpStatusResponseSchema,
  type KnownPathMcpAlternativesInput,
  type KnownPathMcpGetInput,
} from "./contracts.js";
import { McpGatewayError, type KnowledgeMcpGateway, type McpGatewayErrorCode } from "./gateway.js";

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().trim().min(1).max(128),
    message: z.string().trim().min(1).max(1_000),
  }),
  requestId: z.string().trim().min(1).max(128).optional(),
});

interface ResponseSchema<Output> {
  parse(input: unknown): Output;
}

export interface HttpKnowledgeMcpGatewayOptions {
  readonly apiKey: string;
  readonly apiUrl: string;
  readonly maxResponseBytes: number;
  readonly requestTimeoutMs: number;
  readonly fetch?: typeof globalThis.fetch;
}

export class HttpKnowledgeMcpGateway implements KnowledgeMcpGateway {
  private readonly apiBaseUrl: URL;
  private readonly fetchImplementation: typeof globalThis.fetch;

  public constructor(private readonly options: HttpKnowledgeMcpGatewayOptions) {
    this.apiBaseUrl = normalizeApiUrl(options.apiUrl);
    if (options.apiKey.trim().length < 16) {
      throw new Error("KNOWNPATH_API_KEY must contain a valid KnownPath API key");
    }
    if (options.maxResponseBytes < 1_024 || options.maxResponseBytes > 2_000_000) {
      throw new Error("KNOWNPATH_MCP_MAX_RESPONSE_BYTES is outside the supported range");
    }
    if (options.requestTimeoutMs < 1_000 || options.requestTimeoutMs > 120_000) {
      throw new Error("KNOWNPATH_MCP_REQUEST_TIMEOUT_MS is outside the supported range");
    }
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
  }

  public search(input: KnowledgeSearchRequest, signal: AbortSignal) {
    return this.request(
      "api/v1/knowledge/search",
      { method: "POST", body: input },
      knowledgeSearchResponseSchema,
      signal,
    );
  }

  public async get(input: KnownPathMcpGetInput, signal: AbortSignal) {
    if (input.searchId !== undefined) {
      await this.request(
        `api/v1/knowledge/searches/${encodeURIComponent(input.searchId)}/selections`,
        { method: "POST", body: { knownPathId: input.id } },
        knowledgeSelectionResponseSchema,
        signal,
      );
    }
    return this.request(
      `api/v1/known-paths/${encodeURIComponent(input.id)}?includeReview=${String(input.includeReview)}`,
      { method: "GET" },
      knownPathDetailResponseSchema,
      signal,
    );
  }

  public alternatives(input: KnownPathMcpAlternativesInput, signal: AbortSignal) {
    const query = new URLSearchParams({
      includeReview: String(input.includeReview),
      limit: String(input.limit),
    });
    if (input.cursor !== undefined) query.set("cursor", input.cursor);
    return this.request(
      `api/v1/known-paths/${encodeURIComponent(input.id)}/alternatives?${query.toString()}`,
      { method: "GET" },
      knownPathAlternativesResponseSchema,
      signal,
    );
  }

  public status(signal: AbortSignal) {
    return this.request("api/v1/mcp/status", { method: "GET" }, mcpStatusResponseSchema, signal);
  }

  private async request<Output>(
    path: string,
    input: { readonly method: "GET" | "POST"; readonly body?: unknown },
    schema: ResponseSchema<Output>,
    callerSignal: AbortSignal,
  ): Promise<Output> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("KnownPath backend request timed out"));
    }, this.options.requestTimeoutMs);
    const abortFromCaller = () => controller.abort(callerSignal.reason);
    callerSignal.addEventListener("abort", abortFromCaller, { once: true });

    try {
      if (callerSignal.aborted) abortFromCaller();
      const response = await this.fetchImplementation(new URL(path, this.apiBaseUrl), {
        method: input.method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
          ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        signal: controller.signal,
      });
      const payload = await readJson(response, this.options.maxResponseBytes);
      if (!response.ok) throw toGatewayError(response.status, payload);
      try {
        return schema.parse(payload);
      } catch {
        throw new McpGatewayError(
          "backend_response_invalid",
          "The KnownPath API returned a response that did not match its contract",
          response.headers.get("x-request-id") ?? undefined,
        );
      }
    } catch (error) {
      if (error instanceof McpGatewayError) throw error;
      if (callerSignal.aborted) {
        throw new McpGatewayError("backend_cancelled", "The KnownPath request was cancelled");
      }
      if (timedOut) {
        throw new McpGatewayError(
          "backend_timeout",
          "The KnownPath API did not respond before the configured timeout",
        );
      }
      throw new McpGatewayError(
        "backend_unreachable",
        "The KnownPath API could not be reached; check KNOWNPATH_API_URL and network access",
      );
    } finally {
      clearTimeout(timeout);
      callerSignal.removeEventListener("abort", abortFromCaller);
    }
  }
}

function normalizeApiUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("KNOWNPATH_API_URL must use HTTP or HTTPS");
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error(
      "KNOWNPATH_API_URL must not contain credentials, query parameters, or fragments",
    );
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("KNOWNPATH_API_URL must be an origin without a path");
  }
  url.pathname = "/";
  return url;
}

async function readJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > maximumBytes) {
    throw new McpGatewayError(
      "backend_response_too_large",
      "The KnownPath API response exceeded the configured safety limit",
      response.headers.get("x-request-id") ?? undefined,
    );
  }
  if (response.body === null) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new McpGatewayError(
        "backend_response_too_large",
        "The KnownPath API response exceeded the configured safety limit",
        response.headers.get("x-request-id") ?? undefined,
      );
    }
    chunks.push(next.value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(joined)) as unknown;
  } catch {
    throw new McpGatewayError(
      "backend_response_invalid",
      "The KnownPath API returned an invalid JSON response",
      response.headers.get("x-request-id") ?? undefined,
    );
  }
}

function toGatewayError(status: number, payload: unknown): McpGatewayError {
  const parsed = errorEnvelopeSchema.safeParse(payload);
  const requestId = parsed.success ? parsed.data.requestId : undefined;
  const backendCode = parsed.success ? parsed.data.error.code : undefined;
  const mapped = mapBackendCode(status, backendCode);
  return new McpGatewayError(
    mapped.code,
    parsed.success ? parsed.data.error.message : mapped.message,
    requestId,
  );
}

function mapBackendCode(
  status: number,
  code: string | undefined,
): { code: McpGatewayErrorCode; message: string } {
  const allowed: readonly McpGatewayErrorCode[] = [
    "authentication_required",
    "insufficient_permission",
    "knowledge_review_access_forbidden",
    "knowledge_not_found",
    "invalid_cursor",
    "search_event_not_found",
    "selection_not_in_results",
    "selection_conflict",
    "validation_failed",
    "rate_limit_exceeded",
    "search_backend_unavailable",
    "semantic_retrieval_unavailable",
  ];
  if (code !== undefined && allowed.includes(code as McpGatewayErrorCode)) {
    return { code: code as McpGatewayErrorCode, message: "The KnownPath API rejected the request" };
  }
  if (status === 401)
    return {
      code: "authentication_required",
      message: "The KnownPath API key is invalid or revoked",
    };
  if (status === 403)
    return { code: "insufficient_permission", message: "The KnownPath API key lacks permission" };
  if (status === 429)
    return { code: "rate_limit_exceeded", message: "The KnownPath API rate limit was reached" };
  if (status >= 500)
    return {
      code: "search_backend_unavailable",
      message: "The KnownPath backend is temporarily unavailable",
    };
  return {
    code: "backend_response_invalid",
    message: "The KnownPath API returned an unexpected response",
  };
}
