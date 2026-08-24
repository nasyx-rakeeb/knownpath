import { loadSourceManifest } from "@knownpath/source-ingestion";

import type { GitHubSourceDefinition, GitHubSourceManifest, GitHubSourceType } from "./types.js";

export async function loadGitHubSourceManifest(path: string): Promise<GitHubSourceManifest> {
  const manifest = await loadSourceManifest(path);
  const sources = manifest.sources
    .filter((source) => source.adapter === "github_repository")
    .map((source): GitHubSourceDefinition => {
      const [owner, repositoryName] = source.repository.split("/");
      if (owner === undefined || repositoryName === undefined) {
        throw new Error(`Invalid GitHub repository in source manifest: ${source.repository}`);
      }
      return {
        canonicalUrl: source.canonicalUrl,
        defaultLookbackDays: source.defaultLookbackDays,
        ecosystemHints: source.ecosystemHints,
        enabled: source.enabled,
        refreshIntervalMinutes: source.refreshIntervalMinutes,
        key: source.key,
        name: source.name,
        owner,
        repository: source.repository,
        repositoryName,
        types: [...new Set(source.types)] as GitHubSourceType[],
        sourceQuality: source.sourceQuality,
        attributionUrl: source.attributionUrl,
        licenseIdentifier: source.licenseIdentifier,
        ...(source.licenseUrl === undefined ? {} : { licenseUrl: source.licenseUrl }),
      };
    });
  return { schemaVersion: 2, sources };
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
