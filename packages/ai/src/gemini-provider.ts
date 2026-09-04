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
  return model.startsWith("gemini-2.5-flash-lite")
    ? "generate-content-json-default-thinking-v1"
    : "generate-content-json-no-thought-output-v1";
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
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.input,
        config: {
          abortSignal: AbortSignal.timeout(this.options.requestTimeoutMs),
          systemInstruction: request.systemInstruction,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: "application/json",
          responseJsonSchema: request.jsonSchema,
          ...(this.model.startsWith("gemini-2.5-flash-lite")
            ? {}
            : { thinkingConfig: { includeThoughts: false } }),
        },
      });
      const outputText = response.text;
      if (outputText === undefined) {
        throw new ExtractionProviderError(
          "ai_provider_permanent_failure",
          `Gemini generateContent returned no text${
            response.promptFeedback?.blockReason === undefined
              ? ""
              : ` (${response.promptFeedback.blockReason})`
          }`,
          false,
        );
      }
      return {
        ...(response.responseId === undefined ? {} : { interactionId: response.responseId }),
        latencyMs: Date.now() - startedAt,
        outputText,
        ...(response.usageMetadata === undefined
          ? {}
          : { usage: mapUsage(response.usageMetadata) }),
      };
    } catch (error) {
      if (error instanceof ExtractionProviderError) throw error;
      throw classifyGeminiError(error);
    }
  }
}

function mapUsage(usage: {
  cachedContentTokenCount?: number | undefined;
  candidatesTokenCount?: number | undefined;
  promptTokenCount?: number | undefined;
  thoughtsTokenCount?: number | undefined;
  toolUsePromptTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
}): ExtractionUsage {
  return {
    ...(usage.promptTokenCount === undefined ? {} : { inputTokens: usage.promptTokenCount }),
    ...(usage.candidatesTokenCount === undefined
      ? {}
      : { outputTokens: usage.candidatesTokenCount }),
    ...(usage.thoughtsTokenCount === undefined ? {} : { thoughtTokens: usage.thoughtsTokenCount }),
    ...(usage.cachedContentTokenCount === undefined
      ? {}
      : { cachedTokens: usage.cachedContentTokenCount }),
    ...(usage.toolUsePromptTokenCount === undefined
      ? {}
      : { toolTokens: usage.toolUsePromptTokenCount }),
    ...(usage.totalTokenCount === undefined ? {} : { totalTokens: usage.totalTokenCount }),
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
