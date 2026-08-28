import {
  loadApiConfig,
  loadAuthConfig,
  loadEmbeddingConfig,
  loadMongoConfig,
  loadObservabilityConfig,
  loadQueueConfig,
  loadSearchConfig,
} from "@knownpath/config";
import { connectToMongo } from "@knownpath/database";
import {
  createValkeyClient,
  createValkeyConnection,
  JobProducer,
  QueueRegistry,
  ValkeyAbuseRateGate,
} from "@knownpath/jobs";
import { startObservability } from "@knownpath/observability";

import { buildApi } from "./app.js";

let shutdownObservability: () => Promise<void> = async () => undefined;

async function main(): Promise<void> {
  const config = loadApiConfig();
  const observability = await startObservability(loadObservabilityConfig());
  shutdownObservability = observability.shutdown;
  const authConfig = loadAuthConfig();
  const embeddingConfig = loadEmbeddingConfig();
  const searchConfig = loadSearchConfig();
  const database = await connectToMongo(loadMongoConfig());
  const queueConfig = loadQueueConfig();
  const rateLimitRedis =
    config.rateLimitStore === "valkey" && queueConfig.redisUrl !== undefined
      ? createValkeyClient(queueConfig.redisUrl)
      : undefined;
  if (rateLimitRedis !== undefined) {
    try {
      await rateLimitRedis.ping();
    } catch {
      rateLimitRedis.disconnect();
      await database.close();
      throw new Error("Production rate limiter is unavailable");
    }
  }
  const queueConnection =
    queueConfig.redisUrl === undefined ? undefined : createValkeyConnection(queueConfig.redisUrl);
  const queueRegistry =
    queueConnection === undefined ? undefined : new QueueRegistry(queueConnection, queueConfig);
  const jobProducer =
    queueRegistry === undefined ? undefined : new JobProducer(database, queueRegistry, queueConfig);
  const abuseRateGate =
    rateLimitRedis === undefined
      ? undefined
      : new ValkeyAbuseRateGate(
          rateLimitRedis,
          queueConfig.prefix,
          queueConfig.producerConnectTimeoutMs,
        );
  const api = await buildApi({
    apiConfig: config,
    authConfig,
    database,
    embeddingConfig,
    searchConfig,
    ...(rateLimitRedis === undefined ? {} : { rateLimitRedis }),
    ...(abuseRateGate === undefined ? {} : { abuseRateGate }),
    ...(jobProducer === undefined ? {} : { jobProducer }),
    ...(queueRegistry === undefined ? {} : { queueRegistry }),
  });
  let closing = false;

  const close = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    api.log.info({ signal }, "shutting down KnownPath API");
    await api.close();
    await queueRegistry?.close();
    queueConnection?.disconnect();
    rateLimitRedis?.disconnect();
    await database.close();
    await observability.shutdown();
  };

  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));

  await api.listen({ host: config.host, port: config.port });
}

main().catch(async (error: unknown) => {
  const safeError =
    error instanceof Error && error.message.startsWith("Invalid KnownPath configuration:")
      ? `${error.name}: ${error.message}`
      : error instanceof Error
        ? error.name
        : "Unknown startup error";
  console.error(`KnownPath API failed to start: ${safeError}`);
  await shutdownObservability();
  process.exitCode = 1;
});
