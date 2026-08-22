import type { KnownPathDatabase } from "@knownpath/database";
import type { CandidateAssessmentId, CandidateExperienceId } from "@knownpath/domain";

export async function inspectAssessment(
  database: KnownPathDatabase,
  id: CandidateAssessmentId,
): Promise<string> {
  const assessment = await database.repositories.candidateAssessments.findById(id);
  if (assessment === null) throw new Error(`Assessment ${id} was not found`);
  return JSON.stringify(assessment, dateReplacer, 2);
}

export async function inspectAssessmentHistory(
  database: KnownPathDatabase,
  id: CandidateExperienceId,
  limit: number,
): Promise<string> {
  const candidate = await database.repositories.candidateExperiences.findById(id);
  if (candidate === null) throw new Error(`Candidate ${id} was not found`);
  const assessments = await database.repositories.candidateAssessments.listByCandidate(id, limit);
  return JSON.stringify(
    {
      candidateExperienceId: id,
      latestAssessmentId: candidate.latestAssessmentId ?? null,
      assessments,
    },
    dateReplacer,
    2,
  );
}

function dateReplacer(_key: string, value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}
