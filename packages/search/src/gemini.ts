import { ApiError, GoogleGenAI } from "@google/genai";

import {
  EmbeddingProviderError,
  type EmbeddingProvider,
  type EmbeddingProviderRequest,
  type EmbeddingProviderResponse,
} from "./provider.js";

export interface GeminiEmbeddingProviderOptions {
  readonly apiKey: string;
  readonly modelIdentifier: string;
  readonly modelVersion: string;
  readonly requestTimeoutMs: number;
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  public readonly capability = "public_only" as const;
  public readonly identifier = "gemini";
  public readonly modelIdentifier: string;
  public readonly modelVersion: string;
  private readonly client: GoogleGenAI;

  public constructor(private readonly options: GeminiEmbeddingProviderOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new EmbeddingProviderError(
        "embedding_provider_authentication_failed",
        "GEMINI_API_KEY is required for public Gemini embeddings",
        false,
      );
    }
    this.modelIdentifier = options.modelIdentifier;
    this.modelVersion = options.modelVersion;
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
  }

  public async embed(request: EmbeddingProviderRequest): Promise<EmbeddingProviderResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.client.models.embedContent({
        model: this.modelIdentifier,
        contents: formatEmbeddingInput(request),
        config: {
          outputDimensionality: request.dimensions,
          httpOptions: { timeout: this.options.requestTimeoutMs },
        },
      });
      const values = response.embeddings?.[0]?.values;
      if (values === undefined || values.length !== request.dimensions) {
        throw new EmbeddingProviderError(
          "embedding_provider_permanent_failure",
          `Gemini returned ${values?.length ?? 0} embedding dimensions; expected ${request.dimensions}`,
          false,
        );
      }
      return { latencyMs: Date.now() - startedAt, values };
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      throw classifyGeminiEmbeddingError(error);
    }
  }
}

function formatEmbeddingInput(request: EmbeddingProviderRequest): string {
  if (request.task === "retrieval_query") {
    return `task: search result | query: ${request.input}`;
  }
  if (request.task === "retrieval_document") {
    return `title: ${request.title?.trim() || "none"} | text: ${request.input}`;
  }
  return request.input;
}

function classifyGeminiEmbeddingError(error: unknown): EmbeddingProviderError {
  const status = error instanceof ApiError ? error.status : undefined;
  const message = error instanceof Error ? error.message : "Gemini embedding request failed";
  if (status === 401 || status === 403) {
    return new EmbeddingProviderError(
      "embedding_provider_authentication_failed",
      message,
      false,
      status,
    );
  }
  if (status === 429) {
    return new EmbeddingProviderError("embedding_provider_quota_exhausted", message, true, status);
  }
  if (status === 408 || (status !== undefined && status >= 500)) {
    return new EmbeddingProviderError(
      "embedding_provider_transient_failure",
      message,
      true,
      status,
    );
  }
  if (status === undefined && error instanceof Error) {
    return new EmbeddingProviderError("embedding_provider_transient_failure", message, true);
  }
  return new EmbeddingProviderError("embedding_provider_permanent_failure", message, false, status);
}
