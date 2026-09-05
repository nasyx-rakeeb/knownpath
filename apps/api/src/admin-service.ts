import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { CanonicalRecordService } from "@knownpath/canonicalization";
import type { KnownPathDatabase } from "@knownpath/database";
import {
  ADMIN_CONTRACT_VERSION,
  ADMIN_FRESH_SESSION_SECONDS,
  agentContributionV2Schema,
  candidateExperienceIdSchema,
  knownPathIdSchema,
  type AdminListQuery,
  type AdminResource,
  type UserId,
} from "@knownpath/domain";
import type { JobProducer, QueueRegistry } from "@knownpath/jobs";
import { z } from "zod";

import { loadAdminDetail } from "./admin-details.js";
import {
  adminCanonicalExecuteRequestSchema,
  adminCanonicalPreviewRequestSchema,
  adminCanonicalPreviewResponseSchema,
  adminDetailResponseSchema,
  adminJobRetryRequestSchema,
  adminListResponseSchema,
  adminModerationRequestSchema,
  adminOverviewResponseSchema,
  adminPrivateRevealResponseSchema,
  adminQueueControlRequestSchema,
  adminSourceActionRequestSchema,
  adminUserActionRequestSchema,
} from "@knownpath/domain";

type AdminOverviewResponse = z.infer<typeof adminOverviewResponseSchema>;
type AdminListResponse = z.infer<typeof adminListResponseSchema>;
type AdminDetailResponse = z.infer<typeof adminDetailResponseSchema>;
type CanonicalPreviewRequest = z.infer<typeof adminCanonicalPreviewRequestSchema>;
type CanonicalPreviewResponse = z.infer<typeof adminCanonicalPreviewResponseSchema>;

export class AdminOperationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AdminOperationError";
  }
}

export class AdminService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly secret: string,
    private readonly queues?: QueueRegistry,
    private readonly producer?: JobProducer,
    private readonly providerStatus: {
      readonly geminiConfigured: boolean;
      readonly embeddingModel: string;
      readonly searchBackend: "atlas" | "local";
    } = { geminiConfigured: false, embeddingModel: "unconfigured", searchBackend: "local" },
  ) {}

  public async overview(adminId: UserId, sessionCreatedAt: Date): Promise<AdminOverviewResponse> {
    const admin = await this.requireUser(adminId);
    const [sources, jobs, extractions, candidates, paths, contributions, outcomes, users, audit] =
      await Promise.all([
        this.database.repositories.sourceRegistries.count(),
        this.database.repositories.pipelineRuns.count(),
        this.database.repositories.extractionAttempts.count(),
        this.database.repositories.candidateExperiences.count(),
        this.database.repositories.knownPaths.count(),
        this.database.repositories.agentContributions.count(),
        this.database.repositories.agentOutcomes.count(),
        this.database.repositories.users.count(),
        this.database.repositories.auditEvents.count(),
      ]);
    const queueStatus =
      this.queues === undefined
        ? "disabled"
        : await this.queues.probe().catch(() => "unavailable" as const);
    const [queueCounts, workers] = await Promise.all([
      queueStatus === "ok" && this.queues !== undefined
        ? this.queues.status()
        : Promise.resolve({} as Record<string, Record<string, number>>),
      this.database.repositories.workerHeartbeats.listRecent(
        new Date(Date.now() - 5 * 60_000),
        100,
      ),
    ]);
    return adminOverviewResponseSchema.parse({
      contractVersion: ADMIN_CONTRACT_VERSION,
      admin: { id: admin._id, displayName: admin.displayName },
      capabilities: [
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
      ],
      freshUntil: new Date(sessionCreatedAt.getTime() + ADMIN_FRESH_SESSION_SECONDS * 1_000),
      counts: {
        sources,
        jobs,
        extractions,
        candidates,
        knownPaths: paths,
        contributions,
        outcomes,
        users,
        audit,
      },
      queues: {
        status: queueStatus,
        activeWorkers: workers.filter((worker) => worker.state === "ready").length,
        counts: Object.fromEntries(
          Object.entries(queueCounts).flatMap(([queue, counts]) =>
            Object.entries(counts).map(([status, count]) => [`${queue}.${status}`, count]),
          ),
        ),
      },
      providers: {
        gemini: this.providerStatus.geminiConfigured ? "configured" : "unconfigured",
        embeddingModel: this.providerStatus.embeddingModel,
        searchBackend: this.providerStatus.searchBackend,
      },
    });
  }

  public async list(resource: AdminResource, query: AdminListQuery): Promise<AdminListResponse> {
    const options = {
      limit: query.limit + 1,
      ...(query.cursor === undefined ? {} : { before: this.decodeCursor(query.cursor) }),
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const rows = await this.loadRows(resource, options);
    const page = rows.slice(0, query.limit);
    const next = rows.length > query.limit ? page.at(-1) : undefined;
    return adminListResponseSchema.parse({
      contractVersion: ADMIN_CONTRACT_VERSION,
      resource,
      items: page.map((row) => this.toListItem(resource, row)),
      ...(next === undefined ? {} : { nextCursor: this.encodeCursor(next.at, next.id) }),
    });
  }

  public async detail(resource: AdminResource, id: string): Promise<AdminDetailResponse> {
    const detail = await this.loadDetail(resource, id);
    if (detail === null)
      throw new AdminOperationError(
        "admin_resource_not_found",
        "The administration resource was not found",
        404,
      );
    return adminDetailResponseSchema.parse(detail);
  }

  public async revealPrivateContribution(id: string) {
    const contribution = await this.database.repositories.agentContributions.findById(
      agentContributionV2Schema.shape._id.parse(id),
    );
    if (
      contribution === null ||
      contribution.schemaVersion !== 2 ||
      contribution.visibility.scope !== "private"
    ) {
      throw new AdminOperationError(
        "private_contribution_not_found",
        "A private sanitized contribution was not found",
        404,
      );
    }
    return adminPrivateRevealResponseSchema.parse({
      contractVersion: ADMIN_CONTRACT_VERSION,
      contributionId: contribution._id,
      sanitizedPayload: contribution.payload,
      sanitization: {
        status: contribution.sanitization.status,
        findingCategories: [
          ...new Set(contribution.sanitization.findings.map((item) => item.category)),
        ],
        redactedCharacters: contribution.sanitization.redactedCharacters,
      },
    });
  }

  public async sourceAction(
    input: z.infer<typeof adminSourceActionRequestSchema>,
    adminId: UserId,
  ) {
    const source = await this.database.repositories.sourceRegistries.findById(
      input.sourceRegistryId,
    );
    if (source === null)
      throw new AdminOperationError("admin_resource_not_found", "Source registry not found", 404);
    if (input.action === "enable" || input.action === "disable") {
      const updated = await this.database.repositories.sourceRegistries.setEnabled(
        source._id,
        input.action === "enable",
      );
      if (updated === null)
        throw new AdminOperationError(
          "admin_operation_conflict",
          "Source registry changed concurrently",
          409,
        );
      return { id: updated._id, status: updated.enabled ? "enabled" : "disabled" };
    }
    if (this.producer === undefined)
      throw new AdminOperationError("queue_unavailable", "Queue producer is unavailable", 503);
    const jobName =
      source.kind === "github_repository" ? "source.github.sync" : "source.official.sync";
    const result = await this.producer.enqueue({
      jobName,
      kind: "source_sync",
      target: { kind: "source_registry", id: source._id },
      trigger: "operator",
      initiator: { kind: "user", userId: adminId },
      idempotencyParts: ["admin-source-sync-v1", source._id, input.confirmation.reason],
    });
    return { id: result.run._id, status: result.run.status };
  }

  public async queueControl(input: z.infer<typeof adminQueueControlRequestSchema>) {
    if (this.queues === undefined || (await this.queues.probe()) !== "ok") {
      throw new AdminOperationError(
        "queue_unavailable",
        "Queue infrastructure is unavailable",
        503,
      );
    }
    if (input.action === "pause") await this.queues.pause(input.queue);
    else await this.queues.resume(input.queue);
    return { queue: input.queue, paused: await this.queues.isPaused(input.queue) };
  }

  public async retryJob(input: z.infer<typeof adminJobRetryRequestSchema>, adminId: UserId) {
    if (this.producer === undefined)
      throw new AdminOperationError("queue_unavailable", "Queue producer is unavailable", 503);
    const step = await this.database.repositories.pipelineSteps.findById(input.stepId);
    if (step === null)
      throw new AdminOperationError("admin_resource_not_found", "Pipeline step not found", 404);
    if (!(["failed", "quarantined"] as const).includes(step.status as "failed" | "quarantined")) {
      throw new AdminOperationError(
        "admin_operation_conflict",
        "Only failed or quarantined steps can be retried",
        409,
      );
    }
    const result = await this.producer.enqueue({
      jobName: step.jobName,
      kind: "reprocess",
      target: step.target,
      trigger: "operator",
      options: step.payload,
      initiator: { kind: "user", userId: adminId },
      idempotencyParts: ["admin-retry-v1", step._id, input.confirmation.reason],
      processingVersions: step.processingVersions,
    });
    return { originalStepId: step._id, runId: result.run._id, stepId: result.data.pipelineStepId };
  }

  public async moderate(input: z.infer<typeof adminModerationRequestSchema>, adminId: UserId) {
    const now = new Date();
    const status =
      input.action === "approve"
        ? "approved"
        : input.action === "restore"
          ? "unreviewed"
          : input.action === "reject"
            ? "rejected"
            : "flagged";
    const moderation = {
      status,
      reason: input.confirmation.reason,
      reviewedAt: now,
      reviewedByUserId: adminId,
    } as const;
    if (input.resource === "candidate") {
      const updated =
        await this.database.repositories.candidateExperiences.updateModerationIfCurrent(
          candidateExperienceIdSchema.parse(input.id),
          z.enum(["unreviewed", "approved", "flagged", "rejected"]).parse(input.expectedStatus),
          moderation,
        );
      if (updated === null) throw this.conflict();
      return { id: updated._id, status: updated.moderation.status };
    }
    if (input.resource === "contribution") {
      const contributionStatus =
        input.action === "approve"
          ? "accepted"
          : input.action === "restore"
            ? "pending"
            : input.action === "reject"
              ? "rejected"
              : "quarantined";
      const updated = await this.database.repositories.agentContributions.updateModerationIfCurrent(
        agentContributionV2Schema.shape._id.parse(input.id),
        z.enum(["unreviewed", "approved", "flagged", "rejected"]).parse(input.expectedStatus),
        moderation,
        contributionStatus,
      );
      if (updated === null) throw this.conflict();
      return { id: updated._id, status: updated.moderation.status };
    }
    const pathId = knownPathIdSchema.parse(input.id);
    if (this.producer === undefined)
      throw new AdminOperationError(
        "queue_unavailable",
        "Knowledge moderation requires the projection queue",
        503,
      );
    const targetStatus =
      input.action === "deprecate"
        ? "deprecated"
        : input.action === "restore"
          ? "review"
          : input.action === "approve"
            ? "published"
            : "review";
    const expected = z
      .enum(["draft", "review", "published", "deprecated", "superseded", "archived"])
      .parse(input.expectedStatus);
    const current = await this.database.repositories.knownPaths.findById(pathId);
    if (current === null || current.status !== expected) throw this.conflict();
    const updated = await this.database.repositories.knownPaths.moderateIfCurrent(
      pathId,
      expected,
      {
        status: targetStatus,
        moderation,
        safetyReview:
          input.action === "quarantine" || input.action === "reject"
            ? { ...current.safetyReview, status: "restricted", latestEventAt: now }
            : input.action === "restore" || input.action === "approve"
              ? { ...current.safetyReview, status: "resolved", latestEventAt: now }
              : current.safetyReview,
      },
    );
    if (updated === null) throw this.conflict();
    const projection = await this.producer.enqueue({
      jobName: "knownpath.project",
      kind: "reprocess",
      target: { kind: "knownpath", id: updated._id },
      trigger: "operator",
      initiator: { kind: "user", userId: adminId },
      idempotencyParts: [
        "admin-moderation-projection-v1",
        updated._id,
        updated.status,
        updated.moderation.status,
        updated.audit.updatedAt.toISOString(),
      ],
    });
    return {
      id: updated._id,
      status: updated.status,
      projectionRunId: projection.run._id,
      projectionStepId: projection.data.pipelineStepId,
    };
  }

  public async userAction(input: z.infer<typeof adminUserActionRequestSchema>) {
    const updated = await this.database.repositories.users.updateStatusIfCurrent(
      input.userId,
      input.expectedStatus,
      input.action === "suspend" ? "suspended" : "active",
    );
    if (updated === null) throw this.conflict();
    return { id: updated._id, status: updated.status };
  }

  public async previewCanonical(input: CanonicalPreviewRequest): Promise<CanonicalPreviewResponse> {
    const candidateIds =
      input.action === "merge" ? [...new Set(input.candidateIds)].sort() : [input.candidateId];
    const candidates =
      await this.database.repositories.candidateExperiences.findManyByIds(candidateIds);
    if (candidates.length !== candidateIds.length)
      throw new AdminOperationError(
        "admin_resource_not_found",
        "One or more candidates were not found",
        404,
      );
    const memberships = await Promise.all(
      candidateIds.map((id) =>
        this.database.repositories.canonicalMemberships.findActiveSupportingByCandidate(id),
      ),
    );
    const affected = new Set(
      memberships.flatMap((item) => (item === null ? [] : [item.knownPathId])),
    );
    if ("targetKnownPathId" in input && input.targetKnownPathId !== undefined) {
      const target = await this.database.repositories.knownPaths.findById(input.targetKnownPathId);
      if (target === null)
        throw new AdminOperationError(
          "admin_resource_not_found",
          "Target KnownPath was not found",
          404,
        );
      affected.add(target._id);
    }
    const payload = {
      input,
      candidates: candidates.map((item) => ({
        id: item._id,
        status: item.status,
        moderation: item.moderation.status,
        updatedAt: item.audit.updatedAt.toISOString(),
      })),
      memberships: memberships.map((item) =>
        item === null ? null : { id: item._id, path: item.knownPathId, active: item.active },
      ),
    };
    const previewDigest = createHash("sha256").update(stableJson(payload)).digest("hex");
    return adminCanonicalPreviewResponseSchema.parse({
      contractVersion: ADMIN_CONTRACT_VERSION,
      previewDigest,
      action: input.action,
      candidateIds,
      affectedKnownPathIds: [...affected],
      warnings: candidates.flatMap((candidate) =>
        candidate.moderation.status === "approved"
          ? []
          : [`Candidate ${candidate._id} is ${candidate.moderation.status}`],
      ),
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
  }

  public async executeCanonical(
    input: z.infer<typeof adminCanonicalExecuteRequestSchema>,
    adminId: UserId,
  ) {
    const current = await this.previewCanonical(input.preview);
    if (current.previewDigest !== input.previewDigest)
      throw new AdminOperationError(
        "admin_preview_stale",
        "Canonicalization preview changed; review the operation again",
        409,
      );
    const records = new CanonicalRecordService(this.database, { kind: "user", userId: adminId });
    if (input.preview.action === "merge") {
      const result = await records.mergeCandidates({
        candidateIds: input.preview.candidateIds,
        reason: input.confirmation.reason,
        ...(input.preview.targetKnownPathId === undefined
          ? {}
          : { targetKnownPathId: input.preview.targetKnownPathId }),
        alternativeSolution: input.preview.alternativeSolution,
      });
      return {
        knownPathId: result.knownPath._id,
        status: result.knownPath.status,
        operationId: result.operationId,
      };
    }
    if (input.preview.action === "split") {
      const result = await records.splitCandidate({
        candidateId: input.preview.candidateId,
        reason: input.confirmation.reason,
      });
      return {
        knownPathId: result.knownPath._id,
        status: result.knownPath.status,
        operationId: result.operationId,
      };
    }
    const result = await records.reassignCandidate({
      candidateId: input.preview.candidateId,
      targetKnownPathId: input.preview.targetKnownPathId,
      reason: input.confirmation.reason,
    });
    return {
      knownPathId: result.knownPath._id,
      status: result.knownPath.status,
      operationId: result.operationId,
    };
  }

  private async loadRows(
    resource: AdminResource,
    options: Parameters<KnownPathDatabase["repositories"]["users"]["listAdmin"]>[0],
  ) {
    switch (resource) {
      case "sources":
        return (await this.database.repositories.sourceRegistries.listAdmin(options)).map(
          (value) => ({ value, id: value._id, at: value.audit.createdAt }),
        );
      case "source-items":
        return (await this.database.repositories.sourceItems.listAdmin(options)).map((value) => ({
          value,
          id: value._id,
          at: value.audit.createdAt,
        }));
      case "jobs":
        return (await this.database.repositories.pipelineRuns.listAdmin(options)).map((value) => ({
          value,
          id: value._id,
          at: value.audit.createdAt,
        }));
      case "extractions":
        return (await this.database.repositories.extractionAttempts.listAdmin(options)).map(
          (value) => ({ value, id: value._id, at: value.audit.createdAt }),
        );
      case "candidates":
        return (await this.database.repositories.candidateExperiences.listAdmin(options)).map(
          (value) => ({ value, id: value._id, at: value.audit.createdAt }),
        );
      case "known-paths":
        return (await this.database.repositories.knownPaths.listAdmin(options)).map((value) => ({
          value,
          id: value._id,
          at: value.audit.createdAt,
        }));
      case "contributions":
        return (await this.database.repositories.agentContributions.listAdmin(options)).map(
          (value) => ({ value, id: value._id, at: value.audit.createdAt }),
        );
      case "outcomes":
        return (await this.database.repositories.agentOutcomes.listAdmin(options)).map((value) => ({
          value,
          id: value._id,
          at: "receivedAt" in value ? value.receivedAt : value.audit.createdAt,
        }));
      case "users":
        return (await this.database.repositories.users.listAdmin(options)).map((value) => ({
          value,
          id: value._id,
          at: value.createdAt,
        }));
      case "audit":
        return (await this.database.repositories.auditEvents.listAdmin(options)).map((value) => ({
          value,
          id: value._id,
          at: value.occurredAt,
        }));
    }
  }

  private toListItem(
    resource: AdminResource,
    row: { value: Record<string, unknown>; id: string; at: Date },
  ) {
    const value = row.value;
    const audit = isRecord(value["audit"]) ? value["audit"] : {};
    const visibility = isRecord(value["visibility"])
      ? String(value["visibility"]["scope"] ?? "")
      : undefined;
    const status = String(
      value["status"] ??
        value["eventType"] ??
        (value["enabled"] === true
          ? "enabled"
          : value["enabled"] === false
            ? "disabled"
            : "recorded"),
    );
    const hidesPrivateKnowledge =
      visibility === "private" &&
      (resource === "candidates" || resource === "known-paths" || resource === "contributions");
    const title = hidesPrivateKnowledge
      ? `Private ${resource.slice(0, -1)} ${row.id.slice(0, 8)}`
      : String(
          value["name"] ??
            value["title"] ??
            value["problemSummary"] ??
            value["eventType"] ??
            value["email"] ??
            value["jobName"] ??
            row.id,
        );
    return {
      id: row.id,
      kind: resource,
      title: title.slice(0, 1_000),
      status,
      ...(visibility === "public" || visibility === "private" || visibility === "team"
        ? { visibility }
        : {}),
      occurredAt: row.at,
      updatedAt: audit["updatedAt"] instanceof Date ? audit["updatedAt"] : row.at,
      facts: this.listFacts(resource, value),
    };
  }

  private listFacts(resource: AdminResource, value: Record<string, unknown>) {
    if (resource === "sources")
      return { kind: String(value["kind"] ?? "unknown"), url: String(value["canonicalUrl"] ?? "") };
    if (resource === "jobs")
      return {
        kind: String(value["kind"] ?? "unknown"),
        trigger: String(value["trigger"] ?? "unknown"),
      };
    if (resource === "extractions")
      return {
        provider: String(value["provider"] ?? "unknown"),
        model: String(value["model"] ?? "unknown"),
      };
    if (resource === "known-paths")
      return { trust: isRecord(value["trust"]) ? Number(value["trust"]["score"] ?? 0) : 0 };
    if (resource === "users")
      return { role: String(value["role"] ?? "user"), email: String(value["email"] ?? "") };
    return {};
  }

  private async loadDetail(resource: AdminResource, id: string): Promise<unknown> {
    return loadAdminDetail(this.database, resource, id);
  }

  private encodeCursor(at: Date, id: string): string {
    const payload = Buffer.from(JSON.stringify({ at: at.toISOString(), id }), "utf8").toString(
      "base64url",
    );
    return `${payload}.${createHmac("sha256", this.secret).update(payload).digest("base64url")}`;
  }

  private decodeCursor(cursor: string) {
    const [payload, signature, extra] = cursor.split(".");
    if (payload === undefined || signature === undefined || extra !== undefined)
      throw new AdminOperationError("admin_cursor_invalid", "The admin cursor is invalid", 400);
    const expected = createHmac("sha256", this.secret).update(payload).digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, "base64url");
    } catch {
      throw new AdminOperationError("admin_cursor_invalid", "The admin cursor is invalid", 400);
    }
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      throw new AdminOperationError("admin_cursor_invalid", "The admin cursor is invalid", 400);
    const parsed = z
      .strictObject({ at: z.iso.datetime(), id: z.string().min(1).max(512) })
      .parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return { at: new Date(parsed.at), id: parsed.id };
  }

  private async requireUser(id: UserId) {
    const user = await this.database.repositories.users.findById(id);
    if (user === null)
      throw new AdminOperationError("admin_resource_not_found", "Administrator not found", 404);
    return user;
  }

  private conflict() {
    return new AdminOperationError(
      "admin_operation_conflict",
      "The resource changed before the operation could be applied",
      409,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value))
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
