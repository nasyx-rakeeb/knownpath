import { homedir } from "node:os";
import { resolve } from "node:path";

import { adapterDefinition, detectAgents, mutateMcpConfig } from "./adapters.js";
import { inspectMcpConfig, writeMcpConfig } from "./configuration.js";
import { apiKeyEnvironmentName, installerStateVersion } from "./constants.js";
import { inspectKnownPathEnvironment } from "./environment.js";
import {
  backupFile,
  digestDirectory,
  installDirectory,
  pathExists,
  readSkillVersion,
  removeOwnedDirectory,
} from "./filesystem.js";
import { resolveInstallationPaths } from "./paths.js";
import {
  componentStatus,
  deduplicateSharedSkillChanges,
  planAgent,
  planSharedSkillRemoval,
  skillStatus,
} from "./planning.js";
import { runCommand } from "./process.js";
import {
  findOwnedInstallation,
  readInstallerState,
  removeOwnedInstallation,
  replaceOwnedInstallation,
  writeInstallerState,
  type InstallerState,
  type OwnedInstallation,
} from "./state.js";
import {
  InstallerError,
  supportedAgentIds,
  type AgentDetection,
  type AgentId,
  type AgentInstallationStatus,
  type CommandRunner,
  type DoctorCheck,
  type InstallationScope,
  type InstallerOperation,
  type InstallerReport,
  type InstallerRequest,
  type PlannedChange,
} from "./types.js";

export interface KnownPathInstallerOptions {
  readonly commandRunner?: CommandRunner;
  readonly fetch?: typeof globalThis.fetch;
}

interface PreparedContext {
  readonly agents: readonly AgentId[];
  readonly detections: ReadonlyMap<AgentId, AgentDetection>;
  readonly dryRun: boolean;
  readonly environment: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
  readonly projectDirectory: string;
  readonly scope: InstallationScope;
  readonly skillDigest: string;
  readonly skillSourceDirectory: string;
  readonly skillVersion: string;
  readonly profileName?: string;
  readonly expectedWorkspaceId?: string;
}

interface AgentSnapshot {
  readonly configFileExists: boolean;
  readonly detection: AgentDetection;
  readonly mcpActual: "absent" | "conflict" | "current" | "legacy";
  readonly owned?: OwnedInstallation;
  readonly paths: ReturnType<typeof resolveInstallationPaths>;
  readonly skillActualDigest?: string;
  readonly status: AgentInstallationStatus;
}

export class KnownPathInstaller {
  private readonly commandRunner: CommandRunner;
  private readonly fetchImplementation: typeof globalThis.fetch;

  public constructor(options: KnownPathInstallerOptions = {}) {
    this.commandRunner = options.commandRunner ?? runCommand;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
  }

  public detect(
    request: Omit<InstallerRequest, "skillSourceDirectory"> = {},
  ): Promise<AgentDetection[]> {
    const environment = effectiveEnvironment(request.environment, request.homeDirectory);
    return detectAgents({ environment, homeDirectory: request.homeDirectory ?? homedir() });
  }

  public install(request: InstallerRequest): Promise<InstallerReport> {
    return this.mutate("install", request);
  }

  public update(request: InstallerRequest): Promise<InstallerReport> {
    return this.mutate("update", request);
  }

  public uninstall(request: InstallerRequest): Promise<InstallerReport> {
    return this.mutate("uninstall", request);
  }

  public async status(request: InstallerRequest): Promise<InstallerReport> {
    const context = await this.prepare(request);
    const state = await readInstallerState(this.statePath(context));
    const snapshots = await this.snapshots(context, state);
    return {
      agents: snapshots.map((snapshot) => snapshot.status),
      applied: [],
      changes: [],
      checks: [],
      dryRun: context.dryRun,
      operation: "status",
      scope: context.scope,
      success: snapshots.every(
        (snapshot) => snapshot.status.mcp !== "conflict" && snapshot.status.skill !== "conflict",
      ),
    };
  }

  public async doctor(request: InstallerRequest): Promise<InstallerReport> {
    const context = await this.prepare(request);
    const state = await readInstallerState(this.statePath(context));
    const snapshots = await this.snapshots(context, state);
    const environmentStatus = inspectKnownPathEnvironment(context.environment);
    const checks: DoctorCheck[] = [
      {
        code: "node_runtime",
        message: `Node.js ${process.versions.node} is running`,
        status: Number(process.versions.node.split(".")[0]) >= 24 ? "pass" : "fail",
      },
      ...environmentStatus.checks,
      ...snapshots.flatMap((snapshot) => installationChecks(snapshot)),
    ];
    if (environmentStatus.apiUrl !== undefined && environmentStatus.apiKeyPresent) {
      const expectedWorkspaceIds = [
        ...new Set(
          snapshots.flatMap((snapshot) =>
            snapshot.status.expectedWorkspaceId === undefined
              ? []
              : [snapshot.status.expectedWorkspaceId],
          ),
        ),
      ];
      if (expectedWorkspaceIds.length > 1)
        checks.push({
          code: "workspace_profile_conflict",
          message:
            "Selected installations expect different workspace keys but share KNOWNPATH_API_KEY",
          status: "fail",
        });
      checks.push(
        ...(await this.networkChecks(
          environmentStatus.apiUrl,
          context.environment,
          context.expectedWorkspaceId ??
            (expectedWorkspaceIds.length === 1 ? expectedWorkspaceIds[0] : undefined),
        )),
      );
    } else {
      checks.push({
        code: "backend_skipped",
        message: "Backend checks were skipped until both required environment variables are valid",
        status: "warn",
      });
    }
    return {
      agents: snapshots.map((snapshot) => snapshot.status),
      applied: [],
      changes: [],
      checks,
      dryRun: context.dryRun,
      operation: "doctor",
      scope: context.scope,
      success: checks.every((check) => check.status !== "fail"),
    };
  }

  private async mutate(
    operation: Exclude<InstallerOperation, "status" | "doctor">,
    request: InstallerRequest,
  ): Promise<InstallerReport> {
    const context = await this.prepare(request);
    const statePath = this.statePath(context);
    let state = await readInstallerState(statePath);
    const snapshots = await this.snapshots(context, state);
    let changes = snapshots.flatMap((snapshot) => planAgent(operation, snapshot, context));
    if (operation === "uninstall") {
      changes.push(...planSharedSkillRemoval(snapshots, context, state));
    } else {
      changes = deduplicateSharedSkillChanges(changes);
    }
    if (context.dryRun) {
      return {
        agents: snapshots.map((snapshot) => snapshot.status),
        applied: [],
        changes,
        checks: [],
        dryRun: true,
        operation,
        scope: context.scope,
        success: true,
      };
    }

    const applied: PlannedChange[] = [];
    const managedSkillPaths = new Set(
      changes
        .filter((change) => ["install_skill", "update_skill"].includes(change.kind))
        .flatMap((change) => (change.path === undefined ? [] : [change.path])),
    );
    for (const snapshot of snapshots) {
      const agentChanges = changes.filter((change) => change.agent === snapshot.status.agent);
      if (agentChanges.length === 0) continue;
      const outcome = await this.applyAgent(
        operation,
        snapshot,
        context,
        state,
        agentChanges,
        applied,
        managedSkillPaths.has(snapshot.paths.skillPath),
      );
      state = outcome;
      await writeInstallerState(statePath, state);
    }
    const finalSnapshots = await this.snapshots(context, state);
    return {
      agents: finalSnapshots.map((snapshot) => snapshot.status),
      applied,
      changes,
      checks: [],
      dryRun: false,
      operation,
      scope: context.scope,
      success: true,
    };
  }

  private async applyAgent(
    operation: Exclude<InstallerOperation, "status" | "doctor">,
    snapshot: AgentSnapshot,
    context: PreparedContext,
    state: InstallerState,
    changes: readonly PlannedChange[],
    applied: PlannedChange[],
    sharedSkillManaged: boolean,
  ): Promise<InstallerState> {
    const agent = snapshot.status.agent;
    let backupPath = snapshot.owned?.configBackupPath;
    const configChange = changes.find((change) =>
      ["create_config_entry", "update_config_entry", "remove_config_entry"].includes(change.kind),
    );
    if (configChange !== undefined) {
      const backupChange = changes.find((change) => change.kind === "backup_config");
      if (backupChange !== undefined) {
        backupPath = await backupFile(snapshot.paths.configPath);
        applied.push({
          ...backupChange,
          ...(backupPath === undefined ? {} : { path: backupPath }),
        });
      }
      if (configChange.kind === "update_config_entry") {
        await writeMcpConfig(
          agent,
          snapshot.paths.configPath,
          "install",
          context.profileName ?? snapshot.owned?.profileName,
        );
      } else {
        await mutateMcpConfig({
          agent,
          commandRunner: this.commandRunner,
          configPath: snapshot.paths.configPath,
          cwd: context.projectDirectory,
          detection: snapshot.detection,
          environment: context.environment,
          operation: configChange.kind === "remove_config_entry" ? "remove" : "install",
          ...((context.profileName ?? snapshot.owned?.profileName) === undefined
            ? {}
            : { profileName: (context.profileName ?? snapshot.owned?.profileName)! }),
          scope: context.scope,
        });
      }
      applied.push(configChange);
    }

    const skillChange = changes.find((change) =>
      ["install_skill", "update_skill", "remove_skill"].includes(change.kind),
    );
    if (skillChange?.kind === "remove_skill") {
      await removeOwnedDirectory(snapshot.paths.skillPath);
      applied.push(skillChange);
    } else if (skillChange !== undefined) {
      const currentDigest = await digestDirectory(snapshot.paths.skillPath);
      if (currentDigest !== context.skillDigest) {
        await installDirectory(context.skillSourceDirectory, snapshot.paths.skillPath);
      }
      applied.push(skillChange);
    }

    if (operation === "uninstall") {
      const next = removeOwnedInstallation(state, agent, context.scope);
      const stateChange = changes.find((change) => change.kind === "remove_state");
      if (stateChange !== undefined) applied.push(stateChange);
      return next;
    }

    const installation: OwnedInstallation = {
      agent,
      configPath: snapshot.paths.configPath,
      ...(backupPath === undefined ? {} : { configBackupPath: backupPath }),
      mcpManaged:
        snapshot.owned?.mcpManaged ??
        (configChange?.kind === "create_config_entry" ||
          configChange?.kind === "update_config_entry"),
      scope: context.scope,
      skillDigest: context.skillDigest,
      skillManaged:
        snapshot.owned?.skillManaged ??
        (sharedSkillManaged ||
          skillChange?.kind === "install_skill" ||
          skillChange?.kind === "update_skill"),
      skillPath: snapshot.paths.skillPath,
      skillVersion: context.skillVersion,
      updatedAt: new Date().toISOString(),
      ...(context.profileName === undefined
        ? snapshot.owned?.profileName === undefined
          ? {}
          : { profileName: snapshot.owned.profileName }
        : { profileName: context.profileName }),
      ...(context.profileName !== undefined
        ? context.expectedWorkspaceId === undefined
          ? {}
          : { expectedWorkspaceId: context.expectedWorkspaceId }
        : snapshot.owned?.expectedWorkspaceId === undefined
          ? {}
          : { expectedWorkspaceId: snapshot.owned.expectedWorkspaceId }),
    };
    const stateChange = changes.find((change) => change.kind === "write_state");
    if (stateChange !== undefined) applied.push(stateChange);
    return replaceOwnedInstallation(state, installation);
  }

  private async prepare(request: InstallerRequest): Promise<PreparedContext> {
    const homeDirectory = resolve(request.homeDirectory ?? homedir());
    const projectDirectory = resolve(request.projectDirectory ?? process.cwd());
    const environment = effectiveEnvironment(request.environment, homeDirectory);
    const detections = await detectAgents({ environment, homeDirectory });
    const detectionMap = new Map(detections.map((detection) => [detection.id, detection]));
    const requested =
      request.agents ??
      detections.filter((detection) => detection.detected).map((detection) => detection.id);
    const agents = [...new Set(requested)];
    if (agents.length === 0) {
      throw new InstallerError(
        "no_agents_selected",
        "No supported agents were detected; select one explicitly with --agent",
      );
    }
    for (const agent of agents) {
      if (!supportedAgentIds.includes(agent)) {
        throw new InstallerError("unsupported_agent", `Unsupported agent: ${String(agent)}`);
      }
    }
    const skillSourceDirectory = resolve(request.skillSourceDirectory);
    const skillDigest = await digestDirectory(skillSourceDirectory);
    const skillVersion = await readSkillVersion(skillSourceDirectory);
    if (skillDigest === undefined || skillVersion === undefined) {
      throw new InstallerError(
        "skill_source_invalid",
        `The packaged KnownPath skill is missing or invalid at ${skillSourceDirectory}`,
      );
    }
    return {
      agents,
      detections: detectionMap,
      dryRun: request.dryRun ?? false,
      environment,
      homeDirectory,
      projectDirectory,
      scope: request.scope ?? "global",
      skillDigest,
      skillSourceDirectory,
      skillVersion,
      ...(request.profileName === undefined ? {} : { profileName: request.profileName }),
      ...(request.expectedWorkspaceId === undefined
        ? {}
        : { expectedWorkspaceId: request.expectedWorkspaceId }),
    };
  }

  private async snapshots(
    context: PreparedContext,
    state: InstallerState,
  ): Promise<AgentSnapshot[]> {
    return Promise.all(
      context.agents.map(async (agent) => {
        const detection = context.detections.get(agent) ?? {
          id: agent,
          displayName: adapterDefinition(agent).displayName,
          detected: false,
          evidence: [],
        };
        const paths = resolveInstallationPaths({
          agent,
          environment: context.environment,
          homeDirectory: context.homeDirectory,
          projectDirectory: context.projectDirectory,
          scope: context.scope,
        });
        const owned = findOwnedInstallation(state, agent, context.scope);
        const installedProfile = owned?.profileName;
        const desiredProfile = context.profileName ?? installedProfile;
        let mcpActual = await inspectMcpConfig(agent, paths.configPath, desiredProfile);
        if (
          mcpActual === "conflict" &&
          owned?.mcpManaged === true &&
          context.profileName !== undefined &&
          context.profileName !== installedProfile &&
          (await inspectMcpConfig(agent, paths.configPath, installedProfile)) === "current"
        ) {
          mcpActual = "legacy";
        }
        const configFileExists = await pathExists(paths.configPath);
        const skillActualDigest = await digestDirectory(paths.skillPath);
        const installedSkillVersion =
          skillActualDigest === undefined ? undefined : await readSkillVersion(paths.skillPath);
        return {
          configFileExists,
          detection,
          mcpActual,
          ...(owned === undefined ? {} : { owned }),
          paths,
          ...(skillActualDigest === undefined ? {} : { skillActualDigest }),
          status: {
            agent,
            configPath: paths.configPath,
            detected: detection.detected,
            displayName: detection.displayName,
            mcp: componentStatus(mcpActual, owned?.mcpManaged),
            scope: context.scope,
            skill: skillStatus(skillActualDigest, context.skillDigest, owned),
            skillPath: paths.skillPath,
            ...(installedSkillVersion === undefined ? {} : { version: installedSkillVersion }),
            ...(owned?.profileName === undefined ? {} : { profileName: owned.profileName }),
            ...(owned?.expectedWorkspaceId === undefined
              ? {}
              : { expectedWorkspaceId: owned.expectedWorkspaceId }),
          },
        };
      }),
    );
  }

  private statePath(context: PreparedContext): string {
    return resolveInstallationPaths({
      agent: context.agents[0]!,
      environment: context.environment,
      homeDirectory: context.homeDirectory,
      projectDirectory: context.projectDirectory,
      scope: context.scope,
    }).statePath;
  }

  private async networkChecks(
    apiUrl: string,
    environment: NodeJS.ProcessEnv,
    expectedWorkspaceId?: string,
  ): Promise<DoctorCheck[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const readiness = await this.fetchImplementation(new URL("health/ready", `${apiUrl}/`), {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const authorization = await this.fetchImplementation(
        new URL("api/v1/mcp/status", `${apiUrl}/`),
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${environment[apiKeyEnvironmentName] ?? ""}`,
          },
          signal: controller.signal,
        },
      );
      const checks: DoctorCheck[] = [
        {
          code: "backend_readiness",
          message: readiness.ok
            ? "KnownPath backend is ready"
            : `KnownPath backend readiness returned HTTP ${readiness.status}`,
          status: readiness.ok ? "pass" : "fail",
        },
        {
          code: "api_key_authorization",
          message: authorization.ok
            ? "KnownPath API key is authorized for MCP status"
            : `KnownPath API key check returned HTTP ${authorization.status}`,
          status: authorization.ok ? "pass" : "fail",
        },
      ];
      if (authorization.ok && expectedWorkspaceId !== undefined) {
        const binding = await readWorkspaceBinding(authorization);
        checks.push({
          code: "workspace_key_binding",
          message:
            binding === expectedWorkspaceId
              ? `API key is bound to expected workspace ${expectedWorkspaceId}`
              : "API key is not bound to the workspace expected by this installer profile",
          status: binding === expectedWorkspaceId ? "pass" : "fail",
        });
      }
      return checks;
    } catch {
      return [
        {
          code: "backend_unreachable",
          message: "KnownPath backend could not be reached within 5 seconds",
          status: "fail",
        },
      ];
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readWorkspaceBinding(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      authentication?: { binding?: { kind?: unknown; workspaceId?: unknown } };
    };
    const binding = body.authentication?.binding;
    return binding?.kind === "workspace" && typeof binding.workspaceId === "string"
      ? binding.workspaceId
      : undefined;
  } catch {
    return undefined;
  }
}

function installationChecks(snapshot: AgentSnapshot): DoctorCheck[] {
  return [
    {
      code: `${snapshot.status.agent}_detection`,
      message: snapshot.status.detected
        ? `${snapshot.status.displayName} is detected`
        : `${snapshot.status.displayName} is not detected; configuration can be prepared but client verification is pending`,
      status: snapshot.status.detected ? "pass" : "warn",
    },
    {
      code: `${snapshot.status.agent}_mcp`,
      message: `${snapshot.status.displayName} MCP entry is ${snapshot.status.mcp}`,
      status: ["current", "unmanaged"].includes(snapshot.status.mcp) ? "pass" : "fail",
    },
    {
      code: `${snapshot.status.agent}_skill`,
      message: `${snapshot.status.displayName} skill is ${snapshot.status.skill}`,
      status: ["current", "unmanaged"].includes(snapshot.status.skill) ? "pass" : "fail",
    },
  ];
}

function effectiveEnvironment(
  supplied: NodeJS.ProcessEnv | undefined,
  homeDirectory: string | undefined,
): NodeJS.ProcessEnv {
  const environment = { ...process.env, ...supplied };
  if (homeDirectory !== undefined) {
    environment["HOME"] = homeDirectory;
    environment["USERPROFILE"] = homeDirectory;
  }
  return environment;
}

export { installerStateVersion };
