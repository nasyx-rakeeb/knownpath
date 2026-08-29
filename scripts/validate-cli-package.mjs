import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const repositoryRoot = resolve(import.meta.dirname, "..");
const packageManifest = JSON.parse(
  await readFile(join(repositoryRoot, "apps/cli/package.json"), "utf8"),
);
const serverManifest = JSON.parse(await readFile(join(repositoryRoot, "server.json"), "utf8"));
const temporaryDirectory = await mkdtemp(join(repositoryRoot, ".knownpath-package-validation-"));

try {
  const packOutput = await run(packageManagerExecutable(), [
    "--filter",
    "knownpath",
    "pack",
    "--json",
    "--pack-destination",
    temporaryDirectory,
  ]);
  const packResult = JSON.parse(packOutput);
  const archive = await readTarGzip(packResult.filename);
  const expectedFiles = [
    "package/LICENSE",
    "package/README.md",
    "package/dist/index.js",
    "package/dist/index.js.map",
    "package/dist/skill/knownpath/SKILL.md",
    "package/dist/skill/knownpath/references/examples.md",
    "package/package.json",
  ];
  const files = [...archive.keys()].sort();
  assert(
    JSON.stringify(files) === JSON.stringify(expectedFiles),
    `Unexpected package files: ${files.join(", ")}`,
  );

  const packedManifest = JSON.parse(textEntry(archive, "package/package.json"));
  const serializedManifest = JSON.stringify(packedManifest);
  assert(!serializedManifest.includes("workspace:"), "Packed manifest contains workspace ranges");
  assert(!serializedManifest.includes("catalog:"), "Packed manifest contains catalog ranges");
  assert(packedManifest.name === "knownpath", "Packed package name is not knownpath");
  assert(packedManifest.version === packageManifest.version, "Packed package version drifted");
  assert(packedManifest.bin?.knownpath === "dist/index.js", "Packed binary path drifted");
  assert(packedManifest.license === "Apache-2.0", "Packed license metadata drifted");
  assert(
    packedManifest.mcpName === serverManifest.name,
    "package.json mcpName must match server.json name",
  );
  assert(serverManifest.version === packageManifest.version, "MCP server version drifted");
  assert(
    serverManifest.packages?.[0]?.version === packageManifest.version,
    "MCP package version drifted",
  );
  assert(
    serverManifest.packages?.[0]?.identifier === "knownpath",
    "MCP package identifier drifted",
  );
  assert(
    serverManifest.packages?.[0]?.packageArguments?.[0]?.value === "mcp",
    "MCP package command must invoke the mcp subcommand",
  );

  const sourceMap = textEntry(archive, "package/dist/index.js.map");
  assert(!sourceMap.includes(repositoryRoot), "Source map contains the local repository path");

  const consumerDirectory = join(temporaryDirectory, "consumer");
  const projectDirectory = join(consumerDirectory, "project");
  await mkdir(projectDirectory, { recursive: true });
  await run(npmExecutable(), [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefix",
    consumerDirectory,
    packResult.filename,
  ]);
  const executable = join(
    consumerDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "knownpath.cmd" : "knownpath",
  );
  const version = (await run(executable, ["--version"])).trim();
  assert(version === packageManifest.version, "Packed CLI returned the wrong version");
  await run(executable, ["--help"]);
  const status = await run(
    executable,
    [
      "status",
      "--agent",
      "codex",
      "--scope",
      "project",
      "--project-dir",
      projectDirectory,
      "--json",
    ],
    {},
    [0, 1],
  );
  JSON.parse(status);
  const dryRun = await run(
    executable,
    [
      "install",
      "--agent",
      "codex",
      "--scope",
      "project",
      "--project-dir",
      projectDirectory,
      "--dry-run",
      "--yes",
      "--json",
    ],
    {
      KNOWNPATH_API_URL: "https://knownpath.invalid",
      KNOWNPATH_API_KEY: "kp_phase21_validation_not_a_real_key",
    },
  );
  assert(!dryRun.includes("kp_phase21_validation_not_a_real_key"), "CLI output exposed API key");

  process.stdout.write(
    `${JSON.stringify({ package: `${packageManifest.name}@${version}`, files: files.length, mcpName: serverManifest.name, packedCli: "verified" })}\n`,
  );
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

function packageManagerExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, additions = {}, expectedCodes = [0]) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, ...additions },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (expectedCodes.includes(code)) {
        resolvePromise(stdout);
        return;
      }
      rejectPromise(
        new Error(
          `${command} ${args.join(" ")} failed with ${code}: ${stderr.trim().slice(0, 800)}`,
        ),
      );
    });
  });
}

async function readTarGzip(path) {
  const buffer = gunzipSync(await readFile(path));
  const entries = new Map();
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = nullTerminated(header.subarray(0, 100));
    const prefix = nullTerminated(header.subarray(345, 500));
    const fullName = prefix.length > 0 ? `${prefix}/${name}` : name;
    const sizeText = nullTerminated(header.subarray(124, 136)).trim();
    const size = Number.parseInt(sizeText || "0", 8);
    offset += 512;
    if (header[156] === 48 || header[156] === 0) {
      entries.set(fullName, buffer.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return entries;
}

function nullTerminated(buffer) {
  const end = buffer.indexOf(0);
  return buffer.subarray(0, end === -1 ? buffer.length : end).toString("utf8");
}

function textEntry(archive, name) {
  const value = archive.get(name);
  assert(value !== undefined, `Missing package entry: ${name}`);
  return value.toString("utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
