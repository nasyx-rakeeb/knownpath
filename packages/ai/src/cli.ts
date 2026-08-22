import {
  candidateExperienceIdSchema,
  extractionAttemptIdSchema,
  sourceItemIdSchema,
  type CandidateExperienceId,
  type ExtractionAttemptId,
  type SourceItemId,
} from "@knownpath/domain";
import { z } from "zod";

export type ExtractionCommand =
  | { readonly action: "one"; readonly sourceItemId: SourceItemId; readonly force: boolean }
  | { readonly action: "pending"; readonly limit?: number; readonly force: boolean }
  | {
      readonly action: "batch";
      readonly source: string;
      readonly limit?: number;
      readonly force: boolean;
    }
  | { readonly action: "inspect"; readonly candidateId: CandidateExperienceId }
  | { readonly action: "inspect"; readonly attemptId: ExtractionAttemptId };

export function extractionUsage(): string {
  return [
    "KnownPath AI extraction:",
    "  pnpm extract one --source-item <uuid> [--force]",
    "  pnpm extract pending [--limit <n>] [--force]",
    "  pnpm extract batch --source <source-key> [--limit <n>] [--force]",
    "  pnpm extract inspect --candidate <uuid>",
    "  pnpm extract inspect --attempt <uuid>",
  ].join("\n");
}

export function parseExtractionArgs(args: readonly string[]): ExtractionCommand {
  const parsedAction = z.enum(["one", "pending", "batch", "inspect"]).safeParse(args[0]);
  if (!parsedAction.success) {
    throw new Error(extractionUsage());
  }
  const action = parsedAction.data;
  const options = parseOptions(args.slice(1));
  const force = options.has("force");
  const limitValue = options.get("limit");
  const limit = limitValue === undefined ? undefined : parseLimit(limitValue);
  if (action === "one") {
    return {
      action,
      sourceItemId: sourceItemIdSchema.parse(required(options, "source-item")),
      force,
    };
  }
  if (action === "pending") return { action, ...(limit === undefined ? {} : { limit }), force };
  if (action === "batch") {
    return {
      action,
      source: required(options, "source"),
      ...(limit === undefined ? {} : { limit }),
      force,
    };
  }
  const candidate = options.get("candidate");
  const attempt = options.get("attempt");
  if ((candidate === undefined) === (attempt === undefined)) {
    throw new Error("inspect requires exactly one of --candidate or --attempt");
  }
  return candidate === undefined
    ? { action, attemptId: extractionAttemptIdSchema.parse(attempt) }
    : { action, candidateId: candidateExperienceIdSchema.parse(candidate) };
}

function parseOptions(args: readonly string[]): Map<string, string | true> {
  const options = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index]!;
    if (!current.startsWith("--")) throw new Error(`Unexpected argument: ${current}`);
    const name = current.slice(2);
    if (name === "force") {
      options.set(name, true);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`Missing value for --${name}`);
    options.set(name, value);
    index += 1;
  }
  return options;
}

function required(options: ReadonlyMap<string, string | true>, name: string): string {
  const value = options.get(name);
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
}

function parseLimit(value: string | true): number {
  if (typeof value !== "string" || !/^\d+$/u.test(value))
    throw new Error("--limit must be a positive integer");
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000)
    throw new Error("--limit must be between 1 and 1000");
  return limit;
}
