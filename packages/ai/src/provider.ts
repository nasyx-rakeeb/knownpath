import type { AiProviderCapability, ExtractionUsage } from "@knownpath/domain";

export interface ExtractionProviderRequest {
  readonly input: string;
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
  readonly systemInstruction: string;
}

export interface ExtractionProviderResponse {
  readonly interactionId?: string;
  readonly latencyMs: number;
  readonly outputText: string;
  readonly usage?: ExtractionUsage;
}

export interface ExtractionProvider {
  readonly capability: AiProviderCapability;
  readonly identifier: string;
  readonly model: string;
  extract(request: ExtractionProviderRequest): Promise<ExtractionProviderResponse>;
}

export type ExtractionProviderFactory = () => ExtractionProvider;

export class ExtractionProviderError extends Error {
  public constructor(
    public readonly code:
      | "ai_provider_authentication_failed"
      | "ai_provider_call_budget_exhausted"
      | "ai_provider_quota_exhausted"
      | "ai_provider_permanent_failure"
      | "ai_provider_transient_failure",
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
  }
}
