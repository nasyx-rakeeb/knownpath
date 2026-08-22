import { normalizeVersion } from "@knownpath/domain";
import { z } from "zod";

import type { SourceIngestionRequest } from "./types.js";

const positiveIntegerSchema = z.coerce.number().int().min(1).max(10_000);

export function parseSourceIngestionArgs(args: readonly string[]): SourceIngestionRequest {
  const [actionValue, ...options] = args.filter((argument) => argument !== "--");
  const action = z.enum(["discover", "sync"]).parse(actionValue);
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valueOptions = new Set(["--source", "--page", "--version", "--scope", "--limit"]);
  const flagOptions = new Set(["--all", "--dry-run"]);

  for (let index = 0; index < options.length; index += 1) {
    const argument = options[index]!;
    if (flagOptions.has(argument)) {
      if (flags.has(argument)) throw new Error(`Duplicate option: ${argument}`);
      flags.add(argument);
      continue;
    }
    if (!valueOptions.has(argument)) throw new Error(`Unknown option: ${argument}`);
    if (values.has(argument)) throw new Error(`Duplicate option: ${argument}`);
    const value = options[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option ${argument} requires a value`);
    }
    values.set(argument, value);
    index += 1;
  }

  if ([values.has("--source"), flags.has("--all")].filter(Boolean).length !== 1) {
    throw new Error("Exactly one of --source or --all is required");
  }
  const page = values.get("--page");
  if (page !== undefined) z.url({ protocol: /^https$/u }).parse(page);
  if (flags.has("--all") && page !== undefined) {
    throw new Error("--page requires selecting exactly one --source");
  }

  return {
    action,
    ...(flags.has("--all") ? { all: true } : {}),
    ...(values.get("--source") === undefined ? {} : { source: values.get("--source")! }),
    ...(page === undefined ? {} : { page }),
    ...(values.get("--version") === undefined
      ? {}
      : { version: normalizeVersion(values.get("--version")!) }),
    scope: z.enum(["curated", "all"]).parse(values.get("--scope") ?? "curated"),
    limit: positiveIntegerSchema.parse(values.get("--limit") ?? "20"),
    dryRun: flags.has("--dry-run"),
  };
}

export function sourceIngestionUsage(): string {
  return [
    "KnownPath official source ingestion",
    "",
    "Commands:",
    "  discover --source <source-key>  Discover and classify configured candidates",
    "  sync --source <source-key>      Synchronize one configured source",
    "  sync --all                      Synchronize all enabled official sources",
    "",
    "Controls:",
    "  --page <url>                    Target one indexed page",
    "  --version <version>             Filter by a deterministically detected version",
    "  --scope curated|all             Curated by default; all remains bounded by --limit",
    "  --limit <count>                 Maximum selected items per source (default 20)",
    "  --dry-run                       Discover/fetch without database writes",
  ].join("\n");
}
