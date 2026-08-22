import { fileURLToPath } from "node:url";

import { loadMcpBridgeConfig } from "@knownpath/config";
import {
  Client,
  StreamableHTTPClientTransport,
  type Transport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";

interface InspectOptions {
  readonly transport: "http" | "stdio";
  readonly tool?: string;
  readonly input: Record<string, unknown>;
}

async function main(): Promise<void> {
  const config = loadMcpBridgeConfig();
  const options = parseArguments(process.argv.slice(2));
  const transport = createTransport(options.transport, config);
  const client = new Client(
    { name: "knownpath-manual-inspector", version: "0.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    if (options.tool === undefined) {
      process.stdout.write(
        `${JSON.stringify({ protocolEra: client.getProtocolEra(), tools }, null, 2)}\n`,
      );
      return;
    }
    if (!tools.tools.some((tool) => tool.name === options.tool)) {
      throw new Error(`Tool is not advertised by KnownPath: ${options.tool}`);
    }
    const result = await client.callTool({ name: options.tool, arguments: options.input });
    process.stdout.write(
      `${JSON.stringify({ protocolEra: client.getProtocolEra(), tool: options.tool, result }, null, 2)}\n`,
    );
  } finally {
    await client.close();
  }
}

function createTransport(
  kind: InspectOptions["transport"],
  config: ReturnType<typeof loadMcpBridgeConfig>,
): Transport {
  if (kind === "http") {
    return new StreamableHTTPClientTransport(new URL("mcp", `${config.apiUrl}/`), {
      requestInit: { headers: { Authorization: `Bearer ${config.apiKey}` } },
    });
  }
  return new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    cwd: process.cwd(),
    stderr: "pipe",
    env: {
      ...getDefaultEnvironment(),
      KNOWNPATH_API_URL: config.apiUrl,
      KNOWNPATH_API_KEY: config.apiKey,
      KNOWNPATH_MCP_REQUEST_TIMEOUT_MS: String(config.requestTimeoutMs),
      KNOWNPATH_MCP_MAX_RESPONSE_BYTES: String(config.maxResponseBytes),
    },
  });
}

function parseArguments(args: readonly string[]): InspectOptions {
  let transport: InspectOptions["transport"] = "http";
  let tool: string | undefined;
  let input: Record<string, unknown> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--transport" && value !== undefined) {
      if (value !== "http" && value !== "stdio") {
        throw new Error("--transport must be http or stdio");
      }
      transport = value;
      index += 1;
      continue;
    }
    if (argument === "--tool" && value !== undefined) {
      tool = value;
      index += 1;
      continue;
    }
    if (argument === "--input" && value !== undefined) {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("--input must be a JSON object");
      }
      input = parsed as Record<string, unknown>;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argument ?? "<missing>"}`);
  }
  return { transport, ...(tool === undefined ? {} : { tool }), input };
}

main().catch((error: unknown) => {
  const safe = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
  process.stderr.write(`KnownPath MCP inspection failed: ${safe}\n`);
  process.exitCode = 1;
});
