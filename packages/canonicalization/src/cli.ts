import {
  candidateExperienceIdSchema,
  candidatePairAssessmentIdSchema,
  canonicalizationOperationIdSchema,
  knownPathIdSchema,
  type CandidateExperienceId,
  type CandidatePairAssessmentId,
  type CanonicalizationOperationId,
  type KnownPathId,
} from "@knownpath/domain";

export type CanonicalizationRequest =
  | {
      readonly action: "profile";
      readonly candidateId?: CandidateExperienceId;
      readonly limit: number;
    }
  | { readonly action: "discover"; readonly limit: number; readonly useEmbeddings: boolean }
  | {
      readonly action: "auto-merge";
      readonly apply: boolean;
      readonly limit: number;
      readonly useEmbeddings: boolean;
    }
  | {
      readonly action: "review";
      readonly pairAssessmentId?: CandidatePairAssessmentId;
      readonly limit: number;
    }
  | {
      readonly action: "merge";
      readonly candidateIds: readonly CandidateExperienceId[];
      readonly targetKnownPathId?: KnownPathId;
      readonly reason: string;
      readonly alternativeSolution: boolean;
      readonly operationId?: CanonicalizationOperationId;
    }
  | {
      readonly action: "split";
      readonly candidateId: CandidateExperienceId;
      readonly reason: string;
      readonly operationId?: CanonicalizationOperationId;
    }
  | {
      readonly action: "reassign";
      readonly candidateId: CandidateExperienceId;
      readonly targetKnownPathId: KnownPathId;
      readonly reason: string;
      readonly operationId?: CanonicalizationOperationId;
    }
  | {
      readonly action: "rebuild";
      readonly knownPathId: KnownPathId;
      readonly reason: string;
      readonly operationId?: CanonicalizationOperationId;
    }
  | { readonly action: "history"; readonly operationId: CanonicalizationOperationId };

export function canonicalizationUsage(): string {
  return [
    "KnownPath canonicalization:",
    "  pnpm canonicalize profile [--candidate <id>] [--limit <n>]",
    "  pnpm canonicalize discover [--limit <n>] [--no-embeddings]",
    "  pnpm canonicalize auto-merge [--limit <n>] [--apply] [--no-embeddings]",
    "  pnpm canonicalize review [--pair <assessment-id>] [--limit <n>]",
    "  pnpm canonicalize merge --candidate <id> [--candidate <id>] [--target <known-path-id>] --reason <text> [--alternative-solution]",
    "  pnpm canonicalize split --candidate <id> --reason <text>",
    "  pnpm canonicalize reassign --candidate <id> --target <known-path-id> --reason <text>",
    "  pnpm canonicalize rebuild --known-path <id> [--reason <text>]",
    "  pnpm canonicalize history --operation <id>",
  ].join("\n");
}

export function parseCanonicalizationArgs(args: readonly string[]): CanonicalizationRequest {
  const action = args[0];
  const values = parseOptions(args.slice(1));
  const limit = parseLimit(values.get("limit")?.[0] ?? "25");
  const useEmbeddings = !values.has("no-embeddings");
  if (action === "profile") {
    const candidate = values.get("candidate")?.[0];
    return {
      action,
      limit,
      ...(candidate === undefined
        ? {}
        : { candidateId: candidateExperienceIdSchema.parse(candidate) }),
    };
  }
  if (action === "discover") return { action, limit, useEmbeddings };
  if (action === "auto-merge") return { action, limit, useEmbeddings, apply: values.has("apply") };
  if (action === "review") {
    const pair = values.get("pair")?.[0];
    return {
      action,
      limit,
      ...(pair === undefined
        ? {}
        : { pairAssessmentId: candidatePairAssessmentIdSchema.parse(pair) }),
    };
  }
  if (action === "merge") {
    const candidateIds = (values.get("candidate") ?? []).map((value) =>
      candidateExperienceIdSchema.parse(value),
    );
    if (candidateIds.length === 0) throw new Error("merge requires at least one --candidate");
    return {
      action,
      candidateIds,
      reason: requireOption(values, "reason"),
      alternativeSolution: values.has("alternative-solution"),
      ...optionalKnownPath(values, "target", "targetKnownPathId"),
      ...optionalOperation(values),
    };
  }
  if (action === "split")
    return {
      action,
      candidateId: candidateExperienceIdSchema.parse(requireOption(values, "candidate")),
      reason: requireOption(values, "reason"),
      ...optionalOperation(values),
    };
  if (action === "reassign")
    return {
      action,
      candidateId: candidateExperienceIdSchema.parse(requireOption(values, "candidate")),
      targetKnownPathId: knownPathIdSchema.parse(requireOption(values, "target")),
      reason: requireOption(values, "reason"),
      ...optionalOperation(values),
    };
  if (action === "rebuild")
    return {
      action,
      knownPathId: knownPathIdSchema.parse(requireOption(values, "known-path")),
      reason: values.get("reason")?.[0] ?? "manual_rebuild",
      ...optionalOperation(values),
    };
  if (action === "history")
    return {
      action,
      operationId: canonicalizationOperationIdSchema.parse(requireOption(values, "operation")),
    };
  throw new Error(canonicalizationUsage());
}

function parseOptions(args: readonly string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined || !token.startsWith("--"))
      throw new Error(`Unexpected argument: ${token ?? ""}`);
    const key = token.slice(2);
    const next = args[index + 1];
    const value = next !== undefined && !next.startsWith("--") ? next : "true";
    result.set(key, [...(result.get(key) ?? []), value]);
    if (value !== "true") index += 1;
  }
  return result;
}

function requireOption(values: Map<string, string[]>, key: string): string {
  const value = values.get(key)?.[0];
  if (value === undefined || value === "true") throw new Error(`--${key} is required`);
  return value;
}

function parseLimit(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000)
    throw new Error("--limit must be an integer from 1 to 1000");
  return parsed;
}

function optionalKnownPath<Key extends string>(
  values: Map<string, string[]>,
  option: string,
  key: Key,
): { [Property in Key]?: KnownPathId } {
  const value = values.get(option)?.[0];
  return (value === undefined ? {} : { [key]: knownPathIdSchema.parse(value) }) as {
    [Property in Key]?: KnownPathId;
  };
}

function optionalOperation(values: Map<string, string[]>): {
  readonly operationId?: CanonicalizationOperationId;
} {
  const value = values.get("operation")?.[0];
  return value === undefined ? {} : { operationId: canonicalizationOperationIdSchema.parse(value) };
}
