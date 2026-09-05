import type { AgentContributionV2 } from "@knownpath/domain";

export type ContributionCanonicalizationRoute =
  | { readonly mode: "discover_novel" }
  | { readonly mode: "support_existing"; readonly alternativeSolution: boolean }
  | { readonly mode: "conflict_existing" };

export function contributionCanonicalizationRoute(
  contribution: AgentContributionV2,
): ContributionCanonicalizationRoute {
  if (contribution.relationship === "novel") return { mode: "discover_novel" };
  if (contribution.relationship === "correction" || contribution.relationship === "conflict")
    return { mode: "conflict_existing" };
  return {
    mode: "support_existing",
    alternativeSolution: contribution.relationship === "variant",
  };
}

export function contributionCanonicalizationJobKey(
  contribution: AgentContributionV2,
): readonly string[] {
  const candidateId = contribution.processing.candidateExperienceId;
  if (candidateId === undefined)
    throw new Error("Contribution requires a candidate before canonicalization can be scheduled");
  return contribution.processing.stage === "failed"
    ? [
        "approved-contribution-canonicalization-recovery-v1",
        contribution._id,
        candidateId,
        contribution.processing.canonicalizationStepId ?? "initial",
      ]
    : ["approved-contribution-canonicalization-v1", contribution._id, candidateId];
}
