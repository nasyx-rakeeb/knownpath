import type {
  KnowledgeSearchResponse,
  KnownPathAlternativesResponse,
  KnownPathDetailResponse,
  SafeApplicability,
  SafeFreshness,
  SafeProvenance,
  SafeOutcomeVerification,
  SafeSolutionVariant,
  SafeTrust,
} from "@knownpath/domain";

import {
  KNOWNPATH_MCP_CONTRACT_VERSION,
  knownPathMcpAlternativesSuccessSchema,
  knownPathMcpGetSuccessSchema,
  knownPathMcpSearchSuccessSchema,
} from "./contracts.js";

export function projectSearch(response: KnowledgeSearchResponse) {
  return knownPathMcpSearchSuccessSchema.parse({
    ok: true,
    contractVersion: KNOWNPATH_MCP_CONTRACT_VERSION,
    searchId: response.searchId,
    accessMode: response.accessMode,
    semantic: response.capabilities.semantic,
    results: response.results.slice(0, 10).map((result) => {
      const problem = truncate(result.problemSummary, 700);
      const solution = truncate(result.solutionSummary, 900);
      const caveats = result.caveats.slice(0, 5).map((value) => truncate(value, 500));
      const reasons = result.relevance.explanations
        .slice(0, 5)
        .map((value) => truncate(value, 500));
      return {
        id: result.id,
        title: truncate(result.title, 500).value,
        problem: problem.value,
        solution: solution.value,
        status: result.status,
        visibility: result.visibility,
        applicability: compactApplicability(result.applicability),
        caveats: caveats.map((value) => value.value),
        trust: compactTrust(result.trust),
        freshness: compactFreshness(result.freshness),
        outcomes: compactOutcomes(result.outcomes),
        match: {
          score: result.relevance.score,
          versionCompatibility: result.relevance.versionCompatibility,
          channels: result.relevance.matchedBy,
          reasons: reasons.map((value) => value.value),
        },
        provenance: result.provenance.slice(0, 3).map(compactProvenanceLink),
        truncated:
          problem.truncated ||
          solution.truncated ||
          caveats.some((value) => value.truncated) ||
          result.caveats.length > 5 ||
          reasons.some((value) => value.truncated) ||
          result.relevance.explanations.length > 5 ||
          result.provenance.length > 3 ||
          applicabilityWasTruncated(result.applicability),
      };
    }),
  });
}

export function projectDetail(response: KnownPathDetailResponse, selectionRecorded: boolean) {
  const title = truncate(response.title, 500);
  const problem = truncate(response.problemSummary, 3_000);
  const symptoms = response.symptoms.slice(0, 12).map((value) => truncate(value.summary, 1_000));
  const errors = response.errors.slice(0, 12).map((value) => truncate(value.normalized, 1_000));
  const solutions = response.solutions.slice(0, 2).map(compactSolution);
  const evidence = response.provenance.slice(0, 8).map(compactProvenance);
  return knownPathMcpGetSuccessSchema.parse({
    ok: true,
    contractVersion: KNOWNPATH_MCP_CONTRACT_VERSION,
    id: response.id,
    title: title.value,
    problem: problem.value,
    status: response.status,
    visibility: response.visibility,
    symptoms: symptoms.map((value) => value.value),
    errors: errors.map((value) => value.value),
    applicability: compactApplicability(response.applicability),
    solutions,
    trust: compactTrust(response.trust),
    freshness: compactFreshness(response.freshness),
    outcomes: compactOutcomes(response.outcomes),
    evidence,
    selectionRecorded,
    truncated: {
      symptoms: response.symptoms.length > 12 || symptoms.some((value) => value.truncated),
      errors: response.errors.length > 12 || errors.some((value) => value.truncated),
      solutions: response.solutions.length > 2 || solutions.some((solution) => solution.truncated),
      evidence:
        response.provenance.length > 8 ||
        evidence.some((value) => value.excerpt?.endsWith("…") === true),
      text:
        title.truncated || problem.truncated || applicabilityWasTruncated(response.applicability),
    },
  });
}

export function projectAlternatives(response: KnownPathAlternativesResponse) {
  const items = response.items.slice(0, 5).map(compactAlternativeSolution);
  return knownPathMcpAlternativesSuccessSchema.parse({
    ok: true,
    contractVersion: KNOWNPATH_MCP_CONTRACT_VERSION,
    knownPathId: response.knownPathId,
    items,
    nextCursor: response.nextCursor,
    truncated: response.items.length > 5 || items.some((item) => item.truncated),
  });
}

function compactApplicability(value: SafeApplicability) {
  return {
    ecosystem: truncate(value.ecosystem, 256).value,
    packages: value.packages
      .slice(0, 16)
      .map(
        (entry) =>
          truncate(entry.version === undefined ? entry.name : `${entry.name}@${entry.version}`, 512)
            .value,
      ),
    platforms: value.platforms.slice(0, 12).map((entry) => truncate(entry, 256).value),
    versions: value.versions.slice(0, 16).map((entry) => truncate(entry, 256).value),
  };
}

function applicabilityWasTruncated(value: SafeApplicability): boolean {
  return (
    value.packages.length > 16 ||
    value.platforms.length > 12 ||
    value.versions.length > 16 ||
    value.ecosystem.length > 256 ||
    value.packages.some(
      (entry) =>
        `${entry.name}${entry.version === undefined ? "" : `@${entry.version}`}`.length > 512,
    ) ||
    value.platforms.some((entry) => entry.length > 256) ||
    value.versions.some((entry) => entry.length > 256)
  );
}

function compactTrust(value: SafeTrust) {
  return {
    score: value.score,
    grade: value.grade,
    explanation: truncate(value.explanation, 1_000).value,
  };
}

function compactFreshness(value: SafeFreshness) {
  return {
    status: value.status,
    ...(value.lastVerifiedAt === undefined ? {} : { lastVerifiedAt: value.lastVerifiedAt }),
    ...(value.staleAfter === undefined ? {} : { staleAfter: value.staleAfter }),
  };
}

function compactOutcomes(value: SafeOutcomeVerification) {
  if (value.status === "unobserved")
    return { status: value.status, explanation: truncate(value.explanation, 500).value };
  if (value.status === "limited")
    return {
      status: value.status,
      effectiveSampleSize: value.effectiveSampleSize,
      explanation: truncate(value.explanation, 500).value,
    };
  return {
    status: value.status,
    confidenceScore: value.confidenceScore,
    confidenceGrade: value.confidenceGrade,
    effectiveSampleSize: value.effectiveSampleSize,
    recentSuccesses: value.recentSuccesses,
    trend: value.trend,
    explanation: truncate(value.explanation, 500).value,
  };
}

function compactProvenanceLink(value: SafeProvenance) {
  return {
    sourceItemId: value.sourceItemId,
    url: value.canonicalUrl,
    ...(value.title === undefined ? {} : { title: truncate(value.title, 300).value }),
    authority: value.authority,
    relationship: value.relationship,
  };
}

function compactProvenance(value: SafeProvenance) {
  return {
    ...compactProvenanceLink(value),
    ...(value.excerpt === undefined ? {} : { excerpt: truncate(value.excerpt, 500).value }),
  };
}

function compactSolution(value: SafeSolutionVariant) {
  const summary = truncate(value.summary, 1_200);
  const steps = value.steps.slice(0, 8).map((step) => {
    const instruction = truncate(step.instruction, 800);
    const code = step.code === undefined ? undefined : truncateCode(step.code, 1_500);
    const verification =
      step.verification === undefined ? undefined : truncate(step.verification, 400);
    return {
      value: {
        order: step.order,
        ...(step.title === undefined ? {} : { title: truncate(step.title, 256).value }),
        instruction: instruction.value,
        ...(code === undefined ? {} : { code: code.value }),
        ...(step.language === undefined ? {} : { language: truncate(step.language, 128).value }),
        ...(verification === undefined ? {} : { verification: verification.value }),
      },
      truncated:
        instruction.truncated ||
        code?.truncated === true ||
        verification?.truncated === true ||
        (step.title?.length ?? 0) > 256 ||
        (step.language?.length ?? 0) > 128,
    };
  });
  const caveats = value.caveats.slice(0, 8).map((entry) => truncate(entry, 600));
  return {
    id: value.id,
    summary: summary.value,
    steps: steps.map((entry) => entry.value),
    caveats: caveats.map((entry) => entry.value),
    applicability: compactApplicability(value.applicability),
    trust: compactTrust(value.trust),
    truncated:
      summary.truncated ||
      value.steps.length > 8 ||
      steps.some((entry) => entry.truncated) ||
      value.caveats.length > 8 ||
      caveats.some((entry) => entry.truncated) ||
      applicabilityWasTruncated(value.applicability) ||
      value.trust.explanation.length > 1_000,
  };
}

function compactAlternativeSolution(value: SafeSolutionVariant) {
  const compact = compactSolution(value);
  const steps = compact.steps.slice(0, 6).map((step) => ({
    ...step,
    instruction: truncate(step.instruction, 600).value,
    ...(step.code === undefined ? {} : { code: truncateCode(step.code, 1_000).value }),
  }));
  return {
    ...compact,
    steps,
    truncated:
      compact.truncated ||
      compact.steps.length > 6 ||
      compact.steps.some(
        (step) => step.instruction.length > 600 || (step.code?.length ?? 0) > 1_000,
      ),
  };
}

function truncate(value: string, maximum: number): { value: string; truncated: boolean } {
  if (value.length <= maximum) return { value, truncated: false };
  return { value: `${value.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`, truncated: true };
}

function truncateCode(value: string, maximum: number): { value: string; truncated: boolean } {
  if (value.length <= maximum) return { value, truncated: false };
  return {
    value: `${value.slice(0, Math.max(1, maximum - 17)).trimEnd()}\n/* truncated */`,
    truncated: true,
  };
}
