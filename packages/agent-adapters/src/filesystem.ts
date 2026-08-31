import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  lstat,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

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
    await assertSafeExistingFile(path);
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

export async function atomicWrite(path: string, contents: string): Promise<void> {
  assertAbsolutePath(path);
  await assertNoSymbolicLinkComponents(dirname(path));
  await mkdir(dirname(path), { recursive: true });
  await assertNoSymbolicLinkComponents(dirname(path));
  if (await pathExists(path)) await assertSafeExistingFile(path);
  const temporary = join(
    dirname(path),
    `.${basename(path)}.knownpath-${process.pid}-${Date.now()}.tmp`,
  );
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
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
  await assertSafeExistingFile(path);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const backup = `${path}.knownpath-backup-${stamp}`;
  await copyFile(path, backup, constants.COPYFILE_EXCL);
  await chmod(backup, 0o600).catch(() => undefined);
  return backup;
}

export async function digestDirectory(path: string): Promise<string | undefined> {
  if (!(await pathExists(path))) return undefined;
  await assertSafeExistingDirectory(path);
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
  assertAbsolutePath(source);
  assertAbsolutePath(destination);
  await assertSafeExistingDirectory(source);
  await listFiles(source);
  await assertNoSymbolicLinkComponents(dirname(destination));
  await mkdir(dirname(destination), { recursive: true });
  await assertNoSymbolicLinkComponents(dirname(destination));
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.knownpath-${process.pid}-${Date.now()}.tmp`,
  );
  const previous = `${temporary}.previous`;
  const exists = await pathExists(destination);
  if (exists) await assertSafeExistingDirectory(destination);
  let previousMoved = false;
  try {
    await cp(source, temporary, { recursive: true });
    await assertSafeExistingDirectory(temporary);
    await listFiles(temporary);
    if (exists) {
      await rename(destination, previous);
      previousMoved = true;
    }
    await rename(temporary, destination);
    if (previousMoved) await rm(previous, { force: true, recursive: true });
  } catch (error) {
    await rm(temporary, { force: true, recursive: true });
    if (previousMoved && !(await pathExists(destination))) await rename(previous, destination);
    throw error;
  }
}

export async function removeOwnedDirectory(path: string): Promise<void> {
  assertAbsolutePath(path);
  if (!(await pathExists(path))) return;
  await assertSafeExistingDirectory(path);
  await rm(path, { force: true, recursive: true });
}

export async function removeOwnedFile(path: string): Promise<void> {
  assertAbsolutePath(path);
  if (!(await pathExists(path))) return;
  await assertSafeExistingFile(path);
  await rm(path, { force: true });
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
    else if (entry.isSymbolicLink())
      throw new Error(
        `KnownPath installer refuses symbolic links in managed directories: ${child}`,
      );
  }
  return files.sort();
}

async function assertSafeExistingFile(path: string): Promise<void> {
  assertAbsolutePath(path);
  await assertNoSymbolicLinkComponents(path);
  const information = await lstat(path);
  if (!information.isFile()) {
    throw new Error(`KnownPath installer expected a regular file: ${path}`);
  }
}

async function assertSafeExistingDirectory(path: string): Promise<void> {
  assertAbsolutePath(path);
  await assertNoSymbolicLinkComponents(path);
  const information = await lstat(path);
  if (!information.isDirectory()) {
    throw new Error(`KnownPath installer expected a directory: ${path}`);
  }
}

async function assertNoSymbolicLinkComponents(path: string): Promise<void> {
  assertAbsolutePath(path);
  const normalized = resolve(path);
  const root = parse(normalized).root;
  const segments = relative(root, normalized).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const information = await lstat(current);
      if (information.isSymbolicLink()) {
        throw new Error(`KnownPath installer refuses symbolic-link paths: ${current}`);
      }
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }
}

function assertAbsolutePath(path: string): void {
  if (!isAbsolute(path) || path.includes("\0")) {
    throw new Error("KnownPath installer requires an absolute, NUL-free filesystem path");
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
