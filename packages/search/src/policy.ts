import { createHash } from "node:crypto";

export const retrievalPolicyV1 = {
  identifier: "knownpath-retrieval-ranking" as const,
  version: 1,
  maximum: {
    exactError: 25,
    lexical: 15,
    semantic: 15,
    metadataFit: 15,
    versionFit: 10,
    trust: 12,
    freshness: 5,
    outcomes: 3,
  },
  penalties: { conflict: -8, stale: -7, flagged: -12, incompatibleVersion: -25 },
  caps: { incompatibleVersion: 34, deprecated: 25 },
};

export const retrievalPolicyDigest = createHash("sha256")
  .update(JSON.stringify(retrievalPolicyV1), "utf8")
  .digest("hex");
