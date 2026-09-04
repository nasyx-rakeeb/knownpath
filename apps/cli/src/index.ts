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
import { logoutProfile, resolveRuntimeCredential, validateRuntimeCredential } from "./auth.js";
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
    await runMcpBridge(arguments_.profileName);
    return;
  }
  if (arguments_.command === "login") {
    const credential = await resolveRuntimeCredential({
      allowLogin: true,
      ...(arguments_.apiUrl === undefined ? {} : { apiUrl: arguments_.apiUrl }),
      ...(arguments_.authMode === undefined ? {} : { authMode: arguments_.authMode }),
      ...(arguments_.profileName === undefined ? {} : { profileName: arguments_.profileName }),
    });
    if (credential === undefined) throw new Error("KnownPath login did not produce a credential");
    const response = await validateRuntimeCredential(credential);
    if (!response.ok)
      throw new Error(`KnownPath credential check returned HTTP ${response.status}`);
    process.stdout.write(`Signed in to ${credential.apiUrl} (${credential.profileName}).\n`);
    return;
  }
  if (arguments_.command === "logout") {
    const outcome = await logoutProfile(arguments_.profileName);
    process.stdout.write(
      outcome.removed
        ? `Removed the local credential${outcome.revoked ? " and revoked it on the server" : "; server revocation could not be confirmed"}.\n`
        : "No stored KnownPath credential was found.\n",
    );
    return;
  }
  if (arguments_.command === "whoami") {
    const credential = await resolveRuntimeCredential({
      allowLogin: false,
      ...(arguments_.apiUrl === undefined ? {} : { apiUrl: arguments_.apiUrl }),
      ...(arguments_.authMode === undefined ? {} : { authMode: arguments_.authMode }),
      ...(arguments_.profileName === undefined ? {} : { profileName: arguments_.profileName }),
    });
    if (credential === undefined) throw new Error("Not signed in; run `npx knownpath login`");
    const response = await validateRuntimeCredential(credential);
    if (!response.ok)
      throw new Error(`KnownPath credential check returned HTTP ${response.status}`);
    const body = (await response.json()) as unknown;
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
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
    const credential =
      arguments_.command === "doctor"
        ? await resolveRuntimeCredential({
            allowLogin: false,
            ...(arguments_.apiUrl === undefined ? {} : { apiUrl: arguments_.apiUrl }),
            ...(arguments_.authMode === undefined ? {} : { authMode: arguments_.authMode }),
            ...(arguments_.profileName === undefined
              ? {}
              : { profileName: arguments_.profileName }),
          })
        : undefined;
    const diagnosticRequest =
      credential === undefined
        ? request
        : {
            ...request,
            environment: {
              ...process.env,
              KNOWNPATH_API_URL: credential.apiUrl,
              KNOWNPATH_API_KEY: credential.apiKey,
            },
          };
    const report =
      arguments_.command === "status"
        ? await installer.status(diagnosticRequest)
        : await installer.doctor(diagnosticRequest);
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
  const credential =
    operation === "uninstall"
      ? undefined
      : await resolveRuntimeCredential({
          allowLogin: true,
          ...(arguments_.apiUrl === undefined ? {} : { apiUrl: arguments_.apiUrl }),
          ...(arguments_.authMode === undefined ? {} : { authMode: arguments_.authMode }),
          ...(arguments_.profileName === undefined ? {} : { profileName: arguments_.profileName }),
        });
  if (operation !== "uninstall" && credential === undefined) {
    throw new Error("KnownPath authentication did not complete");
  }
  if (credential !== undefined) {
    const response = await validateRuntimeCredential(credential);
    if (!response.ok) {
      throw new Error(
        `The KnownPath credential is not authorized (HTTP ${response.status}); run \`npx knownpath logout\` and retry`,
      );
    }
  }
  const applied = await installer[operation]({ ...request, dryRun: false });
  if (operation === "uninstall" || credential === undefined) {
    finish(applied, arguments_.json);
    return;
  }
  const diagnosed = await installer.doctor({
    ...request,
    dryRun: false,
    environment: {
      ...process.env,
      KNOWNPATH_API_URL: credential.apiUrl,
      KNOWNPATH_API_KEY: credential.apiKey,
    },
  });
  finish(
    { ...applied, checks: diagnosed.checks, success: applied.success && diagnosed.success },
    arguments_.json,
  );
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
