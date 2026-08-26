import {
  listAdminCapabilities,
  requireAdminCapability,
  requireFreshAdmin,
  validateAdminConfirmation,
  type AuditService,
  type Authenticator,
  type Principal,
} from "@knownpath/auth";
import {
  adminCanonicalExecuteRequestSchema,
  adminCanonicalPreviewRequestSchema,
  adminCanonicalPreviewResponseSchema,
  adminDetailResponseSchema,
  adminJobRetryRequestSchema,
  adminListQuerySchema,
  adminListResponseSchema,
  adminModerationRequestSchema,
  adminOverviewResponseSchema,
  adminPrivateRevealRequestSchema,
  adminPrivateRevealResponseSchema,
  adminQueueControlRequestSchema,
  adminResourceSchema,
  adminSourceActionRequestSchema,
  adminUserActionRequestSchema,
  type AdminCapability,
  type AdminConfirmation,
  type AdminSensitiveAction,
  type AuditEventType,
} from "@knownpath/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AdminService } from "./admin-service.js";
import { errorEnvelopeSchema } from "./schemas.js";

const resourceParamsSchema = z.strictObject({ resource: adminResourceSchema });
const detailParamsSchema = z.strictObject({
  resource: adminResourceSchema,
  id: z.string().min(1).max(512),
});
const operationResponseSchema = z.strictObject({ result: z.record(z.string(), z.unknown()) });
const protectedErrors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  503: errorEnvelopeSchema,
} as const;

export function registerAdminRoutes(
  api: FastifyInstance,
  authenticator: Authenticator,
  admin: AdminService,
  audit: AuditService,
): void {
  api.get(
    "/api/v1/admin/overview",
    {
      schema: {
        tags: ["admin"],
        summary: "Get the administrator operations overview",
        security: [{ cookieSession: [] }],
        response: { 200: adminOverviewResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const principal = requireAdminCapability(
        await authenticator.authenticate(request.headers),
        "operations:read",
      );
      listAdminCapabilities(principal);
      return admin.overview(principal.user._id, principal.sessionCreatedAt);
    },
  );

  api.get(
    "/api/v1/admin/resources/:resource",
    {
      schema: {
        tags: ["admin"],
        summary: "List an administration resource",
        security: [{ cookieSession: [] }],
        params: resourceParamsSchema,
        querystring: adminListQuerySchema,
        response: { 200: adminListResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const params = resourceParamsSchema.parse(request.params);
      requireAdminCapability(
        await authenticator.authenticate(request.headers),
        capabilityFor(params.resource),
      );
      return admin.list(params.resource, adminListQuerySchema.parse(request.query));
    },
  );

  api.get(
    "/api/v1/admin/resources/:resource/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "Inspect an administration resource",
        security: [{ cookieSession: [] }],
        params: detailParamsSchema,
        response: { 200: adminDetailResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const params = detailParamsSchema.parse(request.params);
      requireAdminCapability(
        await authenticator.authenticate(request.headers),
        capabilityFor(params.resource),
      );
      return admin.detail(params.resource, params.id);
    },
  );

  api.post(
    "/api/v1/admin/private-content/reveal",
    {
      schema: {
        tags: ["admin"],
        summary: "Reveal one sanitized private contribution for moderation",
        security: [{ cookieSession: [] }],
        body: adminPrivateRevealRequestSchema,
        response: { 200: adminPrivateRevealResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const input = adminPrivateRevealRequestSchema.parse(request.body);
      return sensitive(
        request,
        authenticator,
        audit,
        {
          capability: "private_content:read",
          action: "private_content.reveal",
          target: input.contributionId,
          confirmation: input.confirmation,
          eventType: "admin.private_content_revealed",
          targetKind: "contribution",
        },
        async () => admin.revealPrivateContribution(input.contributionId),
      );
    },
  );

  api.post(
    "/api/v1/admin/moderation",
    {
      schema: {
        tags: ["admin"],
        summary: "Apply a reversible moderation transition",
        security: [{ cookieSession: [] }],
        body: adminModerationRequestSchema,
        response: { 200: operationResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const input = adminModerationRequestSchema.parse(request.body);
      const action = moderationSensitiveAction(input.action);
      return sensitive(
        request,
        authenticator,
        audit,
        {
          capability: "knowledge:moderate",
          action,
          target: input.id,
          confirmation: input.confirmation,
          eventType: "admin.moderation_changed",
          targetKind:
            input.resource === "known_path"
              ? "known_path"
              : input.resource === "candidate"
                ? "candidate_experience"
                : "contribution",
        },
        async (principal) => ({ result: await admin.moderate(input, principal.user._id) }),
      );
    },
  );

  api.post(
    "/api/v1/admin/queues/control",
    {
      schema: {
        tags: ["admin"],
        summary: "Pause or resume an operational queue",
        security: [{ cookieSession: [] }],
        body: adminQueueControlRequestSchema,
        response: { 200: operationResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const input = adminQueueControlRequestSchema.parse(request.body);
      const action = input.action === "pause" ? "queue.pause" : "queue.resume";
      return sensitive(
        request,
        authenticator,
        audit,
        {
          capability: "operations:write",
          action,
          target: input.queue,
          confirmation: input.confirmation,
          eventType: input.action === "pause" ? "admin.queue_paused" : "admin.queue_resumed",
          targetKind: "queue",
        },
        async () => ({ result: await admin.queueControl(input) }),
      );
    },
  );

  api.post(
    "/api/v1/admin/jobs/retry",
    {
      schema: {
        tags: ["admin"],
        summary: "Create a preserved-history retry for a failed pipeline step",
        security: [{ cookieSession: [] }],
        body: adminJobRetryRequestSchema,
        response: { 200: operationResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const input = adminJobRetryRequestSchema.parse(request.body);
      return sensitive(
        request,
        authenticator,
        audit,
        {
          capability: "operations:write",
          action: "job.retry",
          target: input.stepId,
          confirmation: input.confirmation,
          eventType: "admin.job_retry_requested",
          targetKind: "pipeline_step",
        },
        async (principal) => ({ result: await admin.retryJob(input, principal.user._id) }),
      );
    },
  );

  api.post(
    "/api/v1/admin/sources/action",
    {
      schema: {
        tags: ["admin"],
        summary: "Enable, disable, or synchronize a source",
        security: [{ cookieSession: [] }],
        body: adminSourceActionRequestSchema,
        response: { 200: operationResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const input = adminSourceActionRequestSchema.parse(request.body);
      const action = input.action === "sync" ? "source.sync" : "source.update";
      return sensitive(
        request,
        authenticator,
        audit,
        {
          capability: "sources:write",
          action,
          target: input.sourceRegistryId,
          confirmation: input.confirmation,
          eventType:
            input.action === "sync" ? "admin.source_sync_requested" : "admin.source_updated",
          targetKind: "source_registry",
        },
        async (principal) => ({ result: await admin.sourceAction(input, principal.user._id) }),
      );
    },
  );

  api.post(
    "/api/v1/admin/canonicalization/preview",
    {
      schema: {
        tags: ["admin"],
        summary: "Preview a reversible canonicalization operation",
        security: [{ cookieSession: [] }],
        body: adminCanonicalPreviewRequestSchema,
        response: { 200: adminCanonicalPreviewResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      requireAdminCapability(
        await authenticator.authenticate(request.headers),
        "knowledge:moderate",
      );
      return admin.previewCanonical(adminCanonicalPreviewRequestSchema.parse(request.body));
    },
  );

  api.post(
    "/api/v1/admin/canonicalization/execute",
    {
      schema: {
        tags: ["admin"],
        summary: "Execute an approved canonicalization preview",
        security: [{ cookieSession: [] }],
        body: adminCanonicalExecuteRequestSchema,
        response: { 200: operationResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const input = adminCanonicalExecuteRequestSchema.parse(request.body);
      const action = `canonical.${input.preview.action}` as AdminSensitiveAction;
      const target = input.previewDigest;
      return sensitive(
        request,
        authenticator,
        audit,
        {
          capability: "knowledge:moderate",
          action,
          target,
          confirmation: input.confirmation,
          eventType: "admin.canonicalization_executed",
          targetKind: "canonicalization_operation",
        },
        async (principal) => ({ result: await admin.executeCanonical(input, principal.user._id) }),
      );
    },
  );

  api.post(
    "/api/v1/admin/users/action",
    {
      schema: {
        tags: ["admin"],
        summary: "Suspend or restore a user",
        security: [{ cookieSession: [] }],
        body: adminUserActionRequestSchema,
        response: { 200: operationResponseSchema, ...protectedErrors },
      },
    },
    async (request) => {
      const input = adminUserActionRequestSchema.parse(request.body);
      const action = input.action === "suspend" ? "user.suspend" : "user.restore";
      return sensitive(
        request,
        authenticator,
        audit,
        {
          capability: "users:write",
          action,
          target: input.userId,
          confirmation: input.confirmation,
          eventType: input.action === "suspend" ? "admin.user_suspended" : "admin.user_restored",
          targetKind: "user",
        },
        async () => ({ result: await admin.userAction(input) }),
      );
    },
  );
}

async function sensitive<T>(
  request: FastifyRequest,
  authenticator: Authenticator,
  audit: AuditService,
  options: {
    capability: AdminCapability;
    action: AdminSensitiveAction;
    target: string;
    confirmation: AdminConfirmation;
    eventType: AuditEventType;
    targetKind:
      | "candidate_experience"
      | "canonicalization_operation"
      | "contribution"
      | "known_path"
      | "pipeline_step"
      | "queue"
      | "source_registry"
      | "user";
  },
  operation: (principal: Extract<Principal, { kind: "session" }>) => Promise<T>,
): Promise<T> {
  let principal: Principal = { kind: "anonymous" };
  try {
    principal = await authenticator.authenticate(request.headers);
    const admin = requireFreshAdmin(principal, options.capability);
    validateAdminConfirmation(options.confirmation, options.action, options.target);
    const result = await operation(admin);
    await audit.record({
      actor: { kind: "user", userId: admin.user._id },
      eventType: options.eventType,
      outcome: "success",
      target: { kind: options.targetKind, id: options.target },
      requestId: request.id,
      ipAddress: request.ip,
      metadata: { action: options.action, reason: safeAuditReason(options.confirmation.reason) },
    });
    return result;
  } catch (error) {
    await audit.record({
      actor:
        principal.kind === "anonymous"
          ? { kind: "system" }
          : principal.kind === "api_key"
            ? { kind: "api_key", userId: principal.user._id, apiKeyId: principal.key._id }
            : { kind: "user", userId: principal.user._id },
      eventType: options.eventType,
      outcome: "failure",
      target: { kind: options.targetKind, id: options.target },
      requestId: request.id,
      ipAddress: request.ip,
      metadata: { action: options.action, reason: safeAuditReason(options.confirmation.reason) },
    });
    throw error;
  }
}

function moderationSensitiveAction(
  action: "approve" | "quarantine" | "reject" | "deprecate" | "restore",
): AdminSensitiveAction {
  return action === "approve" ? "moderation.approve" : `moderation.${action}`;
}

function capabilityFor(resource: z.infer<typeof adminResourceSchema>): AdminCapability {
  if (resource === "sources" || resource === "source-items") return "sources:read";
  if (resource === "jobs") return "operations:read";
  if (resource === "contributions") return "contributions:read";
  if (resource === "users") return "users:read";
  if (resource === "audit") return "audit:read";
  return "knowledge:read";
}

function safeAuditReason(value: string): string {
  return value
    .replace(/[\r\n\t]+/gu, " ")
    .trim()
    .slice(0, 512);
}
