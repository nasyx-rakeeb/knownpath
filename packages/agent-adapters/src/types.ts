export const supportedAgentIds = ["codex", "claude", "cursor", "gemini", "opencode"] as const;

export type AgentId = (typeof supportedAgentIds)[number];
export type InstallationScope = "global" | "project";
export type InstallerOperation = "install" | "status" | "update" | "uninstall" | "doctor";
export type ChangeKind =
  | "backup_config"
  | "create_config_entry"
  | "update_config_entry"
  | "remove_config_entry"
  | "install_skill"
  | "update_skill"
  | "remove_skill"
  | "write_state"
  | "remove_state";

export interface AgentDetection {
  readonly id: AgentId;
  readonly displayName: string;
  readonly detected: boolean;
  readonly executable?: string;
  readonly evidence: readonly string[];
}

export interface PlannedChange {
  readonly agent: AgentId;
  readonly kind: ChangeKind;
  readonly path?: string;
  readonly summary: string;
}

export type ComponentState =
  "absent" | "configured" | "conflict" | "current" | "modified" | "stale" | "unmanaged";

export interface AgentInstallationStatus {
  readonly agent: AgentId;
  readonly configPath: string;
  readonly detected: boolean;
  readonly displayName: string;
  readonly mcp: ComponentState;
  readonly scope: InstallationScope;
  readonly skill: ComponentState;
  readonly skillPath: string;
  readonly version?: string;
}

export interface DoctorCheck {
  readonly code: string;
  readonly message: string;
  readonly status: "fail" | "pass" | "warn";
}

export interface InstallerReport {
  readonly agents: readonly AgentInstallationStatus[];
  readonly applied: readonly PlannedChange[];
  readonly changes: readonly PlannedChange[];
  readonly checks: readonly DoctorCheck[];
  readonly dryRun: boolean;
  readonly operation: InstallerOperation;
  readonly scope: InstallationScope;
  readonly success: boolean;
}

export interface InstallerRequest {
  readonly agents?: readonly AgentId[];
  readonly dryRun?: boolean;
  readonly environment?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
  readonly projectDirectory?: string;
  readonly scope?: InstallationScope;
  readonly skillSourceDirectory: string;
}

export interface CommandResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

export type CommandRunner = (
  executable: string,
  arguments_: readonly string[],
  options: { readonly cwd: string; readonly environment: NodeJS.ProcessEnv },
) => Promise<CommandResult>;

export class InstallerError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InstallerError";
  }
}
