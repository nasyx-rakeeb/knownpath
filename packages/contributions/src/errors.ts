export type ContributionErrorCode =
  | "contribution_disabled"
  | "contribution_consent_required"
  | "contribution_content_rejected"
  | "contribution_idempotency_conflict"
  | "contribution_not_found"
  | "contribution_owner_forbidden"
  | "contribution_target_forbidden"
  | "contribution_duplicate_check_invalid"
  | "contribution_abuse_limit"
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
