import { randomUUID } from "node:crypto";

import type { KnownPathDatabase } from "@knownpath/database";
import {
  candidateAssessmentSchema,
  createCandidateAssessmentId,
  createVersionedKey,
  type CandidateAssessment,
  type CandidateExperienceId,
} from "@knownpath/domain";

import { resolveCandidateEvidence } from "./evidence.js";
import { scoreCandidate } from "./scoring.js";
import {
  SCORING_ALGORITHM,
  VERIFIER_VERSION,
  scoringPolicyDigest,
  type ScoringPolicy,
} from "./policy.js";

export interface AssessmentResult {
  readonly assessment: CandidateAssessment;
  readonly reused: boolean;
}

export class CandidateAssessmentService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly policy: ScoringPolicy,
  ) {}

  public async assess(
    candidateExperienceId: CandidateExperienceId,
    options: { readonly evaluatedAt: Date; readonly force?: boolean },
  ): Promise<AssessmentResult> {
    const candidate =
      await this.database.repositories.candidateExperiences.findById(candidateExperienceId);
    if (candidate === null) throw new Error(`Candidate ${candidateExperienceId} was not found`);
    const resolved = await resolveCandidateEvidence(this.database, candidate);
    const policyDigest = scoringPolicyDigest(this.policy);
    const sourceInputs = resolved.sourceItems.map((item) => ({
      sourceItemId: item._id,
      sourceRegistryId: item.sourceRegistryId,
      contentDigest: item.content.digest,
      itemType: item.itemType,
      ...(item.sourceQuality?.authority === undefined
        ? {}
        : { authority: item.sourceQuality.authority }),
      observedAt: item.provenance.observedAt,
      ...(item.provenance.publishedAt === undefined
        ? {}
        : { publishedAt: item.provenance.publishedAt }),
    }));
    const idempotencyKey = createVersionedKey([
      candidateExperienceId,
      resolved.candidateDigest,
      ...sourceInputs.flatMap((item) => [item.sourceItemId, item.contentDigest]),
      SCORING_ALGORITHM.identifier,
      String(SCORING_ALGORITHM.version),
      this.policy.identifier,
      String(this.policy.version),
      policyDigest,
      String(VERIFIER_VERSION),
      options.evaluatedAt.toISOString(),
      ...(options.force === true ? [randomUUID()] : []),
    ]);
    if (options.force !== true) {
      const existing =
        await this.database.repositories.candidateAssessments.findByIdempotencyKey(idempotencyKey);
      if (existing !== null) {
        await this.database.repositories.candidateExperiences.setLatestAssessment(
          candidate._id,
          existing._id,
        );
        return { assessment: existing, reused: true };
      }
    }

    const calculated = scoreCandidate(candidate, resolved, this.policy, options.evaluatedAt);
    const assessment = candidateAssessmentSchema.parse({
      _id: createCandidateAssessmentId(),
      schemaVersion: 1,
      candidateExperienceId: candidate._id,
      idempotencyKey,
      status: calculated.status,
      algorithm: SCORING_ALGORITHM,
      policy: {
        identifier: this.policy.identifier,
        version: this.policy.version,
        digest: policyDigest,
      },
      verifierVersion: VERIFIER_VERSION,
      evaluatedAt: options.evaluatedAt,
      candidateDigest: resolved.candidateDigest,
      inputs: { sourceItems: sourceInputs },
      signals: calculated.signals,
      components: calculated.components,
      finalScore: calculated.finalScore,
      reasonCodes: calculated.reasonCodes,
      explanations: calculated.explanations,
      audit: { createdAt: new Date(), updatedAt: new Date() },
    });
    const inserted =
      await this.database.repositories.candidateAssessments.createIfAbsent(assessment);
    const stored =
      inserted ??
      (await this.database.repositories.candidateAssessments.findByIdempotencyKey(idempotencyKey));
    if (stored === null)
      throw new Error("Assessment insert raced but no immutable record could be resolved");
    await this.database.repositories.candidateExperiences.setLatestAssessment(
      candidate._id,
      stored._id,
    );
    return { assessment: stored, reused: inserted === null };
  }
}
