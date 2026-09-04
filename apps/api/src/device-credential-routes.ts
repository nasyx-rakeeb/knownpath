import type { Authenticator, DeviceCredentialService, RateLimitPolicy } from "@knownpath/auth";
import type { AuthConfig } from "@knownpath/config";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  apiKeyMetadataSchema,
  errorEnvelopeSchema,
  machineCredentialExchangeBodySchema,
  toApiKeyMetadata,
} from "./schemas.js";

const exchangeResponseSchema = z.object({
  apiKey: apiKeyMetadataSchema,
  plaintext: z.string(),
  warning: z.string(),
});

const protectedErrors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
} as const;

export function registerDeviceCredentialRoutes(
  api: FastifyInstance,
  authenticator: Authenticator,
  deviceCredentials: DeviceCredentialService,
  authConfig: AuthConfig,
  exchangePolicy: RateLimitPolicy,
): void {
  api.get(
    "/api/v1/auth/registration",
    {
      schema: {
        tags: ["authentication"],
        summary: "Inspect account-registration availability",
        response: { 200: z.object({ registration: z.enum(["open", "closed"]) }) },
      },
    },
    async () => ({ registration: authConfig.registrationMode }),
  );

  api.post(
    "/api/v1/device-credentials/exchange",
    {
      schema: {
        tags: ["authentication"],
        summary: "Exchange a one-time device grant for a scoped machine credential",
        security: [{ deviceBearer: [] }],
        body: machineCredentialExchangeBodySchema,
        response: { 201: exchangeResponseSchema, ...protectedErrors },
      },
      config: {
        rateLimit: { max: exchangePolicy.max, timeWindow: exchangePolicy.timeWindowMs },
      },
    },
    async (request, reply) => {
      const body = machineCredentialExchangeBodySchema.parse(request.body);
      const issued = await deviceCredentials.exchange(
        request.headers,
        body.label,
        context(request),
      );
      return reply.status(201).send({
        apiKey: toApiKeyMetadata(issued.key),
        plaintext: issued.plaintext,
        warning:
          "This machine credential is shown once and must be stored in the OS credential store.",
      });
    },
  );

  api.post(
    "/api/v1/device-credentials/revoke-current",
    {
      schema: {
        tags: ["authentication"],
        summary: "Revoke the current CLI machine credential",
        security: [{ bearerApiKey: [] }],
        response: { 200: z.object({ revoked: z.literal(true) }), ...protectedErrors },
      },
      config: {
        rateLimit: { max: exchangePolicy.max, timeWindow: exchangePolicy.timeWindowMs },
      },
    },
    async (request) => {
      const principal = await authenticator.authenticate(request.headers);
      await deviceCredentials.revokeCurrent(principal, context(request));
      return { revoked: true as const };
    },
  );
}

function context(request: FastifyRequest) {
  return { requestId: request.id, ipAddress: request.ip };
}
