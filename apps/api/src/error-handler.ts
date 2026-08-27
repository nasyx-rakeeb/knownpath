import {
  AuthenticationError,
  AuthorizationError,
  AuthResourceNotFoundError,
  DashboardCursorError,
} from "@knownpath/auth";
import type { FastifyInstance } from "fastify";
import { KnowledgeAccessError } from "@knownpath/search";
import { ContributionError } from "@knownpath/contributions";
import { OutcomeError } from "@knownpath/outcomes";
import { z } from "zod";
import { AdminOperationError } from "./admin-service.js";
import { WorkspaceError } from "@knownpath/workspaces";

export function registerErrorHandler(api: FastifyInstance): void {
  api.setNotFoundHandler(async (request, reply) =>
    reply.status(404).send({
      error: { code: "route_not_found", message: "The requested route does not exist" },
      requestId: request.id,
    }),
  );

  api.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AuthenticationError) {
      if (request.url.startsWith("/mcp") || request.url.startsWith("/api/v1/mcp")) {
        reply.header("www-authenticate", 'Bearer realm="KnownPath", scope="knowledge:read"');
      }
      return reply.status(401).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof AuthorizationError) {
      return reply.status(403).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof AuthResourceNotFoundError) {
      return reply.status(404).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof DashboardCursorError) {
      return reply.status(400).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof AdminOperationError) {
      return reply.status(error.statusCode).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof WorkspaceError) {
      return reply.status(error.statusCode).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof KnowledgeAccessError) {
      return reply.status(error.statusCode).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof ContributionError) {
      const status =
        error.code === "contribution_not_found"
          ? 404
          : error.code === "contribution_idempotency_conflict"
            ? 409
            : error.code === "contribution_content_rejected"
              ? 422
              : 403;
      return reply.status(status).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof OutcomeError) {
      const status =
        error.code === "outcome_target_not_accessible"
          ? 404
          : error.code === "outcome_rate_limited"
            ? 429
            : error.code === "outcome_note_rejected"
              ? 422
              : 409;
      return reply.status(status).send(envelope(error.code, error.message, request.id));
    }
    if (error instanceof z.ZodError || isFastifyValidationError(error)) {
      const details =
        error instanceof z.ZodError
          ? error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
          : error.validation.map((issue) => ({
              path: issue.instancePath || issue.schemaPath,
              message: issue.message ?? "Invalid request value",
            }));
      return reply.status(400).send({
        ...envelope(
          "validation_failed",
          "The request did not satisfy the API contract",
          request.id,
        ),
        error: {
          code: "validation_failed",
          message: "The request did not satisfy the API contract",
          details,
        },
      });
    }
    if (isMongoDuplicateError(error)) {
      return reply
        .status(409)
        .send(
          envelope("resource_conflict", "A resource with that identity already exists", request.id),
        );
    }
    if (isStatusError(error, 429)) {
      return reply
        .status(429)
        .send(envelope("rate_limit_exceeded", "Too many requests; retry later", request.id));
    }
    if (isFastifyCode(error, "FST_ERR_CTP_BODY_TOO_LARGE")) {
      return reply
        .status(413)
        .send(envelope("payload_too_large", "The request payload is too large", request.id));
    }
    if (isFastifyCode(error, "FST_ERR_CTP_INVALID_JSON_BODY")) {
      return reply
        .status(400)
        .send(envelope("validation_failed", "The request body is not valid JSON", request.id));
    }
    if (isCodedSearchError(error)) {
      return reply
        .status(503)
        .send(
          envelope(
            error.code === "semantic_retrieval_unavailable"
              ? "semantic_retrieval_unavailable"
              : "search_backend_unavailable",
            "The requested retrieval capability is temporarily unavailable",
            request.id,
          ),
        );
    }

    const safeError = error instanceof Error ? error : new Error("Unknown API error");
    request.log.error(
      { errorName: safeError.name, errorMessage: safeError.message, stack: safeError.stack },
      "unhandled API error",
    );
    return reply
      .status(500)
      .send(envelope("internal_error", "An unexpected error occurred", request.id));
  });
}

function isFastifyCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isCodedSearchError(error: unknown): error is { code: string } {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return [
    "semantic_retrieval_unavailable",
    "embedding_provider_authentication_failed",
    "embedding_provider_permanent_failure",
    "embedding_provider_quota_exhausted",
    "embedding_provider_transient_failure",
  ].includes(String(error.code));
}

function isFastifyValidationError(
  error: unknown,
): error is { validation: Array<{ instancePath: string; message?: string; schemaPath: string }> } {
  return (
    typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    Array.isArray(error.validation)
  );
}

function isMongoDuplicateError(error: unknown): error is { code: 11000 } {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function isStatusError(error: unknown, statusCode: number): error is { statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === statusCode
  );
}

function envelope(code: string, message: string, requestId: string) {
  return { error: { code, message }, requestId };
}
