import { loadMcpBridgeConfig } from "@knownpath/config";
import { runKnownPathStdioBridge } from "@knownpath/mcp";

export async function runMcpBridge(): Promise<void> {
  const config = loadMcpBridgeConfig();
  await runKnownPathStdioBridge({
    apiKey: config.apiKey,
    apiUrl: config.apiUrl,
    maxResponseBytes: config.maxResponseBytes,
    requestTimeoutMs: config.requestTimeoutMs,
    onError: (error: unknown) => {
      process.stderr.write(`KnownPath MCP protocol error: ${safeError(error)}\n`);
    },
  });
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.name : "Unknown error";
}
