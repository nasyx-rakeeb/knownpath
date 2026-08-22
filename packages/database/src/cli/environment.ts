import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

export function loadWorkspaceEnvironment(): void {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
  const environmentFile = candidates.find((candidate) => existsSync(candidate));

  if (environmentFile !== undefined) {
    loadEnvFile(environmentFile);
  }
}
