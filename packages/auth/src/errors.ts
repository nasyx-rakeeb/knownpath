export class AuthenticationError extends Error {
  public readonly code = "authentication_required";

  public constructor(message = "Valid authentication is required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  public readonly code: string = "insufficient_permission";

  public constructor(
    message = "The authenticated principal is not permitted to perform this action",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class KnowledgeReviewAccessError extends AuthorizationError {
  public override readonly code = "knowledge_review_access_forbidden";

  public constructor() {
    super(
      "Review records require an explicit request from an admin-owned API key with knowledge:read",
    );
    this.name = "KnowledgeReviewAccessError";
  }
}

export class FreshAdminSessionRequiredError extends AuthorizationError {
  public override readonly code = "fresh_admin_session_required";

  public constructor() {
    super("This sensitive administrator action requires a fresh sign-in within 30 minutes");
    this.name = "FreshAdminSessionRequiredError";
  }
}

export class AdminConfirmationError extends AuthorizationError {
  public override readonly code = "admin_confirmation_invalid";

  public constructor() {
    super("The administrator confirmation does not match the requested action and target");
    this.name = "AdminConfirmationError";
  }
}

export class AuthResourceNotFoundError extends Error {
  public readonly code = "resource_not_found";

  public constructor(message = "The requested authentication resource was not found") {
    super(message);
    this.name = "AuthResourceNotFoundError";
  }
}
