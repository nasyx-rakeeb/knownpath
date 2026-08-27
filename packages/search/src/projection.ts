import { createHash } from "node:crypto";

import type { KnownPathDatabase } from "@knownpath/database";
import {
  CURRENT_SCHEMA_VERSION,
  createKnownPathSearchDocumentId,
  createVersionedKey,
  normalizeEcosystem,
  normalizeInlineText,
  normalizePackageName,
  normalizePlatform,
  type KnownPath,
  type KnownPathId,
  type KnownPathSearchDocument,
  type KnownPathRevision,
  type OutcomeAssessment,
} from "@knownpath/domain";

import { assertEmbeddingVisibility, type EmbeddingProvider } from "./provider.js";

const PROJECTION_VERSION = 1;
const TEXT_SCHEMA_VERSION = 1;
const RANKING_SCHEMA_VERSION = 2;
const INPUT_FORMAT_VERSION = 1;

export interface SearchProjectionOptions {
  readonly dimensions: number;
  readonly providerCapability: EmbeddingProvider["capability"];
  readonly providerIdentifier: string;
  readonly providerModel: string;
  readonly providerModelVersion: string;
  readonly providerFactory?: () => EmbeddingProvider;
}

export class SearchProjectionService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly options: SearchProjectionOptions,
  ) {}

  public async project(
    knownPathId: KnownPathId,
    useEmbedding = true,
  ): Promise<{ document: KnownPathSearchDocument; reused: boolean; providerCalled: boolean }> {
    const knownPath = await this.database.repositories.knownPaths.findById(knownPathId);
    if (knownPath === null || knownPath.latestRevisionId === undefined)
      throw new Error("KnownPath and latest revision are required for search projection");
    if (["archived", "superseded"].includes(knownPath.status))
      throw new Error(`KnownPath status ${knownPath.status} is not projectable`);
    const revision = await this.database.repositories.knownPathRevisions.findById(
      knownPath.latestRevisionId,
    );
    if (revision === null) throw new Error("KnownPath latest revision does not exist");
    await this.assertPublicEvidence(revision, knownPath, useEmbedding);
    const assessment =
      knownPath.latestOutcomeAssessmentId === undefined
        ? null
        : await this.database.repositories.outcomeAssessments.findById(
            knownPath.latestOutcomeAssessmentId,
          );
    const base = buildProjectionBase(knownPath, revision, assessment);
    const input = buildRetrievalDocumentInput(base);
    const inputHash = sha256(input);
    const mode =
      knownPath.visibility.scope !== "public" && this.options.providerCapability === "public_only"
        ? "blocked"
        : useEmbedding && this.options.providerFactory !== undefined
          ? "ready"
          : "unavailable";
    if (mode !== "ready") {
      const active = await this.database.repositories.knownPathSearchDocuments.findActive(
        knownPath._id,
        this.options.providerModel,
        this.options.providerModelVersion,
        this.options.dimensions,
      );
      if (
        active !== null &&
        active.knownPathRevisionId === revision._id &&
        active.embedding.inputHash === inputHash &&
        active.rankingSchemaVersion === RANKING_SCHEMA_VERSION &&
        outcomeProjectionMatches(active.outcome, assessment)
      )
        return { document: active, reused: true, providerCalled: false };
    }
    const idempotencyKey = createVersionedKey([
      "known-path-search-document",
      knownPath._id,
      revision._id,
      base.contentHash,
      assessment?._id ?? "outcomes-unobserved",
      this.options.providerIdentifier,
      this.options.providerModel,
      this.options.providerModelVersion,
      String(this.options.dimensions),
      mode,
      String(INPUT_FORMAT_VERSION),
    ]);
    const existing =
      await this.database.repositories.knownPathSearchDocuments.findByIdempotencyKey(
        idempotencyKey,
      );
    if (existing !== null) {
      if (!existing.active) await this.activate(existing);
      return {
        document:
          (await this.database.repositories.knownPathSearchDocuments.findById(existing._id)) ??
          existing,
        reused: true,
        providerCalled: false,
      };
    }
    let providerCalled = false;
    let embedding: KnownPathSearchDocument["embedding"];
    if (mode === "ready") {
      const active = await this.database.repositories.knownPathSearchDocuments.findActive(
        knownPath._id,
        this.options.providerModel,
        this.options.providerModelVersion,
        this.options.dimensions,
      );
      if (active?.embedding.status === "ready" && active.embedding.inputHash === inputHash) {
        embedding = active.embedding;
      } else {
        const provider = this.options.providerFactory?.();
        if (provider === undefined) throw new Error("Embedding provider factory is unavailable");
        assertEmbeddingVisibility(knownPath.visibility, provider.capability);
        const response = await provider.embed({
          input,
          title: knownPath.title,
          dimensions: this.options.dimensions,
          task: "retrieval_document",
        });
        providerCalled = true;
        embedding = {
          status: "ready",
          providerIdentifier: provider.identifier,
          providerCapability: provider.capability,
          modelIdentifier: provider.modelIdentifier,
          modelVersion: provider.modelVersion,
          dimensions: this.options.dimensions,
          inputFormatVersion: INPUT_FORMAT_VERSION,
          inputHash,
          values: [...response.values],
          generatedAt: new Date(),
          latencyMs: response.latencyMs,
        };
      }
    } else {
      embedding = {
        status: mode,
        providerIdentifier: this.options.providerIdentifier,
        providerCapability: this.options.providerCapability,
        modelIdentifier: this.options.providerModel,
        modelVersion: this.options.providerModelVersion,
        dimensions: this.options.dimensions,
        inputFormatVersion: INPUT_FORMAT_VERSION,
        inputHash,
        reasonCode:
          mode === "blocked"
            ? "embedding_provider_visibility_forbidden"
            : "embedding_not_requested_or_configured",
      };
    }
    const now = new Date();
    const proposed: KnownPathSearchDocument = {
      _id: createKnownPathSearchDocumentId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      knownPathId: knownPath._id,
      knownPathRevisionId: revision._id,
      idempotencyKey,
      active: false,
      activatedAt: now,
      projectionVersion: PROJECTION_VERSION,
      textSchemaVersion: TEXT_SCHEMA_VERSION,
      rankingSchemaVersion: RANKING_SCHEMA_VERSION,
      ...base,
      embedding,
      generatedAt: now,
      audit: { createdAt: now, updatedAt: now },
    };
    let created =
      await this.database.repositories.knownPathSearchDocuments.createIfAbsent(proposed);
    if (created === null)
      created =
        await this.database.repositories.knownPathSearchDocuments.findByIdempotencyKey(
          idempotencyKey,
        );
    if (created === null)
      throw new Error("Search projection insert raced but no document was found");
    await this.activate(created);
    const active = await this.database.repositories.knownPathSearchDocuments.findById(created._id);
    if (active === null) throw new Error("Search projection disappeared during activation");
    return { document: active, reused: false, providerCalled };
  }

  public async projectPending(
    limit: number,
    useEmbedding = true,
  ): Promise<
    readonly { document: KnownPathSearchDocument; reused: boolean; providerCalled: boolean }[]
  > {
    const knownPaths = await this.database.repositories.knownPaths.listForSearchProjection(limit);
    const results = [];
    for (const knownPath of knownPaths)
      results.push(await this.project(knownPath._id, useEmbedding));
    return results;
  }

  private async activate(document: KnownPathSearchDocument): Promise<void> {
    await this.database.repositories.knownPathSearchDocuments.retireActive(
      document.knownPathId,
      document.embedding.modelIdentifier,
      document.embedding.modelVersion,
      document.embedding.dimensions,
      document._id,
    );
    const activated = await this.database.repositories.knownPathSearchDocuments.activate(
      document._id,
    );
    if (activated === null) throw new Error("Unable to activate search projection");
  }

  private async assertPublicEvidence(
    revision: KnownPathRevision,
    knownPath: KnownPath,
    useEmbedding: boolean,
  ): Promise<void> {
    if (!useEmbedding) return;
    if (this.options.providerCapability === "public_only")
      assertEmbeddingVisibility(knownPath.visibility, "public_only");
    const candidates = await this.database.repositories.candidateExperiences.findManyByIds(
      revision.candidateExperienceIds,
    );
    if (candidates.length !== revision.candidateExperienceIds.length)
      throw new Error("Search projection has missing supporting candidates");
    const sourceIds = [
      ...new Set(
        candidates.flatMap((candidate) => candidate.evidence.map((entry) => entry.sourceItemId)),
      ),
    ];
    const sources = await this.database.repositories.sourceItems.findByIds(sourceIds);
    if (sources.length !== sourceIds.length)
      throw new Error("Search projection has missing source evidence");
    if (
      this.options.providerCapability === "public_only" &&
      (candidates.some((entry) => entry.visibility.scope !== "public") ||
        sources.some((entry) => entry.visibility.scope !== "public"))
    ) {
      const error = new Error(
        "Private/team candidate or source evidence cannot use the public/unpaid embedding provider",
      ) as Error & { code: string };
      error.code = "embedding_provider_visibility_forbidden";
      throw error;
    }
  }
}

function outcomeProjectionMatches(
  projected: KnownPathSearchDocument["outcome"],
  assessment: OutcomeAssessment | null,
): boolean {
  if (assessment === null || assessment.confidence.status === "unobserved")
    return projected.status === "unobserved";
  return projected.status === "observed" && projected.assessmentId === assessment._id;
}

function buildProjectionBase(
  knownPath: KnownPath,
  revision: KnownPathRevision,
  assessment: OutcomeAssessment | null,
): Omit<
  KnownPathSearchDocument,
  | "_id"
  | "schemaVersion"
  | "knownPathId"
  | "knownPathRevisionId"
  | "idempotencyKey"
  | "active"
  | "activatedAt"
  | "retiredAt"
  | "projectionVersion"
  | "textSchemaVersion"
  | "rankingSchemaVersion"
  | "embedding"
  | "generatedAt"
  | "audit"
> {
  const symptoms = knownPath.symptoms.map((entry) => entry.normalizedText);
  const solutions = knownPath.solutionVariants.flatMap((variant) => [
    variant.summary,
    ...variant.steps.map((step) => step.instruction),
  ]);
  const caveats = knownPath.solutionVariants.flatMap((variant) => variant.caveats);
  const rawErrors = knownPath.errorSignatures.map((entry) => normalizeInlineText(entry.normalized));
  const normalizedErrors = rawErrors.map((entry) => entry.toLowerCase());
  const errorMaterial = rawErrors.join("\n");
  const errorCodes = unique(
    errorMaterial.match(/\b(?:ERR_[A-Z0-9_]+|E[A-Z]{2,10}|TS\d{3,5}|[A-Z]{2,}-\d{2,})\b/gu) ?? [],
  ).map((entry) => entry.toLowerCase());
  const exceptionClasses = unique(
    errorMaterial.match(/\b(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(?:Error|Exception)\b/gu) ?? [],
  ).map((entry) => entry.toLowerCase());
  const ecosystem = normalizeEcosystem(knownPath.metadata.primaryEcosystem);
  const packages = unique(
    knownPath.metadata.packages.map((entry) =>
      normalizePackageName(entry.ecosystem, entry.normalizedName),
    ),
  );
  const platforms = unique(knownPath.metadata.platforms.map(normalizePlatform));
  const versions = unique(knownPath.metadata.versionStrings.map(normalizeInlineText));
  const versionConstraints = [
    ...versions.map((value) => ({ subject: ecosystem, value })),
    ...knownPath.metadata.packages
      .filter((entry) => entry.version !== undefined)
      .map((entry) => ({
        subject: normalizePackageName(entry.ecosystem, entry.normalizedName),
        value: normalizeInlineText(entry.version ?? ""),
      })),
  ];
  const environmentTokens = unique(
    [
      ...knownPath.metadata.environment.runtimes,
      ...knownPath.metadata.environment.operatingSystems,
      ...knownPath.metadata.environment.architectures,
      ...knownPath.metadata.environment.frameworks,
      ...knownPath.metadata.environment.toolchain,
      ...Object.values(knownPath.metadata.environment.extensions),
    ].map((entry) => normalizeInlineText(entry).toLowerCase()),
  );
  const searchableText = unique([
    knownPath.title,
    knownPath.problemSummary,
    ...symptoms,
    ...normalizedErrors,
    ...solutions,
    ...caveats,
    ecosystem,
    ...packages,
    ...platforms,
    ...versions,
    ...environmentTokens,
  ])
    .join("\n")
    .slice(0, 200_000);
  const contentHash = sha256(
    JSON.stringify({
      revision: revision.snapshotDigest,
      searchableText,
      errorCodes,
      exceptionClasses,
      versionConstraints,
    }),
  );
  return {
    contentHash,
    title: knownPath.title,
    problemSummary: knownPath.problemSummary,
    searchableText,
    symptoms,
    solutions,
    caveats,
    normalizedErrors,
    errorFingerprints: knownPath.errorFingerprints,
    errorCodes,
    exceptionClasses,
    ecosystem,
    packages,
    platforms,
    versions,
    versionConstraints,
    environmentTokens,
    visibilityScope: knownPath.visibility.scope,
    ...(knownPath.visibility.scope !== "private"
      ? {}
      : { ownerUserId: knownPath.visibility.ownerUserId }),
    ...(knownPath.visibility.scope !== "team"
      ? {}
      : { workspaceId: knownPath.visibility.workspaceId }),
    knownPathStatus: knownPath.status,
    moderationStatus: knownPath.moderation.status,
    conflictCount: knownPath.membershipSummary.conflicting,
    trust: {
      score: knownPath.trust.score,
      grade: knownPath.trust.grade,
      assessmentIds: knownPath.trust.assessmentIds,
      scoreVersion: knownPath.trust.scoreVersion,
    },
    freshness: {
      status: freshnessStatus(knownPath),
      ...(knownPath.freshness.lastVerifiedAt === undefined
        ? {}
        : { lastVerifiedAt: knownPath.freshness.lastVerifiedAt }),
      ...(knownPath.freshness.staleAfter === undefined
        ? {}
        : { staleAfter: knownPath.freshness.staleAfter }),
    },
    outcome: toProjectionOutcome(assessment),
  };
}

function toProjectionOutcome(
  assessment: OutcomeAssessment | null,
): KnownPathSearchDocument["outcome"] {
  if (
    assessment === null ||
    assessment.confidence.status === "unobserved" ||
    assessment.confidence.grade === "unobserved"
  )
    return { status: "unobserved", sampleSize: 0 };
  return {
    status: "observed",
    assessmentId: assessment._id,
    confidenceScore: assessment.confidence.score,
    confidenceGrade: assessment.confidence.grade,
    effectiveSampleSize: assessment.recency.effectiveSampleSize,
    solved: assessment.counts.solved,
    partiallyHelped: assessment.counts.partiallyHelped,
    attemptedFailed: assessment.counts.attemptedFailed,
    incompatibleEnvironment: assessment.counts.incompatibleEnvironment,
    staleOrOutdated: assessment.counts.staleOrOutdated,
    recentSuccesses: assessment.counts.recentSuccesses,
    anyHelpLowerBound: assessment.intervals.anyHelp.lowerBound,
    fullSolveLowerBound: assessment.intervals.fullSolve.lowerBound,
    ...(assessment.lastSuccessfulAt === undefined
      ? {}
      : { lastSuccessfulAt: assessment.lastSuccessfulAt }),
    trendStatus: assessment.trend.status,
    penalties: assessment.penalties,
    versionDistribution: assessment.versionDistribution,
  };
}

function buildRetrievalDocumentInput(base: { searchableText: string }): string {
  return base.searchableText.slice(0, 60_000);
}

function freshnessStatus(knownPath: KnownPath): "current" | "aging" | "stale" | "unknown" {
  if (knownPath.freshness.lastVerifiedAt === undefined) return "unknown";
  if (
    knownPath.freshness.staleAfter !== undefined &&
    knownPath.freshness.staleAfter.getTime() < Date.now()
  )
    return "stale";
  const ageDays = (Date.now() - knownPath.freshness.lastVerifiedAt.getTime()) / 86_400_000;
  return ageDays > 180 ? "aging" : "current";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
