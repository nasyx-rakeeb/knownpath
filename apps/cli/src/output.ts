import type { AgentDetection, InstallerReport } from "@knownpath/agent-adapters";

export function printDetection(detections: readonly AgentDetection[]): void {
  process.stdout.write("Supported agents:\n");
  for (const detection of detections) {
    process.stdout.write(
      `  ${detection.detected ? "detected" : "not detected"}  ${detection.displayName} (${detection.id})\n`,
    );
  }
}

export function printReport(report: InstallerReport, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `KnownPath ${report.operation}${report.dryRun ? " dry run" : ""} (${report.scope})\n`,
  );
  for (const agent of report.agents) {
    process.stdout.write(
      `  ${agent.displayName}: MCP ${agent.mcp}; skill ${agent.skill}; client ${agent.detected ? "detected" : "not detected"}\n`,
    );
    if (agent.profileName !== undefined) {
      process.stdout.write(
        `    profile ${agent.profileName}${agent.expectedWorkspaceId === undefined ? " (personal)" : `; workspace ${agent.expectedWorkspaceId}`}\n`,
      );
    }
  }
  if (report.changes.length === 0) process.stdout.write("  No changes required.\n");
  else {
    process.stdout.write(report.dryRun ? "Planned changes:\n" : "Changes:\n");
    for (const change of report.changes) {
      process.stdout.write(
        `  - [${change.agent}] ${change.summary}${change.path === undefined ? "" : `: ${change.path}`}\n`,
      );
    }
  }
  if (report.checks.length > 0) {
    process.stdout.write("Checks:\n");
    for (const check of report.checks) {
      process.stdout.write(`  ${check.status.toUpperCase()} ${check.code}: ${check.message}\n`);
    }
  }
}

export function printHelp(): void {
  process.stdout.write(`KnownPath installer CLI

Usage:
  knownpath <command> [options]

Commands:
  install      Configure KnownPath MCP and install the Agent Skill
  status       Inspect local KnownPath installation state
  update       Reconcile installer-owned files to this CLI version
  uninstall    Remove only installer-owned KnownPath entries and files
  doctor       Diagnose environment, backend, agent config, and skill state
  login        Sign in through the browser and create a machine credential
  logout       Revoke and remove the selected machine credential
  whoami       Show the authenticated KnownPath connection
  mcp          Run the thin stdio-to-HTTP MCP bridge

Options:
  --agent <id|all>      Target one or more agents, or all supported agents; repeatable
  --scope <scope>       global (default) or project
  --project-dir <path>  Project root for project-scoped configuration
  --api-url <origin>    Use an explicit self-hosted KnownPath API origin
  --auth <mode>         browser (default) or api-key (advanced environment mode)
  --profile <label>     Record a non-secret key profile label
  --workspace-id <id>   Require the profile key to match this workspace UUID
  --dry-run             Show the exact change plan without writing
  --yes, -y             Confirm changes non-interactively
  --json                Emit machine-readable JSON
  --help, -h            Show help
  --version, -v         Show the CLI version

Hosted installation signs in through the browser and stores a scoped machine credential in the
native OS credential store. Agent configuration contains no credential. Self-hosters may use
--api-url; the legacy KNOWNPATH_API_URL and KNOWNPATH_API_KEY pair remains supported explicitly.
`);
}
