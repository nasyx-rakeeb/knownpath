import type { CandidateExperience, EvidenceSignal, SourceItem } from "@knownpath/domain";

import type { ResolvedEvidence } from "./evidence.js";
import { isCurrentRepositoryAuthority, reactionCounts } from "./github-metadata.js";
import type { ScoringPolicy } from "./policy.js";
import { createVerifiedSignal } from "./signal-factory.js";

interface SignalContext {
  readonly candidate: CandidateExperience;
  readonly resolved: ResolvedEvidence;
  readonly policy: ScoringPolicy;
  readonly sourceById: ReadonlyMap<string, SourceItem>;
  readonly supporting: readonly SourceItem[];
}

export function verifyEvidenceSignals(
  candidate: CandidateExperience,
  resolved: ResolvedEvidence,
  policy: ScoringPolicy,
): EvidenceSignal[] {
  const supportingIds = new Set(
    candidate.evidence
      .filter((reference) =>
        ["supports_solution", "verifies_outcome"].includes(reference.relationship),
      )
      .map((reference) => reference.sourceItemId),
  );
  const sourceById = new Map(resolved.sourceItems.map((item) => [item._id, item]));
  const context: SignalContext = {
    candidate,
    resolved,
    policy,
    sourceById,
    supporting: [...supportingIds].flatMap((id) => sourceById.get(id) ?? []),
  };
  const confirmation = confirmationSignals(context);
  const accumulated = [
    ...confirmation.signals,
    ...threadSignals(context),
    ...popularityAndConvergenceSignals(context),
    ...conflictSignals(context),
    ...labelSignals(context, confirmation),
  ];
  return [...accumulated, ...weakConfirmationSignal(context, accumulated)];
}

interface ConfirmationSignals {
  readonly signals: readonly EvidenceSignal[];
  readonly official: readonly SourceItem[];
  readonly maintainers: readonly SourceItem[];
  readonly authorConfirmations: readonly SourceItem[];
}

function confirmationSignals(context: SignalContext): ConfirmationSignals {
  const { candidate, resolved, policy, sourceById, supporting } = context;
  const signals: EvidenceSignal[] = [];
  if (supporting.length > 0) {
    signals.push(
      createVerifiedSignal({
        type: "grounded_extraction",
        polarity: "positive",
        strength: "moderate",
        points: policy.points.groundedExtraction,
        reasonCode: "grounded_extraction",
        explanation:
          "The candidate solution has verified references to immutable source snapshots.",
        items: supporting,
      }),
    );
  }
  const official = supporting.filter(
    (item) => item.sourceQuality?.authority === "first_party_official",
  );
  if (official.length > 0) {
    signals.push(
      createVerifiedSignal({
        type: "official_solution_guidance",
        polarity: "positive",
        strength: "decisive",
        points: policy.points.officialSolutionGuidance,
        reasonCode: "official_solution_guidance",
        explanation: "First-party official material directly supports the candidate solution.",
        items: official,
      }),
    );
  }
  const maintainers = supporting.filter((item) =>
    isCurrentRepositoryAuthority(resolved.githubFactsBySourceId.get(item._id)?.authorAssociation),
  );
  if (maintainers.length > 0) {
    signals.push(
      createVerifiedSignal({
        type: "maintainer_solution",
        polarity: "positive",
        strength: "strong",
        points: policy.points.maintainerSolution,
        reasonCode: "maintainer_solution",
        explanation:
          "A solution-bearing GitHub item was authored with OWNER, MEMBER, or COLLABORATOR association.",
        items: maintainers,
      }),
    );
  }
  const accepted = supporting.filter((item) => isAcceptedAnswer(item, resolved));
  if (accepted.length > 0) {
    signals.push(
      createVerifiedSignal({
        type: "accepted_discussion_answer",
        polarity: "positive",
        strength: "strong",
        points: policy.points.acceptedDiscussionAnswer,
        reasonCode: "accepted_discussion_answer",
        explanation: "GitHub marks a referenced discussion comment as the selected answer.",
        items: accepted,
      }),
    );
  }
  const authorConfirmations = candidate.candidateVerificationLabels
    .filter((label) => label.label === "author_confirmed")
    .flatMap((label) => label.evidenceSourceItemIds)
    .flatMap((id) => sourceById.get(id) ?? [])
    .filter((item) => isAuthorConfirmation(item, candidate, resolved));
  if (authorConfirmations.length > 0) {
    signals.push(
      createVerifiedSignal({
        type: "author_confirmed",
        polarity: "positive",
        strength: "strong",
        points: policy.points.authorConfirmed,
        reasonCode: "author_confirmed",
        explanation: "The original thread author supplied a referenced outcome confirmation.",
        items: authorConfirmations,
      }),
    );
  }
  return { signals, official, maintainers, authorConfirmations };
}

function threadSignals(context: SignalContext): EvidenceSignal[] {
  const { resolved, policy, supporting } = context;
  const signals: EvidenceSignal[] = [];
  const roots = resolved.sourceItems.filter((item) =>
    ["issue", "discussion"].includes(item.itemType),
  );
  const mergedRoots = roots.filter(
    (item) =>
      resolved.githubFactsBySourceId
        .get(item._id)
        ?.closingPullRequests?.some((pullRequest) => pullRequest.merged) === true,
  );
  if (mergedRoots.length > 0) {
    signals.push(
      createVerifiedSignal({
        type: "merged_closing_pull_request",
        polarity: "positive",
        strength: "strong",
        points: policy.points.mergedClosingPullRequest,
        reasonCode: "merged_closing_pull_request",
        explanation: "GitHub reports a merged pull request linked as closing the issue.",
        items: mergedRoots,
      }),
    );
  }
  const temporalSolutions = supporting.filter((item) =>
    ["issue_comment", "discussion_comment"].includes(item.itemType),
  );
  const earliestSolution = temporalSolutions.reduce<Date | undefined>((earliest, item) => {
    const at = item.provenance.publishedAt ?? item.provenance.observedAt;
    return earliest === undefined || at < earliest ? at : earliest;
  }, undefined);
  const closedAfter = roots.filter((item) => {
    const closedAt = resolved.githubFactsBySourceId.get(item._id)?.closedAt;
    return (
      earliestSolution !== undefined && closedAt != null && new Date(closedAt) > earliestSolution
    );
  });
  if (closedAfter.length > 0) {
    signals.push(
      createVerifiedSignal({
        type: "closed_after_solution",
        polarity: "positive",
        strength: "weak",
        points: policy.points.closedAfterSolution,
        reasonCode: "closed_after_solution",
        explanation:
          "The thread closed after the proposed solution; this is temporal support, not proof of causality.",
        items: closedAfter,
      }),
    );
  }
  return signals;
}

function popularityAndConvergenceSignals(context: SignalContext): EvidenceSignal[] {
  const { resolved, policy, supporting } = context;
  const signals: EvidenceSignal[] = [];
  const reactions = supporting.reduce(
    (total, item) => {
      const facts = resolved.githubFactsBySourceId.get(item._id);
      if (facts === undefined) return total;
      const counts = reactionCounts(facts);
      return {
        positive: total.positive + counts.positive,
        negative: total.negative + counts.negative,
      };
    },
    { positive: 0, negative: 0 },
  );
  if (reactions.positive > 0) {
    signals.push(
      createVerifiedSignal({
        type: "solution_popularity",
        polarity: "positive",
        strength: "weak",
        points: Math.min(
          policy.caps.positivePopularity,
          Math.floor(Math.log2(reactions.positive + 1) * 2),
        ),
        reasonCode: "solution_positive_reactions",
        explanation:
          "Positive reactions on solution-bearing items are recorded only as a capped popularity signal.",
        items: supporting,
        facts: { count: reactions.positive },
      }),
    );
  }
  if (reactions.negative > 0) {
    signals.push(
      createVerifiedSignal({
        type: "negative_popularity",
        polarity: "negative",
        strength: "weak",
        points: Math.max(
          policy.caps.negativePopularity,
          -Math.floor(Math.log2(reactions.negative + 1) * 2),
        ),
        reasonCode: "solution_negative_reactions",
        explanation:
          "Negative reactions on solution-bearing items are recorded only as a capped popularity signal.",
        items: supporting,
        facts: { count: reactions.negative },
      }),
    );
  }
  const independentRoots = new Set(
    supporting.map(
      (item) =>
        `${item.sourceRegistryId}:${item.provenance.rootSourceItemIdentity ?? item.provenance.sourceItemIdentity}`,
    ),
  );
  if (independentRoots.size >= 2) {
    signals.push(
      createVerifiedSignal({
        type: "independent_source_convergence",
        polarity: "positive",
        strength: "moderate",
        points: Math.min(
          policy.points.independentSourceConvergence,
          (independentRoots.size - 1) * 5,
        ),
        reasonCode: "independent_source_convergence",
        explanation: `${String(independentRoots.size)} independent source records support the solution.`,
        items: supporting,
        facts: { independentSourceCount: independentRoots.size },
      }),
    );
  }
  return signals;
}

function conflictSignals(context: SignalContext): EvidenceSignal[] {
  const { candidate, policy, sourceById } = context;
  const items = [
    ...new Map(
      candidate.conflicts.flatMap((conflict) => {
        const item = sourceById.get(conflict.sourceItemId);
        return item === undefined ? [] : [[item._id, item] as const];
      }),
    ).values(),
  ];
  return items.map((item) => {
    const authoritative = ["first_party_official", "maintainer"].includes(
      item.sourceQuality?.authority ?? "",
    );
    return createVerifiedSignal({
      type: authoritative ? "authoritative_conflict" : "community_conflict",
      polarity: "negative",
      strength: authoritative ? "strong" : "moderate",
      points: authoritative ? policy.points.authoritativeConflict : policy.points.communityConflict,
      reasonCode: authoritative ? "authoritative_conflict" : "community_conflict",
      explanation: `${authoritative ? "Authoritative" : "Community"} source evidence conflicts with the candidate.`,
      items: [item],
    });
  });
}

function labelSignals(context: SignalContext, confirmation: ConfirmationSignals): EvidenceSignal[] {
  const { candidate, policy, sourceById } = context;
  const verifiedLabels = new Set<string>();
  if (confirmation.official.length > 0) verifiedLabels.add("official_doc_supported");
  if (confirmation.maintainers.length > 0) verifiedLabels.add("maintainer_confirmed");
  if (confirmation.authorConfirmations.length > 0) verifiedLabels.add("author_confirmed");
  const unsupported = [
    ...new Map(
      candidate.candidateVerificationLabels
        .filter((item) => !verifiedLabels.has(item.label))
        .map((item) => [item.label, item] as const),
    ).values(),
  ];
  return unsupported.map((label) =>
    createVerifiedSignal({
      type: "unsupported_candidate_label",
      polarity: "negative",
      strength: "moderate",
      points: policy.points.unsupportedCandidateLabel,
      reasonCode: "unsupported_candidate_label",
      explanation: `The model-suggested ${label.label} label could not be verified deterministically.`,
      items: label.evidenceSourceItemIds.flatMap((id) => sourceById.get(id) ?? []),
      facts: { label: label.label },
    }),
  );
}

function weakConfirmationSignal(
  context: SignalContext,
  confirmationSignals: readonly EvidenceSignal[],
): EvidenceSignal[] {
  if (
    confirmationSignals.some(
      (item) => item.polarity === "positive" && ["strong", "decisive"].includes(item.strength),
    )
  )
    return [];
  return [
    createVerifiedSignal({
      type: "weak_confirmation",
      polarity: "neutral",
      strength: "moderate",
      points: 0,
      reasonCode: "weak_confirmation",
      explanation:
        "No decisive or strong confirmation signal was verified; source-evidence confidence is capped.",
      items: context.supporting,
    }),
  ];
}

function isAcceptedAnswer(item: SourceItem, resolved: ResolvedEvidence): boolean {
  const facts = resolved.githubFactsBySourceId.get(item._id);
  if (facts?.isAnswer !== true) return false;
  const root = findRoot(item, resolved.sourceItems);
  const rootFacts = root === undefined ? undefined : resolved.githubFactsBySourceId.get(root._id);
  return rootFacts?.answerNodeId === facts.object.nodeId;
}

function isAuthorConfirmation(
  item: SourceItem,
  candidate: CandidateExperience,
  resolved: ResolvedEvidence,
): boolean {
  const root = findRoot(item, resolved.sourceItems);
  return (
    root?.provenance.author !== undefined &&
    root.provenance.author === item.provenance.author &&
    candidate.evidence.some(
      (reference) =>
        reference.sourceItemId === item._id && reference.relationship === "verifies_outcome",
    )
  );
}

function findRoot(item: SourceItem, items: readonly SourceItem[]): SourceItem | undefined {
  return items.find(
    (candidateRoot) =>
      candidateRoot.sourceRegistryId === item.sourceRegistryId &&
      candidateRoot.provenance.sourceItemIdentity === item.provenance.rootSourceItemIdentity,
  );
}
