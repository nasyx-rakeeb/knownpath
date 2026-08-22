import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeUrl } from "@knownpath/domain";
import { z } from "zod";

import type { GitHubSourceDefinition, GitHubSourceManifest, GitHubSourceType } from "./types.js";

const sourceTypeSchema = z.enum(["issues", "discussions"]);

const manifestSourceSchema = z.strictObject({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  name: z.string().trim().min(1).max(256),
  repository: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  canonicalUrl: z.url({ hostname: /^github\.com$/u, protocol: /^https$/u }),
  ecosystemHints: z.array(z.string().trim().min(1).max(256)).max(32),
  types: z.array(sourceTypeSchema).min(1).max(2),
  defaultLookbackDays: z.int().min(1).max(3_650),
  enabled: z.boolean(),
});

const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sources: z.array(manifestSourceSchema).min(1).max(100),
});

export async function loadGitHubSourceManifest(path: string): Promise<GitHubSourceManifest> {
  const absolutePath = resolve(path);
  const parsedJson = JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
  const manifest = manifestSchema.parse(parsedJson);
  const seenKeys = new Set<string>();
  const seenRepositories = new Set<string>();

  const sources = manifest.sources.map((source): GitHubSourceDefinition => {
    const [owner, repositoryName] = source.repository.split("/");
    if (owner === undefined || repositoryName === undefined) {
      throw new Error(`Invalid GitHub repository in source manifest: ${source.repository}`);
    }
    if (seenKeys.has(source.key)) throw new Error(`Duplicate GitHub source key: ${source.key}`);
    const repository = `${owner.toLowerCase()}/${repositoryName.toLowerCase()}`;
    if (seenRepositories.has(repository)) {
      throw new Error(`Duplicate GitHub source repository: ${source.repository}`);
    }
    seenKeys.add(source.key);
    seenRepositories.add(repository);

    const canonicalUrl = normalizeUrl(source.canonicalUrl);
    if (canonicalUrl !== `https://github.com/${source.repository}`) {
      throw new Error(
        `GitHub source ${source.key} canonicalUrl must match its case-sensitive repository`,
      );
    }

    return {
      ...source,
      canonicalUrl,
      owner,
      repository,
      repositoryName,
      types: [...new Set(source.types)] as GitHubSourceType[],
    };
  });

  return { schemaVersion: 1, sources };
}

export function selectGitHubSources(
  manifest: GitHubSourceManifest,
  selection: { readonly all?: boolean; readonly repository?: string; readonly source?: string },
): GitHubSourceDefinition[] {
  const selected = manifest.sources.filter((source) => {
    if (!source.enabled) return false;
    if (selection.all === true) return true;
    if (selection.source !== undefined) return source.key === selection.source;
    return source.repository.toLowerCase() === selection.repository?.toLowerCase();
  });

  if (selected.length === 0) {
    throw new Error("No enabled GitHub source matched the requested selector");
  }
  return selected;
}
