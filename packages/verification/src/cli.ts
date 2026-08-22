import {
  candidateAssessmentIdSchema,
  candidateExperienceIdSchema,
  type CandidateAssessmentId,
  type CandidateExperienceId,
} from "@knownpath/domain";

export type ScoringCommand =
  | {
      readonly action: "one";
      readonly candidateId: CandidateExperienceId;
      readonly policyPath?: string;
      readonly evaluatedAt: Date;
      readonly force: boolean;
    }
  | {
      readonly action: "pending" | "all";
      readonly limit: number;
      readonly policyPath?: string;
      readonly evaluatedAt: Date;
      readonly force: boolean;
    }
  | { readonly action: "inspect"; readonly assessmentId: CandidateAssessmentId }
  | {
      readonly action: "history";
      readonly candidateId: CandidateExperienceId;
      readonly limit: number;
    };

export function scoringUsage(): string {
  return [
    "KnownPath deterministic scoring:",
    "  pnpm score one --candidate <uuid> [--as-of <ISO timestamp>] [--policy <path>] [--force]",
    "  pnpm score pending [--limit <n>] [--as-of <ISO timestamp>] [--policy <path>] [--force]",
    "  pnpm score all [--limit <n>] [--as-of <ISO timestamp>] [--policy <path>] [--force]",
    "  pnpm score inspect --assessment <uuid>",
    "  pnpm score history --candidate <uuid> [--limit <n>]",
  ].join("\n");
}

export function parseScoringArgs(args: readonly string[]): ScoringCommand {
  const action = args[0];
  if (!(["one", "pending", "all", "inspect", "history"] as const).includes(action as never))
    throw new Error(scoringUsage());
  const options = parseOptions(args.slice(1));
  const limit = parseLimit(options.get("limit"));
  if (action === "inspect")
    return {
      action,
      assessmentId: candidateAssessmentIdSchema.parse(required(options, "assessment")),
    };
  if (action === "history")
    return {
      action,
      candidateId: candidateExperienceIdSchema.parse(required(options, "candidate")),
      limit,
    };
  const evaluatedAt = parseAsOf(options.get("as-of"));
  const policyPath = stringOption(options.get("policy"));
  const common = {
    evaluatedAt,
    force: options.has("force"),
    ...(policyPath === undefined ? {} : { policyPath }),
  };
  if (action === "one")
    return {
      action,
      candidateId: candidateExperienceIdSchema.parse(required(options, "candidate")),
      ...common,
    };
  return { action: action as "pending" | "all", limit, ...common };
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

function stringOption(value: string | true | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseLimit(value: string | true | undefined): number {
  if (value === undefined) return 100;
  if (typeof value !== "string" || !/^\d+$/u.test(value))
    throw new Error("--limit must be a positive integer");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 1_000)
    throw new Error("--limit must be between 1 and 1000");
  return number;
}

function parseAsOf(value: string | true | undefined): Date {
  if (value === undefined) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  if (typeof value !== "string") throw new Error("--as-of requires an ISO timestamp");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("--as-of must be a valid ISO timestamp");
  return date;
}
