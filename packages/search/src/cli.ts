import {
  knownPathIdSchema,
  retrievalQuerySchema,
  type KnownPathId,
  type RetrievalQuery,
} from "@knownpath/domain";

export type SearchCommand =
  | { action: "project"; knownPathId?: KnownPathId; limit: number; useEmbedding: boolean }
  | { action: "reembed"; knownPathId?: KnownPathId; limit: number }
  | { action: "inspect"; knownPathId: KnownPathId }
  | { action: "query"; query: RetrievalQuery }
  | { action: "indexes"; operation: "print" | "create" | "status" };

export function searchUsage(): string {
  return [
    "KnownPath retrieval:",
    "  pnpm run search project [--known-path <id> | --pending] [--limit <n>] [--no-embeddings]",
    "  pnpm run search reembed [--known-path <id> | --all] [--limit <n>]",
    "  pnpm run search inspect --known-path <id>",
    "  pnpm run search query --text <problem> [--error <text>] [--ecosystem <name>] [--package <name>] [--version <subject=value>] [--platform <name>] [--environment <value>] [--context <text>] [--include-review] [--semantic disabled|optional|required] [--limit <n>] [--minimum-score <0-100>]",
    "  pnpm run search indexes print|create|status",
  ].join("\n");
}

export function parseSearchArgs(
  args: readonly string[],
  defaults: { limit: number; minimumScore: number },
): SearchCommand {
  const action = args[0];
  if (action === "indexes") {
    const operation = args[1];
    if (operation !== "print" && operation !== "create" && operation !== "status")
      throw new Error(searchUsage());
    return { action, operation };
  }
  const values = parseOptions(args.slice(1));
  const limit = parseInteger(values.get("limit")?.[0] ?? String(defaults.limit), "limit", 1, 100);
  const knownPath = values.get("known-path")?.[0];
  if (action === "project")
    return {
      action,
      ...(knownPath === undefined ? {} : { knownPathId: knownPathIdSchema.parse(knownPath) }),
      limit,
      useEmbedding: !values.has("no-embeddings"),
    };
  if (action === "reembed")
    return {
      action,
      ...(knownPath === undefined ? {} : { knownPathId: knownPathIdSchema.parse(knownPath) }),
      limit,
    };
  if (action === "inspect")
    return { action, knownPathId: knownPathIdSchema.parse(requireOption(values, "known-path")) };
  if (action === "query") {
    if ((values.get("visibility")?.[0] ?? "public") !== "public")
      throw new Error(
        "Private and workspace searches require the authenticated API/MCP path; the database CLI is public-only.",
      );
    const versions = (values.get("version") ?? []).map((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 1 || separator === entry.length - 1)
        throw new Error("--version must use subject=value");
      return { subject: entry.slice(0, separator), value: entry.slice(separator + 1) };
    });
    return {
      action,
      query: retrievalQuerySchema.parse({
        text: requireOption(values, "text"),
        errors: values.get("error") ?? [],
        ...(values.get("ecosystem")?.[0] === undefined
          ? {}
          : { ecosystem: values.get("ecosystem")?.[0] }),
        packages: values.get("package") ?? [],
        versions,
        platforms: values.get("platform") ?? [],
        environment: values.get("environment") ?? [],
        context: values.get("context")?.[0] ?? "",
        access: { scope: "public" },
        allowedStatuses: values.has("include-review") ? ["published", "review"] : ["published"],
        semanticMode: values.get("semantic")?.[0] ?? "optional",
        limit,
        minimumScore: parseInteger(
          values.get("minimum-score")?.[0] ?? String(defaults.minimumScore),
          "minimum-score",
          0,
          100,
        ),
      }),
    };
  }
  throw new Error(searchUsage());
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

function parseInteger(value: string, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}`);
  return parsed;
}
