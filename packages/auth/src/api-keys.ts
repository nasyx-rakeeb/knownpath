import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  createApiKeyId,
  type ApiKey,
  type ApiKeyId,
  type ApiKeyScope,
  type ApiKeyBinding,
  type AuditActor,
  type User,
  type UserId,
  type Workspace,
  type WorkspaceMembership,
  type WorkspaceId,
  apiKeyIdSchema,
} from "@knownpath/domain";
import type { KnownPathRepositories } from "@knownpath/database";

import { AuditService } from "./audit.js";
import { AuthenticationError, AuthResourceNotFoundError, AuthorizationError } from "./errors.js";

const API_KEY_HASH_VERSION = 1;
const API_KEY_PATTERN = /^(kp_[a-f0-9]{12})_([A-Za-z0-9_-]{43})$/u;

export interface ApiKeyRequestContext {
  readonly actor: AuditActor;
  readonly ipAddress?: string;
  readonly requestId?: string;
}

export interface IssueApiKeyInput extends ApiKeyRequestContext {
  readonly expiresAt?: Date;
  readonly name: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly userId: UserId;
  readonly binding?: ApiKeyBinding;
}

export interface IssuedApiKey {
  readonly key: ApiKey;
  readonly plaintext: string;
}

export interface VerifiedApiKey {
  readonly key: ApiKey;
  readonly user: User;
  readonly workspace?: Workspace;
  readonly workspaceMembership?: WorkspaceMembership;
}

export class ApiKeyService {
  public constructor(
    private readonly repositories: KnownPathRepositories,
    private readonly audit: AuditService,
    private readonly pepper: string,
    private readonly lastUsedWriteIntervalMs: number,
  ) {}

  public async issue(input: IssueApiKeyInput): Promise<IssuedApiKey> {
    const generated = this.generateCredential();
    const now = new Date();
    const apiKey = await this.repositories.apiKeys.create({
      _id: createApiKeyId(),
      schemaVersion: 1,
      userId: input.userId,
      name: input.name,
      prefix: generated.prefix,
      keyHash: this.hash(generated.plaintext),
      hashVersion: API_KEY_HASH_VERSION,
      binding: input.binding ?? { kind: "personal" },
      scopes: [...new Set(input.scopes)],
      status: "active",
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      audit: {
        createdAt: now,
        updatedAt: now,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
      },
    });

    await this.audit.record({
      actor: input.actor,
      eventType: "api_key.issued",
      outcome: "success",
      target: { kind: "api_key", id: apiKey._id },
      metadata:
        apiKey.binding.kind === "workspace"
          ? { binding: "workspace", workspaceId: apiKey.binding.workspaceId }
          : { binding: "personal" },
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
    });

    return { key: apiKey, plaintext: generated.plaintext };
  }

  public async list(userId: UserId): Promise<ApiKey[]> {
    return this.repositories.apiKeys.listByUserId(userId);
  }

  public async listWorkspace(workspaceId: WorkspaceId): Promise<ApiKey[]> {
    return this.repositories.apiKeys.listByWorkspaceId(workspaceId);
  }

  public async rotate(
    idInput: string,
    userId: UserId,
    context: ApiKeyRequestContext,
  ): Promise<IssuedApiKey> {
    const id = apiKeyIdSchema.parse(idInput);
    const existing = await this.requireOwnedKey(id, userId);
    if (existing.status !== "active") {
      throw new AuthorizationError("Only active API keys can be rotated");
    }

    const generated = this.generateCredential();
    const updated = await this.repositories.apiKeys.replaceSecret(
      id,
      this.hash(generated.plaintext),
      generated.prefix,
    );
    if (updated === null) {
      throw new AuthResourceNotFoundError("The API key could not be rotated");
    }

    await this.audit.record({
      actor: context.actor,
      eventType: "api_key.rotated",
      outcome: "success",
      target: { kind: "api_key", id: updated._id },
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
    });

    return { key: updated, plaintext: generated.plaintext };
  }

  public async revoke(
    idInput: string,
    userId: UserId,
    context: ApiKeyRequestContext,
  ): Promise<ApiKey> {
    const id = apiKeyIdSchema.parse(idInput);
    await this.requireOwnedKey(id, userId);
    const revoked = await this.repositories.apiKeys.revoke(id);
    if (revoked === null) {
      throw new AuthResourceNotFoundError("The active API key could not be revoked");
    }

    await this.audit.record({
      actor: context.actor,
      eventType: "api_key.revoked",
      outcome: "success",
      target: { kind: "api_key", id: revoked._id },
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
    });

    return revoked;
  }

  public async revokeWorkspaceKey(
    idInput: string,
    workspaceId: WorkspaceId,
    context: ApiKeyRequestContext,
  ): Promise<ApiKey> {
    const id = apiKeyIdSchema.parse(idInput);
    const existing = await this.repositories.apiKeys.findById(id);
    if (
      existing === null ||
      existing.binding.kind !== "workspace" ||
      existing.binding.workspaceId !== workspaceId
    )
      throw new AuthResourceNotFoundError("The workspace API key was not found");
    const revoked = await this.repositories.apiKeys.revoke(id);
    if (revoked === null)
      throw new AuthResourceNotFoundError("The active workspace API key could not be revoked");
    await this.audit.record({
      actor: context.actor,
      eventType: "workspace.api_key_revoked",
      outcome: "success",
      target: { kind: "api_key", id: revoked._id },
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
      metadata: { workspaceId },
    });
    return revoked;
  }

  public async verify(plaintext: string): Promise<VerifiedApiKey> {
    const parsed = API_KEY_PATTERN.exec(plaintext);
    if (parsed === null) {
      throw new AuthenticationError("The API key is malformed or invalid");
    }

    const prefix = parsed[1]!;
    const key = await this.repositories.apiKeys.findByPrefix(prefix);
    const candidateHash = this.hash(plaintext);
    if (key === null || !this.hashesMatch(key.keyHash, candidateHash)) {
      throw new AuthenticationError("The API key is malformed or invalid");
    }

    const now = new Date();
    if (key.status !== "active" || (key.expiresAt !== undefined && key.expiresAt <= now)) {
      throw new AuthenticationError("The API key is inactive or expired");
    }

    const user = await this.repositories.users.findById(key.userId);
    if (user === null || user.status !== "active" || user.banned === true) {
      throw new AuthenticationError("The API key owner is inactive");
    }

    let workspace: Workspace | undefined;
    let workspaceMembership: WorkspaceMembership | undefined;
    if (key.binding.kind === "workspace") {
      const [resolvedWorkspace, resolvedMembership] = await Promise.all([
        this.repositories.workspaces.findById(key.binding.workspaceId),
        this.repositories.workspaceMemberships.findActive(key.binding.workspaceId, key.userId),
      ]);
      if (
        resolvedWorkspace === null ||
        resolvedWorkspace.status !== "active" ||
        resolvedMembership === null
      )
        throw new AuthenticationError("The API key workspace binding is inactive");
      workspace = resolvedWorkspace;
      workspaceMembership = resolvedMembership;
    }

    if (
      key.lastUsedAt === undefined ||
      now.getTime() - key.lastUsedAt.getTime() >= this.lastUsedWriteIntervalMs
    ) {
      await this.repositories.apiKeys.recordLastUsed(key._id, now);
    }

    return {
      key,
      user,
      ...(workspace === undefined ? {} : { workspace }),
      ...(workspaceMembership === undefined ? {} : { workspaceMembership }),
    };
  }

  private async requireOwnedKey(id: ApiKeyId, userId: UserId): Promise<ApiKey> {
    const key = await this.repositories.apiKeys.findById(id);
    if (key === null || key.userId !== userId) {
      throw new AuthResourceNotFoundError("The API key was not found");
    }
    return key;
  }

  private generateCredential(): { plaintext: string; prefix: string } {
    const prefix = `kp_${randomBytes(6).toString("hex")}`;
    const secret = randomBytes(32).toString("base64url");
    return { plaintext: `${prefix}_${secret}`, prefix };
  }

  private hash(plaintext: string): string {
    return createHmac("sha256", this.pepper).update(plaintext, "utf8").digest("hex");
  }

  private hashesMatch(stored: string, candidate: string): boolean {
    const storedBytes = Buffer.from(stored, "hex");
    const candidateBytes = Buffer.from(candidate, "hex");
    return (
      storedBytes.length === candidateBytes.length && timingSafeEqual(storedBytes, candidateBytes)
    );
  }
}
