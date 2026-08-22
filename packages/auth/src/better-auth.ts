import { randomUUID } from "node:crypto";

import type { AuthConfig } from "@knownpath/config";
import type { KnownPathDatabase } from "@knownpath/database";
import { userIdSchema, userStatusSchema } from "@knownpath/domain";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

import { AuditService } from "./audit.js";

export function createKnownPathAuth(
  config: AuthConfig,
  database: KnownPathDatabase,
  audit: AuditService,
) {
  return betterAuth({
    appName: "KnownPath",
    baseURL: config.baseUrl,
    basePath: "/api/v1/auth",
    secret: config.secret,
    database: database.createAuthAdapter(),
    trustedOrigins: [...config.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
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
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 30,
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
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
    ],
    disabledPaths: [
      "/sign-up/email",
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/verify-email",
      "/change-email",
      "/delete-user",
    ],
    rateLimit: {
      enabled: true,
      storage: "memory",
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
  });
}

export type KnownPathAuth = ReturnType<typeof createKnownPathAuth>;
