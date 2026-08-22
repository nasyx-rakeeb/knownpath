import { z } from "zod";

import type { GitHubIngestionRequest, GitHubSourceType } from "./types.js";

const positiveIntegerSchema = z.coerce.number().int().min(1).max(10_000);
const timestampSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export function parseGitHubIngestionArgs(args: readonly string[]): GitHubIngestionRequest {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valueOptions = new Set([
    "--source",
    "--repository",
    "--types",
    "--since",
    "--until",
    "--limit",
  ]);
  const flagOptions = new Set(["--all", "--backfill", "--dry-run"]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--") continue;
    if (flagOptions.has(argument)) {
      if (flags.has(argument)) throw new Error(`Duplicate option: ${argument}`);
      flags.add(argument);
      continue;
    }
    if (!valueOptions.has(argument)) throw new Error(`Unknown option: ${argument}`);
    if (values.has(argument)) throw new Error(`Duplicate option: ${argument}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option ${argument} requires a value`);
    }
    values.set(argument, value);
    index += 1;
  }

  const selectors = [values.has("--source"), values.has("--repository"), flags.has("--all")].filter(
    Boolean,
  );
  if (selectors.length !== 1) {
    throw new Error("Exactly one of --source, --repository, or --all is required");
  }
  const since = parseOptionalTimestamp(values.get("--since"), "--since");
  const until = parseOptionalTimestamp(values.get("--until"), "--until");
  if (since !== undefined && until !== undefined && since > until) {
    throw new Error("--since must not be later than --until");
  }
  if (flags.has("--backfill") && since === undefined) {
    throw new Error("--backfill requires an explicit --since timestamp");
  }

  const types = parseTypes(values.get("--types"));
  return {
    ...(flags.has("--all") ? { all: true } : {}),
    ...(values.get("--source") === undefined ? {} : { source: values.get("--source")! }),
    ...(values.get("--repository") === undefined
      ? {}
      : { repository: values.get("--repository")! }),
    ...(types === undefined ? {} : { types }),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    limit: positiveIntegerSchema.parse(values.get("--limit") ?? "20"),
    backfill: flags.has("--backfill"),
    dryRun: flags.has("--dry-run"),
  };
}

export function githubIngestionUsage(): string {
  return [
    "KnownPath GitHub ingestion",
    "",
    "Select exactly one source scope:",
    "  --source <source-key>       Ingest one configured source",
    "  --repository <owner/name>  Ingest one configured repository",
    "  --all                       Ingest all enabled configured sources",
    "",
    "Bounds:",
    "  --types issues,discussions Narrow enabled source types",
    "  --since <ISO timestamp>     Lower updated-time bound",
    "  --until <ISO timestamp>     Upper updated-time bound",
    "  --limit <count>             Top-level thread limit per source (default 20)",
    "  --backfill                  Require explicit historical --since",
    "  --dry-run                   Discover only; perform no database writes",
  ].join("\n");
}

function parseOptionalTimestamp(value: string | undefined, option: string): Date | undefined {
  if (value === undefined) return undefined;
  const result = timestampSchema.safeParse(value);
  if (!result.success) throw new Error(`${option} must be an ISO 8601 timestamp with an offset`);
  return result.data;
}

function parseTypes(value: string | undefined): GitHubSourceType[] | undefined {
  if (value === undefined) return undefined;
  const types = [...new Set(value.split(",").map((item) => item.trim()))];
  return z
    .array(z.enum(["issues", "discussions"]))
    .min(1)
    .max(2)
    .parse(types);
}
