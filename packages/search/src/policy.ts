import { createHash } from "node:crypto";

export const retrievalPolicyV2 = {
  identifier: "knownpath-retrieval-ranking" as const,
  version: 2,
  maximum: {
    exactError: 20,
    lexical: 15,
    semantic: 12,
    metadataFit: 15,
    versionFit: 10,
    trust: 8,
    freshness: 5,
    outcomes: 15,
  },
  penalties: {
    conflict: -8,
    stale: -7,
    flagged: -12,
    incompatibleVersion: -25,
    corroboratedSafety: -12,
    outcomeDegradation: -10,
    versionOutcomeFailure: -6,
  },
  caps: { incompatibleVersion: 34, deprecated: 25 },
};

export const retrievalPolicyDigest = createHash("sha256")
  .update(JSON.stringify(retrievalPolicyV2), "utf8")
  .digest("hex");
