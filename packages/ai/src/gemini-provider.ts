import { ApiError, GoogleGenAI } from "@google/genai";
import type { ExtractionUsage } from "@knownpath/domain";
import { recordProviderEvent } from "@knownpath/observability";

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

export function geminiGenerationConfigId(model: string): string {
  return supportsMinimalThinking(model)
    ? "minimal-thinking-no-summaries-v1"
    : "model-default-thinking-no-summaries-v1";
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
            thinking_summaries: "none",
            ...(supportsMinimalThinking(this.model) ? { thinking_level: "minimal" as const } : {}),
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

function supportsMinimalThinking(model: string): boolean {
  return (
    model.startsWith("gemini-3.5-") ||
    model.startsWith("gemini-3.6-") ||
    model === "gemini-3-flash-preview" ||
    model === "gemini-3.1-flash-lite-image"
  );
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
  const status = geminiHttpStatus(error);
  const message = error instanceof Error ? error.message : "Gemini request failed";
  if (status === 401 || status === 403) {
    recordProviderEvent("gemini", "authentication");
    return new ExtractionProviderError("ai_provider_authentication_failed", message, false, status);
  }
  if (status === 429) {
    recordProviderEvent("gemini", "quota");
    return new ExtractionProviderError("ai_provider_quota_exhausted", message, false, status);
  }
  if (status === 408 || (status !== undefined && status >= 500)) {
    recordProviderEvent("gemini", "transient_failure");
    return new ExtractionProviderError("ai_provider_transient_failure", message, true, status);
  }
  if (status === undefined && error instanceof Error) {
    recordProviderEvent("gemini", "transient_failure");
    return new ExtractionProviderError("ai_provider_transient_failure", message, true);
  }
  return new ExtractionProviderError("ai_provider_permanent_failure", message, false, status);
}

function geminiHttpStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (error === null || typeof error !== "object") return undefined;
  for (const key of ["status", "statusCode"] as const) {
    const value = Reflect.get(error, key);
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return undefined;
}
