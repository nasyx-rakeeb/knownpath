import type { Visibility } from "@knownpath/domain";

export interface EmbeddingProviderRequest {
  readonly input: string;
  readonly dimensions: number;
  readonly task: "retrieval_document" | "retrieval_query" | "semantic_similarity";
  readonly title?: string;
}

export interface EmbeddingProviderResponse {
  readonly values: readonly number[];
  readonly latencyMs: number;
  readonly usage?: Readonly<Record<string, number>>;
}

export interface EmbeddingProvider {
  readonly capability: "public_only" | "approved_private";
  readonly identifier: string;
  readonly modelIdentifier: string;
  readonly modelVersion: string;
  embed(request: EmbeddingProviderRequest): Promise<EmbeddingProviderResponse>;
}

export class EmbeddingProviderError extends Error {
  public constructor(
    public readonly code:
      | "embedding_provider_authentication_failed"
      | "embedding_provider_permanent_failure"
      | "embedding_provider_quota_exhausted"
      | "embedding_provider_transient_failure"
      | "embedding_provider_visibility_forbidden",
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export function assertEmbeddingVisibility(
  visibility: Visibility,
  capability: EmbeddingProvider["capability"],
): void {
  if (capability === "public_only" && visibility.scope !== "public") {
    throw new EmbeddingProviderError(
      "embedding_provider_visibility_forbidden",
      `${visibility.scope} data cannot use the public/unpaid embedding provider; configure an explicitly approved private-data provider before processing it`,
      false,
    );
  }
}
