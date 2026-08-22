import type { CandidatePairAssessment, CandidateSimilarityProfile } from "@knownpath/domain";
import type { KnownPathDatabase } from "@knownpath/database";

import type { CandidatePairService } from "./pair-service.js";
import type { SimilarityProfileService } from "./service.js";

export interface DiscoverySummary {
  readonly candidates: number;
  readonly profilesCreated: number;
  readonly profilesReused: number;
  readonly pairs: readonly CandidatePairAssessment[];
  readonly pairAssessmentsCreated: number;
  readonly pairAssessmentsReused: number;
}

export class CandidateDiscoveryService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly profiles: SimilarityProfileService,
    private readonly pairs: CandidatePairService,
  ) {}

  public async discover(limit: number, useEmbeddings: boolean): Promise<DiscoverySummary> {
    const candidates =
      await this.database.repositories.candidateExperiences.listForCanonicalization(limit);
    const candidateById = new Map(candidates.map((candidate) => [candidate._id, candidate]));
    const profiles: CandidateSimilarityProfile[] = [];
    let profilesCreated = 0;
    let profilesReused = 0;
    for (const candidate of candidates) {
      const result = await this.profiles.ensure(candidate);
      profiles.push(result.profile);
      if (result.reused) profilesReused += 1;
      else profilesCreated += 1;
    }

    const profileByCandidate = new Map(
      profiles.map((profile) => [profile.candidateExperienceId, profile]),
    );
    const seenPairs = new Set<string>();
    const assessments: CandidatePairAssessment[] = [];
    let pairAssessmentsCreated = 0;
    let pairAssessmentsReused = 0;
    for (const profile of profiles) {
      const matches =
        await this.database.repositories.candidateSimilarityProfiles.listByBlockingValues(
          profile.blockingKeys.map((entry) => entry.value),
          profile.normalizer.version,
          profile.candidateExperienceId,
          Math.max(100, limit * 10),
        );
      for (const match of latestProfiles(matches)) {
        const key = [profile.candidateExperienceId, match.candidateExperienceId].sort().join(":");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const leftCandidate =
          candidateById.get(profile.candidateExperienceId) ??
          (await this.database.repositories.candidateExperiences.findById(
            profile.candidateExperienceId,
          ));
        const rightCandidate =
          candidateById.get(match.candidateExperienceId) ??
          (await this.database.repositories.candidateExperiences.findById(
            match.candidateExperienceId,
          ));
        if (
          leftCandidate === null ||
          leftCandidate === undefined ||
          rightCandidate === null ||
          rightCandidate === undefined
        )
          continue;
        const rightProfile = profileByCandidate.get(match.candidateExperienceId) ?? match;
        const result = await this.pairs.assess(
          leftCandidate,
          profile,
          rightCandidate,
          rightProfile,
          useEmbeddings,
        );
        assessments.push(result.assessment);
        if (result.reused) pairAssessmentsReused += 1;
        else pairAssessmentsCreated += 1;
      }
    }
    return {
      candidates: candidates.length,
      profilesCreated,
      profilesReused,
      pairs: assessments,
      pairAssessmentsCreated,
      pairAssessmentsReused,
    };
  }
}

function latestProfiles(
  profiles: readonly CandidateSimilarityProfile[],
): CandidateSimilarityProfile[] {
  const latest = new Map<string, CandidateSimilarityProfile>();
  for (const profile of profiles) {
    const existing = latest.get(profile.candidateExperienceId);
    if (existing === undefined || existing.generatedAt < profile.generatedAt) {
      latest.set(profile.candidateExperienceId, profile);
    }
  }
  return [...latest.values()];
}
