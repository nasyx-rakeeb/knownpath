export { GitHubIngestionService } from "./service.js";
export { githubIngestionUsage, parseGitHubIngestionArgs } from "./cli.js";
export { loadGitHubSourceManifest, selectGitHubSources } from "./manifest.js";
export type {
  GitHubIngestionLogger,
  GitHubIngestionRequest,
  GitHubSourceDefinition,
  GitHubSourceManifest,
  GitHubSourceType,
  SourceCollectionResult,
} from "./types.js";
