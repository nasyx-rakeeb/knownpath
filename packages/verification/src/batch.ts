import type { KnownPathDatabase } from "@knownpath/database";
import type { CandidateAssessment } from "@knownpath/domain";

import type { ScoringCommand } from "./cli.js";
import { CandidateAssessmentService } from "./service.js";

export interface AssessmentBatchSummary {
  readonly assessments: readonly CandidateAssessment[];
  readonly created: number;
  readonly reused: number;
}

export async function runAssessmentBatch(
  database: KnownPathDatabase,
  service: CandidateAssessmentService,
  command: Extract<ScoringCommand, { action: "pending" | "all" }>,
): Promise<AssessmentBatchSummary> {
  const candidates = await database.repositories.candidateExperiences.listForScoring(
    command.limit,
    command.action === "pending",
  );
  const assessments: CandidateAssessment[] = [];
  let reused = 0;
  for (const candidate of candidates) {
    const result = await service.assess(candidate._id, {
      evaluatedAt: command.evaluatedAt,
      force: command.force,
    });
    assessments.push(result.assessment);
    if (result.reused) reused += 1;
  }
  return { assessments, created: assessments.length - reused, reused };
}
