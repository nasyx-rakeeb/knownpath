import { lintSource } from "@secretlint/core";
import { creator as recommendedSecretRules } from "@secretlint/secretlint-rule-preset-recommend";

export interface PrivacyFinding {
  readonly category:
    "secret" | "email" | "home_path" | "credential_url" | "sensitive_query" | "control_character";
  readonly count: number;
}

export interface SanitizedPrivacyText {
  readonly value: string;
  readonly status: "clean" | "sanitized";
  readonly findings: readonly PrivacyFinding[];
}

/* eslint-disable no-control-regex */
const controls =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/gu;
/* eslint-enable no-control-regex */
const patterns = [
  {
    category: "email" as const,
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
    replacement: "[REDACTED_EMAIL]",
  },
  { category: "home_path" as const, pattern: /\/(?:Users|home)\/[^/\s]+/gu, replacement: "$HOME" },
  { category: "home_path" as const, pattern: /[A-Za-z]:\\Users\\[^\\\s]+/gu, replacement: "$HOME" },
  {
    category: "credential_url" as const,
    pattern: /\b((?:https?|ssh|git|mongodb(?:\+srv)?):\/\/)[^\s/@:]+:[^\s/@]+@/giu,
    replacement: "$1",
  },
  {
    category: "sensitive_query" as const,
    pattern: /([?&](?:token|key|api_key|apikey|secret|password|signature|credential)=)[^&#\s]+/giu,
    replacement: "$1[REDACTED]",
  },
] as const;

export async function sanitizePrivacyText(input: string): Promise<SanitizedPrivacyText> {
  let value = input.normalize("NFKC");
  const findings: PrivacyFinding[] = [];
  const controlCount = [...value.matchAll(controls)].length;
  controls.lastIndex = 0;
  if (controlCount > 0) findings.push({ category: "control_character", count: controlCount });
  value = value.replace(controls, "");
  const secretMessages = await scan(value);
  if (secretMessages.length > 0) {
    findings.push({ category: "secret", count: secretMessages.length });
    for (const [start, end] of mergeRanges(secretMessages.map((message) => message.range)).sort(
      (a, b) => b[0] - a[0],
    ))
      value = `${value.slice(0, start)}[REDACTED_SECRET]${value.slice(end)}`;
  }
  for (const entry of patterns) {
    const count = [...value.matchAll(entry.pattern)].length;
    entry.pattern.lastIndex = 0;
    if (count > 0) findings.push({ category: entry.category, count });
    value = value.replace(entry.pattern, entry.replacement);
  }
  if ((await scan(value)).length > 0 || /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(value))
    throw new Error("privacy_text_secret_residue");
  return { value: value.trim(), status: findings.length === 0 ? "clean" : "sanitized", findings };
}

async function scan(value: string) {
  const result = await lintSource({
    source: {
      content: value,
      filePath: "knownpath://privacy-text",
      contentType: "text",
      ext: ".txt",
    },
    options: {
      maskSecrets: true,
      noPhysicFilePath: true,
      config: {
        rules: [{ id: recommendedSecretRules.meta.id, rule: recommendedSecretRules, options: {} }],
      },
    },
  });
  return result.messages;
}

function mergeRanges(ranges: readonly (readonly [number, number])[]): [number, number][] {
  const merged: [number, number][] = [];
  for (const range of ranges
    .map(([a, b]) => [a, b] as [number, number])
    .sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous === undefined || range[0] > previous[1]) merged.push(range);
    else previous[1] = Math.max(previous[1], range[1]);
  }
  return merged;
}
