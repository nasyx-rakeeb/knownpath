import { z } from "zod";

const logLevelSchema = z
  .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  .default("info");

const apiEnvironmentSchema = z.object({
  API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: logLevelSchema,
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
  readonly host: string;
  readonly logLevel: LogLevel;
  readonly port: number;
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

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = parseEnvironment(apiEnvironmentSchema, environment);

  return {
    host: parsed.API_HOST,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.API_PORT,
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
