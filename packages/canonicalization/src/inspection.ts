import type { CandidatePairAssessmentId, CanonicalizationOperationId } from "@knownpath/domain";
import type { KnownPathDatabase } from "@knownpath/database";

export async function inspectPair(
  database: KnownPathDatabase,
  id: CandidatePairAssessmentId,
): Promise<string> {
  const pair = await database.repositories.candidatePairAssessments.findById(id);
  if (pair === null) throw new Error("Candidate pair assessment not found");
  return JSON.stringify(pair, null, 2);
}

export async function inspectCanonicalizationHistory(
  database: KnownPathDatabase,
  operationId: CanonicalizationOperationId,
): Promise<string> {
  const events = await database.repositories.canonicalizationEvents.listByOperation(operationId);
  return JSON.stringify({ operationId, events }, null, 2);
}
