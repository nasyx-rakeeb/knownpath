import type { ApiKey, ApiKeyScope, User } from "@knownpath/domain";

import { AuthenticationError, AuthorizationError } from "./errors.js";

export type Principal =
  | { readonly kind: "anonymous" }
  | { readonly kind: "session"; readonly user: User }
  | { readonly kind: "api_key"; readonly key: ApiKey; readonly user: User };

export const anonymousPrincipal: Principal = { kind: "anonymous" };

export function requireAuthenticated(
  principal: Principal,
): Exclude<Principal, { kind: "anonymous" }> {
  if (principal.kind === "anonymous") {
    throw new AuthenticationError();
  }
  return principal;
}

export function requireSession(principal: Principal): Extract<Principal, { kind: "session" }> {
  if (principal.kind !== "session") {
    throw new AuthorizationError("A browser session is required for this action");
  }
  return principal;
}

export function requireAdmin(principal: Principal): Extract<Principal, { kind: "session" }> {
  const session = requireSession(principal);
  if (session.user.role !== "admin") {
    throw new AuthorizationError("Administrator access is required");
  }
  return session;
}

export function requireScope(
  principal: Principal,
  scope: ApiKeyScope,
): Exclude<Principal, { kind: "anonymous" }> {
  const authenticated = requireAuthenticated(principal);
  if (authenticated.kind === "api_key" && !authenticated.key.scopes.includes(scope)) {
    throw new AuthorizationError(`The API key requires the ${scope} scope`);
  }
  return authenticated;
}
