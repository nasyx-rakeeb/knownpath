import type { CandidateAssessment, CandidateExperience, EvidenceSignal } from "@knownpath/domain";

import type { ResolvedEvidence } from "./evidence.js";
import { verifyEvidenceSignals } from "./evidence-signals.js";
import type { ScoringPolicy } from "./policy.js";
import {
  calculateFreshness,
  calculateSourceEvidence,
  calculateVersionFit,
  scoreGrade,
} from "./score-components.js";
import { createVerifiedSignal } from "./signal-factory.js";

type Components = CandidateAssessment["components"];
type FinalScore = CandidateAssessment["finalScore"];

export interface ScoreResult {
  readonly status: CandidateAssessment["status"];
  readonly signals: readonly EvidenceSignal[];
  readonly components: Components;
  readonly finalScore: FinalScore;
  readonly reasonCodes: readonly string[];
  readonly explanations: readonly string[];
}

export function scoreCandidate(
  candidate: CandidateExperience,
  resolved: ResolvedEvidence,
  policy: ScoringPolicy,
  evaluatedAt: Date,
): ScoreResult {
  if (!resolved.integrityValid) return ineligibleResult(resolved.integritySignals, policy);
  const signals = [
    ...resolved.integritySignals,
    ...verifyEvidenceSignals(candidate, resolved, policy),
  ];
  const freshness = calculateFreshness(resolved.sourceItems, policy, evaluatedAt);
  const versionFit = calculateVersionFit(candidate, resolved.sourceItems, policy);
  if (freshness.status === "stale") {
    signals.push(
      createVerifiedSignal({
        type: "stale_applicability",
        polarity: "negative",
        strength: "moderate",
        points: 0,
        reasonCode: "source_evidence_stale",
        explanation: "The newest supporting source is outside the configured freshness window.",
        items: resolved.sourceItems,
      }),
    );
  }
  const sourceEvidence = calculateSourceEvidence(signals, policy);
  const components = {
    sourceEvidence,
    freshness,
    versionFit,
    outcomeConfidence: {
      status: "unobserved",
      successes: 0,
      failures: 0,
      sampleSize: 0,
    } as const,
  };
  return completedResult(signals, components, policy);
}

function completedResult(
  signals: readonly EvidenceSignal[],
  components: Components,
  policy: ScoringPolicy,
): ScoreResult {
  const { sourceEvidence, freshness, versionFit } = components;
  const rawScore = Math.round(
    (sourceEvidence.score * policy.componentWeights.sourceEvidence +
      freshness.score * policy.componentWeights.freshness +
      versionFit.score * policy.componentWeights.versionFit) /
      100,
  );
  const finalCaps: string[] = [];
  let final = rawScore;
  const strong = signals.filter(
    (item) => item.polarity === "positive" && ["strong", "decisive"].includes(item.strength),
  );
  if (
    final >= policy.grades.veryHigh &&
    strong.every((item) => item.strength !== "decisive") &&
    strong.length < 2
  ) {
    final = Math.min(final, policy.caps.insufficientVeryHighEvidence);
    finalCaps.push("insufficient_very_high_evidence");
  }
  if (signals.some((item) => item.type === "authoritative_conflict")) {
    final = Math.min(final, policy.caps.authoritativeConflict);
    finalCaps.push("authoritative_conflict");
  }
  if (freshness.status === "stale") {
    final = Math.min(final, policy.caps.staleApplicability);
    finalCaps.push("stale_applicability");
  }
  return {
    status: "completed",
    signals,
    components,
    finalScore: {
      kind: "seed_evidence_score",
      score: final,
      grade: scoreGrade(final, policy),
      positivePoints: sourceEvidence.positivePoints,
      penaltyPoints: sourceEvidence.penaltyPoints,
      appliedCaps: [...new Set([...sourceEvidence.appliedCaps, ...finalCaps])],
    },
    reasonCodes: [...new Set(signals.map((item) => item.reasonCode))],
    explanations: signals.map((item) => item.explanation),
  };
}

function ineligibleResult(signals: readonly EvidenceSignal[], policy: ScoringPolicy): ScoreResult {
  return {
    status: "ineligible",
    signals,
    components: {
      sourceEvidence: {
        score: 0,
        positivePoints: 0,
        penaltyPoints: -100,
        appliedCaps: ["evidence_integrity_failure"],
      },
      freshness: {
        score: 0,
        status: "unknown",
        graceDays: policy.freshness.general.graceDays,
        halfLifeDays: policy.freshness.general.halfLifeDays,
      },
      versionFit: {
        score: 0,
        status: "unknown",
        candidateVersions: [],
        sourceVersions: [],
        reasonCode: "assessment_ineligible",
      },
      outcomeConfidence: { status: "unobserved", successes: 0, failures: 0, sampleSize: 0 },
    },
    finalScore: {
      kind: "seed_evidence_score",
      score: 0,
      grade: "very_low",
      positivePoints: 0,
      penaltyPoints: -100,
      appliedCaps: ["evidence_integrity_failure"],
    },
    reasonCodes: signals.map((item) => item.reasonCode),
    explanations: signals.map((item) => item.explanation),
  };
}
