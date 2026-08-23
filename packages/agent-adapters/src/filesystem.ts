import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

export async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(
    dirname(path),
    `.${basename(path)}.knownpath-${process.pid}-${Date.now()}.tmp`,
  );
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await chmod(path, 0o600).catch(() => undefined);
}

export async function backupFile(path: string): Promise<string | undefined> {
  if (!(await pathExists(path))) return undefined;
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const backup = `${path}.knownpath-backup-${stamp}`;
  await copyFile(path, backup, constants.COPYFILE_EXCL);
  await chmod(backup, 0o600).catch(() => undefined);
  return backup;
}

export async function digestDirectory(path: string): Promise<string | undefined> {
  if (!(await pathExists(path))) return undefined;
  const files = await listFiles(path);
  const hash = createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(join(path, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function installDirectory(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.knownpath-${process.pid}-${Date.now()}.tmp`,
  );
  const previous = `${temporary}.previous`;
  await cp(source, temporary, { recursive: true });
  const exists = await pathExists(destination);
  if (exists) await rename(destination, previous);
  try {
    await rename(temporary, destination);
    if (exists) await rm(previous, { force: true, recursive: true });
  } catch (error) {
    await rm(temporary, { force: true, recursive: true });
    if (exists && !(await pathExists(destination))) await rename(previous, destination);
    throw error;
  }
}

export async function removeOwnedDirectory(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

export async function readSkillVersion(path: string): Promise<string | undefined> {
  const source = await readTextIfPresent(join(path, "SKILL.md"));
  return source?.match(/^\s{2}version:\s*["']?([^"'\s]+)["']?\s*$/mu)?.[1];
}

async function listFiles(root: string, relative = ""): Promise<string[]> {
  const directory = join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = relative === "" ? entry.name : join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, child)));
    else if (entry.isFile()) files.push(child);
    else if (entry.isSymbolicLink()) {
      const information = await stat(join(root, child));
      if (information.isDirectory()) files.push(...(await listFiles(root, child)));
      else if (information.isFile()) files.push(child);
    }
  }
  return files.sort();
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
