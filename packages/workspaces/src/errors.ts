export class WorkspaceError extends Error {
  public constructor(
    public readonly code:
      | "workspace_not_found"
      | "workspace_slug_conflict"
      | "workspace_archived"
      | "workspace_role_forbidden"
      | "workspace_membership_conflict"
      | "workspace_member_not_found"
      | "workspace_owner_protected"
      | "workspace_invitee_not_found"
      | "workspace_invitation_conflict"
      | "workspace_invitation_not_found"
      | "workspace_invitation_expired"
      | "workspace_invitation_email_mismatch",
    message: string,
    public readonly statusCode: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}
