import {
  AuthenticationError,
  AuthorizationError,
  authorizeScopedKnowledgeRead,
  authorizeOutcomeSubmit,
  requireScope,
  type Principal,
  type AbuseRateGate,
  type RateLimitPolicy,
} from "@knownpath/auth";
import type { SearchConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import type { KnowledgeSearchRequest, OutcomeSubmissionRequest } from "@knownpath/domain";
import {
  McpGatewayError,
  type KnowledgeMcpGateway,
  type KnownPathMcpAlternativesInput,
  type KnownPathMcpGetInput,
} from "@knownpath/mcp";
import { KnowledgeAccessError, type KnowledgeAccessService } from "@knownpath/search";
import {
  ContributionError,
  type ContributionService,
  type ContributionSubmissionResult,
} from "@knownpath/contributions";
import type { ContributionSubmissionRequest } from "@knownpath/domain";
import { authorizeContributionSubmit } from "@knownpath/auth";
import type { AuditService } from "@knownpath/auth";
import { OutcomeError, type OutcomeService } from "@knownpath/outcomes";
import { recordMcpTool, recordSecurityDenial, withSpan } from "@knownpath/observability";

export interface ServiceKnowledgeMcpGatewayOptions {
  readonly database: KnownPathDatabase;
  readonly ipAddress?: string;
  readonly knowledge: KnowledgeAccessService;
  readonly principal: Extract<Principal, { kind: "api_key" }>;
  readonly requestId: string;
  readonly searchConfig: SearchConfig;
  readonly contributions: ContributionService;
  readonly audit: AuditService;
  readonly outcomes: OutcomeService;
  readonly abuseRateGate?: AbuseRateGate;
  readonly mutationRateLimitPolicy: RateLimitPolicy;
  readonly providerRateLimitPolicy: RateLimitPolicy;
}

export class ServiceKnowledgeMcpGateway implements KnowledgeMcpGateway {
  public constructor(private readonly options: ServiceKnowledgeMcpGatewayOptions) {}

  public search(input: KnowledgeSearchRequest, signal: AbortSignal) {
    return this.safe("search", async () => {
      throwIfAborted(signal);
      if (input.semanticMode !== "disabled") await this.enforceProviderLimit();
      const authorization = await authorizeScopedKnowledgeRead(
        this.options.principal,
        input.scope,
        input.includeReview,
        this.options.database,
      );
      const response = await this.options.knowledge.search(input, this.context(authorization));
      throwIfAborted(signal);
      return response;
    });
  }

  public get(input: KnownPathMcpGetInput, signal: AbortSignal) {
    return this.safe("get", async () => {
      throwIfAborted(signal);
      const authorization = await authorizeScopedKnowledgeRead(
        this.options.principal,
        input.scope,
        input.includeReview,
        this.options.database,
      );
      const context = this.context(authorization);
      if (input.searchId !== undefined) {
        await this.options.knowledge.recordSelection(input.searchId, input.id, context);
        throwIfAborted(signal);
      }
      const response = await this.options.knowledge.getById(input.id, context);
      throwIfAborted(signal);
      return response;
    });
  }

  public alternatives(input: KnownPathMcpAlternativesInput, signal: AbortSignal) {
    return this.safe("alternatives", async () => {
      throwIfAborted(signal);
      const authorization = await authorizeScopedKnowledgeRead(
        this.options.principal,
        input.scope,
        input.includeReview,
        this.options.database,
      );
      const response = await this.options.knowledge.alternatives(
        input.id,
        input.cursor,
        input.limit,
        this.context(authorization),
      );
      throwIfAborted(signal);
      return response;
    });
  }

  public status(signal: AbortSignal) {
    return this.safe("status", async () => {
      throwIfAborted(signal);
      requireScope(this.options.principal, "knowledge:read");
      const principal = this.options.principal;
      let ready = true;
      try {
        await this.options.database.ping();
      } catch {
        ready = false;
      }
      throwIfAborted(signal);
      return {
        contractVersion: 1 as const,
        service: "knownpath-api" as const,
        status: ready ? ("ready" as const) : ("not_ready" as const),
        authentication: {
          keyId: principal.key._id,
          prefix: principal.key.prefix,
          scopes: principal.key.scopes,
          ownerRole: principal.user.role,
          ownerStatus: principal.user.status,
          binding:
            principal.key.binding.kind === "workspace"
              ? {
                  kind: "workspace" as const,
                  workspaceId: principal.key.binding.workspaceId,
                  workspaceName: principal.workspace?.name ?? "Workspace",
                  role: principal.workspaceMembership?.role ?? "member",
                  defaultContributionScope: principal.workspace?.defaultContributionScope ?? "team",
                }
              : { kind: "personal" as const },
        },
        capabilities: {
          publishedRead: true as const,
          reviewRead: principal.user.role === "admin",
          searchBackend: this.options.searchConfig.backend,
          contribute: principal.key.scopes.includes("knowledge:contribute"),
          reportOutcome: principal.key.scopes.includes("knowledge:outcome"),
        },
      };
    });
  }

  public contribute(input: ContributionSubmissionRequest, signal: AbortSignal) {
    return this.safe("contribute", async () => {
      throwIfAborted(signal);
      await this.enforceMutationLimit();
      const principal = authorizeContributionSubmit(this.options.principal);
      let result: ContributionSubmissionResult;
      try {
        result = await this.options.contributions.submit(
          input,
          {
            user: principal.user,
            apiKeyId: principal.key._id,
            ...(principal.key.binding.kind === "workspace"
              ? { workspaceId: principal.key.binding.workspaceId }
              : {}),
          },
          signal,
        );
      } catch (error) {
        await this.options.audit.record({
          actor: { kind: "api_key", userId: principal.user._id, apiKeyId: principal.key._id },
          eventType: "contribution.rejected",
          target: { kind: "contribution", id: "rejected-before-persistence" },
          outcome: "failure",
          requestId: this.options.requestId,
          ...(this.options.ipAddress === undefined ? {} : { ipAddress: this.options.ipAddress }),
          metadata: { reason: safeCode(error), transport: "mcp" },
        });
        throw error;
      }
      await this.options.audit.record({
        actor: { kind: "api_key", userId: principal.user._id, apiKeyId: principal.key._id },
        eventType: result.response.reused
          ? "contribution.replayed"
          : result.contribution.status === "quarantined"
            ? "contribution.quarantined"
            : "contribution.submitted",
        target: { kind: "contribution", id: result.contribution._id },
        outcome: "success",
        requestId: this.options.requestId,
        ...(this.options.ipAddress === undefined ? {} : { ipAddress: this.options.ipAddress }),
        metadata: {
          visibility: result.response.visibility,
          processingStage: result.response.processingStage,
          transport: "mcp",
        },
      });
      return result.response;
    });
  }

  public reportOutcome(input: OutcomeSubmissionRequest, signal: AbortSignal) {
    return this.safe("outcome", async () => {
      throwIfAborted(signal);
      await this.enforceMutationLimit();
      const principal = authorizeOutcomeSubmit(this.options.principal);
      const scope = input.scope;
      const access = await authorizeScopedKnowledgeRead(
        principal,
        scope,
        input.includeReview,
        this.options.database,
      );
      try {
        const response = await this.options.outcomes.submit(input, {
          userId: principal.user._id,
          apiKeyId: principal.key._id,
          accessMode: access.accessMode,
          scope: input.scope,
          ...(principal.key.binding.kind === "workspace"
            ? { workspaceId: principal.key.binding.workspaceId }
            : {}),
        });
        await this.options.audit.record({
          actor: {
            kind: "api_key",
            userId: principal.user._id,
            apiKeyId: principal.key._id,
          },
          eventType: response.reused ? "outcome.replayed" : "outcome.submitted",
          target: { kind: "outcome", id: response.outcomeId },
          outcome: "success",
          requestId: this.options.requestId,
          ...(this.options.ipAddress === undefined ? {} : { ipAddress: this.options.ipAddress }),
          metadata: {
            knownPathId: input.knownPathId,
            outcome: input.outcome,
            influence: response.influence.status,
            transport: "mcp",
          },
        });
        if (response.safetyReviewQueued && input.outcome === "misleading_or_unsafe") {
          await this.options.audit.record({
            actor: {
              kind: "api_key",
              userId: principal.user._id,
              apiKeyId: principal.key._id,
            },
            eventType: "outcome.safety_review_queued",
            target: { kind: "safety_review", id: input.knownPathId },
            outcome: "success",
            requestId: this.options.requestId,
            ...(this.options.ipAddress === undefined ? {} : { ipAddress: this.options.ipAddress }),
            metadata: { sourceOutcomeId: response.outcomeId, transport: "mcp" },
          });
        }
        throwIfAborted(signal);
        return response;
      } catch (error) {
        await this.options.audit.record({
          actor: {
            kind: "api_key",
            userId: principal.user._id,
            apiKeyId: principal.key._id,
          },
          eventType: "outcome.rejected",
          target: { kind: "outcome", id: "rejected-before-persistence" },
          outcome: "failure",
          requestId: this.options.requestId,
          ...(this.options.ipAddress === undefined ? {} : { ipAddress: this.options.ipAddress }),
          metadata: { reason: safeCode(error), transport: "mcp" },
        });
        throw error;
      }
    });
  }

  private context(authorization: Awaited<ReturnType<typeof authorizeScopedKnowledgeRead>>) {
    return {
      accessMode: authorization.accessMode,
      scope: authorization.scope,
      principal: authorization.principal,
      requestId: this.options.requestId,
      ...(this.options.ipAddress === undefined ? {} : { ipAddress: this.options.ipAddress }),
    };
  }

  private async safe<Output>(
    tool: "alternatives" | "contribute" | "get" | "outcome" | "search" | "status",
    action: () => Promise<Output>,
  ): Promise<Output> {
    const startedAt = performance.now();
    try {
      const result = await withSpan(`knownpath.mcp.${tool}`, { "mcp.tool.name": tool }, action);
      recordMcpTool({ durationMs: performance.now() - startedAt, outcome: "success", tool });
      return result;
    } catch (error) {
      recordMcpTool({ durationMs: performance.now() - startedAt, outcome: "error", tool });
      if (error instanceof McpGatewayError) throw error;
      if (error instanceof AuthenticationError) {
        throw new McpGatewayError("authentication_required", error.message);
      }
      if (error instanceof AuthorizationError) {
        throw new McpGatewayError(
          error.code === "knowledge_review_access_forbidden"
            ? "knowledge_review_access_forbidden"
            : "insufficient_permission",
          error.message,
        );
      }
      if (error instanceof KnowledgeAccessError) {
        throw new McpGatewayError(error.code, error.message);
      }
      if (error instanceof ContributionError) {
        throw new McpGatewayError(
          error.code as import("@knownpath/mcp").McpGatewayErrorCode,
          error.message,
        );
      }
      if (error instanceof OutcomeError) {
        throw new McpGatewayError(
          error.code as import("@knownpath/mcp").McpGatewayErrorCode,
          error.message,
        );
      }
      if (hasCode(error, "semantic_retrieval_unavailable")) {
        throw new McpGatewayError(
          "semantic_retrieval_unavailable",
          "Semantic retrieval is unavailable for this request",
        );
      }
      if (hasSearchProviderCode(error)) {
        throw new McpGatewayError(
          "search_backend_unavailable",
          "The requested KnownPath retrieval capability is temporarily unavailable",
        );
      }
      throw new McpGatewayError("internal_error", "KnownPath could not complete the request");
    }
  }

  private async enforceMutationLimit(): Promise<void> {
    if (this.options.abuseRateGate === undefined) return;
    const result = await this.options.abuseRateGate.consume({
      key: this.options.principal.key._id,
      max: this.options.mutationRateLimitPolicy.max,
      namespace: "mcp",
      windowMs: this.options.mutationRateLimitPolicy.timeWindowMs,
    });
    if (!result.allowed) {
      recordSecurityDenial("abuse_limit", "mcp");
      throw new McpGatewayError(
        "rate_limit_exceeded",
        `MCP mutation rate limit exceeded; retry after ${Math.ceil(result.retryAfterMs / 1_000)} seconds`,
      );
    }
  }

  private async enforceProviderLimit(): Promise<void> {
    if (this.options.abuseRateGate === undefined) return;
    const result = await this.options.abuseRateGate.consume({
      key: this.options.principal.key._id,
      max: this.options.providerRateLimitPolicy.max,
      namespace: "ai",
      windowMs: this.options.providerRateLimitPolicy.timeWindowMs,
    });
    if (!result.allowed) {
      recordSecurityDenial("abuse_limit", "mcp");
      throw new McpGatewayError(
        "rate_limit_exceeded",
        `Provider-heavy request limit exceeded; retry after ${Math.ceil(result.retryAfterMs / 1_000)} seconds`,
      );
    }
  }
}

function safeCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code).slice(0, 128)
    : "rejected";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new McpGatewayError("backend_cancelled", "The KnownPath request was cancelled");
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function hasSearchProviderCode(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return [
    "embedding_provider_authentication_failed",
    "embedding_provider_permanent_failure",
    "embedding_provider_quota_exhausted",
    "embedding_provider_transient_failure",
  ].includes(String(error.code));
}
