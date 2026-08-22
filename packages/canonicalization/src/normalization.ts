import { createHash } from "node:crypto";

import { normalizeInlineText } from "@knownpath/domain";

const windowsTransientPath = /\b[A-Za-z]:\\(?:Users|Temp|tmp|AppData\\Local\\Temp)\\[^\s"'`]+/giu;
const posixTransientPath =
  /(?:\/Users\/[^\s/]+|\/home\/[^\s/]+|\/tmp|\/private\/var\/folders|\/var\/folders)\/[^\s"'`]+/giu;
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;
const isoTimestampPattern =
  /\b\d{4}-\d{2}-\d{2}[T ][0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/giu;
const stackLocationPattern = /(?<=\.[cm]?[jt]sx?|\.[a-z]{1,5}):\d+(?::\d+)?\b/giu;
const contextualIdentifierPattern =
  /\b(build|request|trace|session|correlation)[-_ ]?id\s*[:=]\s*[0-9a-f-]{16,}\b/giu;
const transientBuildSegmentPattern =
  /(?:\/(?:\.expo|\.gradle|\.cache|DerivedData|intermediates|tmp))\/[0-9a-f-]{12,}(?=\/|\s|$)/giu;

const errorCodePattern =
  /\b(?:ERR_[A-Z0-9_]+|TS\d{3,5}|EAS_[A-Z0-9_]+|[A-Z][A-Z0-9_]{2,}_ERROR|E[A-Z]{2,}\d*)\b/gu;
const exceptionClassPattern =
  /\b(?:(?:[A-Za-z_$][\w$]*)\.)*[A-Z][A-Za-z0-9_$]*(?:Error|Exception)\b/gu;

export interface NormalizedTechnicalText {
  readonly text: string;
  readonly reasonCodes: readonly string[];
}

export function normalizeTechnicalText(value: string): NormalizedTechnicalText {
  let text = normalizeInlineText(value).toLowerCase();
  const reasonCodes = new Set<string>();
  const replace = (pattern: RegExp, replacement: string, reasonCode: string): void => {
    pattern.lastIndex = 0;
    if (pattern.test(text)) reasonCodes.add(reasonCode);
    pattern.lastIndex = 0;
    text = text.replace(pattern, replacement);
  };
  replace(windowsTransientPath, "<path>", "normalized_windows_transient_path");
  replace(posixTransientPath, "<path>", "normalized_posix_transient_path");
  replace(transientBuildSegmentPattern, "/<build-id>", "normalized_transient_build_segment");
  replace(uuidPattern, "<uuid>", "normalized_uuid");
  replace(isoTimestampPattern, "<timestamp>", "normalized_timestamp");
  replace(stackLocationPattern, ":<line>", "normalized_stack_location");
  replace(contextualIdentifierPattern, "$1-id:<id>", "normalized_contextual_identifier");
  return { text: text.replace(/\s+/gu, " ").trim(), reasonCodes: [...reasonCodes].sort() };
}

export function extractErrorCodes(value: string): string[] {
  return [...new Set(value.match(errorCodePattern) ?? [])]
    .map((entry) => entry.toUpperCase())
    .sort();
}

export function extractExceptionClasses(value: string): string[] {
  return [...new Set(value.match(exceptionClassPattern) ?? [])].sort();
}

export function createTokenShingles(value: string, width = 3): string[] {
  const tokens = value.split(/[^a-z0-9_@./<>:-]+/u).filter((token) => token.length > 1);
  const shingles = new Set<string>();
  if (tokens.length < width) {
    if (tokens.length > 0) shingles.add(tokens.join(" "));
  } else {
    for (let index = 0; index <= tokens.length - width; index += 1) {
      shingles.add(tokens.slice(index, index + width).join(" "));
    }
  }
  return [...shingles].map(sha256).sort();
}

export function jaccardSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) return 1;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
  return intersection / (leftSet.size + rightSet.size - intersection);
}

export function overlapCoefficient(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
  return intersection / Math.min(leftSet.size, rightSet.size);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
