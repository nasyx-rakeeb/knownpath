import { loadApiConfig } from "@knownpath/config";

import { buildApi } from "./app.js";

async function main(): Promise<void> {
  const config = loadApiConfig();
  const api = buildApi({ logLevel: config.logLevel });

  const close = async (signal: NodeJS.Signals): Promise<void> => {
    api.log.info({ signal }, "shutting down KnownPath API");
    await api.close();
  };

  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));

  await api.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error("KnownPath API failed to start", error);
  process.exitCode = 1;
});
