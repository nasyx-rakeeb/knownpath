import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import type { AuthConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import {
  ADMIN_FRESH_SESSION_SECONDS,
  userContributionModeSchema,
  userIdSchema,
  userStatusSchema,
} from "@knownpath/domain";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, bearer, deviceAuthorization } from "better-auth/plugins";
import { fromNodeHeaders } from "better-auth/node";

import { AuditService } from "./audit.js";

type KnownPathAuthOptions = Omit<BetterAuthOptions, "plugins"> & {
  plugins: [
    ReturnType<typeof bearer>,
    ReturnType<typeof deviceAuthorization>,
    ReturnType<typeof admin>,
  ];
};

export interface KnownPathAuth {
  readonly api: {
    createUser(input: {
      body: { email: string; name: string; password: string; role: "admin" | "user" };
    }): Promise<{ user: { id: string } }>;
    getSession(input: { headers: Headers }): Promise<{
      session: {
        id: string;
        createdAt: Date;
      };
      user: { id: string };
    } | null>;
  };
  handler(request: Request): Promise<Response>;
}

export function getKnownPathSession(auth: KnownPathAuth, headers: IncomingHttpHeaders) {
  return auth.api.getSession({ headers: fromNodeHeaders(headers) });
}

export function createKnownPathAuth(
  config: AuthConfig,
  database: KnownPathDatabase,
  audit: AuditService,
): KnownPathAuth {
  const options: KnownPathAuthOptions = {
    appName: "KnownPath",
    baseURL: config.baseUrl,
    basePath: "/api/v1/auth",
    secret: config.secret,
    database: database.createAuthAdapter(),
    trustedOrigins: [...config.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.registrationMode === "closed",
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: {
      modelName: "users",
      fields: { name: "displayName" },
      additionalFields: {
        schemaVersion: {
          type: "number",
          input: false,
          defaultValue: 1,
        },
        normalizedEmail: {
          type: "string",
          input: false,
        },
        status: {
          type: "string",
          input: false,
          defaultValue: "active",
          validator: { output: userStatusSchema },
        },
        contributionMode: {
          type: "string",
          input: false,
          defaultValue: "ask",
          validator: { output: userContributionModeSchema },
        },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: ADMIN_FRESH_SESSION_SECONDS,
    },
    account: {
      modelName: "auth_accounts",
      accountLinking: { enabled: false },
    },
    verification: {
      modelName: "auth_verifications",
      storeIdentifier: "hashed",
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              schemaVersion: 1,
              normalizedEmail: user.email.trim().toLowerCase(),
              status: "active",
              contributionMode: "ask",
            },
          }),
          after: async (user) => {
            await audit.record({
              actor: { kind: "system" },
              eventType: "user.created",
              outcome: "success",
              target: { kind: "user", id: user.id },
              metadata: {
                role: typeof user["role"] === "string" ? user["role"] : "user",
              },
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await database.repositories.users.findById(
              userIdSchema.parse(session.userId),
            );
            return user !== null && user.status === "active" && user.banned !== true;
          },
          after: async (session) => {
            await audit.record({
              actor: { kind: "user", userId: userIdSchema.parse(session.userId) },
              eventType: "session.created",
              outcome: "success",
              target: { kind: "session", id: session.id },
              ...(session.ipAddress === null || session.ipAddress === undefined
                ? {}
                : { ipAddress: session.ipAddress }),
            });
          },
        },
        delete: {
          after: async (session) => {
            await audit.record({
              actor: { kind: "user", userId: userIdSchema.parse(session.userId) },
              eventType: "session.revoked",
              outcome: "success",
              target: { kind: "session", id: session.id },
            });
          },
        },
      },
    },
    plugins: [
      bearer(),
      deviceAuthorization({
        expiresIn: `${config.deviceCodeExpiresSeconds}s`,
        interval: `${config.devicePollIntervalSeconds}s`,
        verificationUri: `${config.publicWebUrl}/device`,
        validateClient: (clientId) => clientId === "knownpath-cli",
        onDeviceAuthRequest: async (clientId, scope) => {
          if (scope !== "knowledge:read knowledge:contribute knowledge:outcome") {
            throw new Error("KnownPath CLI requested an invalid device authorization scope");
          }
          await audit.record({
            actor: { kind: "system" },
            eventType: "device_authorization.initiated",
            outcome: "success",
            target: { kind: "device_authorization", id: clientId },
            metadata: { client: clientId },
          });
        },
        schema: { deviceCode: { modelName: "auth_device_codes" } },
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
    ],
    disabledPaths: [
      ...(config.registrationMode === "closed" ? ["/sign-up/email"] : []),
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/verify-email",
      "/change-email",
      "/delete-user",
    ],
    rateLimit: {
      // Fastify applies the centralized Valkey-backed policy before Better Auth.
      enabled: false,
    },
    // Fastify owns structured request logging and applies credential redaction.
    logger: { disabled: true },
    advanced: {
      database: {
        // A function keeps UUIDs as durable strings in the official MongoDB adapter.
        // The adapter's "uuid" mode intentionally stores BSON UUID values instead.
        generateId: () => randomUUID(),
        joins: true,
      },
      useSecureCookies: config.runtimeMode === "production",
    },
    telemetry: { enabled: false },
  };
  return betterAuth(options) as unknown as KnownPathAuth;
}
