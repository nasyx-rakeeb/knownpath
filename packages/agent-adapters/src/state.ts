import { dirname } from "node:path";
import { rmdir } from "node:fs/promises";

import { installerStateVersion } from "./constants.js";
import { atomicWrite, readTextIfPresent, removeOwnedDirectory } from "./filesystem.js";
import {
  InstallerError,
  supportedAgentIds,
  type AgentId,
  type InstallationScope,
} from "./types.js";

export interface OwnedInstallation {
  readonly agent: AgentId;
  readonly configPath: string;
  readonly configBackupPath?: string;
  readonly mcpManaged: boolean;
  readonly scope: InstallationScope;
  readonly skillDigest: string;
  readonly skillManaged: boolean;
  readonly skillPath: string;
  readonly skillVersion: string;
  readonly updatedAt: string;
}

export interface InstallerState {
  readonly installations: readonly OwnedInstallation[];
  readonly schemaVersion: number;
}

export async function readInstallerState(path: string): Promise<InstallerState> {
  const source = await readTextIfPresent(path);
  if (source === undefined) return { installations: [], schemaVersion: installerStateVersion };
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!isInstallerState(parsed)) throw new Error("invalid structure");
    return parsed;
  } catch {
    throw new InstallerError(
      "installer_state_invalid",
      `KnownPath installer state is invalid at ${path}; move it aside and retry`,
    );
  }
}

export async function writeInstallerState(path: string, state: InstallerState): Promise<void> {
  if (state.installations.length === 0) {
    await removeOwnedDirectory(path);
    await removeEmptyProjectStateDirectory(path);
    return;
  }
  await atomicWrite(path, `${JSON.stringify(state, null, 2)}\n`);
}

export function findOwnedInstallation(
  state: InstallerState,
  agent: AgentId,
  scope: InstallationScope,
): OwnedInstallation | undefined {
  return state.installations.find(
    (installation) => installation.agent === agent && installation.scope === scope,
  );
}

export function replaceOwnedInstallation(
  state: InstallerState,
  installation: OwnedInstallation,
): InstallerState {
  return {
    schemaVersion: installerStateVersion,
    installations: [
      ...state.installations.filter(
        (current) => current.agent !== installation.agent || current.scope !== installation.scope,
      ),
      installation,
    ].sort((left, right) => left.agent.localeCompare(right.agent)),
  };
}

export function removeOwnedInstallation(
  state: InstallerState,
  agent: AgentId,
  scope: InstallationScope,
): InstallerState {
  return {
    schemaVersion: installerStateVersion,
    installations: state.installations.filter(
      (installation) => installation.agent !== agent || installation.scope !== scope,
    ),
  };
}

function isInstallerState(value: unknown): value is InstallerState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    state["schemaVersion"] === installerStateVersion &&
    Array.isArray(state["installations"]) &&
    state["installations"].every(isOwnedInstallation)
  );
}

function isOwnedInstallation(value: unknown): value is OwnedInstallation {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    supportedAgentIds.includes(entry["agent"] as AgentId) &&
    ["global", "project"].includes(entry["scope"] as string) &&
    typeof entry["configPath"] === "string" &&
    (entry["configBackupPath"] === undefined || typeof entry["configBackupPath"] === "string") &&
    typeof entry["mcpManaged"] === "boolean" &&
    typeof entry["skillPath"] === "string" &&
    typeof entry["skillDigest"] === "string" &&
    typeof entry["skillVersion"] === "string" &&
    typeof entry["skillManaged"] === "boolean" &&
    typeof entry["updatedAt"] === "string"
  );
}

async function removeEmptyProjectStateDirectory(path: string): Promise<void> {
  if (!path.endsWith("installer-state.json")) return;
  const directory = dirname(path);
  try {
    await rmdir(directory);
  } catch {
    // A non-empty state directory may contain future KnownPath-owned files.
  }
}
