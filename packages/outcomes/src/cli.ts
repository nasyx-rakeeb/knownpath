import type { KnownPathDatabase } from "@knownpath/database";
import { knownPathIdSchema, type KnownPathId } from "@knownpath/domain";

import { OutcomeService } from "./service.js";

export type OutcomeCommand =
  | { readonly action: "recompute"; readonly knownPathId?: KnownPathId; readonly limit: number }
  | { readonly action: "inspect"; readonly knownPathId: KnownPathId }
  | { readonly action: "history"; readonly knownPathId: KnownPathId };

export function outcomeUsage(): string {
  return [
    "Outcome commands:",
    "  pnpm --filter @knownpath/worker outcomes recompute --id <knownPathId>",
    "  pnpm --filter @knownpath/worker outcomes recompute --limit <1-1000>",
    "  pnpm --filter @knownpath/worker outcomes inspect --id <knownPathId>",
    "  pnpm --filter @knownpath/worker outcomes history --id <knownPathId>",
  ].join("\n");
}

export function parseOutcomeArgs(args: readonly string[]): OutcomeCommand {
  const action = args[0];
  const idIndex = args.indexOf("--id");
  const rawId = idIndex < 0 ? undefined : args[idIndex + 1];
  const limitIndex = args.indexOf("--limit");
  const rawLimit = limitIndex < 0 ? undefined : args[limitIndex + 1];
  const limit = rawLimit === undefined ? 100 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error(outcomeUsage());
  if (action === "recompute")
    return {
      action,
      ...(rawId === undefined ? {} : { knownPathId: knownPathIdSchema.parse(rawId) }),
      limit,
    };
  if ((action === "inspect" || action === "history") && rawId !== undefined)
    return { action, knownPathId: knownPathIdSchema.parse(rawId) };
  throw new Error(outcomeUsage());
}

export async function runOutcomeCommand(
  database: KnownPathDatabase,
  command: OutcomeCommand,
): Promise<unknown> {
  if (command.action === "history")
    return {
      knownPathId: command.knownPathId,
      assessments: await database.repositories.outcomeAssessments.listByKnownPath(
        command.knownPathId,
      ),
      safetyEvents: await database.repositories.safetyEvents.listByKnownPath(command.knownPathId),
    };
  if (command.action === "inspect") {
    const knownPath = await database.repositories.knownPaths.findById(command.knownPathId);
    if (knownPath === null) throw new Error("KnownPath not found");
    const assessment =
      knownPath.latestOutcomeAssessmentId === undefined
        ? null
        : await database.repositories.outcomeAssessments.findById(
            knownPath.latestOutcomeAssessmentId,
          );
    return {
      knownPathId: knownPath._id,
      status: knownPath.status,
      safetyReview: knownPath.safetyReview,
      latestAssessment: assessment,
    };
  }
  const service = new OutcomeService(database);
  const records =
    command.knownPathId === undefined
      ? await database.repositories.knownPaths.listForOutcomeAssessment(command.limit)
      : [await database.repositories.knownPaths.findById(command.knownPathId)].filter(
          (record) => record !== null,
        );
  const assessments = [];
  for (const record of records) assessments.push(await service.recompute(record._id));
  return {
    recomputed: assessments.length,
    assessments: assessments.map((value) => ({
      id: value._id,
      knownPathId: value.knownPathId,
      algorithmVersion: value.algorithm.version,
      calculatedAt: value.calculatedAt,
      confidence: value.confidence,
      effectiveSampleSize: value.recency.effectiveSampleSize,
      reasonCodes: value.reasonCodes,
    })),
  };
}
