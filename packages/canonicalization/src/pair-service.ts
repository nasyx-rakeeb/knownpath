import {
  CURRENT_SCHEMA_VERSION,
  createCandidatePairAssessmentId,
  createVersionedKey,
  type CandidateExperience,
  type CandidatePairAssessment,
  type CandidateSimilarityProfile,
  type SimilarityBlockingKey,
} from "@knownpath/domain";
import type { KnownPathDatabase } from "@knownpath/database";
import { cosineSimilarity } from "@knownpath/search";

import type { CandidateEmbeddingService } from "./embedding-service.js";
import { jaccardSimilarity, overlapCoefficient } from "./normalization.js";
import {
  CANONICALIZATION_POLICY,
  canonicalizationPolicyReference,
  type CanonicalizationPolicy,
} from "./policy.js";

export class CandidatePairService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly embeddings?: CandidateEmbeddingService,
    private readonly policy: CanonicalizationPolicy = CANONICALIZATION_POLICY,
  ) {}

  public async assess(
    leftCandidate: CandidateExperience,
    leftProfile: CandidateSimilarityProfile,
    rightCandidate: CandidateExperience,
    rightProfile: CandidateSimilarityProfile,
    useEmbeddings = true,
  ): Promise<{ readonly assessment: CandidatePairAssessment; readonly reused: boolean }> {
    const ordered = orderPair(leftCandidate, leftProfile, rightCandidate, rightProfile);
    const blockingReasons = sharedBlockingReasons(ordered.leftProfile, ordered.rightProfile);
    if (blockingReasons.length === 0)
      throw new Error("Candidate pair did not pass deterministic blocking");
    const deterministic = compareProfiles(ordered.leftProfile, ordered.rightProfile);
    const initialDecision = decideDeterministically(deterministic, this.policy);
    let semantic: CandidatePairAssessment["semantic"] = { status: "not_requested" };
    if (initialDecision !== "separate" && useEmbeddings && this.embeddings !== undefined) {
      const left = await this.embeddings.embed(ordered.leftCandidate, ordered.leftProfile);
      const right = await this.embeddings.embed(ordered.rightCandidate, ordered.rightProfile);
      semantic = {
        status: "ready",
        embeddingIds: [left.embedding._id, right.embedding._id],
        cosineSimilarity: cosineSimilarity(left.embedding.values, right.embedding.values),
      };
    }
    const policyReference = canonicalizationPolicyReference(this.policy);
    const idempotencyKey = createVersionedKey([
      "candidate-pair-assessment",
      ordered.leftCandidate._id,
      ordered.rightCandidate._id,
      ordered.leftProfile._id,
      ordered.rightProfile._id,
      policyReference.digest,
      semantic.status,
      ...(semantic.embeddingIds ?? []),
    ]);
    const existing =
      await this.database.repositories.candidatePairAssessments.findByIdempotencyKey(
        idempotencyKey,
      );
    if (existing !== null) return { assessment: existing, reused: true };
    const reasonCodes = pairReasonCodes(
      initialDecision,
      deterministic,
      semantic.cosineSimilarity,
      this.policy,
    );
    const now = new Date();
    const assessment: CandidatePairAssessment = {
      _id: createCandidatePairAssessmentId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      candidateIds: [ordered.leftCandidate._id, ordered.rightCandidate._id],
      profileIds: [ordered.leftProfile._id, ordered.rightProfile._id],
      idempotencyKey,
      policy: policyReference,
      blockingReasons,
      deterministic,
      semantic,
      decision: initialDecision,
      reasonCodes,
      explanations: reasonCodes.map(explainReason),
      evaluatedAt: now,
      audit: { createdAt: now, updatedAt: now },
    };
    const created =
      await this.database.repositories.candidatePairAssessments.createIfAbsent(assessment);
    if (created !== null) return { assessment: created, reused: false };
    const raced =
      await this.database.repositories.candidatePairAssessments.findByIdempotencyKey(
        idempotencyKey,
      );
    if (raced === null) throw new Error("Pair assessment insert raced but no record was found");
    return { assessment: raced, reused: true };
  }
}

function orderPair(
  leftCandidate: CandidateExperience,
  leftProfile: CandidateSimilarityProfile,
  rightCandidate: CandidateExperience,
  rightProfile: CandidateSimilarityProfile,
) {
  return leftCandidate._id < rightCandidate._id
    ? { leftCandidate, leftProfile, rightCandidate, rightProfile }
    : {
        leftCandidate: rightCandidate,
        leftProfile: rightProfile,
        rightCandidate: leftCandidate,
        rightProfile: leftProfile,
      };
}

function sharedBlockingReasons(
  left: CandidateSimilarityProfile,
  right: CandidateSimilarityProfile,
): SimilarityBlockingKey[] {
  const rightValues = new Set(right.blockingKeys.map((entry) => entry.value));
  return left.blockingKeys.filter((entry) => rightValues.has(entry.value));
}

function compareProfiles(
  left: CandidateSimilarityProfile,
  right: CandidateSimilarityProfile,
): CandidatePairAssessment["deterministic"] {
  const exactErrorFingerprint = left.errorFingerprints.some((value) =>
    right.errorFingerprints.includes(value),
  );
  const exactProblemSolutionFingerprint =
    left.problemSolutionFingerprint === right.problemSolutionFingerprint;
  const errorIdentifierOverlap = overlapCoefficient(
    [...left.errorCodes, ...left.exceptionClasses],
    [...right.errorCodes, ...right.exceptionClasses],
  );
  const packageOverlap = overlapCoefficient(left.packages, right.packages);
  const ecosystemCompatible = left.ecosystem === right.ecosystem;
  const platformCompatible =
    left.platforms.length === 0 ||
    right.platforms.length === 0 ||
    overlapCoefficient(left.platforms, right.platforms) > 0;
  const versionCompatible = versionsCompatible(left.versions, right.versions);
  const hardIncompatibilities: string[] = [];
  if (!ecosystemCompatible) hardIncompatibilities.push("incompatible_ecosystem");
  if (!platformCompatible) hardIncompatibilities.push("incompatible_platform");
  if (!versionCompatible) hardIncompatibilities.push("incompatible_explicit_version");
  if (left.packages.length > 0 && right.packages.length > 0 && packageOverlap === 0)
    hardIncompatibilities.push("disjoint_packages");
  if (
    left.normalizedRootCause !== undefined &&
    right.normalizedRootCause !== undefined &&
    jaccardSimilarity(
      createWords(left.normalizedRootCause),
      createWords(right.normalizedRootCause),
    ) < 0.15
  ) {
    hardIncompatibilities.push("conflicting_root_cause");
  }
  return {
    exactErrorFingerprint,
    exactProblemSolutionFingerprint,
    errorIdentifierOverlap,
    packageOverlap,
    platformCompatible,
    versionCompatible,
    ecosystemCompatible,
    problemSimilarity: jaccardSimilarity(left.problemShingles, right.problemShingles),
    solutionSimilarity: jaccardSimilarity(left.solutionShingles, right.solutionShingles),
    hardIncompatibilities,
  };
}

function decideDeterministically(
  comparison: CandidatePairAssessment["deterministic"],
  policy: CanonicalizationPolicy,
): CandidatePairAssessment["decision"] {
  if (comparison.hardIncompatibilities.length > 0) return "separate";
  const strongIdentity =
    comparison.exactErrorFingerprint ||
    comparison.exactProblemSolutionFingerprint ||
    (comparison.errorIdentifierOverlap > 0 &&
      comparison.solutionSimilarity >=
        policy.autoMerge.minimumSolutionSimilarityWithErrorIdentifier);
  if (
    strongIdentity &&
    (comparison.exactProblemSolutionFingerprint || comparison.packageOverlap > 0) &&
    comparison.problemSimilarity >= policy.autoMerge.minimumProblemSimilarity &&
    comparison.solutionSimilarity >= policy.autoMerge.minimumSolutionSimilarity
  )
    return "auto_merge";
  return "review";
}

function versionsCompatible(left: readonly string[], right: readonly string[]): boolean {
  if (left.length === 0 || right.length === 0) return true;
  const leftMajors = new Set(
    left.map(extractMajor).filter((entry): entry is string => entry !== undefined),
  );
  const rightMajors = new Set(
    right.map(extractMajor).filter((entry): entry is string => entry !== undefined),
  );
  if (leftMajors.size === 0 || rightMajors.size === 0) return true;
  for (const major of leftMajors) if (rightMajors.has(major)) return true;
  return false;
}

function extractMajor(value: string): string | undefined {
  return /(?:^|[^0-9])(\d+)(?:\.\d+)?/u.exec(value)?.[1];
}

function createWords(value: string): string[] {
  return [...new Set(value.split(/[^a-z0-9_]+/u).filter((entry) => entry.length > 2))];
}

function pairReasonCodes(
  decision: CandidatePairAssessment["decision"],
  deterministic: CandidatePairAssessment["deterministic"],
  semanticSimilarity: number | undefined,
  policy: CanonicalizationPolicy,
): string[] {
  const reasons = [`decision_${decision}`];
  if (deterministic.exactErrorFingerprint) reasons.push("exact_error_fingerprint");
  if (deterministic.exactProblemSolutionFingerprint)
    reasons.push("exact_problem_solution_fingerprint");
  if (deterministic.errorIdentifierOverlap > 0) reasons.push("error_identifier_overlap");
  reasons.push(...deterministic.hardIncompatibilities);
  if (semanticSimilarity !== undefined) {
    reasons.push(
      semanticSimilarity >= policy.review.semanticPriorityThreshold
        ? "semantic_review_priority_high"
        : "semantic_support_below_priority_threshold",
    );
  }
  if (decision === "review") reasons.push("semantic_similarity_cannot_auto_merge");
  return [...new Set(reasons)];
}

function explainReason(reason: string): string {
  const explanations: Readonly<Record<string, string>> = {
    decision_auto_merge: "The pair passed every conservative deterministic automatic-merge gate.",
    decision_review:
      "The pair is plausible but lacks sufficient deterministic evidence for an automatic merge.",
    decision_separate: "The pair contains a deterministic incompatibility and remains separate.",
    exact_error_fingerprint:
      "The candidates share an exact normalized technical error fingerprint.",
    exact_problem_solution_fingerprint:
      "The candidates share an exact normalized problem and solution fingerprint.",
    error_identifier_overlap: "The candidates share a meaningful error code or exception class.",
    incompatible_ecosystem: "The candidates belong to different ecosystems.",
    incompatible_platform: "The candidates have incompatible explicit platforms.",
    incompatible_explicit_version:
      "The candidates have disjoint explicit major-version applicability.",
    disjoint_packages: "The candidates identify disjoint affected packages.",
    conflicting_root_cause: "The candidates state materially different root causes.",
    semantic_review_priority_high:
      "Semantic similarity strengthens review priority but does not authorize merging.",
    semantic_support_below_priority_threshold:
      "Semantic similarity did not meet the review-priority threshold.",
    semantic_similarity_cannot_auto_merge:
      "Semantic similarity is supporting evidence only and cannot decide a merge.",
  };
  return explanations[reason] ?? reason.replaceAll("_", " ");
}
