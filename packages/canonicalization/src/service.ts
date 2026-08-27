import {
  CURRENT_SCHEMA_VERSION,
  SCORE_VERSION,
  createCanonicalMembershipId,
  createCanonicalizationEventId,
  createCanonicalizationOperationId,
  createKnownPathId,
  createKnownPathRevisionId,
  createVersionedKey,
  type CandidateAssessment,
  type CandidateExperience,
  type CandidateExperienceId,
  type CandidatePairAssessmentId,
  type CandidateSimilarityProfile,
  type CanonicalMembership,
  type CanonicalizationEvent,
  type CanonicalizationOperationId,
  type KnownPath,
  type KnownPathId,
  type KnownPathRevision,
  type EvidenceReference,
  type VersionedKey,
} from "@knownpath/domain";
import type { KnownPathDatabase } from "@knownpath/database";

import { buildSimilarityProfile } from "./profile.js";
import { sha256 } from "./normalization.js";

export class SimilarityProfileService {
  public constructor(private readonly database: KnownPathDatabase) {}

  public async ensure(candidate: CandidateExperience): Promise<{
    readonly profile: CandidateSimilarityProfile;
    readonly reused: boolean;
  }> {
    const proposed = buildSimilarityProfile(candidate);
    const existing =
      await this.database.repositories.candidateSimilarityProfiles.findByIdempotencyKey(
        proposed.idempotencyKey,
      );
    if (existing !== null) return { profile: existing, reused: true };
    const created =
      await this.database.repositories.candidateSimilarityProfiles.createIfAbsent(proposed);
    if (created !== null) return { profile: created, reused: false };
    const raced = await this.database.repositories.candidateSimilarityProfiles.findByIdempotencyKey(
      proposed.idempotencyKey,
    );
    if (raced === null) throw new Error("Profile insert raced but no existing record was found");
    return { profile: raced, reused: true };
  }
}

export class CanonicalRecordService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly actor: CanonicalizationEvent["actor"] = { kind: "system" },
  ) {}

  public async mergeCandidates(input: {
    readonly candidateIds: readonly CandidateExperienceId[];
    readonly reason: string;
    readonly pairAssessmentId?: CandidatePairAssessmentId;
    readonly targetKnownPathId?: KnownPathId;
    readonly alternativeSolution?: boolean;
    readonly operationId?: CanonicalizationOperationId;
  }): Promise<{
    readonly knownPath: KnownPath;
    readonly operationId: CanonicalizationOperationId;
  }> {
    const candidateIds = [...new Set(input.candidateIds)].sort();
    if (candidateIds.length === 0) throw new Error("At least one candidate is required");
    const candidates =
      await this.database.repositories.candidateExperiences.findManyByIds(candidateIds);
    if (candidates.length !== candidateIds.length)
      throw new Error("One or more candidates do not exist");
    const visibility = candidates[0]?.visibility;
    if (
      visibility === undefined ||
      candidates.some((candidate) => !sameVisibility(candidate.visibility, visibility))
    ) {
      throw new Error("Canonical merges require identical visibility scope and ownership");
    }
    for (const candidate of candidates) {
      if (candidate.contribution === undefined) continue;
      const contribution = await this.database.repositories.agentContributions.findById(
        candidate.contribution.contributionId,
      );
      if (
        contribution === null ||
        contribution.schemaVersion !== 2 ||
        contribution.status !== "accepted" ||
        contribution.moderation.status !== "approved"
      ) {
        throw new Error(
          `Contribution candidate ${candidate._id} requires explicit moderation approval before canonical merge`,
        );
      }
    }
    const assessments = await loadLatestAssessments(this.database, candidates);
    if (
      assessments.length !== candidates.length ||
      assessments.some((item) => item.status !== "completed")
    ) {
      throw new Error("Every supporting candidate requires a completed latest assessment");
    }
    const profiles = await Promise.all(
      candidates.map(async (candidate) => {
        const profile =
          await this.database.repositories.candidateSimilarityProfiles.findLatestByCandidate(
            candidate._id,
          );
        if (profile === null)
          throw new Error(`Candidate ${candidate._id} has no similarity profile`);
        return profile;
      }),
    );
    const operationId = input.operationId ?? createCanonicalizationOperationId();
    let target =
      input.targetKnownPathId === undefined
        ? await findExistingTarget(this.database, candidateIds)
        : await this.database.repositories.knownPaths.findById(input.targetKnownPathId);
    if (input.targetKnownPathId !== undefined && target === null)
      throw new Error("Target KnownPath does not exist");
    if (target !== null && !sameVisibility(target.visibility, visibility))
      throw new Error("Canonical target visibility must match every candidate");

    await this.appendEvent(
      operationId,
      0,
      "operation_requested",
      input.reason,
      target === null ? [] : [target._id],
      candidateIds,
      [],
    );
    if (target === null) {
      target = buildInitialKnownPath(candidates, assessments);
      await this.database.repositories.knownPaths.create(target);
      await this.appendEvent(
        operationId,
        1,
        "known_path_created",
        input.reason,
        [target._id],
        candidateIds,
        [],
      );
    }

    const currentMemberships =
      await this.database.repositories.canonicalMemberships.listActiveByKnownPath(target._id);
    const existingSolutionKey = currentMemberships.find(
      (entry) => entry.disposition === "supporting",
    )?.solutionKey;
    const createdMembershipIds: CanonicalMembership["_id"][] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const profile = profiles[index];
      if (candidate === undefined || profile === undefined) continue;
      const active =
        await this.database.repositories.canonicalMemberships.findActiveSupportingByCandidate(
          candidate._id,
        );
      if (active !== null) {
        if (active.knownPathId !== target._id) {
          throw new Error(
            `Candidate ${candidate._id} already supports another KnownPath; use reassign`,
          );
        }
        continue;
      }
      const solutionKey =
        input.alternativeSolution === true || existingSolutionKey === undefined
          ? createVersionedKey([
              "solution-variant",
              profile.normalizedSolution,
              ...profile.normalizedSteps,
            ])
          : existingSolutionKey;
      const now = new Date();
      const membership: CanonicalMembership = {
        _id: createCanonicalMembershipId(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        knownPathId: target._id,
        candidateExperienceId: candidate._id,
        disposition: "supporting",
        solutionKey,
        active: true,
        reasonCode:
          input.pairAssessmentId === undefined ? "manual_merge" : "deterministic_auto_merge",
        ...(input.pairAssessmentId === undefined
          ? {}
          : { pairAssessmentId: input.pairAssessmentId }),
        operationId,
        assignedAt: now,
        audit: { createdAt: now, updatedAt: now },
      };
      const created =
        await this.database.repositories.canonicalMemberships.createIfAbsent(membership);
      if (created !== null) createdMembershipIds.push(created._id);
      await this.database.repositories.candidateExperiences.updateStatus(candidate._id, "accepted");
    }
    await this.appendEvent(
      operationId,
      2,
      "candidate_merged",
      input.reason,
      [target._id],
      candidateIds,
      createdMembershipIds,
    );
    const rebuilt = await this.rebuild(target._id, operationId, input.reason);
    await this.appendEvent(
      operationId,
      4,
      "operation_completed",
      input.reason,
      [target._id],
      candidateIds,
      createdMembershipIds,
    );
    return { knownPath: rebuilt, operationId };
  }

  public async splitCandidate(input: {
    readonly candidateId: CandidateExperienceId;
    readonly reason: string;
    readonly operationId?: CanonicalizationOperationId;
  }): Promise<{
    readonly knownPath: KnownPath;
    readonly operationId: CanonicalizationOperationId;
  }> {
    const membership =
      await this.database.repositories.canonicalMemberships.findActiveSupportingByCandidate(
        input.candidateId,
      );
    if (membership === null) throw new Error("Candidate has no active supporting membership");
    const operationId = input.operationId ?? createCanonicalizationOperationId();
    await this.appendEvent(
      operationId,
      0,
      "operation_requested",
      input.reason,
      [membership.knownPathId],
      [input.candidateId],
      [membership._id],
    );
    await this.database.repositories.canonicalMemberships.deactivate(membership._id, operationId);
    await this.appendEvent(
      operationId,
      1,
      "candidate_split",
      input.reason,
      [membership.knownPathId],
      [input.candidateId],
      [membership._id],
    );
    const rebuilt = await this.rebuild(membership.knownPathId, operationId, input.reason, 2);
    await this.appendEvent(
      operationId,
      3,
      "operation_completed",
      input.reason,
      [membership.knownPathId],
      [input.candidateId],
      [membership._id],
    );
    return { knownPath: rebuilt, operationId };
  }

  public async reassignCandidate(input: {
    readonly candidateId: CandidateExperienceId;
    readonly targetKnownPathId: KnownPathId;
    readonly reason: string;
    readonly operationId?: CanonicalizationOperationId;
  }): Promise<{
    readonly knownPath: KnownPath;
    readonly operationId: CanonicalizationOperationId;
  }> {
    const current =
      await this.database.repositories.canonicalMemberships.findActiveSupportingByCandidate(
        input.candidateId,
      );
    if (current === null) throw new Error("Candidate has no active supporting membership");
    const operationId = input.operationId ?? createCanonicalizationOperationId();
    await this.appendEvent(
      operationId,
      0,
      "operation_requested",
      input.reason,
      [current.knownPathId, input.targetKnownPathId],
      [input.candidateId],
      [current._id],
    );
    await this.database.repositories.canonicalMemberships.deactivate(current._id, operationId);
    const target = await this.database.repositories.knownPaths.findById(input.targetKnownPathId);
    if (target === null) throw new Error("Target KnownPath does not exist");
    const targetMemberships =
      await this.database.repositories.canonicalMemberships.listActiveByKnownPath(target._id);
    const solutionKey = targetMemberships.find(
      (entry) => entry.disposition === "supporting",
    )?.solutionKey;
    if (solutionKey === undefined) throw new Error("Target KnownPath has no solution variant");
    const now = new Date();
    const replacement: CanonicalMembership = {
      _id: createCanonicalMembershipId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      knownPathId: target._id,
      candidateExperienceId: input.candidateId,
      disposition: "supporting",
      solutionKey,
      active: true,
      reasonCode: "manual_reassignment",
      operationId,
      assignedAt: now,
      audit: { createdAt: now, updatedAt: now },
    };
    await this.database.repositories.canonicalMemberships.create(replacement);
    await this.appendEvent(
      operationId,
      1,
      "candidate_reassigned",
      input.reason,
      [current.knownPathId, target._id],
      [input.candidateId],
      [current._id, replacement._id],
    );
    await this.rebuild(current.knownPathId, operationId, input.reason, 2);
    const rebuilt = await this.rebuild(target._id, operationId, input.reason, 3);
    await this.appendEvent(
      operationId,
      4,
      "operation_completed",
      input.reason,
      [current.knownPathId, target._id],
      [input.candidateId],
      [current._id, replacement._id],
    );
    return { knownPath: rebuilt, operationId };
  }

  public async rebuild(
    knownPathId: KnownPathId,
    operationId = createCanonicalizationOperationId(),
    reason = "canonical_rebuild",
    eventSequence = 3,
  ): Promise<KnownPath> {
    const current = await this.database.repositories.knownPaths.findById(knownPathId);
    if (current === null) throw new Error("KnownPath does not exist");
    const memberships =
      await this.database.repositories.canonicalMemberships.listActiveByKnownPath(knownPathId);
    const supporting = memberships.filter((entry) => entry.disposition === "supporting");
    if (supporting.length === 0) {
      const archived = await this.database.repositories.knownPaths.updateStatus(
        knownPathId,
        "archived",
      );
      if (archived === null) throw new Error("KnownPath disappeared while archiving empty record");
      await this.appendEvent(
        operationId,
        eventSequence,
        "known_path_rebuilt",
        reason,
        [knownPathId],
        [],
        [],
        { archived: true },
      );
      return archived;
    }
    const candidates = await this.database.repositories.candidateExperiences.findManyByIds(
      supporting.map((entry) => entry.candidateExperienceId),
    );
    const assessments = await loadLatestAssessments(this.database, candidates);
    if (candidates.length !== supporting.length || assessments.length !== candidates.length) {
      throw new Error("Cannot rebuild KnownPath with missing candidates or assessments");
    }
    const projection = buildCanonicalProjection(current, memberships, candidates, assessments);
    const revisionNumber =
      await this.database.repositories.knownPathRevisions.nextRevisionNumber(knownPathId);
    const snapshotDigest = sha256(JSON.stringify(projection));
    const idempotencyKey = createVersionedKey([
      "known-path-revision",
      knownPathId,
      ...memberships.map((entry) => entry._id).sort(),
      ...assessments.map((entry) => entry._id).sort(),
      snapshotDigest,
      "builder-v1",
    ]);
    let revision =
      await this.database.repositories.knownPathRevisions.findByIdempotencyKey(idempotencyKey);
    if (revision === null) {
      const now = new Date();
      const proposed: KnownPathRevision = {
        _id: createKnownPathRevisionId(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        knownPathId,
        revisionNumber,
        idempotencyKey,
        builder: { identifier: "knownpath-canonical-builder", version: 1 },
        snapshotDigest,
        membershipIds: memberships.map((entry) => entry._id).sort(),
        candidateExperienceIds: candidates.map((entry) => entry._id).sort(),
        assessmentIds: assessments.map((entry) => entry._id).sort(),
        title: projection.title,
        problemSummary: projection.problemSummary,
        metadata: projection.metadata,
        solutionVariants: projection.solutionVariants,
        evidence: projection.evidence,
        trust: projection.trust,
        freshness: projection.freshness,
        membershipSummary: projection.membershipSummary,
        createdAt: now,
        audit: { createdAt: now, updatedAt: now },
      };
      revision = await this.database.repositories.knownPathRevisions.createIfAbsent(proposed);
      if (revision === null)
        revision =
          await this.database.repositories.knownPathRevisions.findByIdempotencyKey(idempotencyKey);
      if (revision === null) throw new Error("Revision insert raced but no record was found");
    }
    const updated = await this.database.repositories.knownPaths.updateProjection(knownPathId, {
      ...projection,
      latestRevisionId: revision._id,
    });
    if (updated === null) throw new Error("KnownPath disappeared during rebuild");
    await this.appendEvent(
      operationId,
      eventSequence,
      "known_path_rebuilt",
      reason,
      [knownPathId],
      candidates.map((entry) => entry._id),
      memberships.map((entry) => entry._id),
      { revisionId: revision._id, revisionNumber: revision.revisionNumber },
    );
    return updated;
  }

  private async appendEvent(
    operationId: CanonicalizationOperationId,
    sequence: number,
    eventType: CanonicalizationEvent["eventType"],
    reason: string,
    knownPathIds: readonly KnownPathId[],
    candidateExperienceIds: readonly CandidateExperienceId[],
    membershipIds: readonly CanonicalMembership["_id"][],
    facts: Readonly<Record<string, unknown>> = {},
  ): Promise<void> {
    const now = new Date();
    const event: CanonicalizationEvent = {
      _id: createCanonicalizationEventId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      idempotencyKey: createVersionedKey([
        "canonicalization-event",
        operationId,
        String(sequence),
        eventType,
      ]),
      operationId,
      sequence,
      eventType,
      actor: this.actor,
      reason,
      knownPathIds: [...knownPathIds],
      candidateExperienceIds: [...candidateExperienceIds],
      membershipIds: [...membershipIds],
      facts: facts as Record<string, never>,
      occurredAt: now,
      audit: { createdAt: now, updatedAt: now },
    };
    await this.database.repositories.canonicalizationEvents.createIfAbsent(event);
  }
}

async function findExistingTarget(
  database: KnownPathDatabase,
  candidateIds: readonly CandidateExperienceId[],
): Promise<KnownPath | null> {
  for (const candidateId of candidateIds) {
    const membership =
      await database.repositories.canonicalMemberships.findActiveSupportingByCandidate(candidateId);
    if (membership !== null)
      return database.repositories.knownPaths.findById(membership.knownPathId);
  }
  return null;
}

async function loadLatestAssessments(
  database: KnownPathDatabase,
  candidates: readonly CandidateExperience[],
): Promise<CandidateAssessment[]> {
  const results: CandidateAssessment[] = [];
  for (const candidate of candidates) {
    if (candidate.latestAssessmentId === undefined) continue;
    const assessment = await database.repositories.candidateAssessments.findById(
      candidate.latestAssessmentId,
    );
    if (assessment !== null) results.push(assessment);
  }
  return results;
}

function buildInitialKnownPath(
  candidates: readonly CandidateExperience[],
  assessments: readonly CandidateAssessment[],
): KnownPath {
  const representative = chooseRepresentative(candidates, assessments);
  const candidate = representative.candidate;
  const assessment = representative.assessment;
  const now = new Date();
  const projectedAt = latestAssessmentTime(assessments);
  const solutionKey = createVersionedKey([
    "solution-variant",
    candidate.solutionSummary,
    ...candidate.solutionSteps.map((entry) => entry.instruction),
  ]);
  const trust = createTrust([assessment], assessment, projectedAt);
  return {
    _id: createKnownPathId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    canonicalKey: createVersionedKey([
      "known-path",
      [...candidates.map((entry) => entry._id)].sort()[0] ?? candidate._id,
    ]),
    status: "review",
    title: truncateTitle(candidate.problemSummary),
    problemSummary: candidate.problemSummary,
    symptoms: candidate.symptoms,
    errorSignatures: candidate.errorSignatures,
    errorFingerprints: candidate.errorFingerprints,
    solutionSummary: candidate.solutionSummary,
    solutionSteps: candidate.solutionSteps,
    metadata: candidate.metadata,
    evidence: candidate.evidence,
    visibility: candidate.visibility,
    moderation: candidate.moderation,
    confidence: createLegacyConfidence(assessment, projectedAt),
    trust,
    freshness: createFreshness(assessment),
    search: { lexicalStatus: "pending", embedding: { status: "pending" } },
    solutionVariants: [
      {
        key: solutionKey,
        summary: candidate.solutionSummary,
        steps: candidate.solutionSteps,
        caveats: candidate.caveats,
        applicability: candidate.metadata,
        supportingCandidateIds: [candidate._id],
        conflictingCandidateIds: [],
        evidence: candidate.evidence,
        trust,
      },
    ],
    membershipSummary: { supporting: 0, conflicting: 0, rejected: 0 },
    safetyReview: { status: "clear" },
    audit: { createdAt: now, updatedAt: now },
  };
}

function buildCanonicalProjection(
  current: KnownPath,
  memberships: readonly CanonicalMembership[],
  candidates: readonly CandidateExperience[],
  assessments: readonly CandidateAssessment[],
): Omit<KnownPath, "_id" | "schemaVersion" | "canonicalKey" | "audit" | "latestRevisionId"> {
  const representative = chooseRepresentative(candidates, assessments);
  const projectedAt = latestAssessmentTime(assessments);
  const candidateById = new Map(candidates.map((entry) => [entry._id, entry]));
  const assessmentByCandidate = new Map(
    assessments.map((entry) => [entry.candidateExperienceId, entry]),
  );
  const supporting = memberships.filter((entry) => entry.disposition === "supporting");
  const solutionGroups = new Map<string, CanonicalMembership[]>();
  for (const membership of supporting) {
    const key = membership.solutionKey?.value;
    if (key === undefined) continue;
    solutionGroups.set(key, [...(solutionGroups.get(key) ?? []), membership]);
  }
  const solutionVariants = [...solutionGroups.values()].map((group) => {
    const groupCandidates = group
      .map((entry) => candidateById.get(entry.candidateExperienceId))
      .filter((entry): entry is CandidateExperience => entry !== undefined);
    const groupAssessments = groupCandidates
      .map((entry) => assessmentByCandidate.get(entry._id))
      .filter((entry): entry is CandidateAssessment => entry !== undefined);
    const selected = chooseRepresentative(groupCandidates, groupAssessments);
    return {
      key: group[0]?.solutionKey as VersionedKey,
      summary: selected.candidate.solutionSummary,
      steps: selected.candidate.solutionSteps,
      caveats: unionStrings(groupCandidates.flatMap((entry) => entry.caveats)),
      applicability: selected.candidate.metadata,
      supportingCandidateIds: groupCandidates.map((entry) => entry._id).sort(),
      conflictingCandidateIds: memberships
        .filter(
          (entry) =>
            entry.disposition === "conflicting" &&
            entry.solutionKey?.value === group[0]?.solutionKey?.value,
        )
        .map((entry) => entry.candidateExperienceId)
        .sort(),
      evidence: unionEvidence(groupCandidates.flatMap((entry) => entry.evidence)),
      trust: createTrust(groupAssessments, selected.assessment, projectedAt),
    };
  });
  const allEvidence = unionEvidence(
    candidates.flatMap((entry) => [...entry.evidence, ...entry.conflicts]),
  );
  const errorSignatures = [
    ...new Map(
      candidates
        .flatMap((entry) => entry.errorSignatures)
        .map((entry) => [entry.fingerprint.value, entry]),
    ).values(),
  ];
  return {
    status: current.status === "archived" ? "review" : current.status,
    title: truncateTitle(representative.candidate.problemSummary),
    problemSummary: representative.candidate.problemSummary,
    symptoms: representative.candidate.symptoms,
    errorSignatures,
    errorFingerprints: errorSignatures.map((entry) => entry.fingerprint.value).sort(),
    solutionSummary: solutionVariants[0]?.summary ?? representative.candidate.solutionSummary,
    solutionSteps: solutionVariants[0]?.steps ?? representative.candidate.solutionSteps,
    metadata: representative.candidate.metadata,
    evidence: allEvidence,
    visibility: representative.candidate.visibility,
    moderation: current.moderation,
    confidence: createLegacyConfidence(representative.assessment, projectedAt),
    trust: createTrust(assessments, representative.assessment, projectedAt),
    freshness: createFreshness(representative.assessment),
    search: { lexicalStatus: "stale", embedding: { status: "stale" } },
    solutionVariants,
    membershipSummary: {
      supporting: supporting.length,
      conflicting: memberships.filter((entry) => entry.disposition === "conflicting").length,
      rejected: memberships.filter((entry) => entry.disposition === "rejected").length,
    },
    safetyReview: current.safetyReview,
    ...(current.latestOutcomeAssessmentId === undefined
      ? {}
      : { latestOutcomeAssessmentId: current.latestOutcomeAssessmentId }),
    ...(current.latestOutcomeAssessedAt === undefined
      ? {}
      : { latestOutcomeAssessedAt: current.latestOutcomeAssessedAt }),
    ...(current.supersededByKnownPathId === undefined
      ? {}
      : { supersededByKnownPathId: current.supersededByKnownPathId }),
  };
}

function chooseRepresentative(
  candidates: readonly CandidateExperience[],
  assessments: readonly CandidateAssessment[],
): { readonly candidate: CandidateExperience; readonly assessment: CandidateAssessment } {
  const candidateById = new Map(candidates.map((entry) => [entry._id, entry]));
  const sorted = [...assessments].sort(
    (left, right) =>
      right.finalScore.score - left.finalScore.score ||
      (candidateById.get(left.candidateExperienceId)?.problemSummary.length ??
        Number.MAX_SAFE_INTEGER) -
        (candidateById.get(right.candidateExperienceId)?.problemSummary.length ??
          Number.MAX_SAFE_INTEGER) ||
      left.candidateExperienceId.localeCompare(right.candidateExperienceId),
  );
  for (const assessment of sorted) {
    const candidate = candidateById.get(assessment.candidateExperienceId);
    if (candidate !== undefined) return { candidate, assessment };
  }
  throw new Error("No assessed representative candidate is available");
}

function latestAssessmentTime(assessments: readonly CandidateAssessment[]): Date {
  const timestamp = Math.max(...assessments.map((assessment) => assessment.evaluatedAt.getTime()));
  if (!Number.isFinite(timestamp)) throw new Error("Cannot project trust without assessment time");
  return new Date(timestamp);
}

function createTrust(
  assessments: readonly CandidateAssessment[],
  representative: CandidateAssessment,
  projectedAt: Date,
) {
  return {
    representativeAssessmentId: representative._id,
    assessmentIds: assessments.map((entry) => entry._id).sort(),
    score: representative.finalScore.score,
    grade: representative.finalScore.grade,
    scoreVersion: representative.algorithm.version,
    projectedAt,
  };
}

function createLegacyConfidence(
  assessment: CandidateAssessment,
  calculatedAt: Date,
): KnownPath["confidence"] {
  return {
    aggregate: assessment.finalScore.score / 100,
    components: {
      sourceEvidence: assessment.components.sourceEvidence.score / 100,
      freshness: assessment.components.freshness.score / 100,
      versionFit: assessment.components.versionFit.score / 100,
    },
    scoreVersion: SCORE_VERSION,
    calculatedAt,
    verificationSignals: assessment.reasonCodes.slice(0, 64),
  };
}

function createFreshness(assessment: CandidateAssessment): KnownPath["freshness"] {
  return {
    ...(assessment.components.freshness.referenceAt === undefined
      ? {}
      : { lastVerifiedAt: assessment.components.freshness.referenceAt }),
    ...(assessment.components.freshness.nextReviewAt === undefined
      ? {}
      : { nextReviewAt: assessment.components.freshness.nextReviewAt }),
  };
}

function unionEvidence(items: readonly EvidenceReference[]): EvidenceReference[] {
  return [
    ...new Map(
      items.map((entry) => [
        `${entry.sourceItemId}:${entry.relationship}:${entry.contentDigest ?? ""}:${entry.locator ?? ""}:${entry.excerpt ?? ""}`,
        entry,
      ]),
    ).values(),
  ];
}

function unionStrings(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}

function truncateTitle(value: string): string {
  return value.length <= 256 ? value : `${value.slice(0, 253)}...`;
}

function sameVisibility(
  left: CandidateExperience["visibility"],
  right: CandidateExperience["visibility"],
): boolean {
  return (
    left.scope === right.scope &&
    (left.scope !== "private" ||
      (right.scope === "private" && left.ownerUserId === right.ownerUserId)) &&
    (left.scope !== "team" || (right.scope === "team" && left.workspaceId === right.workspaceId))
  );
}
