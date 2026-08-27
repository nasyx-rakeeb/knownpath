import {
  ADMIN_FRESH_SESSION_SECONDS,
  type AdminCapability,
  type AdminConfirmation,
  type AdminSensitiveAction,
  type ApiKey,
  type ApiKeyScope,
  type User,
  type Workspace,
  type WorkspaceMembership,
  type KnowledgeSearchScope,
} from "@knownpath/domain";
import type { KnownPathDatabase } from "@knownpath/database";

import {
  AdminConfirmationError,
  AuthenticationError,
  AuthorizationError,
  FreshAdminSessionRequiredError,
  KnowledgeReviewAccessError,
} from "./errors.js";

export type Principal =
  | { readonly kind: "anonymous" }
  | {
      readonly kind: "session";
      readonly sessionId: string;
      readonly sessionCreatedAt: Date;
      readonly user: User;
    }
  | {
      readonly kind: "api_key";
      readonly key: ApiKey;
      readonly user: User;
      readonly workspace?: Workspace;
      readonly workspaceMembership?: WorkspaceMembership;
    };

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

const ADMIN_CAPABILITIES: ReadonlySet<AdminCapability> = new Set([
  "operations:read",
  "operations:write",
  "sources:read",
  "sources:write",
  "knowledge:read",
  "knowledge:moderate",
  "contributions:read",
  "contributions:moderate",
  "private_content:read",
  "users:read",
  "users:write",
  "audit:read",
]);

export function requireAdminCapability(
  principal: Principal,
  capability: AdminCapability,
): Extract<Principal, { kind: "session" }> {
  const admin = requireAdmin(principal);
  if (!ADMIN_CAPABILITIES.has(capability)) {
    throw new AuthorizationError(`Administrator capability ${capability} is required`);
  }
  return admin;
}

export function requireFreshAdmin(
  principal: Principal,
  capability: AdminCapability,
  now = new Date(),
): Extract<Principal, { kind: "session" }> {
  const admin = requireAdminCapability(principal, capability);
  const ageMs = now.getTime() - admin.sessionCreatedAt.getTime();
  if (ageMs < 0 || ageMs > ADMIN_FRESH_SESSION_SECONDS * 1_000) {
    throw new FreshAdminSessionRequiredError();
  }
  return admin;
}

export function expectedAdminConfirmationPhrase(
  action: AdminSensitiveAction,
  target: string,
): string {
  return `CONFIRM ${action} ${target}`;
}

export function validateAdminConfirmation(
  confirmation: AdminConfirmation,
  action: AdminSensitiveAction,
  target: string,
): void {
  if (
    confirmation.action !== action ||
    confirmation.target !== target ||
    confirmation.phrase !== expectedAdminConfirmationPhrase(action, target)
  ) {
    throw new AdminConfirmationError();
  }
}

export function listAdminCapabilities(principal: Principal): AdminCapability[] {
  requireAdmin(principal);
  return [...ADMIN_CAPABILITIES];
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

export function authorizeContributionSubmit(
  principal: Principal,
): Extract<Principal, { kind: "api_key" }> {
  const authenticated = requireScope(principal, "knowledge:contribute");
  if (authenticated.kind !== "api_key") {
    throw new AuthorizationError("Agent contributions require an API key");
  }
  return authenticated;
}

export function authorizeOutcomeSubmit(
  principal: Principal,
): Extract<Principal, { kind: "api_key" }> {
  const authenticated = requireScope(principal, "knowledge:outcome");
  if (authenticated.kind !== "api_key") {
    throw new AuthorizationError("Agent outcomes require an API key");
  }
  return authenticated;
}

export interface KnowledgeAccessAuthorization {
  readonly accessMode: "published" | "review";
  readonly principal:
    | { readonly kind: "session"; readonly userId: User["_id"] }
    | {
        readonly kind: "api_key";
        readonly userId: User["_id"];
        readonly apiKeyId: ApiKey["_id"];
      };
}

export function authorizeKnowledgeRead(
  principal: Principal,
  includeReview: boolean,
): KnowledgeAccessAuthorization {
  const authenticated = requireScope(principal, "knowledge:read");
  if (includeReview) {
    if (authenticated.kind !== "api_key" || authenticated.user.role !== "admin") {
      throw new KnowledgeReviewAccessError();
    }
    return {
      accessMode: "review",
      principal: {
        kind: "api_key",
        userId: authenticated.user._id,
        apiKeyId: authenticated.key._id,
      },
    };
  }
  return {
    accessMode: "published",
    principal:
      authenticated.kind === "session"
        ? { kind: "session", userId: authenticated.user._id }
        : {
            kind: "api_key",
            userId: authenticated.user._id,
            apiKeyId: authenticated.key._id,
          },
  };
}

export interface ScopedKnowledgeAccessAuthorization extends KnowledgeAccessAuthorization {
  readonly scope: KnowledgeSearchScope;
  readonly workspaceMembership?: WorkspaceMembership;
}

export async function authorizeScopedKnowledgeRead(
  principal: Principal,
  scope: KnowledgeSearchScope,
  includeReview: boolean,
  database: KnownPathDatabase,
): Promise<ScopedKnowledgeAccessAuthorization> {
  const base = authorizeKnowledgeRead(principal, includeReview);
  const authenticated = requireAuthenticated(principal);
  if (includeReview) {
    if (scope.kind !== "public")
      throw new AuthorizationError("Administrator review access is limited to public knowledge");
    return { ...base, scope };
  }
  if (scope.kind === "public") return { ...base, scope };
  if (scope.kind === "personal") {
    if (authenticated.kind === "api_key" && authenticated.key.binding.kind === "workspace")
      throw new AuthorizationError("A workspace-bound API key cannot access personal knowledge");
    return { ...base, scope };
  }
  if (
    authenticated.kind === "api_key" &&
    (authenticated.key.binding.kind !== "workspace" ||
      authenticated.key.binding.workspaceId !== scope.workspaceId)
  )
    throw new AuthorizationError("The API key is not bound to the requested workspace");
  const membership =
    authenticated.kind === "api_key" &&
    authenticated.workspaceMembership?.workspaceId === scope.workspaceId
      ? authenticated.workspaceMembership
      : await database.repositories.workspaceMemberships.findActive(
          scope.workspaceId,
          authenticated.user._id,
        );
  const workspace = await database.repositories.workspaces.findById(scope.workspaceId);
  if (membership === null || membership === undefined || workspace?.status !== "active")
    throw new AuthorizationError("The requested workspace is not available to this principal");
  return { ...base, scope, workspaceMembership: membership };
}
