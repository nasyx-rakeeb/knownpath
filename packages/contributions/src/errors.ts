export type ContributionErrorCode =
  | "contribution_disabled"
  | "contribution_consent_required"
  | "team_contributions_not_supported"
  | "contribution_content_rejected"
  | "contribution_idempotency_conflict"
  | "contribution_not_found"
  | "contribution_owner_forbidden"
  | "contribution_provider_visibility_forbidden";

export class ContributionError extends Error {
  public constructor(
    public readonly code: ContributionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ContributionError";
  }
}
