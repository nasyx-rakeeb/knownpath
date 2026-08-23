import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { InstallerError } from "@knownpath/agent-adapters";

export async function resolvePackagedSkillDirectory(): Promise<string> {
  const candidates = [
    fileURLToPath(new URL("./skill/knownpath", import.meta.url)),
    fileURLToPath(new URL("../../../skills/knownpath", import.meta.url)),
  ];
  for (const candidate of candidates) {
    try {
      await access(join(candidate, "SKILL.md"));
      return candidate;
    } catch {
      // Continue to the development checkout fallback.
    }
  }
  throw new InstallerError(
    "skill_source_missing",
    "The KnownPath package does not contain the canonical Agent Skill",
  );
}
