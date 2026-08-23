import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { HttpKnowledgeMcpGateway } from "./http-gateway.js";
import { createKnownPathMcpServer } from "./server.js";

export interface KnownPathStdioBridgeOptions {
  readonly apiKey: string;
  readonly apiUrl: string;
  readonly maxResponseBytes: number;
  readonly requestTimeoutMs: number;
  readonly onError?: (error: unknown) => void;
}

export async function runKnownPathStdioBridge(options: KnownPathStdioBridgeOptions): Promise<void> {
  const gateway = new HttpKnowledgeMcpGateway(options);
  const handle = serveStdio(() => createKnownPathMcpServer(gateway), {
    ...(options.onError === undefined ? {} : { onerror: options.onError }),
  });

  const close = () => void handle.close();
  process.once("SIGINT", close);
  process.once("SIGTERM", close);

  try {
    await new Promise<void>((resolve) => {
      process.stdin.once("end", resolve);
      process.stdin.once("close", resolve);
    });
  } finally {
    process.removeListener("SIGINT", close);
    process.removeListener("SIGTERM", close);
    await handle.close();
  }
}
