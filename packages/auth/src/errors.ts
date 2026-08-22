export class AuthenticationError extends Error {
  public readonly code = "authentication_required";

  public constructor(message = "Valid authentication is required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  public readonly code = "insufficient_permission";

  public constructor(
    message = "The authenticated principal is not permitted to perform this action",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class AuthResourceNotFoundError extends Error {
  public readonly code = "resource_not_found";

  public constructor(message = "The requested authentication resource was not found") {
    super(message);
    this.name = "AuthResourceNotFoundError";
  }
}
