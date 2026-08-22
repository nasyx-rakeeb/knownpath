import {
  CURRENT_SCHEMA_VERSION,
  createSimilarityProfileId,
  createVersionedKey,
  normalizeEcosystem,
  normalizePackageName,
  normalizePlatform,
  normalizeVersion,
  type CandidateExperience,
  type CandidateSimilarityProfile,
  type SimilarityBlockingKey,
} from "@knownpath/domain";

import {
  createTokenShingles,
  extractErrorCodes,
  extractExceptionClasses,
  normalizeTechnicalText,
  sha256,
} from "./normalization.js";

export const SIMILARITY_NORMALIZER_VERSION = 1;
export const SIMILARITY_PROFILE_VERSION = 1;

export function buildSimilarityProfile(
  candidate: CandidateExperience,
  generatedAt = new Date(),
): CandidateSimilarityProfile {
  const problem = normalizeTechnicalText(candidate.problemSummary);
  const rootCause =
    candidate.rootCause === undefined
      ? undefined
      : normalizeTechnicalText(candidate.rootCause.summary);
  const solution = normalizeTechnicalText(candidate.solutionSummary);
  const steps = candidate.solutionSteps.map((step) => normalizeTechnicalText(step.instruction));
  const errors = candidate.errorSignatures.map((error) => normalizeTechnicalText(error.original));
  const errorMaterial = candidate.errorSignatures.map((error) => error.original).join("\n");
  const ecosystem = normalizeEcosystem(candidate.metadata.primaryEcosystem);
  const packages = candidate.metadata.packages
    .map((entry) => normalizePackageName(entry.ecosystem, entry.name))
    .sort();
  const platforms = candidate.metadata.platforms.map(normalizePlatform).sort();
  const versions = candidate.metadata.versionStrings.map(normalizeVersion).sort();
  const errorCodes = extractErrorCodes(errorMaterial);
  const exceptionClasses = extractExceptionClasses(errorMaterial);
  const normalizedErrors = errors
    .map((error) => error.text)
    .filter(Boolean)
    .sort();
  const errorFingerprints = normalizedErrors.map(sha256).sort();
  const normalizedSteps = steps.map((step) => step.text);
  const problemSolutionFingerprint = sha256(
    JSON.stringify([problem.text, solution.text, normalizedSteps]),
  );
  const problemShingles = createTokenShingles(
    [problem.text, ...candidate.symptoms.map((item) => item.normalizedText)].join(" "),
  );
  const solutionShingles = createTokenShingles([solution.text, ...normalizedSteps].join(" "));
  const blockingKeys = buildBlockingKeys({
    ecosystem,
    errorCodes,
    errorFingerprints,
    exceptionClasses,
    packages,
    platforms,
    problemSolutionFingerprint,
    problemShingles,
    solutionShingles,
  });
  const candidateDigest = sha256(
    JSON.stringify({
      candidateId: candidate._id,
      problem: candidate.problemSummary,
      rootCause: candidate.rootCause?.summary,
      solution: candidate.solutionSummary,
      steps: candidate.solutionSteps,
      errors: candidate.errorSignatures,
      metadata: candidate.metadata,
      visibility: candidate.visibility,
    }),
  );
  const reasonCodes = [
    problem,
    solution,
    ...steps,
    ...errors,
    ...(rootCause === undefined ? [] : [rootCause]),
  ].flatMap((entry) => entry.reasonCodes);
  const idempotencyKey = createVersionedKey([
    "candidate-similarity-profile",
    candidate._id,
    candidateDigest,
    String(SIMILARITY_NORMALIZER_VERSION),
    String(SIMILARITY_PROFILE_VERSION),
  ]);
  return {
    _id: createSimilarityProfileId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    candidateExperienceId: candidate._id,
    idempotencyKey,
    candidateDigest,
    normalizer: {
      identifier: "knownpath-technical-normalizer",
      version: SIMILARITY_NORMALIZER_VERSION,
    },
    profileVersion: SIMILARITY_PROFILE_VERSION,
    ecosystem,
    packages,
    platforms,
    versions,
    errorCodes,
    exceptionClasses,
    normalizedErrors,
    errorFingerprints,
    normalizedProblem: problem.text,
    ...(rootCause === undefined ? {} : { normalizedRootCause: rootCause.text }),
    normalizedSolution: solution.text,
    normalizedSteps,
    problemSolutionFingerprint,
    problemShingles,
    solutionShingles,
    blockingKeys,
    normalizationReasonCodes: [...new Set(reasonCodes)].sort(),
    generatedAt,
    audit: { createdAt: generatedAt, updatedAt: generatedAt },
  };
}

function buildBlockingKeys(input: {
  readonly ecosystem: string;
  readonly errorCodes: readonly string[];
  readonly errorFingerprints: readonly string[];
  readonly exceptionClasses: readonly string[];
  readonly packages: readonly string[];
  readonly platforms: readonly string[];
  readonly problemSolutionFingerprint: string;
  readonly problemShingles: readonly string[];
  readonly solutionShingles: readonly string[];
}): SimilarityBlockingKey[] {
  const keys: SimilarityBlockingKey[] = [];
  const add = (
    type: SimilarityBlockingKey["type"],
    material: readonly string[],
    strength: SimilarityBlockingKey["strength"],
  ): void => {
    keys.push({ type, value: sha256(JSON.stringify([type, ...material])), strength });
  };
  for (const fingerprint of input.errorFingerprints)
    add("error_fingerprint", [input.ecosystem, fingerprint], "strong");
  for (const identifier of [...input.errorCodes, ...input.exceptionClasses])
    add("error_identifier", [input.ecosystem, identifier, input.packages[0] ?? "*"], "strong");
  add("problem_solution", [input.ecosystem, input.problemSolutionFingerprint], "strong");
  const context = [input.ecosystem, input.packages[0] ?? "*", input.platforms[0] ?? "*"];
  for (const shingle of input.problemShingles.slice(0, 24))
    add("package_problem", [...context, shingle], "moderate");
  for (const shingle of input.solutionShingles.slice(0, 24))
    add("package_solution", [...context, shingle], "moderate");
  return [...new Map(keys.map((entry) => [`${entry.type}:${entry.value}`, entry])).values()];
}
