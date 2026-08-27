#!/usr/bin/env node

import { checkbox, confirm } from "@inquirer/prompts";
import {
  InstallerError,
  KnownPathInstaller,
  installerVersion,
  type AgentId,
  type InstallerReport,
} from "@knownpath/agent-adapters";

import { parseCliArguments } from "./arguments.js";
import { runMcpBridge } from "./mcp.js";
import { printDetection, printHelp, printReport } from "./output.js";
import { resolvePackagedSkillDirectory } from "./skill.js";

async function main(): Promise<void> {
  const arguments_ = parseCliArguments(process.argv.slice(2));
  if (arguments_.version) {
    process.stdout.write(`${installerVersion}\n`);
    return;
  }
  if (arguments_.help || arguments_.command === undefined) {
    printHelp();
    return;
  }
  if (arguments_.command === "mcp") {
    await runMcpBridge();
    return;
  }

  const installer = new KnownPathInstaller();
  const detections = await installer.detect({
    ...(arguments_.projectDirectory === undefined
      ? {}
      : { projectDirectory: arguments_.projectDirectory }),
    scope: arguments_.scope,
  });
  let agents = arguments_.agents;
  if (agents === undefined) {
    if (!process.stdin.isTTY || arguments_.json) {
      throw new InstallerError(
        "agents_required",
        "Non-interactive and JSON modes require at least one explicit --agent",
      );
    }
    printDetection(detections);
    const detected = detections.filter((detection) => detection.detected);
    agents = await checkbox<AgentId>({
      message: "Select agents to configure",
      choices: detections.map((detection) => ({
        name: `${detection.displayName}${detection.detected ? "" : " (not detected)"}`,
        value: detection.id,
        checked: detection.detected,
      })),
      required: true,
    });
    if (detected.length === 0) {
      process.stdout.write(
        "No supported agent executable was detected; selected configs remain unverified.\n",
      );
    }
  }

  const request = {
    agents,
    dryRun: arguments_.dryRun,
    ...(arguments_.projectDirectory === undefined
      ? {}
      : { projectDirectory: arguments_.projectDirectory }),
    scope: arguments_.scope,
    skillSourceDirectory: await resolvePackagedSkillDirectory(),
    ...(arguments_.profileName === undefined ? {} : { profileName: arguments_.profileName }),
    ...(arguments_.expectedWorkspaceId === undefined
      ? {}
      : { expectedWorkspaceId: arguments_.expectedWorkspaceId }),
  } as const;

  if (arguments_.command === "status" || arguments_.command === "doctor") {
    const report =
      arguments_.command === "status"
        ? await installer.status(request)
        : await installer.doctor(request);
    finish(report, arguments_.json);
    return;
  }

  const operation = arguments_.command;
  const preview = await installer[operation]({ ...request, dryRun: true });
  if (!arguments_.json || arguments_.dryRun) printReport(preview, arguments_.json);
  if (arguments_.dryRun) return;
  if (!arguments_.yes) {
    if (!process.stdin.isTTY || arguments_.json) {
      throw new InstallerError(
        "confirmation_required",
        "Use --yes for non-interactive changes after reviewing --dry-run output",
      );
    }
    const accepted = await confirm({ message: "Apply these KnownPath changes?", default: false });
    if (!accepted) {
      process.stdout.write("No changes applied.\n");
      return;
    }
  }
  const report = await installer[operation]({ ...request, dryRun: false });
  finish(report, arguments_.json);
}

function finish(report: InstallerReport, json: boolean): void {
  printReport(report, json);
  if (!report.success) process.exitCode = 1;
}

function safeMessage(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof InstallerError) return { code: error.code, message: redact(error.message) };
  if (error instanceof Error) return { code: "unexpected_error", message: redact(error.message) };
  return { code: "unexpected_error", message: "KnownPath encountered an unknown error" };
}

function redact(message: string): string {
  let redacted = message.replace(/Bearer\s+[^\s]+/giu, "Bearer [REDACTED]");
  for (const name of ["KNOWNPATH_API_KEY", "KNOWNPATH_API_URL"] as const) {
    const value = process.env[name];
    if (value !== undefined && value !== "") redacted = redacted.replaceAll(value, `[${name}]`);
  }
  return redacted;
}

main().catch((error: unknown) => {
  const safe = safeMessage(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ error: safe }, null, 2)}\n`);
  } else {
    process.stderr.write(`KnownPath ${safe.code}: ${safe.message}\n`);
  }
  process.exitCode = 1;
});
