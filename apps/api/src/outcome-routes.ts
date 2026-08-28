import {
  authorizeScopedKnowledgeRead,
  authorizeOutcomeSubmit,
  type AuditService,
  type Authenticator,
  type RateLimitPolicy,
} from "@knownpath/auth";
import { outcomeSubmissionRequestSchema, outcomeSubmissionResponseSchema } from "@knownpath/domain";
import type { OutcomeService } from "@knownpath/outcomes";
import type { JobProducer } from "@knownpath/jobs";
import { SECURITY_LIMITS } from "@knownpath/config";
import type { FastifyInstance } from "fastify";

import { errorEnvelopeSchema } from "./schemas.js";

const errors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  413: errorEnvelopeSchema,
  422: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
} as const;

export function registerOutcomeRoutes(
  api: FastifyInstance,
  authenticator: Authenticator,
  service: OutcomeService,
  audit: AuditService,
  policy: RateLimitPolicy,
  database: import("@knownpath/database").KnownPathDatabase,
  producer?: JobProducer,
): void {
  api.post(
    "/api/v1/outcomes",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.outcome,
      schema: {
        tags: ["outcomes"],
        summary: "Report whether an attempted KnownPath solution helped",
        description:
          "Requires knowledge:outcome. A report is evidence only after an actual attempt; not_used is recorded with zero evidence weight. Review targets additionally require explicit admin review access.",
        security: [{ bearerApiKey: [] }],
        body: outcomeSubmissionRequestSchema.meta({
          examples: [
            {
              contractVersion: 1,
              clientOutcomeId: "2a75c65a-a8c8-4d9e-9f0c-d20f874528da",
              clientExecutionId: "81fd3c3f-2745-4475-b42f-a42b89f3f52d",
              knownPathId: "8d5f23be-f2a2-4d95-a1fd-0c91f674a2eb",
              outcome: "solved",
              attemptedAt: "2026-08-23T12:00:00.000Z",
              agentClient: { name: "codex", version: "1.0" },
              environment: {
                ecosystem: "expo",
                packages: [{ name: "expo", version: "55.0.0" }],
                platforms: ["android"],
                versions: ["expo@55.0.0"],
                toolchain: ["pnpm"],
              },
              note: "The documented cache reset resolved the build after the configuration change.",
              includeReview: false,
            },
          ],
        }),
        response: { 200: outcomeSubmissionResponseSchema, ...errors },
      },
      config: {
        knownPathRateLimitPolicy: policy.name,
        rateLimit: { max: policy.max, timeWindow: policy.timeWindowMs },
      },
    },
    async (request) => {
      const input = outcomeSubmissionRequestSchema.parse(request.body);
      const principal = authorizeOutcomeSubmit(await authenticator.authenticate(request.headers));
      const targetScope =
        input.scope.kind === "workspace"
          ? { kind: "workspace" as const, workspaceId: input.scope.workspaceId }
          : input.scope;
      const access = await authorizeScopedKnowledgeRead(
        principal,
        targetScope,
        input.includeReview,
        database,
      );
      try {
        const response = await service.submit(input, {
          userId: principal.user._id,
          apiKeyId: principal.key._id,
          accessMode: access.accessMode,
          scope: input.scope,
          ...(principal.key.binding.kind === "workspace"
            ? { workspaceId: principal.key.binding.workspaceId }
            : {}),
        });
        if (producer !== undefined) {
          try {
            await producer.enqueue({
              jobName: "outcomes.aggregate",
              kind: "outcome",
              target: { kind: "knownpath", id: input.knownPathId },
              trigger: "api",
              idempotencyParts: ["outcomes.aggregate", response.outcomeId],
            });
          } catch {
            request.log.warn(
              { errorCode: "queue_dispatch_deferred" },
              "outcome stored; aggregate dispatch will be reconciled",
            );
          }
        }
        await audit.record({
          actor: {
            kind: "api_key",
            userId: principal.user._id,
            apiKeyId: principal.key._id,
          },
          eventType: response.reused ? "outcome.replayed" : "outcome.submitted",
          target: { kind: "outcome", id: response.outcomeId },
          outcome: "success",
          requestId: request.id,
          ipAddress: request.ip,
          metadata: {
            knownPathId: input.knownPathId,
            outcome: input.outcome,
            influence: response.influence.status,
          },
        });
        if (response.safetyReviewQueued && input.outcome === "misleading_or_unsafe") {
          await audit.record({
            actor: {
              kind: "api_key",
              userId: principal.user._id,
              apiKeyId: principal.key._id,
            },
            eventType: "outcome.safety_review_queued",
            target: { kind: "safety_review", id: input.knownPathId },
            outcome: "success",
            requestId: request.id,
            ipAddress: request.ip,
            metadata: { sourceOutcomeId: response.outcomeId },
          });
        }
        return response;
      } catch (error) {
        await audit.record({
          actor: {
            kind: "api_key",
            userId: principal.user._id,
            apiKeyId: principal.key._id,
          },
          eventType: "outcome.rejected",
          target: { kind: "outcome", id: "rejected-before-persistence" },
          outcome: "failure",
          requestId: request.id,
          ipAddress: request.ip,
          metadata: { reason: safeCode(error), knownPathId: input.knownPathId },
        });
        throw error;
      }
    },
  );
}

function safeCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code).slice(0, 128)
    : "rejected";
}
