import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const applicationDirectory = fileURLToPath(new URL("../", import.meta.url));
const distributionDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const skillSourceDirectory = fileURLToPath(new URL("../../../skills/knownpath/", import.meta.url));
const skillTargetDirectory = fileURLToPath(new URL("../dist/skill/knownpath/", import.meta.url));

await rm(distributionDirectory, { force: true, recursive: true });
await mkdir(distributionDirectory, { recursive: true });
await build({
  absWorkingDir: applicationDirectory,
  alias: {
    "@knownpath/agent-adapters": resolve(
      applicationDirectory,
      "../../packages/agent-adapters/src/index.ts",
    ),
    "@knownpath/config": resolve(applicationDirectory, "../../packages/config/src/index.ts"),
    "@knownpath/domain": resolve(applicationDirectory, "../../packages/domain/src/index.ts"),
    "@knownpath/mcp": resolve(applicationDirectory, "../../packages/mcp/src/index.ts"),
  },
  banner: {
    js: 'import { createRequire as __knownpathCreateRequire } from "node:module"; const require = __knownpathCreateRequire(import.meta.url);',
  },
  bundle: true,
  entryPoints: ["src/index.ts"],
  external: [
    "@inquirer/prompts",
    "@modelcontextprotocol/server",
    "@modelcontextprotocol/server/*",
    "@napi-rs/keyring",
    "jsonc-parser",
    "open",
    "zod",
  ],
  format: "esm",
  legalComments: "external",
  outfile: "dist/index.js",
  packages: "bundle",
  platform: "node",
  sourcemap: true,
  target: "node24",
});
await cp(skillSourceDirectory, skillTargetDirectory, { recursive: true });
