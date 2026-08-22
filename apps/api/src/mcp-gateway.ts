import {
  AuthenticationError,
  AuthorizationError,
  authorizeKnowledgeRead,
  requireScope,
  type Principal,
} from "@knownpath/auth";
import type { SearchConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import type { KnowledgeSearchRequest } from "@knownpath/domain";
import {
  McpGatewayError,
  type KnowledgeMcpGateway,
  type KnownPathMcpAlternativesInput,
  type KnownPathMcpGetInput,
} from "@knownpath/mcp";
import { KnowledgeAccessError, type KnowledgeAccessService } from "@knownpath/search";

export interface ServiceKnowledgeMcpGatewayOptions {
  readonly database: KnownPathDatabase;
  readonly ipAddress?: string;
  readonly knowledge: KnowledgeAccessService;
  readonly principal: Extract<Principal, { kind: "api_key" }>;
  readonly requestId: string;
  readonly searchConfig: SearchConfig;
}

export class ServiceKnowledgeMcpGateway implements KnowledgeMcpGateway {
  public constructor(private readonly options: ServiceKnowledgeMcpGatewayOptions) {}

  public search(input: KnowledgeSearchRequest, signal: AbortSignal) {
    return this.safe(async () => {
      throwIfAborted(signal);
      const authorization = authorizeKnowledgeRead(this.options.principal, input.includeReview);
      const response = await this.options.knowledge.search(input, this.context(authorization));
      throwIfAborted(signal);
      return response;
    });
  }

  public get(input: KnownPathMcpGetInput, signal: AbortSignal) {
    return this.safe(async () => {
      throwIfAborted(signal);
      const authorization = authorizeKnowledgeRead(this.options.principal, input.includeReview);
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
    return this.safe(async () => {
      throwIfAborted(signal);
      const authorization = authorizeKnowledgeRead(this.options.principal, input.includeReview);
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
    return this.safe(async () => {
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
        },
        capabilities: {
          publishedRead: true as const,
          reviewRead: principal.user.role === "admin",
          searchBackend: this.options.searchConfig.backend,
        },
      };
    });
  }

  private context(authorization: ReturnType<typeof authorizeKnowledgeRead>) {
    return {
      accessMode: authorization.accessMode,
      principal: authorization.principal,
      requestId: this.options.requestId,
      ...(this.options.ipAddress === undefined ? {} : { ipAddress: this.options.ipAddress }),
    };
  }

  private async safe<Output>(action: () => Promise<Output>): Promise<Output> {
    try {
      return await action();
    } catch (error) {
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
