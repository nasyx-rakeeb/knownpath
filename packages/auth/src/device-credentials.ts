import type { IncomingHttpHeaders } from "node:http";

import type { KnownPathDatabase } from "@knownpath/database";
import { userIdSchema, type ApiKeyScope } from "@knownpath/domain";
import type { Principal } from "./authorization.js";
import { fromNodeHeaders } from "better-auth/node";

import { ApiKeyService, type ApiKeyRequestContext, type IssuedApiKey } from "./api-keys.js";
import { AuditService } from "./audit.js";
import type { KnownPathAuth } from "./better-auth.js";
import { AuthenticationError } from "./errors.js";

export const knownPathDeviceClientId = "knownpath-cli";
export const knownPathDeviceScopes = [
  "knowledge:read",
  "knowledge:contribute",
  "knowledge:outcome",
] as const satisfies readonly ApiKeyScope[];
export const knownPathDeviceScope = knownPathDeviceScopes.join(" ");

export class DeviceCredentialService {
  public constructor(
    private readonly auth: KnownPathAuth,
    private readonly database: KnownPathDatabase,
    private readonly apiKeys: ApiKeyService,
    private readonly audit: AuditService,
    private readonly credentialTtlDays: number,
  ) {}

  public async exchange(
    headers: IncomingHttpHeaders,
    label: string,
    context: Omit<ApiKeyRequestContext, "actor">,
  ): Promise<IssuedApiKey> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (session === null) {
      throw new AuthenticationError("The device authorization proof is invalid or expired");
    }

    const userId = userIdSchema.parse(session.user.id);
    const user = await this.database.repositories.users.findById(userId);
    if (user === null || user.status !== "active" || user.banned === true) {
      throw new AuthenticationError("The device authorization owner is inactive");
    }

    // Deleting the temporary Better Auth session is the atomic, one-time exchange gate. Only one
    // concurrent request can win; a failed issuance requires a new short-lived device grant.
    const consumed = await this.database.repositories.authSessions.revokeOwned(
      session.session.id,
      userId,
    );
    if (!consumed) {
      throw new AuthenticationError("The device authorization proof was already consumed");
    }

    const expiresAt = new Date(Date.now() + this.credentialTtlDays * 24 * 60 * 60 * 1_000);
    const issued = await this.apiKeys.issue({
      userId,
      name: label,
      scopes: knownPathDeviceScopes,
      credentialKind: "cli_device",
      expiresAt,
      actor: { kind: "user", userId },
      ...context,
    });
    await this.audit.record({
      actor: { kind: "user", userId },
      eventType: "machine_credential.issued",
      outcome: "success",
      target: { kind: "machine_credential", id: issued.key._id },
      metadata: { client: knownPathDeviceClientId },
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
    });
    return issued;
  }

  public async revokeCurrent(
    principal: Principal,
    context: Omit<ApiKeyRequestContext, "actor">,
  ): Promise<void> {
    if (principal.kind !== "api_key" || principal.key.credentialKind !== "cli_device") {
      throw new AuthenticationError("A KnownPath CLI machine credential is required");
    }
    const actor = {
      kind: "api_key" as const,
      userId: principal.user._id,
      apiKeyId: principal.key._id,
    };
    await this.apiKeys.revoke(principal.key._id, principal.user._id, { actor, ...context });
    await Promise.all([
      this.audit.record({
        actor,
        eventType: "machine_credential.revoked",
        outcome: "success",
        target: { kind: "machine_credential", id: principal.key._id },
        ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
        ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
      }),
      this.audit.record({
        actor,
        eventType: "cli.logout",
        outcome: "success",
        target: { kind: "machine_credential", id: principal.key._id },
        ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
        ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
      }),
    ]);
  }
}
