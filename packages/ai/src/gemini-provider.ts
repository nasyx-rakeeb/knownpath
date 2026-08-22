import { ApiError, GoogleGenAI } from "@google/genai";
import type { ExtractionUsage } from "@knownpath/domain";

import {
  ExtractionProviderError,
  type ExtractionProvider,
  type ExtractionProviderRequest,
  type ExtractionProviderResponse,
} from "./provider.js";

export interface GeminiProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly requestTimeoutMs: number;
}

export class GeminiExtractionProvider implements ExtractionProvider {
  public readonly capability = "public_only" as const;
  public readonly identifier = "gemini";
  public readonly model: string;
  private readonly client: GoogleGenAI;

  public constructor(private readonly options: GeminiProviderOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new ExtractionProviderError(
        "ai_provider_authentication_failed",
        "GEMINI_API_KEY is required for public Gemini extraction",
        false,
      );
    }
    this.model = options.model;
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
  }

  public async extract(request: ExtractionProviderRequest): Promise<ExtractionProviderResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.client.interactions.create(
        {
          model: this.model,
          input: request.input,
          system_instruction: request.systemInstruction,
          store: false,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: request.jsonSchema,
          },
          generation_config: {
            max_output_tokens: request.maxOutputTokens,
            thinking_level: "minimal",
            thinking_summaries: "none",
          },
        },
        { timeout: this.options.requestTimeoutMs, maxRetries: 0 },
      );
      if (response.status !== "completed" || response.output_text === undefined) {
        throw new ExtractionProviderError(
          "ai_provider_permanent_failure",
          `Gemini interaction ended with status ${response.status}`,
          false,
        );
      }
      return {
        interactionId: response.id,
        latencyMs: Date.now() - startedAt,
        outputText: response.output_text,
        ...(response.usage === undefined ? {} : { usage: mapUsage(response.usage) }),
      };
    } catch (error) {
      if (error instanceof ExtractionProviderError) throw error;
      throw classifyGeminiError(error);
    }
  }
}

function mapUsage(usage: {
  total_cached_tokens?: number | undefined;
  total_input_tokens?: number | undefined;
  total_output_tokens?: number | undefined;
  total_thought_tokens?: number | undefined;
  total_tokens?: number | undefined;
  total_tool_use_tokens?: number | undefined;
}): ExtractionUsage {
  return {
    ...(usage.total_input_tokens === undefined ? {} : { inputTokens: usage.total_input_tokens }),
    ...(usage.total_output_tokens === undefined ? {} : { outputTokens: usage.total_output_tokens }),
    ...(usage.total_thought_tokens === undefined
      ? {}
      : { thoughtTokens: usage.total_thought_tokens }),
    ...(usage.total_cached_tokens === undefined ? {} : { cachedTokens: usage.total_cached_tokens }),
    ...(usage.total_tool_use_tokens === undefined
      ? {}
      : { toolTokens: usage.total_tool_use_tokens }),
    ...(usage.total_tokens === undefined ? {} : { totalTokens: usage.total_tokens }),
  };
}

function classifyGeminiError(error: unknown): ExtractionProviderError {
  const status = error instanceof ApiError ? error.status : undefined;
  const message = error instanceof Error ? error.message : "Gemini request failed";
  if (status === 401 || status === 403) {
    return new ExtractionProviderError("ai_provider_authentication_failed", message, false, status);
  }
  if (status === 429) {
    return new ExtractionProviderError("ai_provider_quota_exhausted", message, true, status);
  }
  if (status === 408 || (status !== undefined && status >= 500)) {
    return new ExtractionProviderError("ai_provider_transient_failure", message, true, status);
  }
  if (status === undefined && error instanceof Error) {
    return new ExtractionProviderError("ai_provider_transient_failure", message, true);
  }
  return new ExtractionProviderError("ai_provider_permanent_failure", message, false, status);
}
