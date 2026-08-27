import type { KnownPathDatabase, SearchChannelHit } from "@knownpath/database";
import {
  retrievalQuerySchema,
  retrievalResultSchema,
  type KnownPathSearchDocument,
  type RetrievalQuery,
  type RetrievalResult,
} from "@knownpath/domain";

import { normalizeRetrievalQuery } from "./normalization.js";
import { retrievalPolicyDigest, retrievalPolicyV2 } from "./policy.js";
import {
  assertEmbeddingVisibility,
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "./provider.js";
import { evaluateVersionFit } from "./version-fit.js";

export interface RetrievalServiceOptions {
  readonly backend: "local" | "atlas";
  readonly atlasLexicalIndex: string;
  readonly atlasVectorIndex: string;
  readonly candidatePoolMultiplier: number;
  readonly dimensions: number;
  readonly modelIdentifier: string;
  readonly modelVersion: string;
  readonly providerFactory?: () => EmbeddingProvider;
}

export interface RetrievalResponse {
  readonly query: RetrievalQuery;
  readonly capabilities: Readonly<
    Record<
      "exact" | "lexical" | "semantic",
      { state: "used" | "unavailable" | "disabled" | "blocked"; reason: string }
    >
  >;
  readonly results: readonly RetrievalResult[];
}

export class RetrievalService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly options: RetrievalServiceOptions,
  ) {}

  public async search(input: unknown): Promise<RetrievalResponse> {
    const query = retrievalQuerySchema.parse(input);
    const normalized = normalizeRetrievalQuery({
      text: query.text,
      errors: query.errors,
      packages: query.packages,
      platforms: query.platforms,
      environment: query.environment,
      ...(query.ecosystem === undefined ? {} : { ecosystem: query.ecosystem }),
    });
    const poolLimit = Math.min(
      1_000,
      Math.max(query.limit * this.options.candidatePoolMultiplier, query.limit),
    );
    const exact = await this.database.repositories.knownPathSearchDocuments.exactCandidates({
      statuses: query.allowedStatuses,
      access: query.access,
      errorFingerprints: normalized.errorFingerprints,
      errorCodes: normalized.errorCodes,
      ...(normalized.ecosystem === undefined ? {} : { ecosystem: normalized.ecosystem }),
      packages: normalized.packages,
      platforms: normalized.platforms,
      limit: poolLimit,
    });
    let lexical: SearchChannelHit[];
    let lexicalCapability: RetrievalResponse["capabilities"]["lexical"];
    if (this.options.backend === "atlas") {
      try {
        lexical = await this.database.repositories.knownPathSearchDocuments.atlasTextSearch(
          query.text,
          query.allowedStatuses,
          query.access,
          this.options.atlasLexicalIndex,
          poolLimit,
        );
        lexicalCapability = {
          state: "used",
          reason: "MongoDB Search lexical index returned candidates.",
        };
      } catch {
        lexical = await this.database.repositories.knownPathSearchDocuments.localTextSearch(
          query.text,
          query.allowedStatuses,
          query.access,
          poolLimit,
        );
        lexicalCapability = {
          state: "unavailable",
          reason: "Atlas lexical search was unavailable; local MongoDB text retrieval was used.",
        };
      }
    } else {
      lexical = await this.database.repositories.knownPathSearchDocuments.localTextSearch(
        query.text,
        query.allowedStatuses,
        query.access,
        poolLimit,
      );
      lexicalCapability = {
        state: "used",
        reason: "Local MongoDB weighted text retrieval was used.",
      };
    }
    let semantic: SearchChannelHit[] = [];
    let semanticCapability: RetrievalResponse["capabilities"]["semantic"];
    if (query.semanticMode === "disabled") {
      semanticCapability = {
        state: "disabled",
        reason: "Semantic retrieval was disabled by the request.",
      };
    } else if (this.options.backend !== "atlas") {
      semanticCapability = {
        state: "unavailable",
        reason:
          "Local MongoDB has no configured Vector Search service; deterministic and text retrieval remain active.",
      };
      if (query.semanticMode === "required")
        throw capabilityError("semantic_retrieval_unavailable", semanticCapability.reason);
    } else if (this.options.providerFactory === undefined) {
      semanticCapability = {
        state: "unavailable",
        reason: "No retrieval-query embedding provider is configured.",
      };
      if (query.semanticMode === "required")
        throw capabilityError("semantic_retrieval_unavailable", semanticCapability.reason);
    } else {
      try {
        const provider = this.options.providerFactory();
        assertEmbeddingVisibility(query.access, provider.capability);
        const embedded = await provider.embed({
          input: [query.text, ...query.errors, query.context].filter(Boolean).join("\n"),
          dimensions: this.options.dimensions,
          task: "retrieval_query",
        });
        semantic = await this.database.repositories.knownPathSearchDocuments.atlasVectorSearch(
          embedded.values,
          query.allowedStatuses,
          query.access,
          this.options.modelIdentifier,
          this.options.modelVersion,
          this.options.dimensions,
          this.options.atlasVectorIndex,
          poolLimit,
          Math.min(10_000, poolLimit * 20),
        );
        semanticCapability = {
          state: "used",
          reason: `MongoDB Vector Search returned ${query.access.scope} semantic candidates.`,
        };
      } catch (error) {
        if (query.semanticMode === "required") throw error;
        semanticCapability = {
          state:
            error instanceof EmbeddingProviderError &&
            error.code === "embedding_provider_visibility_forbidden"
              ? "blocked"
              : "unavailable",
          reason: error instanceof Error ? error.message : "Semantic retrieval failed.",
        };
      }
    }
    const results = rerank(query, normalized, exact, lexical, semantic)
      .filter((entry) => entry.score.finalScore >= query.minimumScore)
      .slice(0, query.limit);
    return {
      query,
      capabilities: {
        exact: {
          state: "used",
          reason: "Indexed normalized error and metadata matching was used.",
        },
        lexical: lexicalCapability,
        semantic: semanticCapability,
      },
      results,
    };
  }
}

function rerank(
  query: RetrievalQuery,
  normalized: ReturnType<typeof normalizeRetrievalQuery>,
  exact: readonly KnownPathSearchDocument[],
  lexical: readonly SearchChannelHit[],
  semantic: readonly SearchChannelHit[],
): RetrievalResult[] {
  const candidates = new Map<
    string,
    {
      document: KnownPathSearchDocument;
      matched: Set<"exact" | "lexical" | "semantic">;
      lexical: number;
      semantic: number;
    }
  >();
  for (const document of exact)
    candidates.set(document._id, {
      document,
      matched: new Set(["exact"]),
      lexical: 0,
      semantic: 0,
    });
  for (const hit of lexical) addHit(candidates, hit, "lexical");
  for (const hit of semantic) addHit(candidates, hit, "semantic");
  const maxLexical = Math.max(0, ...lexical.map((entry) => entry.score));
  const results = [...candidates.values()].map((candidate) => {
    const document = candidate.document;
    const exactText = normalized.errors.some((error) => document.normalizedErrors.includes(error));
    const codeOverlap = overlap(normalized.errorCodes, document.errorCodes);
    const exactError = exactText ? 20 : codeOverlap > 0 ? 15 : 0;
    const lexicalPoints =
      maxLexical === 0 ? 0 : Math.round(15 * Math.min(1, candidate.lexical / maxLexical));
    const semanticPoints =
      candidate.semantic === 0 ? 0 : Math.round(12 * Math.max(0, Math.min(1, candidate.semantic)));
    let metadataFit = 0;
    if (normalized.ecosystem !== undefined && normalized.ecosystem === document.ecosystem)
      metadataFit += 5;
    metadataFit += Math.min(5, Math.round(overlap(normalized.packages, document.packages) * 5));
    metadataFit += Math.min(3, Math.round(overlap(normalized.platforms, document.platforms) * 3));
    metadataFit += Math.min(
      2,
      Math.round(overlap(normalized.environment, document.environmentTokens) * 2),
    );
    const version = evaluateVersionFit(query, document.versionConstraints);
    const versionPoints = version.fit === "exact" ? 10 : version.fit === "compatible" ? 8 : 0;
    const trust = Math.round((document.trust.score / 100) * 8);
    const freshness =
      document.freshness.status === "current"
        ? 5
        : document.freshness.status === "aging"
          ? 3
          : document.freshness.status === "unknown"
            ? 1
            : 0;
    const penalties: Array<{ code: string; points: number; explanation: string }> = [];
    const outcomes =
      document.outcome.status === "observed"
        ? Math.round((document.outcome.confidenceScore / 100) * 15)
        : 0;
    let cap: number | undefined;
    if (version.fit === "incompatible") {
      penalties.push({
        code: "version_incompatible",
        points: retrievalPolicyV2.penalties.incompatibleVersion,
        explanation: "Explicit version constraints are incompatible.",
      });
      cap = retrievalPolicyV2.caps.incompatibleVersion;
    }
    if (document.conflictCount > 0)
      penalties.push({
        code: "conflicting_evidence",
        points: retrievalPolicyV2.penalties.conflict,
        explanation: "The canonical record has active conflicting candidate evidence.",
      });
    if (document.freshness.status === "stale")
      penalties.push({
        code: "stale_applicability",
        points: retrievalPolicyV2.penalties.stale,
        explanation: "The record is past its stale-after timestamp.",
      });
    if (document.moderationStatus === "flagged")
      penalties.push({
        code: "moderation_flagged",
        points: retrievalPolicyV2.penalties.flagged,
        explanation: "The canonical record is flagged for review.",
      });
    if (document.knownPathStatus === "deprecated")
      cap = Math.min(cap ?? 100, retrievalPolicyV2.caps.deprecated);
    if (document.outcome.status === "observed") {
      if (document.outcome.penalties.includes("corroborated_safety"))
        penalties.push({
          code: "corroborated_safety_outcomes",
          points: retrievalPolicyV2.penalties.corroboratedSafety,
          explanation:
            "Independent safety reports reached the deterministic corroboration threshold.",
        });
      if (document.outcome.penalties.includes("outcome_degradation"))
        penalties.push({
          code: "recent_outcome_degradation",
          points: retrievalPolicyV2.penalties.outcomeDegradation,
          explanation:
            "Conservative recent outcome reliability materially declined against its historical baseline.",
        });
      const queryVersionValues = query.versions.map((entry) => entry.value.toLowerCase());
      const matchingBuckets = document.outcome.versionDistribution.filter((entry) =>
        queryVersionValues.some((value) => entry.bucket.toLowerCase().includes(value)),
      );
      const matchingCount = matchingBuckets.reduce((sum, entry) => sum + entry.count, 0);
      const matchingSolved = matchingBuckets.reduce((sum, entry) => sum + entry.solved, 0);
      const matchingFailed = matchingBuckets.reduce((sum, entry) => sum + entry.failed, 0);
      if (matchingCount >= 3 && matchingFailed > matchingSolved)
        penalties.push({
          code: "version_specific_outcome_failures",
          points: retrievalPolicyV2.penalties.versionOutcomeFailure,
          explanation:
            "The requested version bucket has more eligible failed than solved outcome reports.",
        });
    }
    const raw =
      exactError +
      lexicalPoints +
      semanticPoints +
      metadataFit +
      versionPoints +
      trust +
      freshness +
      outcomes +
      penalties.reduce((sum, entry) => sum + entry.points, 0);
    const finalScore = Math.max(0, Math.min(cap ?? 100, Math.min(100, raw)));
    const reasonCodes = [
      ...new Set([
        exactError > 0 ? "exact_error_signal" : "no_exact_error",
        lexicalPoints > 0 ? "lexical_match" : "no_lexical_match",
        semanticPoints > 0 ? "semantic_match" : "semantic_not_used",
        `version_${version.fit}`,
        `trust_${document.trust.grade}`,
        `freshness_${document.freshness.status}`,
        document.outcome.status === "observed"
          ? `outcomes_${document.outcome.confidenceGrade}`
          : "outcomes_unobserved",
        ...penalties.map((entry) => entry.code),
      ]),
    ];
    return retrievalResultSchema.parse({
      knownPathId: document.knownPathId,
      searchDocumentId: document._id,
      title: document.title,
      problemSummary: document.problemSummary,
      solutionSummary: document.solutions[0] ?? document.problemSummary,
      status: document.knownPathStatus,
      matchedBy: [...candidate.matched],
      trustAssessmentIds: document.trust.assessmentIds,
      score: {
        policyIdentifier: retrievalPolicyV2.identifier,
        policyVersion: retrievalPolicyV2.version,
        policyDigest: retrievalPolicyDigest,
        components: {
          exactError,
          lexical: lexicalPoints,
          semantic: semanticPoints,
          metadataFit,
          versionFit: versionPoints,
          trust,
          freshness,
          outcomes,
        },
        penalties,
        ...(cap === undefined ? {} : { cap }),
        finalScore,
        versionCompatibility: version.fit,
        reasonCodes,
        explanations: [
          exactError > 0
            ? "Exact normalized error identifiers materially increased relevance."
            : "No exact normalized error identifier matched.",
          `Lexical contribution ${lexicalPoints}/15; semantic contribution ${semanticPoints}/12.`,
          `Metadata fit contributed ${metadataFit}/15; deterministic source trust contributed ${trust}/8.`,
          ...version.explanations,
          document.outcome.status === "observed"
            ? `Freshness contributed ${freshness}/5; conservative outcome confidence contributed ${outcomes}/15 from effective sample ${document.outcome.effectiveSampleSize.toFixed(2)}.`
            : `Freshness contributed ${freshness}/5; agent outcomes are unobserved.`,
          ...penalties.map((entry) => entry.explanation),
        ],
      },
    });
  });
  return results.sort(
    (left, right) =>
      right.score.finalScore - left.score.finalScore ||
      right.score.components.exactError - left.score.components.exactError ||
      right.score.components.versionFit - left.score.components.versionFit ||
      right.score.components.trust - left.score.components.trust ||
      left.knownPathId.localeCompare(right.knownPathId),
  );
}

function addHit(
  map: Map<
    string,
    {
      document: KnownPathSearchDocument;
      matched: Set<"exact" | "lexical" | "semantic">;
      lexical: number;
      semantic: number;
    }
  >,
  hit: SearchChannelHit,
  channel: "lexical" | "semantic",
): void {
  const current = map.get(hit.document._id) ?? {
    document: hit.document,
    matched: new Set(),
    lexical: 0,
    semantic: 0,
  };
  current.matched.add(channel);
  current[channel] = Math.max(current[channel], hit.score);
  map.set(hit.document._id, current);
}

function overlap(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.filter((entry) => rightSet.has(entry)).length / Math.max(left.length, right.length);
}

function capabilityError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
