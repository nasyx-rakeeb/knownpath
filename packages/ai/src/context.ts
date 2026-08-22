import type { KnownPathDatabase } from "@knownpath/database";
import {
  type ExtractionStrategy,
  type SourceItem,
  type SourceRegistry,
  type Visibility,
} from "@knownpath/domain";

import { sha256, stableJson } from "./digests.js";
import { getPromptBundle } from "./prompts.js";

export const EXTRACTION_CONTEXT_VERSION = 1;

export interface ExtractionContext {
  readonly contextDigest: string;
  readonly estimatedInputTokens: number;
  readonly input: string;
  readonly sourceItems: readonly SourceItem[];
  readonly sourceRegistry: SourceRegistry;
  readonly strategy: ExtractionStrategy;
  readonly target: SourceItem;
  readonly visibility: readonly Visibility[];
}

export class ExtractionContextError extends Error {
  public constructor(
    public readonly code:
      | "extraction_target_not_supported"
      | "extraction_context_too_large"
      | "extraction_root_missing",
    message: string,
  ) {
    super(message);
  }
}

export async function assembleExtractionContext(
  database: KnownPathDatabase,
  requestedTarget: SourceItem,
  maxEstimatedInputTokens: number,
): Promise<ExtractionContext> {
  const registry = await database.repositories.sourceRegistries.findById(
    requestedTarget.sourceRegistryId,
  );
  if (registry === null)
    throw new ExtractionContextError("extraction_root_missing", "Source registry not found");

  const { target, candidates, strategy } = await resolveTarget(database, requestedTarget);
  const prefix = "EVIDENCE_JSON\n";
  const promptEstimatedTokens = Math.ceil(getPromptBundle(strategy).systemInstruction.length / 4);
  const budgetCharacters = (maxEstimatedInputTokens - promptEstimatedTokens) * 4;
  if (budgetCharacters <= 0) {
    throw new ExtractionContextError(
      "extraction_context_too_large",
      "Configured input budget cannot fit the versioned extraction instructions",
    );
  }
  const prioritized = prioritize(target, candidates);
  const selected: SourceItem[] = [];

  for (const item of prioritized) {
    const proposed = [...selected, item];
    const serialized = prefix + stableJson(createEvidenceEnvelope(registry, target, proposed));
    if (serialized.length <= budgetCharacters) {
      selected.push(item);
      continue;
    }
    if (item._id === target._id || isHighSignalAnchor(item, target)) {
      throw new ExtractionContextError(
        "extraction_context_too_large",
        `Target ${target._id} cannot fit without truncating a root or high-signal confirmation`,
      );
    }
  }

  const input =
    prefix + stableJson(createEvidenceEnvelope(registry, target, chronological(selected)));
  return {
    contextDigest: sha256(input),
    estimatedInputTokens: promptEstimatedTokens + Math.ceil(input.length / 4),
    input,
    sourceItems: chronological(selected),
    sourceRegistry: registry,
    strategy,
    target,
    visibility: [
      registry.visibility,
      requestedTarget.visibility,
      ...selected.map((item) => item.visibility),
    ],
  };
}

async function resolveTarget(
  database: KnownPathDatabase,
  requested: SourceItem,
): Promise<{ target: SourceItem; candidates: SourceItem[]; strategy: ExtractionStrategy }> {
  if (["documentation_page", "release_note"].includes(requested.itemType)) {
    return { target: requested, candidates: [requested], strategy: "official_document" };
  }
  if (["issue", "discussion"].includes(requested.itemType)) {
    const candidates = await database.repositories.sourceItems.listLatestForRoot(
      requested.sourceRegistryId,
      requested.provenance.sourceItemIdentity,
    );
    return { target: requested, candidates, strategy: "github_thread" };
  }
  if (["issue_comment", "discussion_comment"].includes(requested.itemType)) {
    const rootIdentity = requested.provenance.rootSourceItemIdentity;
    if (rootIdentity === undefined) {
      throw new ExtractionContextError("extraction_root_missing", "Comment has no root identity");
    }
    const root = await database.repositories.sourceItems.findLatestBySourceIdentity(
      requested.sourceRegistryId,
      rootIdentity,
    );
    if (root === null)
      throw new ExtractionContextError("extraction_root_missing", "Thread root not found");
    const candidates = await database.repositories.sourceItems.listLatestForRoot(
      requested.sourceRegistryId,
      rootIdentity,
    );
    return { target: root, candidates, strategy: "github_thread" };
  }
  throw new ExtractionContextError(
    "extraction_target_not_supported",
    `Source item type ${requested.itemType} is not an extraction target`,
  );
}

function prioritize(root: SourceItem, items: readonly SourceItem[]): SourceItem[] {
  const unique = new Map(items.map((item) => [item._id, item]));
  unique.set(root._id, root);
  return [...unique.values()].sort((left, right) => score(right, root) - score(left, root));
}

function score(item: SourceItem, root: SourceItem): number {
  if (item._id === root._id) return 1_000_000;
  const payload = item.providerMetadata?.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return 0;
  const metadata = payload as Record<string, unknown>;
  let value = metadata["isAnswer"] === true ? 100_000 : 0;
  if (["OWNER", "MEMBER", "COLLABORATOR"].includes(String(metadata["authorAssociation"]))) {
    value += 50_000;
  }
  if (root.provenance.author !== undefined && item.provenance.author === root.provenance.author) {
    value += 25_000;
  }
  const reactions = metadata["reactionSummary"];
  if (reactions !== null && typeof reactions === "object" && !Array.isArray(reactions)) {
    value += Object.values(reactions).reduce<number>(
      (sum, count) => sum + (typeof count === "number" ? count : 0),
      0,
    );
  }
  return value;
}

function isHighSignalAnchor(item: SourceItem, root: SourceItem): boolean {
  const payload = item.providerMetadata?.payload;
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const metadata = payload as Record<string, unknown>;
    if (metadata["isAnswer"] === true) return true;
    if (["OWNER", "MEMBER", "COLLABORATOR"].includes(String(metadata["authorAssociation"]))) {
      return true;
    }
  }
  return root.provenance.author !== undefined && item.provenance.author === root.provenance.author;
}

function chronological(items: readonly SourceItem[]): SourceItem[] {
  return [...items].sort((left, right) => {
    if (["issue", "discussion"].includes(left.itemType)) return -1;
    if (["issue", "discussion"].includes(right.itemType)) return 1;
    return (
      (left.provenance.publishedAt ?? left.capturedAt).getTime() -
      (right.provenance.publishedAt ?? right.capturedAt).getTime()
    );
  });
}

function createEvidenceEnvelope(
  registry: SourceRegistry,
  target: SourceItem,
  items: readonly SourceItem[],
): unknown {
  return {
    contextVersion: EXTRACTION_CONTEXT_VERSION,
    registry: {
      id: registry._id,
      kind: registry.kind,
      name: registry.name,
      canonicalUrl: registry.canonicalUrl,
      ecosystemHints: registry.ecosystemHints,
    },
    targetSourceItemId: target._id,
    items: items.map((item) => ({
      sourceItemId: item._id,
      itemType: item.itemType,
      title: item.title ?? null,
      canonicalUrl: item.provenance.canonicalUrl,
      sourceIdentity: item.provenance.sourceItemIdentity,
      rootIdentity: item.provenance.rootSourceItemIdentity ?? null,
      author: item.provenance.author ?? null,
      publishedAt: item.provenance.publishedAt?.toISOString() ?? null,
      observedAt: item.provenance.observedAt.toISOString(),
      sourceQuality: item.sourceQuality ?? null,
      documentMetadata: item.documentMetadata ?? null,
      providerFacts: item.providerMetadata?.payload ?? null,
      contentDigest: item.content.digest,
      text: item.structuredBlocks ?? item.content.text ?? "",
    })),
  };
}
