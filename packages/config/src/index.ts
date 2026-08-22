import { z } from "zod";

const logLevelSchema = z
  .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  .default("info");

const runtimeModeSchema = z.enum(["development", "test", "production"]).default("development");
const booleanEnvironmentSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const commaSeparatedUrlsSchema = z
  .string()
  .default("")
  .transform((value, context) => {
    const origins = value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

    for (const origin of origins) {
      try {
        const url = new URL(origin);
        if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
          throw new Error("origin must not include a path");
        }
      } catch {
        context.addIssue({ code: "custom", message: `invalid HTTP origin: ${origin}` });
        return z.NEVER;
      }
    }

    return origins;
  });

const secretSchema = z.string().min(32, "must contain at least 32 characters");

const apiEnvironmentSchema = z.object({
  API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  API_CORS_ORIGINS: commaSeparatedUrlsSchema,
  API_DOCS_ENABLED: booleanEnvironmentSchema.default(true),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(300),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  API_TRUST_PROXY: z.string().trim().default("false"),
  LOG_LEVEL: logLevelSchema,
  NODE_ENV: runtimeModeSchema,
});

const authEnvironmentSchema = z.object({
  API_KEY_LAST_USED_WRITE_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(300),
  API_KEY_PEPPER: secretSchema,
  AUTH_TRUSTED_ORIGINS: commaSeparatedUrlsSchema,
  BETTER_AUTH_SECRET: secretSchema,
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/u }),
  NODE_ENV: runtimeModeSchema,
});

const mongoEnvironmentSchema = z.object({
  MONGODB_APP_NAME: z.string().trim().min(1).default("knownpath"),
  MONGODB_DATABASE: z.string().trim().min(1).default("knownpath"),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(1_000).default(20),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).max(1_000).default(0),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(120_000)
    .default(10_000),
  MONGODB_URI: z
    .string()
    .trim()
    .regex(/^mongodb(?:\+srv)?:\/\//u, "must be a MongoDB connection URI"),
});

const runtimeEnvironmentSchema = z.object({
  LOG_LEVEL: logLevelSchema,
});

export type LogLevel = z.infer<typeof logLevelSchema>;

export interface ApiConfig {
  readonly corsOrigins: readonly string[];
  readonly docsEnabled: boolean;
  readonly host: string;
  readonly logLevel: LogLevel;
  readonly port: number;
  readonly rateLimitMax: number;
  readonly rateLimitWindowMs: number;
  readonly runtimeMode: RuntimeMode;
  readonly trustProxy: false | string[];
}

export interface AuthConfig {
  readonly apiKeyLastUsedWriteIntervalMs: number;
  readonly apiKeyPepper: string;
  readonly baseUrl: string;
  readonly runtimeMode: RuntimeMode;
  readonly secret: string;
  readonly trustedOrigins: readonly string[];
}

export interface MongoConfig {
  readonly appName: string;
  readonly databaseName: string;
  readonly maxPoolSize: number;
  readonly minPoolSize: number;
  readonly serverSelectionTimeoutMs: number;
  readonly uri: string;
}

export interface RuntimeConfig {
  readonly logLevel: LogLevel;
}

export type RuntimeMode = z.infer<typeof runtimeModeSchema>;

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = parseEnvironment(apiEnvironmentSchema, environment);

  return {
    corsOrigins: parsed.API_CORS_ORIGINS,
    docsEnabled: parsed.API_DOCS_ENABLED,
    host: parsed.API_HOST,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.API_PORT,
    rateLimitMax: parsed.API_RATE_LIMIT_MAX,
    rateLimitWindowMs: parsed.API_RATE_LIMIT_WINDOW_MS,
    runtimeMode: parsed.NODE_ENV,
    trustProxy: parseTrustProxy(parsed.API_TRUST_PROXY),
  };
}

export function loadAuthConfig(environment: NodeJS.ProcessEnv = process.env): AuthConfig {
  const parsed = parseEnvironment(authEnvironmentSchema, environment);
  const baseUrl = new URL(parsed.BETTER_AUTH_URL);

  if (parsed.NODE_ENV === "production" && baseUrl.protocol !== "https:") {
    throw new Error(
      "Invalid KnownPath configuration: BETTER_AUTH_URL must use HTTPS in production",
    );
  }

  return {
    apiKeyLastUsedWriteIntervalMs: parsed.API_KEY_LAST_USED_WRITE_INTERVAL_SECONDS * 1_000,
    apiKeyPepper: parsed.API_KEY_PEPPER,
    baseUrl: baseUrl.toString().replace(/\/$/u, ""),
    runtimeMode: parsed.NODE_ENV,
    secret: parsed.BETTER_AUTH_SECRET,
    trustedOrigins: parsed.AUTH_TRUSTED_ORIGINS,
  };
}

export function loadMongoConfig(environment: NodeJS.ProcessEnv = process.env): MongoConfig {
  const parsed = parseEnvironment(mongoEnvironmentSchema, environment);

  return {
    appName: parsed.MONGODB_APP_NAME,
    databaseName: parsed.MONGODB_DATABASE,
    maxPoolSize: parsed.MONGODB_MAX_POOL_SIZE,
    minPoolSize: parsed.MONGODB_MIN_POOL_SIZE,
    serverSelectionTimeoutMs: parsed.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    uri: parsed.MONGODB_URI,
  };
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = parseEnvironment(runtimeEnvironmentSchema, environment);

  return {
    logLevel: parsed.LOG_LEVEL,
  };
}

function parseEnvironment<Schema extends z.ZodType>(
  schema: Schema,
  environment: NodeJS.ProcessEnv,
): z.output<Schema> {
  const result = schema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid KnownPath configuration: ${details}`);
  }

  return result.data;
}

function parseTrustProxy(value: string): false | string[] {
  if (value === "false") {
    return false;
  }

  const addresses = value
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.length > 0);

  if (addresses.length === 0 || addresses.includes("true")) {
    throw new Error(
      "Invalid KnownPath configuration: API_TRUST_PROXY must be false or explicit addresses",
    );
  }

  return addresses;
}
