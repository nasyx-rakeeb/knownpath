import { loadApiConfig, loadAuthConfig, loadMongoConfig } from "@knownpath/config";
import { connectToMongo } from "@knownpath/database";

import { buildApi } from "./app.js";

async function main(): Promise<void> {
  const config = loadApiConfig();
  const authConfig = loadAuthConfig();
  const database = await connectToMongo(loadMongoConfig());
  const api = await buildApi({ apiConfig: config, authConfig, database });
  let closing = false;

  const close = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    api.log.info({ signal }, "shutting down KnownPath API");
    await api.close();
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
