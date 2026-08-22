import type {
  CandidateAssessment,
  CandidateExperience,
  EvidenceSignal,
  FreshnessComponent,
  SourceItem,
  VersionFitComponent,
} from "@knownpath/domain";

import type { ScoringPolicy } from "./policy.js";

export function calculateSourceEvidence(
  signals: readonly EvidenceSignal[],
  policy: ScoringPolicy,
): CandidateAssessment["components"]["sourceEvidence"] {
  const positivePoints = signals
    .filter((item) => item.verificationStatus === "verified" && item.points > 0)
    .reduce((sum, item) => sum + item.points, 0);
  const penaltyPoints = signals
    .filter((item) => item.verificationStatus === "verified" && item.points < 0)
    .reduce((sum, item) => sum + item.points, 0);
  const appliedCaps: string[] = [];
  let score = Math.max(0, Math.min(100, positivePoints + penaltyPoints));
  if (signals.some((item) => item.type === "weak_confirmation")) {
    score = Math.min(score, policy.caps.weakConfirmation);
    appliedCaps.push("weak_confirmation");
  }
  return { score, positivePoints, penaltyPoints, appliedCaps };
}

export function calculateFreshness(
  items: readonly SourceItem[],
  policy: ScoringPolicy,
  evaluatedAt: Date,
): FreshnessComponent {
  const dates = items.map((item) => item.provenance.observedAt);
  if (dates.length === 0)
    return {
      score: policy.freshness.unknownScore,
      status: "unknown",
      graceDays: policy.freshness.general.graceDays,
      halfLifeDays: policy.freshness.general.halfLifeDays,
    };
  const referenceAt = new Date(Math.max(...dates.map((date) => date.getTime())));
  const timeSensitive = items.some(
    (item) =>
      item.documentMetadata !== undefined &&
      policy.freshness.timeSensitiveDocumentTypes.includes(item.documentMetadata.documentType),
  );
  const profile = timeSensitive ? policy.freshness.timeSensitive : policy.freshness.general;
  const ageDays = Math.max(
    0,
    Math.floor((evaluatedAt.getTime() - referenceAt.getTime()) / 86_400_000),
  );
  const score =
    ageDays <= profile.graceDays
      ? 100
      : Math.max(0, Math.round(100 * 2 ** (-(ageDays - profile.graceDays) / profile.halfLifeDays)));
  return {
    score,
    status:
      ageDays <= profile.graceDays
        ? "current"
        : score >= policy.freshness.staleThreshold
          ? "aging"
          : "stale",
    referenceAt,
    ageDays,
    graceDays: profile.graceDays,
    halfLifeDays: profile.halfLifeDays,
    nextReviewAt: new Date(referenceAt.getTime() + profile.graceDays * 86_400_000),
  };
}

export function calculateVersionFit(
  candidate: CandidateExperience,
  items: readonly SourceItem[],
  policy: ScoringPolicy,
): VersionFitComponent {
  const candidateVersions = [
    ...new Set(candidate.metadata.versionStrings.map(normalizeVersion)),
  ].sort();
  const sourceVersions = [
    ...new Set(
      items.flatMap((item) => item.documentMetadata?.versions ?? []).map(normalizeVersion),
    ),
  ].sort();
  if (candidateVersions.length > 0 && sourceVersions.length > 0) {
    const matches = candidateVersions.some((version) => sourceVersions.includes(version));
    return {
      score: matches ? policy.versionFit.explicit : policy.versionFit.conflicting,
      status: matches ? "explicit" : "conflicting",
      candidateVersions,
      sourceVersions,
      reasonCode: matches ? "explicit_version_match" : "explicit_version_conflict",
    };
  }
  if (candidateVersions.length > 0 || sourceVersions.length > 0)
    return {
      score: policy.versionFit.partial,
      status: "partial",
      candidateVersions,
      sourceVersions,
      reasonCode: "partial_version_context",
    };
  if (items.some((item) => item.sourceQuality?.authority === "first_party_official"))
    return {
      score: policy.versionFit.general,
      status: "general",
      candidateVersions,
      sourceVersions,
      reasonCode: "general_official_guidance",
    };
  return {
    score: policy.versionFit.unknown,
    status: "unknown",
    candidateVersions,
    sourceVersions,
    reasonCode: "version_context_unknown",
  };
}

export function scoreGrade(
  score: number,
  policy: ScoringPolicy,
): CandidateAssessment["finalScore"]["grade"] {
  if (score >= policy.grades.veryHigh) return "very_high";
  if (score >= policy.grades.high) return "high";
  if (score >= policy.grades.moderate) return "moderate";
  if (score >= policy.grades.low) return "low";
  return "very_low";
}

function normalizeVersion(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^v(?=\d)/, "");
}
