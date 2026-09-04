import { runKnownPathStdioBridge } from "@knownpath/mcp";

import { resolveRuntimeCredential } from "./auth.js";

export async function runMcpBridge(profileName?: string): Promise<void> {
  const credential = await resolveRuntimeCredential({
    allowLogin: false,
    ...(profileName === undefined ? {} : { profileName }),
  });
  if (credential === undefined) {
    throw new Error("No KnownPath credential is available; run `npx knownpath login`");
  }
  await runKnownPathStdioBridge({
    apiKey: credential.apiKey,
    apiUrl: credential.apiUrl,
    maxResponseBytes: boundedEnvironmentNumber(
      "KNOWNPATH_MCP_MAX_RESPONSE_BYTES",
      262_144,
      16_384,
      4_194_304,
    ),
    requestTimeoutMs: boundedEnvironmentNumber(
      "KNOWNPATH_MCP_REQUEST_TIMEOUT_MS",
      30_000,
      1_000,
      120_000,
    ),
    onError: (error: unknown) => {
      process.stderr.write(`KnownPath MCP protocol error: ${safeError(error)}\n`);
    },
  });
}

function boundedEnvironmentNumber(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.name : "Unknown error";
}
