import type { EvidenceSignal, SourceItem } from "@knownpath/domain";

interface VerifiedSignalInput {
  readonly type: EvidenceSignal["type"];
  readonly polarity: EvidenceSignal["polarity"];
  readonly strength: EvidenceSignal["strength"];
  readonly points: number;
  readonly reasonCode: string;
  readonly explanation: string;
  readonly items: readonly SourceItem[];
  readonly facts?: Readonly<Record<string, string | number | boolean | null>>;
}

export function createVerifiedSignal(input: VerifiedSignalInput): EvidenceSignal {
  return {
    type: input.type,
    polarity: input.polarity,
    strength: input.strength,
    verificationStatus: "verified",
    points: input.points,
    reasonCode: input.reasonCode,
    explanation: input.explanation,
    sourceItemIds: input.items.slice(0, 32).map((item) => item._id),
    sourceContentDigests: input.items.slice(0, 32).map((item) => item.content.digest),
    observedAt: newestObservedAt(input.items),
    facts: { ...input.facts },
  };
}

function newestObservedAt(items: readonly SourceItem[]): Date | undefined {
  if (items.length === 0) return undefined;
  return new Date(Math.max(...items.map((item) => item.provenance.observedAt.getTime())));
}
