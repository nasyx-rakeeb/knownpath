import {
  authorizeContributionSubmit,
  requireSession,
  type AuditService,
  type Authenticator,
  type RateLimitPolicy,
} from "@knownpath/auth";
import {
  agentContributionIdSchema,
  contributionInspectionResponseSchema,
  contributionSubmissionRequestSchema,
  contributionSubmissionResponseSchema,
  userContributionModeSchema,
} from "@knownpath/domain";
import type { ContributionService } from "@knownpath/contributions";
import type { KnownPathDatabase } from "@knownpath/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { errorEnvelopeSchema } from "./schemas.js";

const contributionParamsSchema = z.strictObject({ id: agentContributionIdSchema });
const settingsSchema = z.strictObject({ contributionMode: userContributionModeSchema });
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

export function registerContributionRoutes(
  api: FastifyInstance,
  authenticator: Authenticator,
  service: ContributionService,
  database: KnownPathDatabase,
  audit: AuditService,
  policy: RateLimitPolicy,
): void {
  api.post(
    "/api/v1/contributions",
    {
      bodyLimit: 48 * 1_024,
      schema: {
        tags: ["contributions"],
        summary: "Submit a privacy-minimized generalized experience",
        description:
          "Requires an API key with knowledge:contribute. Public submissions require explicit publication consent; private submissions remain owner-scoped. Team submissions are rejected.",
        security: [{ bearerApiKey: [] }],
        body: contributionSubmissionRequestSchema.meta({
          examples: [
            {
              contractVersion: 1,
              clientSubmissionId: "4b6246aa-0d93-4e66-8817-d5c85da15fb1",
              kind: "new_lesson",
              visibility: "public",
              consent: { policyVersion: 1, confirmed: true },
              agentClient: { name: "codex", version: "1.0" },
              payload: {
                problem: "Metro retained a stale resolver result after a package entry changed",
                ecosystem: "react-native",
                packages: [{ ecosystem: "npm", name: "metro" }],
                platforms: ["development"],
                versions: [],
                toolchain: ["pnpm"],
                symptoms: ["The corrected package entry point was not resolved"],
                errors: ["Unable to resolve module old-entry"],
                solutionSummary:
                  "Correct the entry point and restart Metro with its documented cache reset.",
                steps: [
                  {
                    instruction:
                      "Correct the package entry point and restart Metro with cache reset.",
                    verification: "The bundle completes using the corrected entry point.",
                  },
                ],
                caveats: ["Do not remove unrelated global caches."],
                successEvidence: {
                  summary: "The development bundle completed after the clean restart.",
                  checks: ["Two consecutive bundles completed."],
                },
                consultedKnownPaths: [],
              },
            },
          ],
        }),
        response: {
          200: contributionSubmissionResponseSchema,
          202: contributionSubmissionResponseSchema,
          ...errors,
        },
      },
      config: {
        knownPathRateLimitPolicy: policy.name,
        rateLimit: { max: policy.max, timeWindow: policy.timeWindowMs },
      },
    },
    async (request, reply) => {
      const principal = authorizeContributionSubmit(
        await authenticator.authenticate(request.headers),
      );
      try {
        const result = await service.submit(
          contributionSubmissionRequestSchema.parse(request.body),
          {
            user: principal.user,
            apiKeyId: principal.key._id,
          },
        );
        await audit.record({
          actor: { kind: "api_key", userId: principal.user._id, apiKeyId: principal.key._id },
          eventType: result.response.reused
            ? "contribution.replayed"
            : result.contribution.status === "quarantined"
              ? "contribution.quarantined"
              : "contribution.submitted",
          target: { kind: "contribution", id: result.contribution._id },
          outcome: "success",
          requestId: request.id,
          ipAddress: request.ip,
          metadata: {
            visibility: result.response.visibility,
            processingStage: result.response.processingStage,
          },
        });
        return reply
          .status(result.contribution.status === "quarantined" ? 202 : 200)
          .send(result.response);
      } catch (error) {
        await audit.record({
          actor: { kind: "api_key", userId: principal.user._id, apiKeyId: principal.key._id },
          eventType: "contribution.rejected",
          target: { kind: "contribution", id: "rejected-before-persistence" },
          outcome: "failure",
          requestId: request.id,
          ipAddress: request.ip,
          metadata: { reason: safeCode(error) },
        });
        throw error;
      }
    },
  );

  api.get(
    "/api/v1/contributions/:id",
    {
      schema: {
        tags: ["contributions"],
        summary: "Inspect an owned contribution",
        security: [{ bearerApiKey: [] }, { cookieSession: [] }],
        params: contributionParamsSchema,
        response: { 200: contributionInspectionResponseSchema, ...errors },
      },
    },
    async (request) => {
      const principal = await authenticator.authenticate(request.headers);
      const authenticated =
        principal.kind === "api_key"
          ? authorizeContributionSubmit(principal)
          : requireSession(principal);
      const id = contributionParamsSchema.parse(request.params).id;
      const ownerUserId = authenticated.user._id;
      const response = await service.inspect(id, ownerUserId);
      await audit.record({
        actor:
          authenticated.kind === "api_key"
            ? { kind: "api_key", userId: authenticated.user._id, apiKeyId: authenticated.key._id }
            : { kind: "user", userId: authenticated.user._id },
        eventType: "contribution.inspected",
        target: { kind: "contribution", id },
        outcome: "success",
        requestId: request.id,
        ipAddress: request.ip,
      });
      return response;
    },
  );

  api.get(
    "/api/v1/account/contribution-settings",
    {
      schema: {
        tags: ["account"],
        summary: "Get contribution privacy settings",
        security: [{ cookieSession: [] }],
        response: { 200: settingsSchema, ...errors },
      },
    },
    async (request) => {
      const principal = requireSession(await authenticator.authenticate(request.headers));
      return { contributionMode: principal.user.contributionMode };
    },
  );

  api.patch(
    "/api/v1/account/contribution-settings",
    {
      bodyLimit: 1_024,
      schema: {
        tags: ["account"],
        summary: "Update contribution privacy settings",
        security: [{ cookieSession: [] }],
        body: settingsSchema,
        response: { 200: settingsSchema, ...errors },
      },
    },
    async (request) => {
      const principal = requireSession(await authenticator.authenticate(request.headers));
      const input = settingsSchema.parse(request.body);
      const user = await database.repositories.users.updateContributionMode(
        principal.user._id,
        input.contributionMode,
      );
      if (user === null) throw new Error("Contribution settings owner disappeared");
      await audit.record({
        actor: { kind: "user", userId: user._id },
        eventType: "contribution.settings_updated",
        target: { kind: "user", id: user._id },
        outcome: "success",
        requestId: request.id,
        ipAddress: request.ip,
        metadata: { contributionMode: user.contributionMode },
      });
      return { contributionMode: user.contributionMode };
    },
  );
}

function safeCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code).slice(0, 128)
    : "rejected";
}
