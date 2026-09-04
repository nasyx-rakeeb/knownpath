import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from "jsonc-parser";

import {
  apiKeyEnvironmentName,
  apiUrlEnvironmentName,
  stdioArgumentsForProfile,
  stdioCommand,
} from "./constants.js";
import { atomicWrite, readTextIfPresent } from "./filesystem.js";
import { InstallerError, type AgentId } from "./types.js";

const codexBlockStart = "# >>> KnownPath installer managed MCP entry >>>";
const codexBlockEnd = "# <<< KnownPath installer managed MCP entry <<<";
function codexBlock(profileName?: string): string {
  return `${codexBlockStart}
[mcp_servers.knownpath]
command = ${JSON.stringify(stdioCommand)}
args = ${JSON.stringify(stdioArgumentsForProfile(profileName))}
${codexBlockEnd}`;
}

const legacyCodexBlock = `${codexBlockStart}
[mcp_servers.knownpath]
command = ${JSON.stringify(stdioCommand)}
args = ${JSON.stringify(stdioArgumentsForProfile())}
env_vars = ${JSON.stringify([apiUrlEnvironmentName, apiKeyEnvironmentName])}
${codexBlockEnd}`;

export type McpConfigState = "absent" | "conflict" | "current" | "legacy";

export async function inspectMcpConfig(
  agent: AgentId,
  path: string,
  profileName?: string,
): Promise<McpConfigState> {
  const source = await readTextIfPresent(path);
  if (source === undefined) return "absent";
  if (agent === "codex") return inspectCodex(source, profileName);
  const document = parseJsonc(source, path);
  const value = readPath(document, configPropertyPath(agent));
  if (value === undefined) return "absent";
  if (deepEqual(value, desiredMcpEntry(agent, profileName))) return "current";
  return deepEqual(value, legacyMcpEntry(agent)) ? "legacy" : "conflict";
}

export async function writeMcpConfig(
  agent: AgentId,
  path: string,
  operation: "install" | "remove",
  profileName?: string,
): Promise<void> {
  const source = (await readTextIfPresent(path)) ?? (agent === "codex" ? "" : "{}\n");
  if (agent === "codex") {
    await atomicWrite(path, updateCodex(source, operation, profileName));
    return;
  }
  const propertyPath = configPropertyPath(agent);
  parseJsonc(source, path);
  const edits = modify(
    source,
    propertyPath,
    operation === "install" ? desiredMcpEntry(agent, profileName) : undefined,
    {
      formattingOptions: {
        eol: source.includes("\r\n") ? "\r\n" : "\n",
        insertSpaces: true,
        tabSize: 2,
      },
    },
  );
  await atomicWrite(path, ensureFinalNewline(applyEdits(source, edits)));
}

export function desiredMcpEntry(
  agent: Exclude<AgentId, "codex">,
  profileName?: string,
): Record<string, unknown> {
  const arguments_ = stdioArgumentsForProfile(profileName);
  if (agent === "claude") {
    return {
      type: "stdio",
      command: stdioCommand,
      args: [...arguments_],
      env: {},
    };
  }
  if (agent === "cursor") {
    return {
      type: "stdio",
      command: stdioCommand,
      args: [...arguments_],
    };
  }
  if (agent === "gemini") {
    return {
      command: stdioCommand,
      args: [...arguments_],
      timeout: 30_000,
      trust: false,
    };
  }
  return {
    type: "local",
    command: [stdioCommand, ...arguments_],
  };
}

function legacyMcpEntry(agent: Exclude<AgentId, "codex">): Record<string, unknown> {
  const base = desiredMcpEntry(agent);
  if (agent === "claude")
    return {
      ...base,
      env: {
        [apiUrlEnvironmentName]: `\${${apiUrlEnvironmentName}}`,
        [apiKeyEnvironmentName]: `\${${apiKeyEnvironmentName}}`,
      },
    };
  if (agent === "cursor")
    return {
      ...base,
      env: {
        [apiUrlEnvironmentName]: `\${env:${apiUrlEnvironmentName}}`,
        [apiKeyEnvironmentName]: `\${env:${apiKeyEnvironmentName}}`,
      },
    };
  if (agent === "gemini")
    return {
      ...base,
      env: {
        [apiUrlEnvironmentName]: `$${apiUrlEnvironmentName}`,
        [apiKeyEnvironmentName]: `$${apiKeyEnvironmentName}`,
      },
    };
  return {
    ...base,
    environment: {
      [apiUrlEnvironmentName]: `{env:${apiUrlEnvironmentName}}`,
      [apiKeyEnvironmentName]: `{env:${apiKeyEnvironmentName}}`,
    },
  };
}

function inspectCodex(source: string, profileName?: string): McpConfigState {
  const start = source.indexOf(codexBlockStart);
  const end = source.indexOf(codexBlockEnd);
  if (start >= 0 || end >= 0) {
    if (start < 0 || end < start) return "conflict";
    const installed = source.slice(start, end + codexBlockEnd.length).trim();
    if (installed === codexBlock(profileName)) return "current";
    return installed === legacyCodexBlock ? "legacy" : "conflict";
  }
  return /^\s*\[mcp_servers\.knownpath\]\s*$/mu.test(source) ? "conflict" : "absent";
}

function updateCodex(
  source: string,
  operation: "install" | "remove",
  profileName?: string,
): string {
  const state = inspectCodex(source, profileName);
  if (operation === "install") {
    if (state === "conflict") throw configConflict("Codex");
    if (state === "current") return ensureFinalNewline(source);
    if (state === "legacy") {
      const start = source.indexOf(codexBlockStart);
      const end = source.indexOf(codexBlockEnd) + codexBlockEnd.length;
      return ensureFinalNewline(
        `${source.slice(0, start)}${codexBlock(profileName)}${source.slice(end)}`,
      );
    }
    const prefix = source.trimEnd();
    return `${prefix}${prefix === "" ? "" : "\n\n"}${codexBlock(profileName)}\n`;
  }
  if (state === "absent") return ensureFinalNewline(source);
  if (state === "conflict") throw configConflict("Codex");
  const start = source.indexOf(codexBlockStart);
  const end = source.indexOf(codexBlockEnd) + codexBlockEnd.length;
  return ensureFinalNewline(
    `${source.slice(0, start).trimEnd()}\n${source.slice(end).trimStart()}`.trim(),
  );
}

function configPropertyPath(agent: Exclude<AgentId, "codex">): (string | number)[] {
  return agent === "opencode" ? ["mcp", "knownpath"] : ["mcpServers", "knownpath"];
}

function parseJsonc(source: string, path: string): unknown {
  const errors: ParseError[] = [];
  const parsed = parse(source, errors, { allowEmptyContent: false, allowTrailingComma: true });
  if (errors.length > 0) {
    throw new InstallerError(
      "agent_config_invalid",
      `Cannot safely modify ${path}: ${errors.map((error) => printParseErrorCode(error.error)).join(", ")}`,
    );
  }
  return parsed;
}

function readPath(document: unknown, path: readonly (string | number)[]): unknown {
  let value = document;
  for (const part of path) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[String(part)];
  }
  return value;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => deepEqual(value, right[index]))
    );
  }
  if (
    typeof left === "object" &&
    left !== null &&
    !Array.isArray(left) &&
    typeof right === "object" &&
    right !== null &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      deepEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) => deepEqual(leftRecord[key], rightRecord[key]))
    );
  }
  return false;
}

function ensureFinalNewline(source: string): string {
  return `${source.trimEnd()}\n`;
}

function configConflict(agent: string): InstallerError {
  return new InstallerError(
    "agent_config_conflict",
    `${agent} already has a non-KnownPath-owned MCP entry named knownpath; rename or remove it explicitly`,
  );
}
