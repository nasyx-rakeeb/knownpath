import { z } from "zod";

import {
  apiKeyIdSchema,
  auditMetadataSchema,
  knowledgeShareRequestIdSchema,
  knownPathIdSchema,
  schemaVersionSchema,
  shortStringSchema,
  timestampSchema,
  userIdSchema,
  workspaceIdSchema,
  workspaceInvitationIdSchema,
  workspaceMembershipIdSchema,
} from "./common.js";
import { contributionPayloadSchema, contributionSanitizationReportSchema } from "./feedback.js";

export const WORKSPACE_API_CONTRACT_VERSION = 1 as const;

export const workspaceStatusSchema = z.enum(["active", "archived"]);
export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);
export const workspaceMembershipStatusSchema = z.enum(["active", "removed"]);
export const workspaceInvitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "revoked",
  "expired",
]);
export const workspaceContributionScopeSchema = z.enum(["private", "team"]);

export const workspaceSchema = z.strictObject({
  _id: workspaceIdSchema,
  schemaVersion: schemaVersionSchema,
  name: shortStringSchema,
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  description: z.string().trim().min(1).max(1_000).optional(),
  status: workspaceStatusSchema,
  ownerUserId: userIdSchema,
  defaultContributionScope: workspaceContributionScopeSchema,
  audit: auditMetadataSchema,
});

export const workspaceMembershipSchema = z.strictObject({
  _id: workspaceMembershipIdSchema,
  schemaVersion: schemaVersionSchema,
  workspaceId: workspaceIdSchema,
  userId: userIdSchema,
  role: workspaceRoleSchema,
  status: workspaceMembershipStatusSchema,
  invitedByUserId: userIdSchema.optional(),
  joinedAt: timestampSchema,
  removedAt: timestampSchema.optional(),
  audit: auditMetadataSchema,
});

export const workspaceInvitationSchema = z.strictObject({
  _id: workspaceInvitationIdSchema,
  schemaVersion: schemaVersionSchema,
  workspaceId: workspaceIdSchema,
  inviterUserId: userIdSchema,
  inviteeUserId: userIdSchema,
  invitedEmail: z.email().max(320),
  role: z.enum(["admin", "member"]),
  status: workspaceInvitationStatusSchema,
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  respondedAt: timestampSchema.optional(),
  revokedAt: timestampSchema.optional(),
  expiredAt: timestampSchema.optional(),
  audit: auditMetadataSchema,
});

export const knowledgeShareRequestSchema = z.strictObject({
  _id: knowledgeShareRequestIdSchema,
  schemaVersion: schemaVersionSchema,
  sourceKnownPathId: knownPathIdSchema,
  sourceScope: z.discriminatedUnion("scope", [
    z.strictObject({ scope: z.literal("private"), ownerUserId: userIdSchema }),
    z.strictObject({ scope: z.literal("team"), workspaceId: workspaceIdSchema }),
  ]),
  requestedByUserId: userIdSchema,
  requestedByApiKeyId: apiKeyIdSchema.optional(),
  status: z.enum(["draft", "submitted", "quarantined", "rejected"]),
  publicPayload: contributionPayloadSchema,
  sanitization: contributionSanitizationReportSchema,
  publicContributionId: z.uuidv4().optional(),
  consent: z.strictObject({
    policyVersion: z.literal(1),
    confirmedAt: timestampSchema,
    confirmedByUserId: userIdSchema,
  }),
  audit: auditMetadataSchema,
});

export const publicKnowledgeShareSubmissionSchema = z.strictObject({
  payload: contributionPayloadSchema,
  consent: z.strictObject({ policyVersion: z.literal(1), confirmed: z.literal(true) }),
});

export const publicKnowledgeShareResponseSchema = z.strictObject({
  contractVersion: z.literal(WORKSPACE_API_CONTRACT_VERSION),
  shareRequestId: knowledgeShareRequestIdSchema,
  sourceKnownPathId: knownPathIdSchema,
  status: z.enum(["submitted", "quarantined"]),
  publicContributionId: z.uuidv4().optional(),
  sanitization: z.strictObject({
    status: z.enum(["clean", "sanitized", "quarantined"]),
    findingCount: z.int().nonnegative(),
  }),
});

export const workspaceCreateRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(256),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .optional(),
  description: z.string().trim().min(1).max(1_000).optional(),
  defaultContributionScope: workspaceContributionScopeSchema.default("team"),
});

export const workspaceUpdateRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().trim().min(1).max(1_000).nullable().optional(),
  defaultContributionScope: workspaceContributionScopeSchema.optional(),
});

export const workspaceIdParamsSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export const workspaceMemberParamsSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  userId: userIdSchema,
});
export const workspaceInvitationParamsSchema = z.strictObject({
  invitationId: workspaceInvitationIdSchema,
});

export const workspaceInviteRequestSchema = z.strictObject({
  email: z.email().max(320),
  role: z.enum(["admin", "member"]).default("member"),
  expiresInDays: z.int().min(1).max(30).default(7),
});

export const workspaceMembershipUpdateRequestSchema = z.strictObject({
  role: z.enum(["admin", "member"]),
});

export const workspaceSummarySchema = z.strictObject({
  id: workspaceIdSchema,
  name: shortStringSchema,
  slug: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(1_000).optional(),
  status: workspaceStatusSchema,
  role: workspaceRoleSchema,
  ownerUserId: userIdSchema,
  defaultContributionScope: workspaceContributionScopeSchema,
  memberCount: z.int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const workspaceMemberViewSchema = z.strictObject({
  userId: userIdSchema,
  displayName: shortStringSchema,
  email: z.email().max(320),
  role: workspaceRoleSchema,
  status: workspaceMembershipStatusSchema,
  joinedAt: z.iso.datetime(),
});

export const workspaceInvitationViewSchema = z.strictObject({
  id: workspaceInvitationIdSchema,
  workspaceId: workspaceIdSchema,
  workspaceName: shortStringSchema,
  inviterUserId: userIdSchema,
  inviterDisplayName: shortStringSchema,
  inviteeUserId: userIdSchema,
  invitedEmail: z.email().max(320),
  role: z.enum(["admin", "member"]),
  status: workspaceInvitationStatusSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  respondedAt: z.iso.datetime().optional(),
});

export const workspaceListResponseSchema = z.strictObject({
  contractVersion: z.literal(WORKSPACE_API_CONTRACT_VERSION),
  workspaces: z.array(workspaceSummarySchema).max(200),
  pendingInvitations: z.array(workspaceInvitationViewSchema).max(200),
});

export const workspaceDetailResponseSchema = z.strictObject({
  contractVersion: z.literal(WORKSPACE_API_CONTRACT_VERSION),
  workspace: workspaceSummarySchema,
  members: z.array(workspaceMemberViewSchema).max(500),
  invitations: z.array(workspaceInvitationViewSchema).max(500),
});

export const workspaceMutationResponseSchema = z.strictObject({
  contractVersion: z.literal(WORKSPACE_API_CONTRACT_VERSION),
  workspace: workspaceSummarySchema,
});

export const workspaceInvitationMutationResponseSchema = z.strictObject({
  contractVersion: z.literal(WORKSPACE_API_CONTRACT_VERSION),
  invitation: workspaceInvitationViewSchema,
});

export const knowledgeSearchScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("public") }),
  z.strictObject({ kind: z.literal("personal") }),
  z.strictObject({ kind: z.literal("workspace"), workspaceId: workspaceIdSchema }),
  z.strictObject({ kind: z.literal("workspace_and_public"), workspaceId: workspaceIdSchema }),
]);

export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceInvitationView = z.infer<typeof workspaceInvitationViewSchema>;
export type KnowledgeSearchScope = z.infer<typeof knowledgeSearchScopeSchema>;
export type KnowledgeShareRequest = z.infer<typeof knowledgeShareRequestSchema>;
