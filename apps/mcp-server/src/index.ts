import { loadMcpBridgeConfig } from "@knownpath/config";
import { createKnownPathMcpServer, HttpKnowledgeMcpGateway } from "@knownpath/mcp";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

async function main(): Promise<void> {
  const config = loadMcpBridgeConfig();
  const gateway = new HttpKnowledgeMcpGateway({
    apiKey: config.apiKey,
    apiUrl: config.apiUrl,
    maxResponseBytes: config.maxResponseBytes,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  const handle = serveStdio(() => createKnownPathMcpServer(gateway), {
    onerror: (error) => {
      process.stderr.write(`KnownPath MCP protocol error: ${safeError(error)}\n`);
    },
  });

  process.once("SIGINT", () => void handle.close());
  process.once("SIGTERM", () => void handle.close());

  await new Promise<void>((resolve) => {
    process.stdin.once("end", resolve);
    process.stdin.once("close", resolve);
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`KnownPath MCP bridge failed to start: ${safeError(error)}\n`);
  process.exitCode = 1;
});

function safeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
}
