import type { SourceIngestionConfig } from "@knownpath/config";
import { recordSecurityDenial } from "@knownpath/observability";
import { lookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { Agent, fetch } from "undici";

import type { FetchValidators, SafeFetchResult, SourceIngestionLogger } from "./types.js";

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_REDIRECTS = 5;
const parseRobots = robotsParser as unknown as (
  url: string,
  body: string,
) => { isAllowed(url: string, userAgent?: string): boolean | undefined };

export class SafeSourceHttpClient {
  public constructor(
    private readonly config: SourceIngestionConfig,
    private readonly logger: SourceIngestionLogger,
    private readonly signal?: AbortSignal,
    private readonly onRateLimited?: () => void,
  ) {}

  public async assertRobotsAllowed(
    robotsUrl: string,
    targetUrls: readonly string[],
    allowedOrigins: readonly string[],
  ): Promise<void> {
    const result = await this.getText(robotsUrl, {
      allowedContentTypes: ["text/plain"],
      allowedOrigins,
      allowedPathPrefixes: ["/"],
    });
    if (result.body === undefined) throw new Error("Robots policy returned no body");
    const policy = parseRobots(robotsUrl, result.body);
    for (const targetUrl of targetUrls) {
      if (policy.isAllowed(targetUrl, this.config.userAgent) !== true) {
        throw new Error(`Robots policy does not allow configured source URL: ${targetUrl}`);
      }
    }
  }

  public async getText(
    url: string,
    options: {
      readonly allowedContentTypes: readonly string[];
      readonly allowedOrigins: readonly string[];
      readonly allowedPathPrefixes: readonly string[];
      readonly validators?: FetchValidators;
    },
  ): Promise<SafeFetchResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const result = await this.fetchOnce(url, options);
        if (result.status === 429) this.onRateLimited?.();
        if (!TRANSIENT_STATUSES.has(result.status) || attempt === this.config.maxRetries) {
          if (result.status >= 400) throw new SourceHttpError(result.status, result.finalUrl);
          return result;
        }
        await this.waitForRetry(attempt, result.retryAfterSeconds);
      } catch (error) {
        const ssrfDenied = hasCode(error, "KNOWNPATH_SSRF_DENIED");
        const effectiveError = ssrfDenied ? ssrfDeniedError() : error;
        if (ssrfDenied) {
          recordSecurityDenial("ssrf", "ingestion");
        }
        lastError = effectiveError;
        if (
          attempt === this.config.maxRetries ||
          (error instanceof SourceHttpError && !TRANSIENT_STATUSES.has(error.status)) ||
          ssrfDenied ||
          this.signal?.aborted === true
        ) {
          throw effectiveError;
        }
        this.logger.warn("Official source request will retry", {
          url: safeUrl(url),
          attempt: attempt + 1,
          code: error instanceof SourceHttpError ? `http_${error.status}` : "network_error",
        });
        await this.waitForRetry(attempt, undefined);
      }
    }
    throw lastError;
  }

  private async fetchOnce(
    initialUrl: string,
    options: {
      readonly allowedContentTypes: readonly string[];
      readonly allowedOrigins: readonly string[];
      readonly allowedPathPrefixes: readonly string[];
      readonly validators?: FetchValidators;
    },
  ): Promise<SafeFetchResult> {
    let currentUrl = validateUrl(initialUrl, options.allowedOrigins, options.allowedPathPrefixes);
    const dispatcher = new Agent({ connect: { lookup: safePublicLookup } });
    try {
      for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const timeoutSignal = AbortSignal.timeout(this.config.requestTimeoutMs);
        const signal =
          this.signal === undefined ? timeoutSignal : AbortSignal.any([this.signal, timeoutSignal]);
        const response = await fetch(currentUrl, {
          dispatcher,
          redirect: "manual",
          signal,
          headers: {
            Accept: options.allowedContentTypes.join(", "),
            "User-Agent": this.config.userAgent,
            ...(options.validators?.etag === undefined
              ? {}
              : { "If-None-Match": options.validators.etag }),
            ...(options.validators?.lastModified === undefined
              ? {}
              : { "If-Modified-Since": options.validators.lastModified }),
          },
        });

        if (response.status === 304) {
          const etag = response.headers.get("etag") ?? undefined;
          const lastModified = response.headers.get("last-modified") ?? undefined;
          return {
            status: response.status,
            finalUrl: currentUrl,
            notModified: true,
            ...(etag === undefined ? {} : { etag }),
            ...(lastModified === undefined ? {} : { lastModified }),
          };
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (location === null) throw new SourceHttpError(response.status, currentUrl);
          if (redirectCount === MAX_REDIRECTS)
            throw new Error("Official source redirect limit exceeded");
          await response.body?.cancel();
          currentUrl = validateUrl(
            new URL(location, currentUrl).toString(),
            options.allowedOrigins,
            options.allowedPathPrefixes,
          );
          continue;
        }

        const etag = response.headers.get("etag") ?? undefined;
        const lastModified = response.headers.get("last-modified") ?? undefined;
        const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
        const common = {
          status: response.status,
          finalUrl: currentUrl,
          ...(etag === undefined ? {} : { etag }),
          ...(lastModified === undefined ? {} : { lastModified }),
          ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        };
        if (response.status >= 400) return { ...common, notModified: false };

        const contentType = (response.headers.get("content-type") ?? "")
          .split(";", 1)[0]!
          .trim()
          .toLowerCase();
        if (!options.allowedContentTypes.some((allowed) => contentType === allowed)) {
          throw new Error(`Unexpected official source content type: ${contentType || "missing"}`);
        }
        const body = await readBoundedText(response, this.config.maxResponseBytes);
        return { ...common, body, contentType, notModified: false };
      }
      throw new Error("Official source redirect limit exceeded");
    } finally {
      await dispatcher.close();
    }
  }

  private async waitForRetry(
    attempt: number,
    retryAfterSeconds: number | undefined,
  ): Promise<void> {
    const exponentialMs = Math.min(30_000, 500 * 2 ** attempt);
    const delayMs = Math.min(
      30_000,
      retryAfterSeconds === undefined ? exponentialMs : retryAfterSeconds * 1_000,
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs + Math.floor(Math.random() * 250));
      this.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(this.signal?.reason ?? new Error("Official source request aborted"));
        },
        { once: true },
      );
    });
  }
}

class SourceHttpError extends Error {
  public constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`Official source request failed with HTTP ${status} for ${safeUrl(url)}`);
    this.name = "SourceHttpError";
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Official source response exceeds configured size limit");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error("Official source response exceeds configured size limit");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

function validateUrl(
  value: string,
  allowedOrigins: readonly string[],
  allowedPathPrefixes: readonly string[],
): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.port !== "" && url.port !== "443") ||
    url.username !== "" ||
    url.password !== "" ||
    !allowedOrigins.includes(url.origin) ||
    !allowedPathPrefixes.some((prefix) => pathMatchesPrefix(url.pathname, prefix))
  ) {
    throw new Error(`Official source URL is outside the configured allowlist: ${safeUrl(value)}`);
  }
  const literalHostname = url.hostname.replace(/^\[|\]$/gu, "");
  if (ipaddr.isValid(literalHostname) && !isPublicAddress(literalHostname)) {
    throw ssrfDeniedError();
  }
  return url.toString();
}

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return (
    prefix === "/" ||
    pathname === prefix ||
    pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

const safePublicLookup = ((
  hostname: string,
  options: { readonly all?: boolean } | number,
  callback: (...arguments_: unknown[]) => void,
) => {
  void lookup(hostname, { all: true, order: "verbatim" }).then(
    (addresses) => {
      if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
        const error = new Error("Official source hostname resolved to a non-public address");
        Object.assign(error, { code: "KNOWNPATH_SSRF_DENIED" });
        callback(error);
        return;
      }
      if (typeof options === "object" && options.all === true) {
        callback(null, addresses);
        return;
      }
      const selected = addresses[0]!;
      callback(null, selected.address, selected.family);
    },
    (error: unknown) => callback(error),
  );
}) as LookupFunction;

function isPublicAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address();
  }
  return parsed.range() === "unicast";
}

function safeUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1_000));
}

function hasCode(error: unknown, code: string): boolean {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && current.code === code) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

function ssrfDeniedError(): Error & { code: "KNOWNPATH_SSRF_DENIED" } {
  return Object.assign(new Error("Official source request denied by SSRF policy"), {
    code: "KNOWNPATH_SSRF_DENIED" as const,
  });
}
