import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";

import type { CommandResult, CommandRunner } from "./types.js";

export const runCommand: CommandRunner = async (executable, arguments_, options) =>
  new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, [...arguments_], {
      cwd: options.cwd,
      env: options.environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        code: code ?? 1,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      });
    });
  });

export async function findExecutable(
  names: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const paths = (environment["PATH"] ?? "").split(delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (environment["PATHEXT"] ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  for (const name of names) {
    for (const directory of paths) {
      for (const extension of extensions) {
        const candidate = join(directory, `${name}${extension}`);
        try {
          await access(candidate);
          return candidate;
        } catch {
          // Continue searching PATH without exposing it in output.
        }
      }
    }
  }
  return undefined;
}
