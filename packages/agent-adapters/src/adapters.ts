import { access } from "node:fs/promises";
import { join } from "node:path";

import {
  apiKeyEnvironmentName,
  apiUrlEnvironmentName,
  stdioArguments,
  stdioCommand,
} from "./constants.js";
import { writeMcpConfig } from "./configuration.js";
import { findExecutable } from "./process.js";
import {
  InstallerError,
  type AgentDetection,
  type AgentId,
  type CommandRunner,
  type InstallationScope,
} from "./types.js";

interface AdapterDefinition {
  readonly displayName: string;
  readonly executables: readonly string[];
  readonly id: AgentId;
}

const definitions: readonly AdapterDefinition[] = [
  { id: "codex", displayName: "OpenAI Codex CLI", executables: ["codex"] },
  { id: "claude", displayName: "Claude Code", executables: ["claude"] },
  { id: "cursor", displayName: "Cursor", executables: ["cursor", "cursor-agent"] },
  { id: "gemini", displayName: "Gemini CLI", executables: ["gemini"] },
  { id: "opencode", displayName: "OpenCode", executables: ["opencode"] },
];

export function adapterDefinition(agent: AgentId): AdapterDefinition {
  return definitions.find((definition) => definition.id === agent)!;
}

export async function detectAgents(input: {
  readonly environment: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
}): Promise<AgentDetection[]> {
  return Promise.all(
    definitions.map(async (definition) => {
      const executable = await findExecutable(definition.executables, input.environment);
      const evidence: string[] = [];
      if (executable !== undefined) evidence.push(`executable:${definition.executables[0]}`);
      if (definition.id === "cursor" && (await cursorApplicationPresent(input.homeDirectory))) {
        evidence.push("application:cursor");
      }
      return {
        id: definition.id,
        displayName: definition.displayName,
        detected: evidence.length > 0,
        ...(executable === undefined ? {} : { executable }),
        evidence,
      };
    }),
  );
}

export async function mutateMcpConfig(input: {
  readonly agent: AgentId;
  readonly commandRunner: CommandRunner;
  readonly configPath: string;
  readonly cwd: string;
  readonly detection: AgentDetection;
  readonly environment: NodeJS.ProcessEnv;
  readonly operation: "install" | "remove";
  readonly scope: InstallationScope;
}): Promise<void> {
  if (input.agent === "claude" && input.detection.executable !== undefined) {
    await runOfficialMutation(input, claudeArguments(input.operation, input.scope));
    return;
  }
  if (input.agent === "gemini" && input.detection.executable !== undefined) {
    await runOfficialMutation(input, geminiArguments(input.operation, input.scope));
    return;
  }
  await writeMcpConfig(input.agent, input.configPath, input.operation);
}

function claudeArguments(
  operation: "install" | "remove",
  scope: InstallationScope,
): readonly string[] {
  const mappedScope = scope === "global" ? "user" : "project";
  if (operation === "remove") return ["mcp", "remove", "--scope", mappedScope, "knownpath"];
  return [
    "mcp",
    "add",
    "--scope",
    mappedScope,
    "--env",
    `${apiUrlEnvironmentName}=\${${apiUrlEnvironmentName}}`,
    "--env",
    `${apiKeyEnvironmentName}=\${${apiKeyEnvironmentName}}`,
    "--transport",
    "stdio",
    "knownpath",
    "--",
    stdioCommand,
    ...stdioArguments,
  ];
}

function geminiArguments(
  operation: "install" | "remove",
  scope: InstallationScope,
): readonly string[] {
  const mappedScope = scope === "global" ? "user" : "project";
  if (operation === "remove") return ["mcp", "remove", "--scope", mappedScope, "knownpath"];
  return [
    "mcp",
    "add",
    "--scope",
    mappedScope,
    "--transport",
    "stdio",
    "--env",
    `${apiUrlEnvironmentName}=$${apiUrlEnvironmentName}`,
    "--env",
    `${apiKeyEnvironmentName}=$${apiKeyEnvironmentName}`,
    "knownpath",
    stdioCommand,
    "--",
    ...stdioArguments,
  ];
}

async function runOfficialMutation(
  input: Parameters<typeof mutateMcpConfig>[0],
  arguments_: readonly string[],
): Promise<void> {
  const result = await input.commandRunner(input.detection.executable!, arguments_, {
    cwd: input.cwd,
    environment: input.environment,
  });
  if (result.code !== 0) {
    throw new InstallerError(
      "agent_configuration_failed",
      `${input.detection.displayName} could not ${input.operation} the KnownPath MCP entry; run its MCP status command for details`,
    );
  }
}

async function cursorApplicationPresent(homeDirectory: string): Promise<boolean> {
  const candidates =
    process.platform === "darwin"
      ? ["/Applications/Cursor.app", join(homeDirectory, "Applications", "Cursor.app")]
      : process.platform === "win32"
        ? [
            join(
              process.env["LOCALAPPDATA"] ?? join(homeDirectory, "AppData", "Local"),
              "Programs",
              "cursor",
              "Cursor.exe",
            ),
          ]
        : ["/usr/bin/cursor", "/usr/local/bin/cursor"];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return true;
    } catch {
      // Continue through documented platform locations.
    }
  }
  return false;
}
