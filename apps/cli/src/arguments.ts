import { parseArgs } from "node:util";

import {
  InstallerError,
  supportedAgentIds,
  type AgentId,
  type InstallationScope,
} from "@knownpath/agent-adapters";

export const cliCommands = [
  "install",
  "status",
  "update",
  "uninstall",
  "doctor",
  "login",
  "logout",
  "whoami",
  "mcp",
] as const;
export type CliCommand = (typeof cliCommands)[number];

export interface CliArguments {
  readonly agents?: readonly AgentId[];
  readonly apiUrl?: string;
  readonly authMode?: "api-key" | "browser";
  readonly command?: CliCommand;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly json: boolean;
  readonly projectDirectory?: string;
  readonly profileName?: string;
  readonly expectedWorkspaceId?: string;
  readonly scope: InstallationScope;
  readonly version: boolean;
  readonly yes: boolean;
}

export function parseCliArguments(arguments_: readonly string[]): CliArguments {
  const parsed = parseArgs({
    args: [...arguments_],
    allowPositionals: true,
    options: {
      agent: { type: "string", multiple: true },
      "api-url": { type: "string" },
      auth: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      json: { type: "boolean", default: false },
      "project-dir": { type: "string" },
      profile: { type: "string" },
      "workspace-id": { type: "string" },
      scope: { type: "string", default: "global" },
      version: { type: "boolean", short: "v", default: false },
      yes: { type: "boolean", short: "y", default: false },
    },
    strict: true,
  });
  if (parsed.positionals.length > 1) {
    throw new InstallerError("invalid_arguments", "KnownPath accepts one command at a time");
  }
  const command = parsed.positionals[0];
  if (command !== undefined && !cliCommands.includes(command as CliCommand)) {
    throw new InstallerError("unknown_command", `Unknown command: ${command}`);
  }
  const scope = parsed.values.scope;
  if (scope !== "global" && scope !== "project") {
    throw new InstallerError("invalid_scope", "--scope must be global or project");
  }
  const agents = parseAgents(parsed.values.agent);
  const authMode = parsed.values.auth;
  if (authMode !== undefined && authMode !== "browser" && authMode !== "api-key") {
    throw new InstallerError("invalid_auth_mode", "--auth must be browser or api-key");
  }
  const profileName = parsed.values.profile?.trim();
  const expectedWorkspaceId = parsed.values["workspace-id"]?.trim();
  if (profileName !== undefined && (profileName.length < 1 || profileName.length > 80)) {
    throw new InstallerError("invalid_profile", "--profile must be between 1 and 80 characters");
  }
  if (
    expectedWorkspaceId !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      expectedWorkspaceId,
    )
  ) {
    throw new InstallerError("invalid_workspace_id", "--workspace-id must be a UUID v4");
  }
  if (expectedWorkspaceId !== undefined && profileName === undefined) {
    throw new InstallerError(
      "profile_required",
      "--workspace-id requires a non-secret --profile label",
    );
  }
  return {
    ...(agents === undefined ? {} : { agents }),
    ...(parsed.values["api-url"] === undefined ? {} : { apiUrl: parsed.values["api-url"] }),
    ...(authMode === undefined ? {} : { authMode }),
    ...(command === undefined ? {} : { command: command as CliCommand }),
    dryRun: parsed.values["dry-run"] ?? false,
    help: parsed.values.help ?? false,
    json: parsed.values.json ?? false,
    ...(parsed.values["project-dir"] === undefined
      ? {}
      : { projectDirectory: parsed.values["project-dir"] }),
    ...(profileName === undefined ? {} : { profileName }),
    ...(expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId }),
    scope,
    version: parsed.values.version ?? false,
    yes: parsed.values.yes ?? false,
  };
}

function parseAgents(values: readonly string[] | undefined): readonly AgentId[] | undefined {
  if (values === undefined) return undefined;
  const requested = values.flatMap((value) => value.split(",")).map((value) => value.trim());
  if (requested.length === 0 || requested.some((value) => value === "")) {
    throw new InstallerError("invalid_agent", "--agent requires a supported agent name or all");
  }
  if (requested.includes("all")) {
    if (requested.length !== 1) {
      throw new InstallerError(
        "invalid_agent",
        "Use --agent all by itself, or list specific agents without all",
      );
    }
    return supportedAgentIds;
  }
  for (const agent of requested) {
    if (!supportedAgentIds.includes(agent as AgentId)) {
      throw new InstallerError(
        "unsupported_agent",
        `Unsupported agent ${agent}; choose ${supportedAgentIds.join(", ")}, or all`,
      );
    }
  }
  return [...new Set(requested)] as AgentId[];
}
