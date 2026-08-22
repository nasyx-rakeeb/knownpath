import { z } from "zod";

import { createVersionedKey } from "@knownpath/domain";

export const canonicalizationPolicySchema = z.strictObject({
  identifier: z.literal("knownpath-canonicalization"),
  version: z.int().positive(),
  autoMerge: z.strictObject({
    minimumProblemSimilarity: z.number().min(0).max(1),
    minimumSolutionSimilarity: z.number().min(0).max(1),
    minimumSolutionSimilarityWithErrorIdentifier: z.number().min(0).max(1),
  }),
  review: z.strictObject({
    minimumProblemSimilarity: z.number().min(0).max(1),
    minimumSolutionSimilarity: z.number().min(0).max(1),
    semanticPriorityThreshold: z.number().min(-1).max(1),
  }),
});

export const CANONICALIZATION_POLICY = canonicalizationPolicySchema.parse({
  identifier: "knownpath-canonicalization",
  version: 1,
  autoMerge: {
    minimumProblemSimilarity: 0.72,
    minimumSolutionSimilarity: 0.78,
    minimumSolutionSimilarityWithErrorIdentifier: 0.88,
  },
  review: {
    minimumProblemSimilarity: 0.35,
    minimumSolutionSimilarity: 0.35,
    semanticPriorityThreshold: 0.82,
  },
});

export type CanonicalizationPolicy = z.infer<typeof canonicalizationPolicySchema>;

export function canonicalizationPolicyReference(policy = CANONICALIZATION_POLICY) {
  const digest = createVersionedKey([String(policy.version), JSON.stringify(policy)]).value;
  return { identifier: policy.identifier, version: policy.version, digest };
}
