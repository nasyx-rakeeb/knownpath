import type { InstallationPaths } from "./paths.js";
import type { InstallerState, OwnedInstallation } from "./state.js";
import {
  InstallerError,
  type AgentInstallationStatus,
  type ComponentState,
  type InstallationScope,
  type InstallerOperation,
  type PlannedChange,
} from "./types.js";

export interface PlanningContext {
  readonly scope: InstallationScope;
  readonly skillDigest: string;
  readonly profileName?: string;
  readonly expectedWorkspaceId?: string;
}

export interface PlanningSnapshot {
  readonly configFileExists: boolean;
  readonly mcpActual: "absent" | "conflict" | "current";
  readonly owned?: OwnedInstallation;
  readonly paths: InstallationPaths;
  readonly skillActualDigest?: string;
  readonly status: AgentInstallationStatus;
}

export function planAgent(
  operation: Exclude<InstallerOperation, "status" | "doctor">,
  snapshot: PlanningSnapshot,
  context: PlanningContext,
): PlannedChange[] {
  const changes: PlannedChange[] = [];
  const agent = snapshot.status.agent;
  if (operation === "uninstall") {
    if (snapshot.owned === undefined) return changes;
    if (snapshot.owned.mcpManaged) {
      if (snapshot.mcpActual === "conflict") throw modifiedConfig(snapshot);
      if (snapshot.mcpActual === "current") {
        changes.push(backupChange(snapshot));
        changes.push(
          change(
            agent,
            "remove_config_entry",
            snapshot.paths.configPath,
            "Remove the KnownPath MCP entry",
          ),
        );
      }
    }
    if (snapshot.owned.skillManaged && snapshot.skillActualDigest !== undefined) {
      if (snapshot.skillActualDigest !== snapshot.owned.skillDigest) throw modifiedSkill(snapshot);
    }
    changes.push(
      change(
        agent,
        "remove_state",
        undefined,
        "Remove this adapter from KnownPath installer state",
      ),
    );
    return changes;
  }

  if (operation === "update" && snapshot.owned === undefined) {
    throw new InstallerError(
      "installation_not_owned",
      `${snapshot.status.displayName} is not managed by KnownPath; run install first`,
    );
  }
  if (snapshot.mcpActual === "conflict") {
    throw modifiedConfig(snapshot);
  } else if (snapshot.mcpActual === "absent") {
    if (operation === "update" && snapshot.owned?.mcpManaged !== true)
      throw modifiedConfig(snapshot);
    if (snapshot.configFileExists) changes.push(backupChange(snapshot));
    changes.push(
      change(
        agent,
        "create_config_entry",
        snapshot.paths.configPath,
        "Add the KnownPath stdio MCP bridge entry",
      ),
    );
  }

  if (snapshot.skillActualDigest === undefined) {
    if (operation === "update" && snapshot.owned?.skillManaged !== true)
      throw modifiedSkill(snapshot);
    changes.push(
      change(
        agent,
        "install_skill",
        snapshot.paths.skillPath,
        "Install the canonical KnownPath Agent Skill",
      ),
    );
  } else if (snapshot.skillActualDigest !== context.skillDigest) {
    if (snapshot.owned?.skillManaged !== true) throw modifiedSkill(snapshot);
    if (snapshot.skillActualDigest !== snapshot.owned.skillDigest) throw modifiedSkill(snapshot);
    changes.push(
      change(
        agent,
        "update_skill",
        snapshot.paths.skillPath,
        "Update the canonical KnownPath Agent Skill",
      ),
    );
  }
  const profileChanged =
    context.profileName !== undefined &&
    (snapshot.owned?.profileName !== context.profileName ||
      snapshot.owned?.expectedWorkspaceId !== context.expectedWorkspaceId);
  if (snapshot.owned === undefined || changes.length > 0 || profileChanged) {
    changes.push(
      change(agent, "write_state", undefined, "Record non-secret installer ownership metadata"),
    );
  }
  return changes;
}

export function planSharedSkillRemoval(
  snapshots: readonly PlanningSnapshot[],
  context: PlanningContext,
  state: InstallerState,
): PlannedChange[] {
  const selected = new Set(snapshots.map((snapshot) => snapshot.status.agent));
  const changes: PlannedChange[] = [];
  const plannedPaths = new Set<string>();
  for (const snapshot of snapshots) {
    if (
      snapshot.owned?.skillManaged !== true ||
      snapshot.skillActualDigest === undefined ||
      plannedPaths.has(snapshot.paths.skillPath)
    ) {
      continue;
    }
    const retainedOwner = state.installations.some(
      (installation) =>
        installation.scope === context.scope &&
        installation.skillManaged &&
        installation.skillPath === snapshot.paths.skillPath &&
        !selected.has(installation.agent),
    );
    if (!retainedOwner) {
      plannedPaths.add(snapshot.paths.skillPath);
      changes.push(
        change(
          snapshot.status.agent,
          "remove_skill",
          snapshot.paths.skillPath,
          "Remove the installer-owned KnownPath skill",
        ),
      );
    }
  }
  return changes;
}

export function deduplicateSharedSkillChanges(changes: readonly PlannedChange[]): PlannedChange[] {
  const plannedPaths = new Set<string>();
  return changes.filter((change) => {
    if (!["install_skill", "update_skill"].includes(change.kind) || change.path === undefined) {
      return true;
    }
    if (plannedPaths.has(change.path)) return false;
    plannedPaths.add(change.path);
    return true;
  });
}

export function componentStatus(
  actual: "absent" | "conflict" | "current",
  managed: boolean | undefined,
): ComponentState {
  if (actual === "absent") return managed === true ? "stale" : "absent";
  if (actual === "conflict") return managed === true ? "modified" : "conflict";
  return managed === true ? "current" : "unmanaged";
}

export function skillStatus(
  actualDigest: string | undefined,
  desiredDigest: string,
  owned: OwnedInstallation | undefined,
): ComponentState {
  if (actualDigest === undefined) return owned?.skillManaged === true ? "stale" : "absent";
  if (actualDigest === desiredDigest) return owned?.skillManaged === true ? "current" : "unmanaged";
  if (owned?.skillManaged === true) {
    return actualDigest === owned.skillDigest ? "stale" : "modified";
  }
  return "conflict";
}

function backupChange(snapshot: PlanningSnapshot): PlannedChange {
  return change(
    snapshot.status.agent,
    "backup_config",
    snapshot.paths.configPath,
    "Back up the existing agent configuration before mutation",
  );
}

function change(
  agent: AgentInstallationStatus["agent"],
  kind: PlannedChange["kind"],
  path: string | undefined,
  summary: string,
): PlannedChange {
  return { agent, kind, ...(path === undefined ? {} : { path }), summary };
}

function modifiedConfig(snapshot: PlanningSnapshot): InstallerError {
  return new InstallerError(
    "agent_config_conflict",
    `${snapshot.status.displayName} has a conflicting or locally modified knownpath MCP entry at ${snapshot.paths.configPath}`,
  );
}

function modifiedSkill(snapshot: PlanningSnapshot): InstallerError {
  return new InstallerError(
    "skill_conflict",
    `${snapshot.status.displayName} has a conflicting or locally modified KnownPath skill at ${snapshot.paths.skillPath}`,
  );
}
