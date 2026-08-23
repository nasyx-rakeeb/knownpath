import type {
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnownPathAlternativesResponse,
  KnownPathDetailResponse,
  ContributionSubmissionResponse,
  ContributionSubmissionRequest,
} from "@knownpath/domain";

import type {
  KnownPathMcpAlternativesInput,
  KnownPathMcpGetInput,
  KnownPathMcpStatus,
} from "./contracts.js";

export interface KnowledgeMcpGateway {
  search(input: KnowledgeSearchRequest, signal: AbortSignal): Promise<KnowledgeSearchResponse>;
  get(input: KnownPathMcpGetInput, signal: AbortSignal): Promise<KnownPathDetailResponse>;
  alternatives(
    input: KnownPathMcpAlternativesInput,
    signal: AbortSignal,
  ): Promise<KnownPathAlternativesResponse>;
  status(signal: AbortSignal): Promise<KnownPathMcpStatus>;
  contribute(
    input: ContributionSubmissionRequest,
    signal: AbortSignal,
  ): Promise<ContributionSubmissionResponse>;
}

export type McpGatewayErrorCode =
  | "backend_cancelled"
  | "backend_timeout"
  | "backend_unreachable"
  | "backend_response_invalid"
  | "backend_response_too_large"
  | "authentication_required"
  | "insufficient_permission"
  | "knowledge_review_access_forbidden"
  | "knowledge_not_found"
  | "invalid_cursor"
  | "search_event_not_found"
  | "selection_not_in_results"
  | "selection_conflict"
  | "validation_failed"
  | "rate_limit_exceeded"
  | "search_backend_unavailable"
  | "semantic_retrieval_unavailable"
  | "contribution_disabled"
  | "contribution_consent_required"
  | "contribution_content_rejected"
  | "contribution_idempotency_conflict"
  | "team_contributions_not_supported"
  | "internal_error";

export class McpGatewayError extends Error {
  public constructor(
    public readonly code: McpGatewayErrorCode,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "McpGatewayError";
  }
}
