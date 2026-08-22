import { z } from "zod";

import {
  agentContributionIdSchema,
  agentOutcomeIdSchema,
  auditMetadataSchema,
  knownPathIdSchema,
  moderationStateSchema,
  nonEmptyStringSchema,
  schemaVersionSchema,
  shortStringSchema,
  sourceItemIdSchema,
  userIdSchema,
  versionedKeySchema,
  visibilitySchema,
} from "./common.js";

export const contributorIdentitySchema = z
  .strictObject({
    kind: z.enum(["user", "agent", "anonymous"]),
    userId: userIdSchema.optional(),
    agentIdentifier: shortStringSchema.optional(),
  })
  .superRefine((identity, context) => {
    if (identity.kind === "user" && identity.userId === undefined) {
      context.addIssue({
        code: "custom",
        message: "user contributor requires userId",
        path: ["userId"],
      });
    }

    if (identity.kind === "agent" && identity.agentIdentifier === undefined) {
      context.addIssue({
        code: "custom",
        message: "agent contributor requires agentIdentifier",
        path: ["agentIdentifier"],
      });
    }
  });

export const contributionStatusSchema = z.enum(["pending", "accepted", "rejected", "superseded"]);

export const agentContributionSchema = z.strictObject({
  _id: agentContributionIdSchema,
  schemaVersion: schemaVersionSchema,
  contributor: contributorIdentitySchema,
  knownPathId: knownPathIdSchema.optional(),
  kind: z.enum(["new_lesson", "correction", "additional_evidence", "freshness_update"]),
  deduplicationKey: versionedKeySchema,
  summary: nonEmptyStringSchema,
  proposedContent: z.string().trim().min(1).max(100_000),
  evidenceSourceItemIds: z.array(sourceItemIdSchema).max(128),
  status: contributionStatusSchema,
  visibility: visibilitySchema,
  moderation: moderationStateSchema,
  audit: auditMetadataSchema,
});

export const agentOutcomeValueSchema = z.enum([
  "helpful",
  "not_helpful",
  "partially_helpful",
  "unknown",
]);

export const agentOutcomeSchema = z.strictObject({
  _id: agentOutcomeIdSchema,
  schemaVersion: schemaVersionSchema,
  knownPathId: knownPathIdSchema,
  reporter: contributorIdentitySchema,
  outcome: agentOutcomeValueSchema,
  failureCategory: shortStringSchema.optional(),
  notes: z.string().trim().min(1).max(10_000).optional(),
  context: z.strictObject({
    agentName: shortStringSchema.optional(),
    agentVersion: shortStringSchema.optional(),
    taskCategory: shortStringSchema.optional(),
    environment: z.record(z.string(), z.string().max(1_000)).default({}),
  }),
  deduplicationKey: versionedKeySchema,
  visibility: visibilitySchema,
  audit: auditMetadataSchema,
});

export type AgentContribution = z.infer<typeof agentContributionSchema>;
export type AgentOutcome = z.infer<typeof agentOutcomeSchema>;
