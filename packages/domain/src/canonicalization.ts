import { createHash } from "node:crypto";

import { NORMALIZATION_VERSION, type VersionedKey } from "./common.js";

const slugSeparatorPattern = /[^a-z0-9]+/gu;
const whitespacePattern = /\s+/gu;

export function normalizeText(value: string): string {
  return value.normalize("NFKC").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
}

export function normalizeInlineText(value: string): string {
  return normalizeText(value).replace(whitespacePattern, " ");
}

export function normalizeSlug(value: string): string {
  return normalizeInlineText(value)
    .toLowerCase()
    .replace(slugSeparatorPattern, "-")
    .replace(/^-+|-+$/gu, "");
}

export function normalizeEcosystem(value: string): string {
  return normalizeSlug(value);
}

export function normalizePlatform(value: string): string {
  return normalizeSlug(value);
}

export function normalizePackageName(ecosystem: string, packageName: string): string {
  const normalized = normalizeInlineText(packageName);
  const normalizedEcosystem = normalizeEcosystem(ecosystem);

  if (["npm", "jsr", "pypi", "nuget", "crates-io"].includes(normalizedEcosystem)) {
    return normalized.toLowerCase();
  }

  return normalized;
}

export function normalizeVersion(value: string): string {
  return normalizeInlineText(value);
}

export function normalizeUrl(value: string): string {
  const url = new URL(normalizeInlineText(value));
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.protocol = url.protocol.toLowerCase();

  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/u, "");
  }

  return url.toString();
}

export function normalizeTimestamp(value: Date | string): string {
  const timestamp = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(timestamp.getTime())) {
    throw new TypeError("Cannot normalize an invalid timestamp");
  }

  return timestamp.toISOString();
}

export function createVersionedKey(
  parts: readonly string[],
  version = NORMALIZATION_VERSION,
): VersionedKey {
  const canonicalTuple = JSON.stringify([version, ...parts.map(normalizeText)]);

  return {
    value: createHash("sha256").update(canonicalTuple, "utf8").digest("hex"),
    version,
  };
}

export function createErrorFingerprint(errorMaterial: string): VersionedKey {
  return createVersionedKey([normalizeInlineText(errorMaterial)]);
}
