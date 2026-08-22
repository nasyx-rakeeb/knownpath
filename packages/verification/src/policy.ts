import { readFile } from "node:fs/promises";

import { z } from "zod";

import { sha256, stableJson } from "./digests.js";

export const SCORING_ALGORITHM = { identifier: "knownpath-seed-evidence", version: 1 } as const;
export const VERIFIER_VERSION = 5;

const integerScore = z.int().min(0).max(100);

export const scoringPolicySchema = z
  .strictObject({
    identifier: z.string().trim().min(1).max(256),
    version: z.int().positive(),
    points: z.strictObject({
      groundedExtraction: z.int().nonnegative(),
      officialSolutionGuidance: z.int().nonnegative(),
      maintainerSolution: z.int().nonnegative(),
      acceptedDiscussionAnswer: z.int().nonnegative(),
      authorConfirmed: z.int().nonnegative(),
      mergedClosingPullRequest: z.int().nonnegative(),
      closedAfterSolution: z.int().nonnegative(),
      independentSourceConvergence: z.int().nonnegative(),
      authoritativeConflict: z.int().nonpositive(),
      communityConflict: z.int().nonpositive(),
      unsupportedCandidateLabel: z.int().nonpositive(),
    }),
    caps: z.strictObject({
      positivePopularity: z.int().nonnegative(),
      negativePopularity: z.int().nonpositive(),
      weakConfirmation: integerScore,
      authoritativeConflict: integerScore,
      staleApplicability: integerScore,
      insufficientVeryHighEvidence: integerScore,
    }),
    componentWeights: z
      .strictObject({
        sourceEvidence: z.int().nonnegative(),
        freshness: z.int().nonnegative(),
        versionFit: z.int().nonnegative(),
      })
      .refine((value) => value.sourceEvidence + value.freshness + value.versionFit === 100, {
        message: "component weights must sum to 100",
      }),
    freshness: z.strictObject({
      timeSensitiveDocumentTypes: z.array(z.string().trim().min(1)).min(1),
      timeSensitive: z.strictObject({
        graceDays: z.int().nonnegative(),
        halfLifeDays: z.int().positive(),
      }),
      general: z.strictObject({
        graceDays: z.int().nonnegative(),
        halfLifeDays: z.int().positive(),
      }),
      unknownScore: integerScore,
      staleThreshold: integerScore,
    }),
    versionFit: z.strictObject({
      explicit: integerScore,
      general: integerScore,
      partial: integerScore,
      unknown: integerScore,
      conflicting: integerScore,
    }),
    grades: z.strictObject({
      low: integerScore,
      moderate: integerScore,
      high: integerScore,
      veryHigh: integerScore,
    }),
  })
  .superRefine((policy, context) => {
    const { low, moderate, high, veryHigh } = policy.grades;
    if (!(low < moderate && moderate < high && high < veryHigh)) {
      context.addIssue({
        code: "custom",
        message: "grade thresholds must increase from low through veryHigh",
        path: ["grades"],
      });
    }
  });

export type ScoringPolicy = z.infer<typeof scoringPolicySchema>;

export const defaultScoringPolicy: ScoringPolicy = scoringPolicySchema.parse({
  identifier: "knownpath-seed-confidence",
  version: 1,
  points: {
    groundedExtraction: 20,
    officialSolutionGuidance: 40,
    maintainerSolution: 28,
    acceptedDiscussionAnswer: 24,
    authorConfirmed: 20,
    mergedClosingPullRequest: 15,
    closedAfterSolution: 5,
    independentSourceConvergence: 15,
    authoritativeConflict: -35,
    communityConflict: -15,
    unsupportedCandidateLabel: -10,
  },
  caps: {
    positivePopularity: 6,
    negativePopularity: -6,
    weakConfirmation: 55,
    authoritativeConflict: 69,
    staleApplicability: 69,
    insufficientVeryHighEvidence: 84,
  },
  componentWeights: { sourceEvidence: 70, freshness: 20, versionFit: 10 },
  freshness: {
    timeSensitiveDocumentTypes: [
      "upgrade_guide",
      "release_note",
      "compatibility_reference",
      "migration_guide",
      "deprecation_notice",
      "breaking_change",
    ],
    timeSensitive: { graceDays: 90, halfLifeDays: 180 },
    general: { graceDays: 180, halfLifeDays: 365 },
    unknownScore: 40,
    staleThreshold: 50,
  },
  versionFit: { explicit: 100, general: 75, partial: 55, unknown: 40, conflicting: 10 },
  grades: { low: 25, moderate: 50, high: 70, veryHigh: 85 },
});

export async function loadScoringPolicy(path?: string): Promise<ScoringPolicy> {
  if (path === undefined) return defaultScoringPolicy;
  return scoringPolicySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export function scoringPolicyDigest(policy: ScoringPolicy): string {
  return sha256(stableJson(policy));
}
