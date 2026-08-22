import { RequestError } from "octokit";

export class GitHubIngestionError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly rateLimited = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GitHubIngestionError";
  }
}

export function normalizeGitHubError(error: unknown): GitHubIngestionError {
  if (error instanceof GitHubIngestionError) return error;
  if (error instanceof RequestError) {
    const remaining = error.response?.headers["x-ratelimit-remaining"];
    const rateLimited = error.status === 429 || (error.status === 403 && remaining === "0");
    const retryable = rateLimited || error.status === 408 || error.status >= 500;
    const requestId = error.response?.headers["x-github-request-id"];
    const suffix = requestId === undefined ? "" : ` (GitHub request ${requestId})`;
    return new GitHubIngestionError(
      `GitHub API request failed with status ${error.status}${suffix}`,
      rateLimited ? "github_rate_limited" : `github_http_${error.status}`,
      retryable,
      rateLimited,
      { cause: error },
    );
  }
  return new GitHubIngestionError(
    error instanceof Error ? error.message : "Unknown GitHub ingestion failure",
    "github_ingestion_failed",
    false,
    false,
    { cause: error },
  );
}
