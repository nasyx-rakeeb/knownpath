import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "knownpath",
    version: "0.0.0",
  });
  const transport = new StdioServerTransport();

  process.once("SIGINT", () => void server.close());
  process.once("SIGTERM", () => void server.close());

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("KnownPath MCP server failed to start", error);
  process.exitCode = 1;
});
