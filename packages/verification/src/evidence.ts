import type { KnownPathDatabase } from "@knownpath/database";
import type {
  CandidateExperience,
  EvidenceSignal,
  SourceItem,
  SourceItemId,
} from "@knownpath/domain";

import { sha256, stableJson } from "./digests.js";
import { parseGitHubFacts, type GitHubFacts } from "./github-metadata.js";

type CandidateReference = CandidateExperience["evidence"][number];

export interface ResolvedEvidence {
  readonly candidateDigest: string;
  readonly directReferences: readonly CandidateReference[];
  readonly githubFactsBySourceId: ReadonlyMap<SourceItemId, GitHubFacts>;
  readonly integritySignals: readonly EvidenceSignal[];
  readonly integrityValid: boolean;
  readonly sourceItems: readonly SourceItem[];
}

export async function resolveCandidateEvidence(
  database: KnownPathDatabase,
  candidate: CandidateExperience,
): Promise<ResolvedEvidence> {
  const directReferences = [...candidate.evidence, ...candidate.conflicts];
  const requestedIds = collectReferencedSourceIds(candidate);
  const initiallyLoaded = await database.repositories.sourceItems.findByIds(requestedIds);
  const roots = await loadRoots(database, initiallyLoaded);
  const sourceItems = [
    ...new Map([...initiallyLoaded, ...roots].map((item) => [item._id, item])).values(),
  ].sort((left, right) => left._id.localeCompare(right._id));
  const byId = new Map(sourceItems.map((item) => [item._id, item]));
  const integritySignals: EvidenceSignal[] = [];

  for (const id of requestedIds) {
    if (!byId.has(id)) {
      integritySignals.push(
        integrityFailure("evidence_source_missing", `Referenced source item ${id} does not exist`, [
          id,
        ]),
      );
    }
  }
  for (const item of sourceItems) {
    if (!visibilityAllows(candidate, item)) {
      integritySignals.push(
        integrityFailure(
          "evidence_visibility_mismatch",
          `Source visibility is incompatible with candidate ${candidate._id}`,
          [item._id],
        ),
      );
    }
  }
  for (const reference of directReferences) {
    const item = byId.get(reference.sourceItemId);
    if (item === undefined) continue;
    if (reference.contentDigest !== undefined && reference.contentDigest !== item.content.digest) {
      integritySignals.push(
        integrityFailure(
          "evidence_digest_mismatch",
          `Reference digest does not match immutable source item ${item._id}`,
          [item._id],
        ),
      );
    }
    if (
      reference.canonicalUrl !== undefined &&
      reference.canonicalUrl !== item.provenance.canonicalUrl
    ) {
      integritySignals.push(
        integrityFailure(
          "evidence_url_mismatch",
          `Reference URL does not match source item ${item._id}`,
          [item._id],
        ),
      );
    }
    if (reference.excerpt !== undefined && !sourceText(item).includes(reference.excerpt)) {
      integritySignals.push(
        integrityFailure(
          "evidence_excerpt_mismatch",
          `Reference excerpt was not found in source item ${item._id}`,
          [item._id],
        ),
      );
    }
  }

  if (integritySignals.length === 0) {
    integritySignals.push({
      type: "evidence_integrity",
      polarity: "neutral",
      strength: "decisive",
      verificationStatus: "verified",
      points: 0,
      reasonCode: "evidence_integrity_verified",
      explanation: `All ${String(requestedIds.length)} referenced source items resolved and direct references matched immutable source data.`,
      sourceItemIds: requestedIds.slice(0, 32),
      sourceContentDigests: initiallyLoaded.slice(0, 32).map((item) => item.content.digest),
      facts: { referencedSourceCount: requestedIds.length },
    });
  }

  return {
    candidateDigest: digestCandidate(candidate),
    directReferences,
    githubFactsBySourceId: new Map(
      sourceItems.flatMap((item) => {
        if (item.providerMetadata?.provider !== "github") return [];
        const facts = parseGitHubFacts(item.providerMetadata.payload);
        return facts === null ? [] : ([[item._id, facts]] as const);
      }),
    ),
    integritySignals,
    integrityValid: integritySignals.every((signal) => signal.verificationStatus === "verified"),
    sourceItems,
  };
}

function collectReferencedSourceIds(candidate: CandidateExperience): SourceItemId[] {
  const ids = new Set<SourceItemId>();
  for (const reference of [...candidate.evidence, ...candidate.conflicts])
    ids.add(reference.sourceItemId);
  for (const symptom of candidate.symptoms)
    for (const id of symptom.evidenceSourceItemIds) ids.add(id);
  for (const step of candidate.solutionSteps)
    for (const id of step.evidenceSourceItemIds) ids.add(id);
  for (const approach of candidate.attemptedApproaches)
    for (const id of approach.evidenceSourceItemIds) ids.add(id);
  for (const label of candidate.candidateVerificationLabels)
    for (const id of label.evidenceSourceItemIds) ids.add(id);
  for (const id of candidate.rootCause?.evidenceSourceItemIds ?? []) ids.add(id);
  return [...ids].sort();
}

async function loadRoots(
  database: KnownPathDatabase,
  items: readonly SourceItem[],
): Promise<SourceItem[]> {
  const identities = new Map<string, SourceItem>();
  for (const item of items) {
    const rootIdentity = item.provenance.rootSourceItemIdentity;
    if (rootIdentity === undefined) continue;
    const key = `${item.sourceRegistryId}:${rootIdentity}`;
    if (identities.has(key)) continue;
    const root = await database.repositories.sourceItems.findLatestBySourceIdentity(
      item.sourceRegistryId,
      rootIdentity,
    );
    if (root !== null) identities.set(key, root);
  }
  return [...identities.values()];
}

function sourceText(item: SourceItem): string {
  return item.content.text ?? item.structuredBlocks?.map((block) => block.text).join("\n") ?? "";
}

function visibilityAllows(candidate: CandidateExperience, item: SourceItem): boolean {
  if (candidate.visibility.scope !== item.visibility.scope) return false;
  if (candidate.visibility.scope === "private")
    return (
      item.visibility.scope === "private" &&
      candidate.visibility.ownerUserId === item.visibility.ownerUserId
    );
  if (candidate.visibility.scope === "team")
    return (
      item.visibility.scope === "team" &&
      candidate.visibility.workspaceId === item.visibility.workspaceId
    );
  return true;
}

function digestCandidate(candidate: CandidateExperience): string {
  return sha256(
    stableJson({
      ...candidate,
      latestAssessmentId: undefined,
      audit: { ...candidate.audit, updatedAt: candidate.audit.createdAt },
    }),
  );
}

function integrityFailure(
  reasonCode: string,
  explanation: string,
  sourceItemIds: SourceItemId[],
): EvidenceSignal {
  return {
    type: "evidence_integrity",
    polarity: "negative",
    strength: "decisive",
    verificationStatus: "rejected",
    points: -100,
    reasonCode,
    explanation,
    sourceItemIds,
    sourceContentDigests: [],
    facts: {},
  };
}
