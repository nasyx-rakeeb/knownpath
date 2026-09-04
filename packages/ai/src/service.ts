import { randomUUID } from "node:crypto";

import type { KnownPathDatabase } from "@knownpath/database";
import {
  createExtractionAttemptId,
  createVersionedKey,
  extractionAttemptSchema,
  type AiProviderCapability,
  type CandidateExperience,
  type ExtractionAttempt,
  type SourceItem,
} from "@knownpath/domain";

import { createCandidateExperience } from "./candidate-builder.js";
import { assembleExtractionContext, EXTRACTION_CONTEXT_VERSION } from "./context.js";
import { sha256, stableJson } from "./digests.js";
import { EXTRACTION_OUTPUT_SCHEMA_VERSION, extractionOutputJsonSchema } from "./output-schema.js";
import { getPromptBundle } from "./prompts.js";
import {
  ExtractionProviderError,
  type ExtractionProviderFactory,
  type ExtractionProviderResponse,
} from "./provider.js";
import { decodeExtractionResponse } from "./response-validation.js";

const TERMINAL_STATUSES = new Set<ExtractionAttempt["status"]>([
  "succeeded",
  "irrelevant",
  "insufficient_evidence",
  "conflicting_evidence",
  "quarantined",
  "blocked",
  "failed",
]);

export interface ExtractionServiceOptions {
  readonly dataHandling: AiProviderCapability;
  readonly generationConfigId: string;
  readonly maxEstimatedInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxRetries: number;
  readonly minRequestSpacingMs: number;
  readonly model: string;
  readonly providerCapability: AiProviderCapability;
  readonly providerFactory: ExtractionProviderFactory;
  readonly providerIdentifier: string;
}

export interface ExtractionResult {
  readonly attempt: ExtractionAttempt;
  readonly providerCalls: number;
  readonly reused: boolean;
}

export class ExtractionPolicyError extends Error {
  public readonly code = "ai_private_data_not_approved";
  public constructor(public readonly attempt: ExtractionAttempt) {
    super(
      "Private/team source data is blocked from the public-only Gemini path. Configure an explicitly approved private-data provider/account before processing this source.",
    );
  }
}

export class ExtractionService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly options: ExtractionServiceOptions,
  ) {}

  public async processOne(
    sourceItem: SourceItem,
    force = false,
    providerCallBudget = Number.POSITIVE_INFINITY,
  ): Promise<ExtractionResult> {
    const context = await assembleExtractionContext(
      this.database,
      sourceItem,
      this.options.maxEstimatedInputTokens,
    );
    const prompts = getPromptBundle(context.strategy);
    const generationConfigDigest = sha256(
      stableJson({
        generationConfigId: this.options.generationConfigId,
        maxOutputTokens: this.options.maxOutputTokens,
      }),
    );
    const idempotencyKey = createVersionedKey([
      context.target._id,
      context.contextDigest,
      this.options.providerIdentifier,
      this.options.model,
      this.options.providerCapability,
      stableJson(prompts.references),
      String(EXTRACTION_OUTPUT_SCHEMA_VERSION),
      generationConfigDigest,
      ...(force ? [randomUUID()] : []),
    ]);
    if (!force) {
      const existing =
        await this.database.repositories.extractionAttempts.findByIdempotencyKey(idempotencyKey);
      if (existing !== null && TERMINAL_STATUSES.has(existing.status)) {
        if (existing.status === "blocked") throw new ExtractionPolicyError(existing);
        return { attempt: existing, providerCalls: 0, reused: true };
      }
    }

    const queued = this.createQueuedAttempt({
      context,
      generationConfigDigest,
      idempotencyKey,
      prompts: prompts.references,
    });
    const inserted = await this.database.repositories.extractionAttempts.createIfAbsent(queued);
    if (inserted === null) {
      const concurrent =
        await this.database.repositories.extractionAttempts.findByIdempotencyKey(idempotencyKey);
      if (concurrent === null) throw new Error("Extraction attempt was concurrently removed");
      return { attempt: concurrent, providerCalls: 0, reused: true };
    }

    if (
      context.visibility.some(({ scope }) => scope !== "public") &&
      (this.options.dataHandling !== "approved_private" ||
        this.options.providerCapability !== "approved_private")
    ) {
      const blocked = await this.requireUpdatedAttempt(queued._id, {
        status: "blocked",
        completedAt: new Date(),
        failureCode: "ai_private_data_not_approved",
        failureMessage: "The configured AI path is public-only",
      });
      throw new ExtractionPolicyError(blocked);
    }

    await this.requireUpdatedAttempt(queued._id, { status: "running", startedAt: new Date() });
    let response: ExtractionProviderResponse;
    let providerCalls = 0;
    try {
      const provider = this.options.providerFactory();
      if (
        provider.identifier !== this.options.providerIdentifier ||
        provider.model !== this.options.model ||
        provider.capability !== this.options.providerCapability
      ) {
        throw new ExtractionProviderError(
          "ai_provider_permanent_failure",
          "Configured provider does not match the declared extraction policy",
          false,
        );
      }
      response = await this.callWithRetry(
        async () => {
          if (providerCalls >= providerCallBudget) {
            throw new ExtractionProviderError(
              "ai_provider_call_budget_exhausted",
              "Configured provider-call budget was reached",
              false,
            );
          }
          providerCalls += 1;
          return provider.extract({
            input: context.input,
            systemInstruction: prompts.systemInstruction,
            jsonSchema: extractionOutputJsonSchema,
            maxOutputTokens: this.options.maxOutputTokens,
          });
        },
        async (retryCount) => {
          await this.requireUpdatedAttempt(queued._id, { retryCount });
        },
      );
    } catch (error) {
      const providerError =
        error instanceof ExtractionProviderError
          ? error
          : new ExtractionProviderError(
              "ai_provider_permanent_failure",
              "AI provider request failed",
              false,
            );
      const failed = await this.requireUpdatedAttempt(queued._id, {
        status: "failed",
        completedAt: new Date(),
        failureCode: providerError.code,
        failureMessage: safeFailureMessage(providerError),
      });
      return { attempt: failed, providerCalls, reused: false };
    }

    return this.processResponse(
      queued,
      context.sourceItems,
      context.sourceRegistry.ecosystemHints[0],
      response,
      providerCalls,
    );
  }

  private createQueuedAttempt(input: {
    readonly context: Awaited<ReturnType<typeof assembleExtractionContext>>;
    readonly generationConfigDigest: string;
    readonly idempotencyKey: ReturnType<typeof createVersionedKey>;
    readonly prompts: ReturnType<typeof getPromptBundle>["references"];
  }): ExtractionAttempt {
    const now = new Date();
    return extractionAttemptSchema.parse({
      _id: createExtractionAttemptId(),
      schemaVersion: 1,
      idempotencyKey: input.idempotencyKey,
      status: "queued",
      sourceRegistryId: input.context.sourceRegistry._id,
      targetSourceItemId: input.context.target._id,
      sourceItemIds: input.context.sourceItems.map((item) => item._id),
      sourceContentDigests: input.context.sourceItems.map((item) => item.content.digest),
      contextVersion: EXTRACTION_CONTEXT_VERSION,
      contextDigest: input.context.contextDigest,
      strategy: input.context.strategy,
      provider: this.options.providerIdentifier,
      model: this.options.model,
      providerCapability: this.options.providerCapability,
      prompts: input.prompts,
      extractionSchemaVersion: EXTRACTION_OUTPUT_SCHEMA_VERSION,
      generationConfigDigest: input.generationConfigDigest,
      estimatedInputTokens: input.context.estimatedInputTokens,
      retryCount: 0,
      validationIssues: [],
      audit: { createdAt: now, updatedAt: now },
    });
  }

  private async processResponse(
    queued: ExtractionAttempt,
    sourceItems: readonly SourceItem[],
    ecosystemHint: string | undefined,
    response: ExtractionProviderResponse,
    providerCalls: number,
  ): Promise<ExtractionResult> {
    const responseDigest = sha256(response.outputText);
    const decoded = decodeExtractionResponse(response.outputText, sourceItems);
    if (!decoded.success) {
      const quarantined = await this.completeFromResponse(queued._id, response, {
        status: "quarantined",
        responseDigest,
        validationIssues: decoded.issues,
      });
      return { attempt: quarantined, providerCalls, reused: false };
    }
    if (decoded.output.classification !== "reusable") {
      const classified = await this.completeFromResponse(queued._id, response, {
        status: decoded.output.classification,
        classification: decoded.output.classification,
        classificationReason: decoded.output.conciseReason,
        responseDigest,
      });
      return { attempt: classified, providerCalls, reused: false };
    }

    let candidate: CandidateExperience;
    try {
      candidate = createCandidateExperience(queued, sourceItems, ecosystemHint, decoded.output);
    } catch {
      const quarantined = await this.completeFromResponse(queued._id, response, {
        status: "quarantined",
        responseDigest,
        validationIssues: [
          {
            code: "candidate_normalization_failed",
            message: "Validated provider output could not form a valid normalized candidate",
          },
        ],
      });
      return { attempt: quarantined, providerCalls, reused: false };
    }

    let persisted: CandidateExperience;
    try {
      const created =
        await this.database.repositories.candidateExperiences.createIfAbsent(candidate);
      const existing =
        created ??
        (await this.database.repositories.candidateExperiences.findByDeduplicationKey(
          candidate.deduplicationKey,
        ));
      if (existing === null) throw new Error("Candidate was concurrently removed");
      persisted = existing;
    } catch {
      const failed = await this.completeFromResponse(queued._id, response, {
        status: "failed",
        failureCode: "candidate_persistence_failed",
        failureMessage: "Validated candidate could not be persisted",
        responseDigest,
      });
      return { attempt: failed, providerCalls, reused: false };
    }
    const succeeded = await this.completeFromResponse(queued._id, response, {
      status: "succeeded",
      classification: "reusable",
      classificationReason: decoded.output.conciseReason,
      candidateExperienceId: persisted._id,
      responseDigest,
    });
    return { attempt: succeeded, providerCalls, reused: false };
  }

  private async completeFromResponse(
    id: ExtractionAttempt["_id"],
    response: ExtractionProviderResponse,
    result: Parameters<KnownPathDatabase["repositories"]["extractionAttempts"]["updateResult"]>[1],
  ): Promise<ExtractionAttempt> {
    return this.requireUpdatedAttempt(id, {
      ...result,
      completedAt: new Date(),
      latencyMs: response.latencyMs,
      ...(response.interactionId === undefined
        ? {}
        : { providerInteractionId: response.interactionId }),
      ...(response.usage === undefined ? {} : { usage: response.usage }),
    });
  }

  private async callWithRetry(
    call: () => Promise<ExtractionProviderResponse>,
    onRetry: (retryCount: number) => Promise<void>,
  ): Promise<ExtractionProviderResponse> {
    let retries = 0;
    for (;;) {
      try {
        return await call();
      } catch (error) {
        if (
          !(error instanceof ExtractionProviderError) ||
          !error.retryable ||
          retries >= this.options.maxRetries
        ) {
          throw error;
        }
        retries += 1;
        await onRetry(retries);
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(this.options.minRequestSpacingMs, Math.min(8_000, 500 * 2 ** retries)),
          ),
        );
      }
    }
  }

  private async requireUpdatedAttempt(
    id: ExtractionAttempt["_id"],
    update: Parameters<KnownPathDatabase["repositories"]["extractionAttempts"]["updateResult"]>[1],
  ): Promise<ExtractionAttempt> {
    const result = await this.database.repositories.extractionAttempts.updateResult(id, update);
    if (result === null) throw new Error(`Extraction attempt ${id} disappeared`);
    return result;
  }
}

function safeFailureMessage(error: ExtractionProviderError): string {
  if (error.code === "ai_provider_authentication_failed")
    return "Gemini authentication failed; verify GEMINI_API_KEY";
  if (error.code === "ai_provider_quota_exhausted")
    return "Gemini quota or rate limit was exhausted; inspect AI Studio limits and retry later";
  if (error.code === "ai_provider_call_budget_exhausted")
    return "The configured provider-call budget was exhausted before extraction completed";
  const status = error.status === undefined ? "" : ` (HTTP ${error.status})`;
  return error.retryable
    ? `Gemini request failed after transient retries${status}`
    : `Gemini rejected the extraction request${status}`;
}
