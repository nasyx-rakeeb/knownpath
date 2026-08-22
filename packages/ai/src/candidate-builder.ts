import {
  candidateExperienceSchema,
  createCandidateExperienceId,
  createErrorFingerprint,
  createVersionedKey,
  normalizeEcosystem,
  normalizeInlineText,
  normalizePackageName,
  normalizePlatform,
  normalizeVersion,
  type CandidateExperience,
  type ExtractionAttempt,
  type SourceItem,
} from "@knownpath/domain";

import { EXTRACTION_OUTPUT_SCHEMA_VERSION, type ExtractionOutput } from "./output-schema.js";

export function createCandidateExperience(
  attempt: ExtractionAttempt,
  sourceItems: readonly SourceItem[],
  ecosystemHint: string | undefined,
  output: ExtractionOutput,
): CandidateExperience {
  const now = new Date();
  const byId = new Map(sourceItems.map((item) => [item._id as string, item]));
  const errorSignatures = output.symptoms.flatMap((symptom) => {
    if (symptom.errorMessage === undefined) return [];
    const normalized = normalizeInlineText(symptom.errorMessage);
    return [
      {
        original: symptom.errorMessage,
        normalized,
        fingerprint: createErrorFingerprint(normalized),
      },
    ];
  });
  const primaryEcosystem = normalizeEcosystem(
    output.ecosystems[0] ??
      sourceItems[0]?.documentMetadata?.ecosystem ??
      ecosystemHint ??
      "unknown",
  );
  return candidateExperienceSchema.parse({
    _id: createCandidateExperienceId(),
    schemaVersion: 1,
    status: "pending",
    deduplicationKey: createVersionedKey([attempt.idempotencyKey.value, "candidate"]),
    problemSummary: output.problemStatement!,
    symptoms: output.symptoms.map((symptom) => ({
      summary: symptom.summary,
      normalizedText: normalizeInlineText(symptom.errorMessage ?? symptom.summary),
      evidenceSourceItemIds: symptom.evidenceSourceItemIds.map((id) => byId.get(id)!._id),
    })),
    errorSignatures,
    errorFingerprints: [...new Set(errorSignatures.map((value) => value.fingerprint.value))],
    solutionSummary: output.solutionSummary!,
    solutionSteps: output.solutionSteps.map((step, index) => ({
      order: index + 1,
      instruction: step.instruction,
      ...(step.title === undefined ? {} : { title: step.title }),
      ...(step.code === undefined ? {} : { code: step.code }),
      ...(step.language === undefined ? {} : { language: step.language }),
      ...(step.verification === undefined ? {} : { verification: step.verification }),
      evidenceSourceItemIds: step.evidenceSourceItemIds.map((id) => byId.get(id)!._id),
    })),
    metadata: createMetadata(output, primaryEcosystem),
    evidence: output.evidence.map((reference) => toEvidence(reference, byId)),
    visibility: { scope: "public" },
    moderation: { status: "unreviewed" },
    audit: { createdAt: now, updatedAt: now },
    ...(output.rootCause === undefined
      ? {}
      : {
          rootCause: {
            summary: output.rootCause.summary,
            evidenceSourceItemIds: output.rootCause.evidenceSourceItemIds.map(
              (id) => byId.get(id)!._id,
            ),
          },
        }),
    attemptedApproaches: output.attemptedApproaches.map((approach) => ({
      ...approach,
      evidenceSourceItemIds: approach.evidenceSourceItemIds.map((id) => byId.get(id)!._id),
    })),
    caveats: output.caveats,
    conflicts: output.conflicts.map((reference) => toEvidence(reference, byId)),
    candidateVerificationLabels: output.verificationLabels
      .filter((label) => isCandidateLabelGrounded(label, sourceItems))
      .map((label) => ({
        ...label,
        evidenceSourceItemIds: label.evidenceSourceItemIds.map((id) => byId.get(id)!._id),
        verificationStatus: "unverified" as const,
      })),
    extraction: {
      attemptId: attempt._id,
      extractorIdentifier: "knownpath-structured-extraction",
      extractorVersion: "1",
      modelIdentifier: attempt.model,
      promptVersion: Math.max(...attempt.prompts.map((prompt) => prompt.version)),
      schemaVersion: EXTRACTION_OUTPUT_SCHEMA_VERSION,
      sourceContentHashes: attempt.sourceContentDigests,
      extractedAt: now,
    },
  });
}

function createMetadata(output: ExtractionOutput, primaryEcosystem: string) {
  return {
    primaryEcosystem,
    ...(output.packages[0] === undefined
      ? {}
      : {
          primaryPackageName: normalizePackageName(
            output.packages[0].ecosystem,
            output.packages[0].name,
          ),
        }),
    packages: output.packages.map((coordinate) => ({
      ecosystem: normalizeEcosystem(coordinate.ecosystem),
      name: coordinate.name,
      normalizedName: normalizePackageName(coordinate.ecosystem, coordinate.name),
      ...(coordinate.version === undefined
        ? {}
        : { version: normalizeVersion(coordinate.version) }),
      role: coordinate.role,
    })),
    platforms: [...new Set(output.platforms.map(normalizePlatform))],
    versionStrings: [...new Set(output.versions.map(normalizeVersion))],
    environment: {
      runtimes: [],
      operatingSystems: [],
      architectures: [],
      frameworks: [],
      toolchain: [],
      extensions: {},
    },
  };
}

function toEvidence(
  reference: ExtractionOutput["evidence"][number],
  byId: ReadonlyMap<string, SourceItem>,
) {
  const item = byId.get(reference.sourceItemId)!;
  return {
    sourceItemId: item._id,
    relationship: reference.relationship,
    canonicalUrl: item.provenance.canonicalUrl,
    contentDigest: item.content.digest,
    excerpt: reference.excerpt,
    ...(reference.locator === undefined ? {} : { locator: reference.locator }),
  };
}

function isCandidateLabelGrounded(
  label: ExtractionOutput["verificationLabels"][number],
  sourceItems: readonly SourceItem[],
): boolean {
  const cited = sourceItems.filter((item) => label.evidenceSourceItemIds.includes(item._id));
  if (label.label === "official_doc_supported") {
    return cited.some((item) => item.sourceQuality?.authority === "first_party_official");
  }
  if (label.label === "maintainer_confirmed") {
    return cited.some((item) => item.sourceQuality?.authority === "maintainer");
  }
  const root = sourceItems.find((item) => ["issue", "discussion"].includes(item.itemType));
  return (
    root?.provenance.author !== undefined &&
    cited.some((item) => item.provenance.author === root.provenance.author)
  );
}
