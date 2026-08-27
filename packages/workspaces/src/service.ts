import { randomBytes } from "node:crypto";

import { type AuditService } from "@knownpath/auth";
import type { KnownPathDatabase } from "@knownpath/database";
import {
  CURRENT_SCHEMA_VERSION,
  WORKSPACE_API_CONTRACT_VERSION,
  createWorkspaceId,
  createWorkspaceInvitationId,
  createWorkspaceMembershipId,
  workspaceCreateRequestSchema,
  workspaceInviteRequestSchema,
  workspaceMembershipUpdateRequestSchema,
  workspaceUpdateRequestSchema,
  type UserId,
  type AuditEventType,
  type AuditTarget,
  type Workspace,
  type WorkspaceId,
  type WorkspaceInvitation,
  type WorkspaceInvitationId,
  type WorkspaceInvitationView,
  type WorkspaceMembership,
  type WorkspaceRole,
  type WorkspaceSummary,
} from "@knownpath/domain";

import { WorkspaceError } from "./errors.js";

const ROLE_WEIGHT: Readonly<Record<WorkspaceRole, number>> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export interface WorkspaceRequestContext {
  readonly requestId?: string;
  readonly ipAddress?: string;
}

export class WorkspaceService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly audit: AuditService,
  ) {}

  public async create(userId: UserId, input: unknown, context: WorkspaceRequestContext) {
    const request = workspaceCreateRequestSchema.parse(input);
    const now = new Date();
    const workspace: Workspace = {
      _id: createWorkspaceId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      name: request.name,
      slug: request.slug ?? (await this.availableSlug(request.name)),
      ...(request.description === undefined ? {} : { description: request.description }),
      status: "active",
      ownerUserId: userId,
      defaultContributionScope: request.defaultContributionScope,
      audit: {
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    };
    const created = await this.database.repositories.workspaces.createIfSlugAvailable(workspace);
    if (created === null)
      throw new WorkspaceError(
        "workspace_slug_conflict",
        "That workspace slug is already in use",
        409,
      );
    const membership: WorkspaceMembership = {
      _id: createWorkspaceMembershipId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      workspaceId: created._id,
      userId,
      role: "owner",
      status: "active",
      joinedAt: now,
      audit: {
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    };
    const owner = await this.database.repositories.workspaceMemberships.createIfAbsent(membership);
    if (owner === null) throw new Error("Workspace owner membership could not be created");
    await this.record("workspace.created", userId, "workspace", created._id, context, {
      role: "owner",
    });
    return this.summary(created, owner, 1);
  }

  public async list(userId: UserId) {
    await this.expireDueInvitations();
    const memberships =
      await this.database.repositories.workspaceMemberships.listActiveByUser(userId);
    const workspaces = await this.database.repositories.workspaces.findManyByIds(
      memberships.map((membership) => membership.workspaceId),
    );
    const membershipByWorkspace = new Map(
      memberships.map((membership) => [membership.workspaceId, membership]),
    );
    const summaries = await Promise.all(
      workspaces.map(async (workspace) => {
        const membership = membershipByWorkspace.get(workspace._id);
        if (membership === undefined) throw new Error("Workspace membership projection mismatch");
        const members = await this.database.repositories.workspaceMemberships.listActiveByWorkspace(
          workspace._id,
        );
        return this.summary(workspace, membership, members.length);
      }),
    );
    const invitations =
      await this.database.repositories.workspaceInvitations.listPendingByInvitee(userId);
    return {
      contractVersion: WORKSPACE_API_CONTRACT_VERSION,
      workspaces: summaries.sort((left, right) => left.name.localeCompare(right.name)),
      pendingInvitations: await Promise.all(
        invitations.map((invite) => this.invitationView(invite)),
      ),
    };
  }

  public async detail(workspaceId: WorkspaceId, userId: UserId) {
    await this.expireDueInvitations();
    const { workspace, membership } = await this.requireMembership(workspaceId, userId, "member");
    const memberships =
      await this.database.repositories.workspaceMemberships.listActiveByWorkspace(workspaceId);
    const users = await Promise.all(
      memberships.map((entry) => this.database.repositories.users.findById(entry.userId)),
    );
    const members = memberships.map((entry, index) => {
      const user = users[index];
      if (user === null || user === undefined) throw new Error("Workspace member user is missing");
      return {
        userId: user._id,
        displayName: user.displayName,
        email: user.email,
        role: entry.role,
        status: entry.status,
        joinedAt: entry.joinedAt.toISOString(),
      };
    });
    const invitations =
      ROLE_WEIGHT[membership.role] >= ROLE_WEIGHT.admin
        ? await this.database.repositories.workspaceInvitations.listByWorkspace(workspaceId)
        : [];
    return {
      contractVersion: WORKSPACE_API_CONTRACT_VERSION,
      workspace: this.summary(workspace, membership, memberships.length),
      members,
      invitations: await Promise.all(invitations.map((invite) => this.invitationView(invite))),
    };
  }

  public async update(
    workspaceId: WorkspaceId,
    userId: UserId,
    input: unknown,
    context: WorkspaceRequestContext,
  ) {
    const request = workspaceUpdateRequestSchema.parse(input);
    const { membership } = await this.requireMembership(workspaceId, userId, "admin");
    const values = {
      ...(request.name === undefined ? {} : { name: request.name }),
      ...(request.description === undefined
        ? {}
        : request.description === null
          ? { description: null }
          : { description: request.description }),
      ...(request.defaultContributionScope === undefined
        ? {}
        : { defaultContributionScope: request.defaultContributionScope }),
    };
    const updated = await this.database.repositories.workspaces.updateSettings(workspaceId, values);
    if (updated === null) throw workspaceNotFound();
    await this.record("workspace.updated", userId, "workspace", workspaceId, context);
    const members =
      await this.database.repositories.workspaceMemberships.listActiveByWorkspace(workspaceId);
    return this.summary(updated, membership, members.length);
  }

  public async invite(
    workspaceId: WorkspaceId,
    inviterUserId: UserId,
    input: unknown,
    context: WorkspaceRequestContext,
  ): Promise<WorkspaceInvitationView> {
    const request = workspaceInviteRequestSchema.parse(input);
    await this.requireMembership(workspaceId, inviterUserId, "admin");
    const normalizedEmail = request.email.trim().toLowerCase();
    const invitee = await this.database.repositories.users.findByNormalizedEmail(normalizedEmail);
    if (invitee === null || invitee.status !== "active")
      throw new WorkspaceError(
        "workspace_invitee_not_found",
        "Invitations are available only for an existing active KnownPath account",
        404,
      );
    if (invitee._id === inviterUserId)
      throw new WorkspaceError(
        "workspace_membership_conflict",
        "You cannot invite yourself to this workspace",
        409,
      );
    if (
      (await this.database.repositories.workspaceMemberships.findActive(
        workspaceId,
        invitee._id,
      )) !== null
    )
      throw new WorkspaceError(
        "workspace_membership_conflict",
        "This user is already a workspace member",
        409,
      );
    await this.expireDueInvitations();
    if (
      (await this.database.repositories.workspaceInvitations.findPending(
        workspaceId,
        invitee._id,
      )) !== null
    )
      throw new WorkspaceError(
        "workspace_invitation_conflict",
        "An active invitation already exists for this user",
        409,
      );
    const now = new Date();
    const invitation: WorkspaceInvitation = {
      _id: createWorkspaceInvitationId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      workspaceId,
      inviterUserId,
      inviteeUserId: invitee._id,
      invitedEmail: invitee.normalizedEmail,
      role: request.role,
      status: "pending",
      createdAt: now,
      expiresAt: new Date(now.getTime() + request.expiresInDays * 86_400_000),
      audit: {
        createdAt: now,
        updatedAt: now,
        createdByUserId: inviterUserId,
        updatedByUserId: inviterUserId,
      },
    };
    const created = await this.database.repositories.workspaceInvitations.createPending(invitation);
    if (created === null)
      throw new WorkspaceError(
        "workspace_invitation_conflict",
        "An active invitation already exists for this user",
        409,
      );
    await this.record(
      "workspace.invitation_created",
      inviterUserId,
      "workspace_invitation",
      created._id,
      context,
      {
        workspaceId,
        role: created.role,
      },
    );
    return this.invitationView(created);
  }

  public async accept(
    invitationId: WorkspaceInvitationId,
    userId: UserId,
    context: WorkspaceRequestContext,
  ): Promise<WorkspaceInvitationView> {
    const invitation = await this.database.repositories.workspaceInvitations.findById(invitationId);
    if (
      invitation === null ||
      invitation.inviteeUserId !== userId ||
      invitation.status !== "pending"
    )
      throw invitationNotFound();
    const invitee = await this.database.repositories.users.findById(userId);
    if (invitee === null || invitee.normalizedEmail !== invitation.invitedEmail)
      throw new WorkspaceError(
        "workspace_invitation_email_mismatch",
        "This invitation no longer matches the account email",
        403,
      );
    const now = new Date();
    if (invitation.expiresAt <= now) {
      const expired = await this.database.repositories.workspaceInvitations.transition(
        invitationId,
        userId,
        "expired",
        now,
      );
      if (expired !== null)
        await this.record(
          "workspace.invitation_expired",
          userId,
          "workspace_invitation",
          invitationId,
          context,
          {
            workspaceId: invitation.workspaceId,
          },
        );
      throw new WorkspaceError(
        "workspace_invitation_expired",
        "This workspace invitation has expired",
        409,
      );
    }
    const workspace = await this.database.repositories.workspaces.findById(invitation.workspaceId);
    if (workspace === null || workspace.status !== "active") throw workspaceNotFound();
    if (
      (await this.database.repositories.workspaceMemberships.findActive(
        invitation.workspaceId,
        userId,
      )) !== null
    )
      throw new WorkspaceError(
        "workspace_membership_conflict",
        "This user is already a workspace member",
        409,
      );
    const accepted = await this.database.repositories.workspaceInvitations.transition(
      invitationId,
      userId,
      "accepted",
      now,
    );
    if (accepted === null) throw invitationNotFound();
    const membership: WorkspaceMembership = {
      _id: createWorkspaceMembershipId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role,
      status: "active",
      invitedByUserId: invitation.inviterUserId,
      joinedAt: now,
      audit: {
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    };
    const created =
      await this.database.repositories.workspaceMemberships.createIfAbsent(membership);
    if (created === null) throw new Error("Accepted invitation membership could not be created");
    await this.record(
      "workspace.invitation_accepted",
      userId,
      "workspace_invitation",
      invitationId,
      context,
      {
        workspaceId: invitation.workspaceId,
        role: invitation.role,
      },
    );
    return this.invitationView(accepted);
  }

  public async reject(
    invitationId: WorkspaceInvitationId,
    userId: UserId,
    context: WorkspaceRequestContext,
  ) {
    const rejected = await this.database.repositories.workspaceInvitations.transition(
      invitationId,
      userId,
      "rejected",
    );
    if (rejected === null) throw invitationNotFound();
    await this.record(
      "workspace.invitation_rejected",
      userId,
      "workspace_invitation",
      invitationId,
      context,
      {
        workspaceId: rejected.workspaceId,
      },
    );
    return this.invitationView(rejected);
  }

  public async revokeInvitation(
    invitationId: WorkspaceInvitationId,
    userId: UserId,
    context: WorkspaceRequestContext,
  ) {
    const invitation = await this.database.repositories.workspaceInvitations.findById(invitationId);
    if (invitation === null || invitation.status !== "pending") throw invitationNotFound();
    await this.requireMembership(invitation.workspaceId, userId, "admin");
    const revoked = await this.database.repositories.workspaceInvitations.transition(
      invitationId,
      undefined,
      "revoked",
    );
    if (revoked === null) throw invitationNotFound();
    await this.record(
      "workspace.invitation_revoked",
      userId,
      "workspace_invitation",
      invitationId,
      context,
      {
        workspaceId: invitation.workspaceId,
      },
    );
    return this.invitationView(revoked);
  }

  public async updateMemberRole(
    workspaceId: WorkspaceId,
    targetUserId: UserId,
    actorUserId: UserId,
    input: unknown,
    context: WorkspaceRequestContext,
  ) {
    const request = workspaceMembershipUpdateRequestSchema.parse(input);
    await this.requireMembership(workspaceId, actorUserId, "owner");
    const target = await this.database.repositories.workspaceMemberships.findActive(
      workspaceId,
      targetUserId,
    );
    if (target === null) throw memberNotFound();
    if (target.role === "owner") throw ownerProtected();
    const updated = await this.database.repositories.workspaceMemberships.updateRole(
      workspaceId,
      targetUserId,
      target.role,
      request.role,
    );
    if (updated === null) throw memberNotFound();
    await this.record(
      "workspace.member_role_updated",
      actorUserId,
      "workspace_membership",
      updated._id,
      context,
      {
        workspaceId,
        fromRole: target.role,
        toRole: updated.role,
      },
    );
    return updated;
  }

  public async removeMember(
    workspaceId: WorkspaceId,
    targetUserId: UserId,
    actorUserId: UserId,
    context: WorkspaceRequestContext,
  ) {
    const { membership: actor } = await this.requireMembership(workspaceId, actorUserId, "admin");
    const target = await this.database.repositories.workspaceMemberships.findActive(
      workspaceId,
      targetUserId,
    );
    if (target === null) throw memberNotFound();
    if (target.role === "owner") throw ownerProtected();
    if (actor.role === "admin" && target.role === "admin")
      throw new WorkspaceError(
        "workspace_role_forbidden",
        "Only a workspace owner can remove an administrator",
        403,
      );
    const removed = await this.database.repositories.workspaceMemberships.remove(
      workspaceId,
      targetUserId,
    );
    if (removed === null) throw memberNotFound();
    const workspaceKeys = await this.database.repositories.apiKeys.listByWorkspaceId(workspaceId);
    for (const key of workspaceKeys) {
      if (key.userId === targetUserId && key.status === "active") {
        await this.database.repositories.apiKeys.revoke(key._id);
      }
    }
    await this.record(
      "workspace.member_removed",
      actorUserId,
      "workspace_membership",
      removed._id,
      context,
      {
        workspaceId,
        targetUserId,
      },
    );
    return removed;
  }

  public async requireMembership(
    workspaceId: WorkspaceId,
    userId: UserId,
    minimumRole: WorkspaceRole,
  ): Promise<{ workspace: Workspace; membership: WorkspaceMembership }> {
    const [workspace, membership] = await Promise.all([
      this.database.repositories.workspaces.findById(workspaceId),
      this.database.repositories.workspaceMemberships.findActive(workspaceId, userId),
    ]);
    if (workspace === null || membership === null) throw workspaceNotFound();
    if (workspace.status !== "active")
      throw new WorkspaceError("workspace_archived", "This workspace is archived", 403);
    if (ROLE_WEIGHT[membership.role] < ROLE_WEIGHT[minimumRole])
      throw new WorkspaceError(
        "workspace_role_forbidden",
        `The ${minimumRole} workspace role is required`,
        403,
      );
    return { workspace, membership };
  }

  private async availableSlug(name: string): Promise<string> {
    const base =
      name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "")
        .slice(0, 64) || "workspace";
    if ((await this.database.repositories.workspaces.findBySlug(base)) === null) return base;
    return `${base}-${randomBytes(3).toString("hex")}`;
  }

  private summary(
    workspace: Workspace,
    membership: WorkspaceMembership,
    memberCount: number,
  ): WorkspaceSummary {
    return {
      id: workspace._id,
      name: workspace.name,
      slug: workspace.slug,
      ...(workspace.description === undefined ? {} : { description: workspace.description }),
      status: workspace.status,
      role: membership.role,
      ownerUserId: workspace.ownerUserId,
      defaultContributionScope: workspace.defaultContributionScope,
      memberCount,
      createdAt: workspace.audit.createdAt.toISOString(),
      updatedAt: workspace.audit.updatedAt.toISOString(),
    };
  }

  private async invitationView(invitation: WorkspaceInvitation): Promise<WorkspaceInvitationView> {
    const [workspace, inviter] = await Promise.all([
      this.database.repositories.workspaces.findById(invitation.workspaceId),
      this.database.repositories.users.findById(invitation.inviterUserId),
    ]);
    if (workspace === null || inviter === null)
      throw new Error("Workspace invitation references missing records");
    return {
      id: invitation._id,
      workspaceId: invitation.workspaceId,
      workspaceName: workspace.name,
      inviterUserId: invitation.inviterUserId,
      inviterDisplayName: inviter.displayName,
      inviteeUserId: invitation.inviteeUserId,
      invitedEmail: invitation.invitedEmail,
      role: invitation.role,
      status: invitation.status,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      ...(invitation.respondedAt === undefined
        ? {}
        : { respondedAt: invitation.respondedAt.toISOString() }),
    };
  }

  private async expireDueInvitations(): Promise<void> {
    const expired = await this.database.repositories.workspaceInvitations.expireDue();
    for (const invitation of expired) {
      await this.audit.record({
        actor: { kind: "system" },
        eventType: "workspace.invitation_expired",
        target: { kind: "workspace_invitation", id: invitation._id },
        outcome: "success",
        metadata: { workspaceId: invitation.workspaceId },
      });
    }
  }

  private async record(
    eventType: AuditEventType,
    userId: UserId,
    kind: AuditTarget["kind"],
    id: string,
    context: WorkspaceRequestContext,
    metadata?: Record<string, string>,
  ) {
    await this.audit.record({
      actor: { kind: "user", userId },
      eventType,
      target: { kind, id },
      outcome: "success",
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
      ...(metadata === undefined ? {} : { metadata }),
    });
  }
}

function workspaceNotFound() {
  return new WorkspaceError("workspace_not_found", "The workspace was not found", 404);
}

function invitationNotFound() {
  return new WorkspaceError(
    "workspace_invitation_not_found",
    "The workspace invitation was not found",
    404,
  );
}

function memberNotFound() {
  return new WorkspaceError(
    "workspace_member_not_found",
    "The workspace member was not found",
    404,
  );
}

function ownerProtected() {
  return new WorkspaceError(
    "workspace_owner_protected",
    "The workspace owner cannot be modified by this operation",
    409,
  );
}
