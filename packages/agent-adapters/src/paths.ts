import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { AgentId, InstallationScope } from "./types.js";

export interface InstallationPaths {
  readonly configPath: string;
  readonly skillPath: string;
  readonly statePath: string;
}

export function resolveInstallationPaths(input: {
  readonly agent: AgentId;
  readonly environment: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
  readonly projectDirectory?: string;
  readonly scope: InstallationScope;
}): InstallationPaths {
  const home = resolve(input.homeDirectory ?? homedir());
  const project = resolve(input.projectDirectory ?? process.cwd());
  const base = input.scope === "global" ? home : project;
  return {
    configPath: resolveConfigPath(input.agent, input.scope, base, input.environment),
    skillPath: resolveSkillPath(input.agent, base),
    statePath:
      input.scope === "project"
        ? join(project, ".knownpath", "installer-state.json")
        : join(resolveGlobalStateDirectory(home, input.environment), "installer-state.json"),
  };
}

function resolveConfigPath(
  agent: AgentId,
  scope: InstallationScope,
  base: string,
  environment: NodeJS.ProcessEnv,
): string {
  if (agent === "codex") return join(base, ".codex", "config.toml");
  if (agent === "claude")
    return scope === "global" ? join(base, ".claude.json") : join(base, ".mcp.json");
  if (agent === "cursor") return join(base, ".cursor", "mcp.json");
  if (agent === "gemini") return join(base, ".gemini", "settings.json");
  if (scope === "project") {
    const jsonc = join(base, "opencode.jsonc");
    const json = join(base, "opencode.json");
    return existsSync(jsonc) || !existsSync(json) ? jsonc : json;
  }
  const configBase = resolveOpenCodeConfigBase(base, environment);
  const jsonc = join(configBase, "opencode", "opencode.jsonc");
  const json = join(configBase, "opencode", "opencode.json");
  return existsSync(jsonc) || !existsSync(json) ? jsonc : json;
}

function resolveSkillPath(agent: AgentId, base: string): string {
  if (agent === "claude") return join(base, ".claude", "skills", "knownpath");
  return join(base, ".agents", "skills", "knownpath");
}

function resolveGlobalStateDirectory(home: string, environment: NodeJS.ProcessEnv): string {
  if (process.platform === "win32") {
    return join(environment["APPDATA"] ?? join(home, "AppData", "Roaming"), "KnownPath");
  }
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "KnownPath");
  }
  return join(environment["XDG_CONFIG_HOME"] ?? join(home, ".config"), "knownpath");
}

function resolveOpenCodeConfigBase(home: string, environment: NodeJS.ProcessEnv): string {
  if (process.platform === "win32") {
    return environment["APPDATA"] ?? join(home, "AppData", "Roaming");
  }
  return environment["XDG_CONFIG_HOME"] ?? join(home, ".config");
}
