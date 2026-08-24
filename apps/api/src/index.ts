import {
  loadApiConfig,
  loadAuthConfig,
  loadEmbeddingConfig,
  loadMongoConfig,
  loadQueueConfig,
  loadSearchConfig,
} from "@knownpath/config";
import { connectToMongo } from "@knownpath/database";
import { createValkeyConnection, JobProducer, QueueRegistry } from "@knownpath/jobs";

import { buildApi } from "./app.js";

async function main(): Promise<void> {
  const config = loadApiConfig();
  const authConfig = loadAuthConfig();
  const embeddingConfig = loadEmbeddingConfig();
  const searchConfig = loadSearchConfig();
  const database = await connectToMongo(loadMongoConfig());
  const queueConfig = loadQueueConfig();
  const queueConnection =
    queueConfig.redisUrl === undefined ? undefined : createValkeyConnection(queueConfig.redisUrl);
  const queueRegistry =
    queueConnection === undefined ? undefined : new QueueRegistry(queueConnection, queueConfig);
  const jobProducer =
    queueRegistry === undefined ? undefined : new JobProducer(database, queueRegistry, queueConfig);
  const api = await buildApi({
    apiConfig: config,
    authConfig,
    database,
    embeddingConfig,
    searchConfig,
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
    await database.close();
  };

  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));

  await api.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  const safeError =
    error instanceof Error ? `${error.name}: ${error.message}` : "Unknown startup error";
  console.error(`KnownPath API failed to start: ${safeError}`);
  process.exitCode = 1;
});
