import type { KnownPathDatabase } from "@knownpath/database";
import type { CandidateExperienceId, ExtractionAttemptId } from "@knownpath/domain";

export async function inspectCandidate(
  database: KnownPathDatabase,
  id: CandidateExperienceId,
): Promise<string> {
  const candidate = await database.repositories.candidateExperiences.findById(id);
  if (candidate === null) throw new Error(`Candidate ${id} was not found`);
  const provenance = await Promise.all(
    candidate.evidence.map(async (evidence) => {
      const item = await database.repositories.sourceItems.findById(evidence.sourceItemId);
      return {
        sourceItemId: evidence.sourceItemId,
        relationship: evidence.relationship,
        canonicalUrl: item?.provenance.canonicalUrl ?? evidence.canonicalUrl ?? null,
        title: item?.title ?? null,
        excerpt: evidence.excerpt ?? null,
      };
    }),
  );
  return JSON.stringify({ candidate, provenance }, dateReplacer, 2);
}

export async function inspectAttempt(
  database: KnownPathDatabase,
  id: ExtractionAttemptId,
): Promise<string> {
  const attempt = await database.repositories.extractionAttempts.findById(id);
  if (attempt === null) throw new Error(`Extraction attempt ${id} was not found`);
  return JSON.stringify(attempt, dateReplacer, 2);
}

function dateReplacer(_key: string, value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}
