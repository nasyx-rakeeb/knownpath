import {
  createErrorFingerprint,
  normalizeEcosystem,
  normalizeInlineText,
  normalizePackageName,
  normalizePlatform,
} from "@knownpath/domain";

export function normalizeRetrievalError(value: string): string {
  return normalizeInlineText(value)
    .replace(/\b(?:[a-z]:)?[\\/](?:users|home|tmp|private|var|data)[\\/][^\s:]+/giu, "<path>")
    .replace(/:\d+(?::\d+)?\b/gu, ":<line>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/giu, "<uuid>")
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?\b/gu, "<timestamp>")
    .toLowerCase();
}

export function normalizeRetrievalQuery(input: {
  text: string;
  errors: readonly string[];
  ecosystem?: string;
  packages: readonly string[];
  platforms: readonly string[];
  environment: readonly string[];
}) {
  const rawErrorMaterial = input.errors.map(normalizeInlineText).join("\n");
  const errors = [...new Set(input.errors.map(normalizeRetrievalError))];
  const explicitCodes = [
    ...(rawErrorMaterial.match(/\b(?:ERR_[A-Z0-9_]+|TS\d{3,5}|[A-Z]{2,}-\d{2,})\b/giu) ?? []),
    ...(rawErrorMaterial.match(/\bE[A-Z]{2,10}\b/gu) ?? []),
  ];
  return {
    text: normalizeInlineText(input.text).toLowerCase(),
    errors,
    errorFingerprints: errors.map((entry) => createErrorFingerprint(entry).value),
    errorCodes: [...new Set(explicitCodes.map((entry) => entry.toLowerCase()))],
    ecosystem: input.ecosystem === undefined ? undefined : normalizeEcosystem(input.ecosystem),
    packages: [...new Set(input.packages.map((entry) => normalizePackageName("npm", entry)))],
    platforms: [...new Set(input.platforms.map(normalizePlatform))],
    environment: [
      ...new Set(input.environment.map((entry) => normalizeInlineText(entry).toLowerCase())),
    ],
  };
}
