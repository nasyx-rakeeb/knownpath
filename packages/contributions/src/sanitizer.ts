import { lintSource } from "@secretlint/core";
import { creator as recommendedSecretRules } from "@secretlint/secretlint-rule-preset-recommend";
import {
  contributionPayloadSchema,
  contributionSanitizationReportSchema,
  type ContributionPayload,
  type ContributionSanitizationReport,
} from "@knownpath/domain";

import { ContributionError } from "./errors.js";

const SANITIZER_VERSION = 2;
const SECRET_SCANNER_VERSION = "13.0.4";
const REDACTED_SECRET = "[REDACTED_SECRET]";
// Explicit Unicode ranges remove non-printing control/bidi characters before any persistence.
/* eslint-disable no-control-regex */
const controlCharacterPattern =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/gu;
/* eslint-enable no-control-regex */
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const unixHomePattern = /\/(?:Users|home)\/[^/\s]+/gu;
const windowsHomePattern = /[A-Za-z]:\\Users\\[^\\\s]+/gu;
const credentialUrlPattern = /\b((?:https?|ssh|git|mongodb(?:\+srv)?):\/\/)[^\s/@:]+:[^\s/@]+@/giu;
const sensitiveQueryPattern =
  /([?&](?:token|key|api_key|apikey|secret|password|signature|credential)=)[^&#\s]+/giu;
const internalHostPattern =
  /\b(?:https?:\/\/)?(?:[A-Za-z0-9-]+\.)+(?:internal|corp|lan|local)(?::\d{1,5})?\b/giu;
const privateIpPattern =
  /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/gu;
const repositoryUrlPattern =
  /\bhttps?:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\b/giu;
const promptInjectionPatterns = [
  /\bignore (?:all |any )?(?:previous|prior|system|developer) instructions\b/iu,
  /\b(?:reveal|print|exfiltrate|send) (?:the )?(?:system prompt|credentials|secrets?|tokens?)\b/iu,
  /\b(?:execute|call|invoke) (?:this |the )?(?:tool|command)\b/iu,
  /\byou are now (?:the |an? )?/iu,
  /\bdo not treat (?:this|the following) as data\b/iu,
] as const;

interface MutableFinding {
  readonly category: ContributionSanitizationReport["findings"][number]["category"];
  readonly fieldPath: string;
  readonly ruleId?: string;
  readonly count: number;
}

export interface SanitizedContribution {
  readonly payload: ContributionPayload;
  readonly report: ContributionSanitizationReport;
}

export async function sanitizeContributionPayload(
  input: ContributionPayload,
): Promise<SanitizedContribution> {
  const parsed = contributionPayloadSchema.parse(input);
  const findings: MutableFinding[] = [];
  let originalCharacters = 0;
  let sanitizedCharacters = 0;

  const clean = async (value: string, fieldPath: string): Promise<string> => {
    originalCharacters += value.length;
    let output = value.normalize("NFKC");
    output = replaceAndRecord(
      output,
      controlCharacterPattern,
      "",
      "control_character",
      fieldPath,
      findings,
    );
    output = replaceAndRecord(
      output,
      internalHostPattern,
      "[REDACTED_INTERNAL_HOST]",
      "internal_identifier",
      fieldPath,
      findings,
    );
    output = replaceAndRecord(
      output,
      privateIpPattern,
      "[REDACTED_INTERNAL_HOST]",
      "internal_identifier",
      fieldPath,
      findings,
    );
    output = replaceAndRecord(
      output,
      repositoryUrlPattern,
      "[REDACTED_REPOSITORY]",
      "repository_identifier",
      fieldPath,
      findings,
    );
    output = await redactSecrets(output, fieldPath, findings);
    output = replaceAndRecord(
      output,
      emailPattern,
      "[REDACTED_EMAIL]",
      "email",
      fieldPath,
      findings,
    );
    output = replaceAndRecord(output, unixHomePattern, "$HOME", "home_path", fieldPath, findings);
    output = replaceAndRecord(
      output,
      windowsHomePattern,
      "$HOME",
      "home_path",
      fieldPath,
      findings,
    );
    output = replaceAndRecord(
      output,
      credentialUrlPattern,
      "$1",
      "credential_url",
      fieldPath,
      findings,
    );
    output = replaceAndRecord(
      output,
      sensitiveQueryPattern,
      "$1[REDACTED]",
      "sensitive_query",
      fieldPath,
      findings,
    );
    const injectionCount = promptInjectionPatterns.filter((pattern) => pattern.test(output)).length;
    if (injectionCount > 0)
      findings.push({ category: "prompt_injection", fieldPath, count: injectionCount });
    const remaining = await scanSecrets(output, fieldPath);
    if (remaining.length > 0 || /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(output)) {
      throw new ContributionError(
        "contribution_content_rejected",
        "The contribution still appears to contain high-risk secret material after sanitization",
      );
    }
    if (isExcessiveSourceContent(output)) {
      findings.push({ category: "excessive_private_content", fieldPath, count: 1 });
      throw new ContributionError(
        "contribution_content_rejected",
        "The contribution contains excessive source-like or private content; submit a shorter generalized lesson",
      );
    }
    sanitizedCharacters += output.length;
    return output.trim();
  };

  const payload = contributionPayloadSchema.parse({
    problem: await clean(parsed.problem, "payload.problem"),
    ecosystem: await clean(parsed.ecosystem, "payload.ecosystem"),
    packages: await Promise.all(
      parsed.packages.map(async (item, index) => ({
        ecosystem: await clean(item.ecosystem, `payload.packages.${index}.ecosystem`),
        name: await clean(item.name, `payload.packages.${index}.name`),
        ...(item.version === undefined
          ? {}
          : { version: await clean(item.version, `payload.packages.${index}.version`) }),
      })),
    ),
    platforms: await cleanArray(parsed.platforms, "payload.platforms", clean),
    versions: await cleanArray(parsed.versions, "payload.versions", clean),
    toolchain: await cleanArray(parsed.toolchain, "payload.toolchain", clean),
    symptoms: await cleanArray(parsed.symptoms, "payload.symptoms", clean),
    errors: await cleanArray(parsed.errors, "payload.errors", clean),
    solutionSummary: await clean(parsed.solutionSummary, "payload.solutionSummary"),
    ...(parsed.rootCause === undefined
      ? {}
      : { rootCause: await clean(parsed.rootCause, "payload.rootCause") }),
    steps: await Promise.all(
      parsed.steps.map(async (step, index) => ({
        instruction: await clean(step.instruction, `payload.steps.${index}.instruction`),
        ...(step.verification === undefined
          ? {}
          : {
              verification: await clean(step.verification, `payload.steps.${index}.verification`),
            }),
      })),
    ),
    caveats: await cleanArray(parsed.caveats, "payload.caveats", clean),
    successEvidence: {
      summary: await clean(parsed.successEvidence.summary, "payload.successEvidence.summary"),
      checks: await cleanArray(
        parsed.successEvidence.checks,
        "payload.successEvidence.checks",
        clean,
      ),
    },
    verificationType: parsed.verificationType,
    ...(parsed.applicability === undefined
      ? {}
      : {
          applicability: {
            appliesWhen: await clean(
              parsed.applicability.appliesWhen,
              "payload.applicability.appliesWhen",
            ),
            doesNotApplyWhen: await cleanArray(
              parsed.applicability.doesNotApplyWhen,
              "payload.applicability.doesNotApplyWhen",
              clean,
            ),
          },
        }),
    environment: {
      runtimes: await cleanArray(
        parsed.environment.runtimes,
        "payload.environment.runtimes",
        clean,
      ),
      operatingSystems: await cleanArray(
        parsed.environment.operatingSystems,
        "payload.environment.operatingSystems",
        clean,
      ),
      architectures: await cleanArray(
        parsed.environment.architectures,
        "payload.environment.architectures",
        clean,
      ),
      frameworks: await cleanArray(
        parsed.environment.frameworks,
        "payload.environment.frameworks",
        clean,
      ),
      buildModes: await cleanArray(
        parsed.environment.buildModes,
        "payload.environment.buildModes",
        clean,
      ),
    },
    consultedKnownPaths: parsed.consultedKnownPaths,
  });
  const redactedCharacters = Math.max(0, originalCharacters - sanitizedCharacters);
  if (originalCharacters > 0 && redactedCharacters / originalCharacters > 0.6) {
    throw new ContributionError(
      "contribution_content_rejected",
      "Too much of the contribution required redaction to retain a useful reusable lesson",
    );
  }
  const quarantined = findings.some((finding) => finding.category === "prompt_injection");
  return {
    payload,
    report: contributionSanitizationReportSchema.parse({
      sanitizerIdentifier: "knownpath-contribution-sanitizer",
      sanitizerVersion: SANITIZER_VERSION,
      secretScanner: { identifier: "secretlint-recommended", version: SECRET_SCANNER_VERSION },
      status: quarantined ? "quarantined" : findings.length > 0 ? "sanitized" : "clean",
      findings,
      originalCharacters,
      sanitizedCharacters,
      redactedCharacters,
      reasonCodes: quarantined ? ["prompt_injection_language_detected"] : [],
    }),
  };
}

async function cleanArray(
  values: readonly string[],
  fieldPath: string,
  clean: (value: string, fieldPath: string) => Promise<string>,
): Promise<string[]> {
  return Promise.all(values.map((value, index) => clean(value, `${fieldPath}.${index}`)));
}

async function scanSecrets(value: string, fieldPath: string) {
  const result = await lintSource({
    source: {
      content: value,
      filePath: `contribution://${fieldPath}`,
      contentType: "text",
      ext: ".txt",
    },
    options: {
      maskSecrets: true,
      noPhysicFilePath: true,
      config: {
        rules: [
          {
            id: recommendedSecretRules.meta.id,
            rule: recommendedSecretRules,
            options: {},
          },
        ],
      },
    },
  });
  return result.messages;
}

async function redactSecrets(
  value: string,
  fieldPath: string,
  findings: MutableFinding[],
): Promise<string> {
  const messages = await scanSecrets(value, fieldPath);
  if (messages.length === 0) return value;
  for (const [ruleId, count] of countBy(messages.map((message) => message.ruleId)).entries())
    findings.push({ category: "secret", fieldPath, ruleId, count });
  const ranges = mergeRanges(messages.map((message) => message.range));
  let output = value;
  for (const [start, end] of ranges.sort((left, right) => right[0] - left[0]))
    output = `${output.slice(0, start)}${REDACTED_SECRET}${output.slice(end)}`;
  return output;
}

function replaceAndRecord(
  input: string,
  pattern: RegExp,
  replacement: string,
  category: MutableFinding["category"],
  fieldPath: string,
  findings: MutableFinding[],
): string {
  const matches = [...input.matchAll(pattern)].length;
  pattern.lastIndex = 0;
  if (matches > 0) findings.push({ category, fieldPath, count: matches });
  return input.replace(pattern, replacement);
}

function isExcessiveSourceContent(value: string): boolean {
  const lines = value.split("\n");
  if (lines.length > 40) return true;
  const codeLike = lines.filter((line) =>
    /^\s*(?:import |export |class |function |const |let |var |interface |type |[{}]|<\/?[A-Za-z])/u.test(
      line,
    ),
  ).length;
  return lines.length >= 12 && codeLike >= 10;
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function mergeRanges(ranges: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = ranges
    .map(([start, end]) => [start, end] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous === undefined || range[0] > previous[1]) merged.push(range);
    else previous[1] = Math.max(previous[1], range[1]);
  }
  return merged;
}
