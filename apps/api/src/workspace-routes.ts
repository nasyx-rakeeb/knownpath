import {
  requireSession,
  type ApiKeyService,
  type Authenticator,
  type RateLimitPolicy,
} from "@knownpath/auth";
import {
  WORKSPACE_API_CONTRACT_VERSION,
  apiKeyIdSchema,
  workspaceCreateRequestSchema,
  workspaceDetailResponseSchema,
  workspaceIdParamsSchema,
  workspaceInvitationMutationResponseSchema,
  workspaceInvitationParamsSchema,
  workspaceInviteRequestSchema,
  workspaceListResponseSchema,
  workspaceMemberParamsSchema,
  workspaceMembershipUpdateRequestSchema,
  workspaceMutationResponseSchema,
  workspaceUpdateRequestSchema,
} from "@knownpath/domain";
import type { WorkspaceService } from "@knownpath/workspaces";
import { SECURITY_LIMITS } from "@knownpath/config";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  apiKeyMetadataSchema,
  errorEnvelopeSchema,
  issueApiKeyBodySchema,
  toApiKeyMetadata,
} from "./schemas.js";

const errors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
} as const;
const workspaceApiKeyParamsSchema = workspaceIdParamsSchema.extend({ id: apiKeyIdSchema });
const workspaceApiKeyListSchema = z.strictObject({
  contractVersion: z.literal(WORKSPACE_API_CONTRACT_VERSION),
  apiKeys: z.array(apiKeyMetadataSchema).max(500),
});
const workspaceIssuedKeySchema = z.strictObject({
  contractVersion: z.literal(WORKSPACE_API_CONTRACT_VERSION),
  apiKey: apiKeyMetadataSchema,
  plaintext: z.string().min(1),
  warning: z.string().min(1),
});

export function registerWorkspaceRoutes(
  api: FastifyInstance,
  authenticator: Authenticator,
  workspaces: WorkspaceService,
  apiKeys: ApiKeyService,
  mutationPolicy: RateLimitPolicy,
): void {
  api.get(
    "/api/v1/workspaces",
    {
      schema: {
        tags: ["workspaces"],
        summary: "List workspace memberships and pending invitations",
        security: [{ cookieSession: [] }],
        response: { 200: workspaceListResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      return workspaces.list(session.user._id);
    },
  );

  api.post(
    "/api/v1/workspaces",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
      schema: {
        tags: ["workspaces"],
        summary: "Create a workspace",
        security: [{ cookieSession: [] }],
        body: workspaceCreateRequestSchema,
        response: { 201: workspaceMutationResponseSchema, ...errors },
      },
      config: rateConfig(mutationPolicy),
    },
    async (request, reply) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const workspace = await workspaces.create(session.user._id, request.body, context(request));
      return reply.status(201).send({ contractVersion: WORKSPACE_API_CONTRACT_VERSION, workspace });
    },
  );

  api.get(
    "/api/v1/workspaces/:workspaceId",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Inspect an authorized workspace",
        security: [{ cookieSession: [] }],
        params: workspaceIdParamsSchema,
        response: { 200: workspaceDetailResponseSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      return workspaces.detail(workspaceId, session.user._id);
    },
  );

  api.patch(
    "/api/v1/workspaces/:workspaceId",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
      schema: {
        tags: ["workspaces"],
        summary: "Update authorized workspace settings",
        security: [{ cookieSession: [] }],
        params: workspaceIdParamsSchema,
        body: workspaceUpdateRequestSchema,
        response: { 200: workspaceMutationResponseSchema, ...errors },
      },
      config: rateConfig(mutationPolicy),
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      const workspace = await workspaces.update(
        workspaceId,
        session.user._id,
        request.body,
        context(request),
      );
      return { contractVersion: WORKSPACE_API_CONTRACT_VERSION, workspace };
    },
  );

  api.post(
    "/api/v1/workspaces/:workspaceId/invitations",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
      schema: {
        tags: ["workspaces"],
        summary: "Invite an existing KnownPath user",
        security: [{ cookieSession: [] }],
        params: workspaceIdParamsSchema,
        body: workspaceInviteRequestSchema,
        response: { 201: workspaceInvitationMutationResponseSchema, ...errors },
      },
      config: rateConfig(mutationPolicy),
    },
    async (request, reply) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      const invitation = await workspaces.invite(
        workspaceId,
        session.user._id,
        request.body,
        context(request),
      );
      return reply
        .status(201)
        .send({ contractVersion: WORKSPACE_API_CONTRACT_VERSION, invitation });
    },
  );

  for (const action of ["accept", "reject"] as const) {
    api.post(
      `/api/v1/workspace-invitations/:invitationId/${action}`,
      {
        bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
        schema: {
          tags: ["workspaces"],
          summary: `${action === "accept" ? "Accept" : "Reject"} an owned workspace invitation`,
          security: [{ cookieSession: [] }],
          params: workspaceInvitationParamsSchema,
          response: { 200: workspaceInvitationMutationResponseSchema, ...errors },
        },
        config: rateConfig(mutationPolicy),
      },
      async (request) => {
        const session = requireSession(await authenticator.authenticate(request.headers));
        const { invitationId } = workspaceInvitationParamsSchema.parse(request.params);
        const invitation = await workspaces[action](
          invitationId,
          session.user._id,
          context(request),
        );
        return { contractVersion: WORKSPACE_API_CONTRACT_VERSION, invitation };
      },
    );
  }

  api.post(
    "/api/v1/workspace-invitations/:invitationId/revoke",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
      schema: {
        tags: ["workspaces"],
        summary: "Revoke a pending workspace invitation",
        security: [{ cookieSession: [] }],
        params: workspaceInvitationParamsSchema,
        response: { 200: workspaceInvitationMutationResponseSchema, ...errors },
      },
      config: rateConfig(mutationPolicy),
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { invitationId } = workspaceInvitationParamsSchema.parse(request.params);
      const invitation = await workspaces.revokeInvitation(
        invitationId,
        session.user._id,
        context(request),
      );
      return { contractVersion: WORKSPACE_API_CONTRACT_VERSION, invitation };
    },
  );

  api.patch(
    "/api/v1/workspaces/:workspaceId/members/:userId",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
      schema: {
        tags: ["workspaces"],
        summary: "Change a workspace member role",
        security: [{ cookieSession: [] }],
        params: workspaceMemberParamsSchema,
        body: workspaceMembershipUpdateRequestSchema,
        response: { 204: z.null(), ...errors },
      },
      config: rateConfig(mutationPolicy),
    },
    async (request, reply) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { workspaceId, userId } = workspaceMemberParamsSchema.parse(request.params);
      await workspaces.updateMemberRole(
        workspaceId,
        userId,
        session.user._id,
        request.body,
        context(request),
      );
      return reply.status(204).send();
    },
  );

  api.post(
    "/api/v1/workspaces/:workspaceId/members/:userId/remove",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
      schema: {
        tags: ["workspaces"],
        summary: "Remove a workspace member and revoke their workspace keys",
        security: [{ cookieSession: [] }],
        params: workspaceMemberParamsSchema,
        response: { 204: z.null(), ...errors },
      },
      config: rateConfig(mutationPolicy),
    },
    async (request, reply) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { workspaceId, userId } = workspaceMemberParamsSchema.parse(request.params);
      await workspaces.removeMember(workspaceId, userId, session.user._id, context(request));
      return reply.status(204).send();
    },
  );

  api.get(
    "/api/v1/workspaces/:workspaceId/api-keys",
    {
      schema: {
        tags: ["workspaces"],
        summary: "List safe workspace-key metadata",
        security: [{ cookieSession: [] }],
        params: workspaceIdParamsSchema,
        response: { 200: workspaceApiKeyListSchema, ...errors },
      },
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await workspaces.requireMembership(workspaceId, session.user._id, "admin");
      return {
        contractVersion: WORKSPACE_API_CONTRACT_VERSION,
        apiKeys: (await apiKeys.listWorkspace(workspaceId)).map(toApiKeyMetadata),
      };
    },
  );

  api.post(
    "/api/v1/workspaces/:workspaceId/api-keys",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
      schema: {
        tags: ["workspaces"],
        summary: "Issue a user-owned key bound to one workspace",
        security: [{ cookieSession: [] }],
        params: workspaceIdParamsSchema,
        body: issueApiKeyBodySchema,
        response: { 201: workspaceIssuedKeySchema, ...errors },
      },
      config: rateConfig(mutationPolicy),
    },
    async (request, reply) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await workspaces.requireMembership(workspaceId, session.user._id, "admin");
      const body = issueApiKeyBodySchema.parse(request.body);
      const issued = await apiKeys.issue({
        userId: session.user._id,
        binding: { kind: "workspace", workspaceId },
        name: body.name,
        scopes: body.scopes,
        actor: { kind: "user", userId: session.user._id },
        ...(body.expiresAt === undefined ? {} : { expiresAt: new Date(body.expiresAt) }),
        ...context(request),
      });
      return reply.status(201).send({
        contractVersion: WORKSPACE_API_CONTRACT_VERSION,
        apiKey: toApiKeyMetadata(issued.key),
        plaintext: issued.plaintext,
        warning: "Store this key now. KnownPath will not show it again.",
      });
    },
  );

  api.post(
    "/api/v1/workspaces/:workspaceId/api-keys/:id/revoke",
    {
      bodyLimit: SECURITY_LIMITS.payloadBytes.workspaceMutation,
      schema: {
        tags: ["workspaces"],
        summary: "Revoke a workspace-bound API key",
        security: [{ cookieSession: [] }],
        params: workspaceApiKeyParamsSchema,
        response: { 200: z.strictObject({ apiKey: apiKeyMetadataSchema }), ...errors },
      },
      config: rateConfig(mutationPolicy),
    },
    async (request) => {
      const session = requireSession(await authenticator.authenticate(request.headers));
      const { workspaceId, id } = workspaceApiKeyParamsSchema.parse(request.params);
      await workspaces.requireMembership(workspaceId, session.user._id, "admin");
      const key = await apiKeys.revokeWorkspaceKey(id, workspaceId, {
        actor: { kind: "user", userId: session.user._id },
        ...context(request),
      });
      return { apiKey: toApiKeyMetadata(key) };
    },
  );
}

function context(request: FastifyRequest) {
  return { requestId: request.id, ipAddress: request.ip };
}

function rateConfig(policy: RateLimitPolicy) {
  return { rateLimit: { max: policy.max, timeWindow: policy.timeWindowMs } };
}
