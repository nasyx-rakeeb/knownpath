import {
  CURRENT_SCHEMA_VERSION,
  createCandidateEmbeddingId,
  createVersionedKey,
  type CandidateEmbedding,
  type CandidateExperience,
  type CandidateSimilarityProfile,
  type SourceItemId,
} from "@knownpath/domain";
import type { KnownPathDatabase } from "@knownpath/database";
import {
  assertEmbeddingVisibility,
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "@knownpath/search";

export const EMBEDDING_INPUT_VERSION = 1;

export interface CandidateEmbeddingServiceOptions {
  readonly dimensions: number;
  readonly maxProviderCalls: number;
  readonly maxRetries: number;
  readonly minRequestSpacingMs: number;
  readonly providerCapability: EmbeddingProvider["capability"];
  readonly providerIdentifier: string;
  readonly providerModel: string;
  readonly providerModelVersion: string;
  readonly providerFactory: () => EmbeddingProvider;
}

export class CandidateEmbeddingService {
  private providerCalls = 0;
  private lastProviderCallAt = 0;

  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly options: CandidateEmbeddingServiceOptions,
  ) {}

  public async embed(
    candidate: CandidateExperience,
    profile: CandidateSimilarityProfile,
  ): Promise<{ readonly embedding: CandidateEmbedding; readonly reused: boolean }> {
    await this.assertPublicSourceBoundary(candidate);
    const input = createEmbeddingInput(candidate, profile);
    const inputDigest = createVersionedKey([input], EMBEDDING_INPUT_VERSION).value;
    const idempotencyKey = createVersionedKey([
      "candidate-embedding",
      candidate._id,
      profile._id,
      inputDigest,
      this.options.providerIdentifier,
      this.options.providerModel,
      this.options.providerModelVersion,
      String(this.options.dimensions),
    ]);
    const existing =
      await this.database.repositories.candidateEmbeddings.findByIdempotencyKey(idempotencyKey);
    if (existing !== null) return { embedding: existing, reused: true };

    const provider = this.options.providerFactory();
    if (provider.capability !== this.options.providerCapability) {
      throw new EmbeddingProviderError(
        "embedding_provider_permanent_failure",
        "Configured embedding provider capability does not match orchestration policy",
        false,
      );
    }
    await this.reserveProviderCall();
    const response = await withRetry(
      () =>
        provider.embed({ input, dimensions: this.options.dimensions, task: "semantic_similarity" }),
      this.options.maxRetries,
    );
    const now = new Date();
    const embedding: CandidateEmbedding = {
      _id: createCandidateEmbeddingId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      candidateExperienceId: candidate._id,
      similarityProfileId: profile._id,
      idempotencyKey,
      inputDigest,
      inputVersion: EMBEDDING_INPUT_VERSION,
      visibilityScope: candidate.visibility.scope,
      provider: { identifier: provider.identifier, capability: provider.capability },
      modelIdentifier: provider.modelIdentifier,
      modelVersion: provider.modelVersion,
      dimensions: this.options.dimensions,
      task: "semantic_similarity",
      values: [...response.values],
      generatedAt: now,
      latencyMs: response.latencyMs,
      ...(response.usage === undefined ? {} : { usage: { ...response.usage } }),
      audit: { createdAt: now, updatedAt: now },
    };
    const created = await this.database.repositories.candidateEmbeddings.createIfAbsent(embedding);
    if (created !== null) return { embedding: created, reused: false };
    const raced =
      await this.database.repositories.candidateEmbeddings.findByIdempotencyKey(idempotencyKey);
    if (raced === null) throw new Error("Embedding insert raced but no existing record was found");
    return { embedding: raced, reused: true };
  }

  private async reserveProviderCall(): Promise<void> {
    if (this.providerCalls >= this.options.maxProviderCalls) {
      throw new EmbeddingProviderError(
        "embedding_provider_permanent_failure",
        `Embedding provider-call budget exhausted at ${this.options.maxProviderCalls} calls`,
        false,
      );
    }
    const waitMs = Math.max(
      0,
      this.lastProviderCallAt + this.options.minRequestSpacingMs - Date.now(),
    );
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.providerCalls += 1;
    this.lastProviderCallAt = Date.now();
  }

  private async assertPublicSourceBoundary(candidate: CandidateExperience): Promise<void> {
    assertEmbeddingVisibility(candidate.visibility, this.options.providerCapability);
    const sourceIds = collectSourceItemIds(candidate);
    const sources = await this.database.repositories.sourceItems.findByIds(sourceIds);
    if (sources.length !== sourceIds.length) {
      throw new EmbeddingProviderError(
        "embedding_provider_visibility_forbidden",
        "Embedding blocked because not every referenced source record could be verified",
        false,
      );
    }
    for (const source of sources)
      assertEmbeddingVisibility(source.visibility, this.options.providerCapability);
  }
}

export function createEmbeddingInput(
  candidate: CandidateExperience,
  profile: CandidateSimilarityProfile,
): string {
  return [
    "task: semantic similarity for technical problem and solution deduplication",
    `ecosystem: ${profile.ecosystem}`,
    `packages: ${profile.packages.join(", ") || "none"}`,
    `platforms: ${profile.platforms.join(", ") || "none"}`,
    `versions: ${profile.versions.join(", ") || "none"}`,
    `problem: ${candidate.problemSummary}`,
    `symptoms: ${candidate.symptoms.map((item) => item.summary).join(" | ")}`,
    `errors: ${profile.normalizedErrors.join(" | ") || "none"}`,
    `root cause: ${candidate.rootCause?.summary ?? "unknown"}`,
    `solution: ${candidate.solutionSummary}`,
    `steps: ${candidate.solutionSteps.map((step) => `${step.order}. ${step.instruction}`).join(" | ")}`,
    `caveats: ${candidate.caveats.join(" | ") || "none"}`,
  ].join("\n");
}

function collectSourceItemIds(candidate: CandidateExperience): SourceItemId[] {
  return [
    ...new Set([
      ...candidate.evidence.map((entry) => entry.sourceItemId),
      ...candidate.symptoms.flatMap((entry) => entry.evidenceSourceItemIds),
      ...candidate.solutionSteps.flatMap((entry) => entry.evidenceSourceItemIds),
      ...(candidate.rootCause?.evidenceSourceItemIds ?? []),
      ...candidate.attemptedApproaches.flatMap((entry) => entry.evidenceSourceItemIds),
      ...candidate.conflicts.map((entry) => entry.sourceItemId),
    ]),
  ];
}

async function withRetry<T>(operation: () => Promise<T>, maxRetries: number): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof EmbeddingProviderError) || !error.retryable || attempt >= maxRetries)
        throw error;
      const delayMs = Math.min(8_000, 500 * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }
}
