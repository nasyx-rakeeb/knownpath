import type { GitHubConfig } from "@knownpath/config";
import { recordProviderEvent } from "@knownpath/observability";
import { Octokit, type Octokit as OctokitClient } from "octokit";

import type { GitHubIngestionLogger } from "./types.js";

export interface CreateGitHubClientOptions {
  readonly config: GitHubConfig;
  readonly logger: GitHubIngestionLogger;
  readonly onRateLimited: (retryAfterSeconds: number, secondary: boolean) => void;
  readonly signal?: AbortSignal;
}

export function createGitHubClient(options: CreateGitHubClientOptions): OctokitClient {
  const { config, logger } = options;
  const client = new Octokit({
    ...(config.token === undefined ? {} : { auth: config.token }),
    userAgent: config.userAgent,
    request: {
      timeout: config.requestTimeoutMs,
      retries: 3,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    log: {
      debug: () => logger.debug("GitHub SDK event"),
      info: () => logger.info("GitHub SDK event"),
      warn: () => logger.warn("GitHub SDK warning"),
      error: () => logger.error("GitHub SDK error"),
    },
    throttle: {
      onRateLimit: (
        retryAfter: number,
        requestOptions: { readonly method: string; readonly url: string },
        _octokit: unknown,
        retryCount: number,
      ) => {
        options.onRateLimited(retryAfter, false);
        recordProviderEvent("github", "rate_limit");
        logger.warn("GitHub primary rate limit reached", {
          method: requestOptions.method,
          route: requestOptions.url,
          retryAfterSeconds: retryAfter,
          retryCount,
        });
        return retryCount === 0 && retryAfter <= config.maxRateLimitWaitSeconds;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        requestOptions: { readonly method: string; readonly url: string },
        _octokit: unknown,
        retryCount: number,
      ) => {
        options.onRateLimited(retryAfter, true);
        recordProviderEvent("github", "rate_limit");
        logger.warn("GitHub secondary rate limit reached", {
          method: requestOptions.method,
          route: requestOptions.url,
          retryAfterSeconds: retryAfter,
          retryCount,
        });
        return retryCount === 0 && retryAfter <= config.maxRateLimitWaitSeconds;
      },
    },
  });

  client.hook.after("request", async (response) => {
    const remaining = parseIntegerHeader(response.headers["x-ratelimit-remaining"]);
    const limit = parseIntegerHeader(response.headers["x-ratelimit-limit"]);
    const reset = parseIntegerHeader(response.headers["x-ratelimit-reset"]);
    logger.debug("GitHub API response", {
      status: response.status,
      ...(limit === undefined ? {} : { rateLimit: limit }),
      ...(remaining === undefined ? {} : { rateRemaining: remaining }),
      ...(reset === undefined ? {} : { rateResetAt: new Date(reset * 1_000).toISOString() }),
      ...(response.headers["x-ratelimit-resource"] === undefined
        ? {}
        : { rateResource: response.headers["x-ratelimit-resource"] }),
      ...(response.headers["x-github-request-id"] === undefined
        ? {}
        : { githubRequestId: response.headers["x-github-request-id"] }),
    });
  });

  return client;
}

function parseIntegerHeader(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
