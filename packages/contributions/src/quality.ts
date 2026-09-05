import { createHash } from "node:crypto";

import {
  CONTRIBUTION_QUALITY_ALGORITHM_VERSION,
  CURRENT_SCHEMA_VERSION,
  contributionQualityAssessmentSchema,
  createContributionQualityAssessmentId,
  createVersionedKey,
  type AgentContributionV2,
  type ContributionQualityAssessment,
  type ContributionPayload,
} from "@knownpath/domain";

const TRIVIAL_LOCAL_PATTERNS = [
  /\b(missing|extra)\s+semicolon\b/iu,
  /\btypo\b|\bmisspell(?:ed|ing)?\b/iu,
  /\bwrong\s+(?:local\s+)?import\b/iu,
  /\brename(?:d)?\s+(?:a\s+)?(?:local\s+)?variable\b/iu,
  /\bcss\s+(?:color|spacing|margin|padding)\b/iu,
  /\bforgot\s+(?:a\s+)?local\s+(?:environment|env)\s+variable\b/iu,
] as const;
const RISKY_INSTRUCTION_PATTERNS = [
  /\brm\s+-rf\b/iu,
  /\bchmod\s+777\b/iu,
  /\bcurl\b[^\n|]{0,240}\|\s*(?:sh|bash)\b/iu,
  /\bdisable\s+(?:ssl|tls|certificate|security|authentication)\b/iu,
  /--no-verify\b/iu,
] as const;
const GENERIC_SOLUTIONS = [
  /^(?:fix|update|change|configure|debug|restart|retry)\s+(?:it|the issue|the code)\.?$/iu,
  /^(?:use|follow)\s+(?:the\s+)?(?:correct|right)\s+(?:version|configuration|setting)\.?$/iu,
] as const;

export function assessContributionQuality(
  contribution: AgentContributionV2,
  evaluatedAt = new Date(),
): ContributionQualityAssessment {
  const payload = contribution.payload;
  const combined = qualityText(payload);
  const signals = {
    hasSpecificProblem: wordCount(payload.problem) >= 6 && payload.symptoms.length > 0,
    hasReusableSolution:
      wordCount(payload.solutionSummary) >= 6 &&
      payload.steps.length > 0 &&
      !GENERIC_SOLUTIONS.some((pattern) => pattern.test(payload.solutionSummary)),
    hasTechnicalAnchor:
      payload.packages.length > 0 ||
      payload.platforms.length > 0 ||
      payload.versions.length > 0 ||
      payload.toolchain.length > 0 ||
      payload.errors.length > 0 ||
      payload.environment.frameworks.length > 0 ||
      payload.environment.runtimes.length > 0,
    hasApplicability:
      payload.applicability !== undefined && wordCount(payload.applicability.appliesWhen) >= 3,
    hasObservableVerification:
      payload.successEvidence.checks.length > 0 && wordCount(payload.successEvidence.summary) >= 3,
    standsAlone:
      !/\b(?:this|our|my)\s+(?:repo(?:sitory)?|project|app|company|customer)\b/iu.test(combined) &&
      !/(?:^|\s)(?:\.\.\/|\.\/|src\/|app\/)[A-Za-z0-9_.@/-]+/u.test(combined),
    appearsTrivialOrLocal: TRIVIAL_LOCAL_PATTERNS.some((pattern) => pattern.test(combined)),
    containsRiskyInstructions: RISKY_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(combined)),
  };
  const reasonCodes: string[] = [];
  const explanations: string[] = [];
  addSignal(
    signals.hasSpecificProblem,
    "specific_problem",
    "problem_not_specific",
    "The contribution describes a specific problem and observable symptom.",
    "The problem or symptom is too vague to stand alone.",
    reasonCodes,
    explanations,
  );
  addSignal(
    signals.hasReusableSolution,
    "reusable_solution",
    "solution_not_reusable",
    "The solution contains concrete reusable actions.",
    "The solution is missing concrete reusable actions or is overly generic.",
    reasonCodes,
    explanations,
  );
  addSignal(
    signals.hasTechnicalAnchor,
    "technical_context_present",
    "technical_context_missing",
    "Framework, package, version, platform, error, or toolchain context is present.",
    "No technical anchor identifies where the lesson applies.",
    reasonCodes,
    explanations,
  );
  addSignal(
    signals.hasApplicability,
    "applicability_present",
    "applicability_missing",
    "Applicability is stated explicitly.",
    "Applicability is not stated explicitly.",
    reasonCodes,
    explanations,
  );
  addSignal(
    signals.hasObservableVerification,
    "observable_verification",
    "verification_missing",
    "The originating task includes an observable verification result.",
    "Observable verification is missing.",
    reasonCodes,
    explanations,
  );
  if (!signals.standsAlone) {
    reasonCodes.push("project_specific_context");
    explanations.push("The lesson depends on repository-local wording or paths.");
  }
  if (signals.appearsTrivialOrLocal) {
    reasonCodes.push("trivial_or_local_fix");
    explanations.push("The lesson appears to be a trivial or repository-local correction.");
  }
  if (signals.containsRiskyInstructions) {
    reasonCodes.push("risky_instruction_requires_review");
    explanations.push("Potentially destructive or security-weakening instructions require review.");
  }

  const rejected =
    !signals.hasSpecificProblem ||
    !signals.hasReusableSolution ||
    !signals.hasTechnicalAnchor ||
    !signals.standsAlone ||
    signals.appearsTrivialOrLocal;
  const decision = rejected
    ? "rejected"
    : !signals.hasApplicability ||
        !signals.hasObservableVerification ||
        signals.containsRiskyInstructions
      ? "review"
      : "eligible";
  const inputDigest = createHash("sha256").update(stableJson(payload)).digest("hex");
  return contributionQualityAssessmentSchema.parse({
    _id: createContributionQualityAssessmentId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    contributionId: contribution._id,
    idempotencyKey: createVersionedKey([
      "contribution-quality",
      String(CONTRIBUTION_QUALITY_ALGORITHM_VERSION),
      contribution._id,
      inputDigest,
    ]),
    algorithm: {
      identifier: "knownpath-contribution-quality",
      version: CONTRIBUTION_QUALITY_ALGORITHM_VERSION,
    },
    evaluatedAt,
    decision,
    signals,
    reasonCodes,
    explanations,
    inputDigest,
    audit: {
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
      createdByUserId: contribution.contributor.userId,
    },
  });
}

function addSignal(
  value: boolean,
  positive: string,
  negative: string,
  positiveExplanation: string,
  negativeExplanation: string,
  reasons: string[],
  explanations: string[],
) {
  reasons.push(value ? positive : negative);
  explanations.push(value ? positiveExplanation : negativeExplanation);
}

function qualityText(payload: ContributionPayload): string {
  return [
    payload.problem,
    ...payload.symptoms,
    ...payload.errors,
    payload.rootCause ?? "",
    payload.solutionSummary,
    ...payload.steps.map((step) => step.instruction),
    payload.applicability?.appliesWhen ?? "",
  ].join("\n");
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
