import { createHash } from "node:crypto";

export const outcomePolicyV1 = {
  identifier: "knownpath-outcome-policy" as const,
  version: 1 as const,
  apiKeyPerHour: 10,
  accountPerDay: 20,
  influenceWindowDays: 30,
  graceDays: 30 as const,
  halfLifeDays: 180 as const,
  recentWindowDays: 90,
  baselineWindowDays: 365,
  decline: {
    recentEffectiveMinimum: 5,
    baselineEffectiveMinimum: 10,
    lowerBoundDrop: 0.2,
    failures: 3,
    users: 3,
  },
  safetyCorroborationUsers: 2,
} as const;

export const outcomePolicyDigest = createHash("sha256")
  .update(JSON.stringify(outcomePolicyV1), "utf8")
  .digest("hex");
