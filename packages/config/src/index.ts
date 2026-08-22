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

const optionalSecretEnvironmentSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const githubEnvironmentSchema = z.object({
  GITHUB_API_VERSION: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .default("2026-03-10"),
  GITHUB_INCREMENTAL_OVERLAP_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS: z.coerce.number().int().min(0).max(900).default(120),
  GITHUB_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  SOURCE_REGISTRY_PATH: z.string().trim().min(1).default("config/sources/registry.json"),
  GITHUB_TOKEN: optionalSecretEnvironmentSchema,
  GITHUB_USER_AGENT: z.string().trim().min(1).max(256).default("knownpath/0.0.0"),
  LOG_LEVEL: logLevelSchema,
});

const sourceIngestionEnvironmentSchema = z.object({
  LOG_LEVEL: logLevelSchema,
  SOURCE_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1_024).max(50_000_000).default(5_000_000),
  SOURCE_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  SOURCE_REGISTRY_PATH: z.string().trim().min(1).default("config/sources/registry.json"),
  SOURCE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  SOURCE_USER_AGENT: z.string().trim().min(1).max(256).default("knownpath/0.0.0"),
});

const aiExtractionEnvironmentSchema = z.object({
  AI_PROVIDER: z.literal("gemini").default("gemini"),
  AI_DATA_HANDLING: z.literal("public_only").default("public_only"),
  AI_MAX_TARGETS: z.coerce.number().int().min(1).max(1_000).default(10),
  AI_MAX_PROVIDER_CALLS: z.coerce.number().int().min(1).max(10_000).default(20),
  AI_MAX_ESTIMATED_INPUT_TOKENS: z.coerce.number().int().min(1_000).max(1_000_000).default(250_000),
  AI_MAX_ACTUAL_TOTAL_TOKENS: z.coerce.number().int().min(1_000).max(10_000_000).default(300_000),
  GEMINI_API_KEY: optionalSecretEnvironmentSchema,
  GEMINI_MODEL: z.string().trim().min(1).max(256).default("gemini-3.5-flash-lite"),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(65_536).default(8_192),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  GEMINI_MIN_REQUEST_SPACING_MS: z.coerce.number().int().min(0).max(60_000).default(1_000),
  GEMINI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(120_000),
});

const embeddingEnvironmentSchema = z.object({
  AI_DATA_HANDLING: z.literal("public_only").default("public_only"),
  EMBEDDING_MAX_PROVIDER_CALLS: z.coerce.number().int().min(1).max(10_000).default(20),
  EMBEDDING_MIN_REQUEST_SPACING_MS: z.coerce.number().int().min(0).max(60_000).default(1_000),
  EMBEDDING_PROVIDER: z.literal("gemini").default("gemini"),
  GEMINI_API_KEY: optionalSecretEnvironmentSchema,
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(128).max(3_072).default(768),
  GEMINI_EMBEDDING_MODEL: z.string().trim().min(1).max(256).default("gemini-embedding-2"),
  GEMINI_EMBEDDING_MODEL_VERSION: z.string().trim().min(1).max(256).default("gemini-embedding-2"),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  GEMINI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(120_000),
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

export interface EmbeddingConfig {
  readonly dataHandling: "public_only";
  readonly dimensions: number;
  readonly geminiApiKey?: string;
  readonly maxProviderCalls: number;
  readonly maxRetries: number;
  readonly minRequestSpacingMs: number;
  readonly model: string;
  readonly modelVersion: string;
  readonly provider: "gemini";
  readonly requestTimeoutMs: number;
}

export interface GitHubConfig {
  readonly apiVersion: string;
  readonly incrementalOverlapMs: number;
  readonly logLevel: LogLevel;
  readonly maxRateLimitWaitSeconds: number;
  readonly requestTimeoutMs: number;
  readonly sourceRegistryPath: string;
  readonly token?: string;
  readonly userAgent: string;
}

export interface SourceIngestionConfig {
  readonly logLevel: LogLevel;
  readonly maxResponseBytes: number;
  readonly maxRetries: number;
  readonly requestTimeoutMs: number;
  readonly sourceRegistryPath: string;
  readonly userAgent: string;
}

export interface AiExtractionConfig {
  readonly dataHandling: "public_only";
  readonly geminiApiKey?: string;
  readonly maxActualTotalTokens: number;
  readonly maxEstimatedInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxProviderCalls: number;
  readonly maxRetries: number;
  readonly maxTargets: number;
  readonly minRequestSpacingMs: number;
  readonly model: string;
  readonly provider: "gemini";
  readonly requestTimeoutMs: number;
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

export function loadGitHubConfig(environment: NodeJS.ProcessEnv = process.env): GitHubConfig {
  const parsed = parseEnvironment(githubEnvironmentSchema, environment);

  return {
    apiVersion: parsed.GITHUB_API_VERSION,
    incrementalOverlapMs: parsed.GITHUB_INCREMENTAL_OVERLAP_HOURS * 60 * 60 * 1_000,
    logLevel: parsed.LOG_LEVEL,
    maxRateLimitWaitSeconds: parsed.GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS,
    requestTimeoutMs: parsed.GITHUB_REQUEST_TIMEOUT_MS,
    sourceRegistryPath: parsed.SOURCE_REGISTRY_PATH,
    ...(parsed.GITHUB_TOKEN === undefined ? {} : { token: parsed.GITHUB_TOKEN }),
    userAgent: parsed.GITHUB_USER_AGENT,
  };
}

export function loadSourceIngestionConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SourceIngestionConfig {
  const parsed = parseEnvironment(sourceIngestionEnvironmentSchema, environment);
  return {
    logLevel: parsed.LOG_LEVEL,
    maxResponseBytes: parsed.SOURCE_MAX_RESPONSE_BYTES,
    maxRetries: parsed.SOURCE_MAX_RETRIES,
    requestTimeoutMs: parsed.SOURCE_REQUEST_TIMEOUT_MS,
    sourceRegistryPath: parsed.SOURCE_REGISTRY_PATH,
    userAgent: parsed.SOURCE_USER_AGENT,
  };
}

export function loadAiExtractionConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AiExtractionConfig {
  const parsed = parseEnvironment(aiExtractionEnvironmentSchema, environment);
  return {
    dataHandling: parsed.AI_DATA_HANDLING,
    ...(parsed.GEMINI_API_KEY === undefined ? {} : { geminiApiKey: parsed.GEMINI_API_KEY }),
    maxActualTotalTokens: parsed.AI_MAX_ACTUAL_TOTAL_TOKENS,
    maxEstimatedInputTokens: parsed.AI_MAX_ESTIMATED_INPUT_TOKENS,
    maxOutputTokens: parsed.GEMINI_MAX_OUTPUT_TOKENS,
    maxProviderCalls: parsed.AI_MAX_PROVIDER_CALLS,
    maxRetries: parsed.GEMINI_MAX_RETRIES,
    maxTargets: parsed.AI_MAX_TARGETS,
    minRequestSpacingMs: parsed.GEMINI_MIN_REQUEST_SPACING_MS,
    model: parsed.GEMINI_MODEL,
    provider: parsed.AI_PROVIDER,
    requestTimeoutMs: parsed.GEMINI_REQUEST_TIMEOUT_MS,
  };
}

export function loadEmbeddingConfig(environment: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const parsed = parseEnvironment(embeddingEnvironmentSchema, environment);
  return {
    dataHandling: parsed.AI_DATA_HANDLING,
    dimensions: parsed.GEMINI_EMBEDDING_DIMENSIONS,
    ...(parsed.GEMINI_API_KEY === undefined ? {} : { geminiApiKey: parsed.GEMINI_API_KEY }),
    maxProviderCalls: parsed.EMBEDDING_MAX_PROVIDER_CALLS,
    maxRetries: parsed.GEMINI_MAX_RETRIES,
    minRequestSpacingMs: parsed.EMBEDDING_MIN_REQUEST_SPACING_MS,
    model: parsed.GEMINI_EMBEDDING_MODEL,
    modelVersion: parsed.GEMINI_EMBEDDING_MODEL_VERSION,
    provider: parsed.EMBEDDING_PROVIDER,
    requestTimeoutMs: parsed.GEMINI_REQUEST_TIMEOUT_MS,
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
