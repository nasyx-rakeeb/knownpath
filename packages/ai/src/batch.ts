import type { KnownPathDatabase } from "@knownpath/database";
import type { ExtractionAttempt, SourceItem } from "@knownpath/domain";

import type { ExtractionCommand } from "./cli.js";
import { assembleExtractionContext } from "./context.js";
import { ExtractionService, type ExtractionResult } from "./service.js";

export interface ExtractionBatchOptions {
  readonly maxActualTotalTokens: number;
  readonly maxEstimatedInputTokens: number;
  readonly maxProviderCalls: number;
  readonly maxTargets: number;
  readonly minRequestSpacingMs: number;
}

export interface ExtractionBatchSummary {
  readonly attempts: readonly ExtractionAttempt[];
  readonly estimatedInputTokens: number;
  readonly providerCalls: number;
  readonly reused: number;
  readonly totalTokens: number;
}

export class ExtractionBatchRunner {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly service: ExtractionService,
    private readonly options: ExtractionBatchOptions,
  ) {}

  public async run(
    command: Extract<ExtractionCommand, { action: "one" | "pending" | "batch" }>,
  ): Promise<ExtractionBatchSummary> {
    const targets = await this.resolveTargets(command);
    const attempts: ExtractionAttempt[] = [];
    let estimatedInputTokens = 0;
    let providerCalls = 0;
    let reused = 0;
    let totalTokens = 0;
    let lastProviderCallCompletedAt = 0;

    for (const target of targets) {
      const context = await assembleExtractionContext(
        this.database,
        target,
        this.options.maxEstimatedInputTokens,
      );
      if (
        estimatedInputTokens + context.estimatedInputTokens >
        this.options.maxEstimatedInputTokens
      )
        break;
      if (
        providerCalls >= this.options.maxProviderCalls ||
        totalTokens >= this.options.maxActualTotalTokens
      )
        break;
      if (lastProviderCallCompletedAt > 0) {
        const remaining =
          this.options.minRequestSpacingMs - (Date.now() - lastProviderCallCompletedAt);
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      const result = await this.service.processOne(
        target,
        command.force,
        this.options.maxProviderCalls - providerCalls,
      );
      attempts.push(result.attempt);
      if (result.providerCalls > 0) estimatedInputTokens += context.estimatedInputTokens;
      if (result.reused) reused += 1;
      if (result.providerCalls > 0) {
        providerCalls += result.providerCalls;
        lastProviderCallCompletedAt = Date.now();
      }
      totalTokens += result.attempt.usage?.totalTokens ?? 0;
      if (result.attempt.status === "failed") break;
    }
    return { attempts, estimatedInputTokens, providerCalls, reused, totalTokens };
  }

  private async resolveTargets(
    command: Extract<ExtractionCommand, { action: "one" | "pending" | "batch" }>,
  ): Promise<SourceItem[]> {
    if (command.action === "one") {
      const target = await this.database.repositories.sourceItems.findById(command.sourceItemId);
      if (target === null) throw new Error(`Source item ${command.sourceItemId} was not found`);
      return [target];
    }
    const limit = Math.min(command.limit ?? this.options.maxTargets, this.options.maxTargets);
    if (command.action === "pending") {
      return this.database.repositories.sourceItems.listLatestExtractionTargets(limit);
    }
    const registry = await this.database.repositories.sourceRegistries.findBySourceKey(
      command.source,
    );
    if (registry === null) throw new Error(`Enabled source ${command.source} was not found`);
    return this.database.repositories.sourceItems.listLatestExtractionTargets(limit, registry._id);
  }
}

export function summarizeExtractionResult(result: ExtractionResult): Record<string, unknown> {
  return {
    attemptId: result.attempt._id,
    status: result.attempt.status,
    candidateExperienceId: result.attempt.candidateExperienceId ?? null,
    providerCalls: result.providerCalls,
    reused: result.reused,
    usage: result.attempt.usage ?? null,
  };
}
