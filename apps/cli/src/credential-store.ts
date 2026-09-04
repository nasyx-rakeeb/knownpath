import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open as openFile, readFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { AsyncEntry } from "@napi-rs/keyring";
import { z } from "zod";

import { defaultProfileName } from "./hosted.js";

const credentialService = "io.knownpath.cli";
const profileSchema = z.strictObject({
  apiUrl: z.url(),
  credentialAccount: z.string().min(1).max(200),
  keyId: z.uuidv4(),
  keyPrefix: z.string().min(3).max(64),
  scopes: z.array(z.string().min(1).max(64)).max(32),
  expiresAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime(),
});
const storeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  defaultProfile: z.string().min(1).max(80),
  profiles: z.record(z.string().min(1).max(80), profileSchema),
});

export type StoredProfile = z.infer<typeof profileSchema>;

export class CredentialStore {
  public constructor(private readonly homeDirectory = effectiveHomeDirectory()) {}

  public async getProfile(name = defaultProfileName): Promise<StoredProfile | undefined> {
    return (await this.readMetadata()).profiles[name];
  }

  public async getCredential(profile: StoredProfile): Promise<string | undefined> {
    try {
      return await new AsyncEntry(credentialService, profile.credentialAccount).getPassword();
    } catch {
      throw new Error(
        "The native OS credential store is unavailable or locked; unlock it and retry",
      );
    }
  }

  public async save(
    name: string,
    profile: Omit<StoredProfile, "credentialAccount" | "updatedAt">,
    credential: string,
  ): Promise<StoredProfile> {
    const credentialAccount = accountName(name, profile.apiUrl);
    const entry = new AsyncEntry(credentialService, credentialAccount);
    try {
      await entry.setPassword(credential);
    } catch {
      throw new Error(
        "KnownPath could not save the machine credential in the native OS credential store; no plaintext fallback was written",
      );
    }
    const stored: StoredProfile = {
      ...profile,
      credentialAccount,
      updatedAt: new Date().toISOString(),
    };
    try {
      const metadata = await this.readMetadata();
      await this.writeMetadata({
        schemaVersion: 1,
        defaultProfile: name,
        profiles: { ...metadata.profiles, [name]: stored },
      });
      return stored;
    } catch (error) {
      await entry.deletePassword().catch(() => false);
      throw error;
    }
  }

  public async remove(name = defaultProfileName): Promise<boolean> {
    const metadata = await this.readMetadata();
    const profile = metadata.profiles[name];
    if (profile === undefined) return false;
    try {
      await new AsyncEntry(credentialService, profile.credentialAccount).deletePassword();
    } catch {
      throw new Error(
        "KnownPath could not remove the credential from the native OS credential store",
      );
    }
    const profiles = { ...metadata.profiles };
    delete profiles[name];
    await this.writeMetadata({
      schemaVersion: 1,
      defaultProfile:
        metadata.defaultProfile === name
          ? (Object.keys(profiles)[0] ?? defaultProfileName)
          : metadata.defaultProfile,
      profiles,
    });
    return true;
  }

  private async readMetadata(): Promise<z.infer<typeof storeSchema>> {
    try {
      await assertSafePath(this.metadataPath());
      return storeSchema.parse(JSON.parse(await readFile(this.metadataPath(), "utf8")));
    } catch (error) {
      if (isMissing(error)) {
        return { schemaVersion: 1, defaultProfile: defaultProfileName, profiles: {} };
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        throw new Error(`KnownPath credential metadata is invalid at ${this.metadataPath()}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  private async writeMetadata(value: z.infer<typeof storeSchema>): Promise<void> {
    const path = this.metadataPath();
    await assertNoSymlinkComponents(dirname(path));
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await chmod(dirname(path), 0o700).catch(() => undefined);
    await assertNoSymlinkComponents(dirname(path));
    try {
      await assertSafePath(path);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
    const handle = await openFile(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
    await chmod(path, 0o600).catch(() => undefined);
  }

  private metadataPath(): string {
    return join(resolve(this.homeDirectory), ".knownpath", "profiles.json");
  }
}

function accountName(profileName: string, apiUrl: string): string {
  const originDigest = createHash("sha256").update(apiUrl).digest("hex").slice(0, 16);
  return `profile:${profileName}:${originDigest}`;
}

function effectiveHomeDirectory(): string {
  return process.env[process.platform === "win32" ? "USERPROFILE" : "HOME"] ?? homedir();
}

async function assertSafePath(path: string): Promise<void> {
  if (!isAbsolute(path) || path.includes("\0")) throw new Error("Unsafe credential metadata path");
  await assertNoSymlinkComponents(path);
  const information = await lstat(path);
  if (!information.isFile())
    throw new Error(`Expected a regular credential metadata file: ${path}`);
}

async function assertNoSymlinkComponents(path: string): Promise<void> {
  const normalized = resolve(path);
  const root = parse(normalized).root;
  let current = root;
  for (const segment of relative(root, normalized).split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`KnownPath refuses a symbolic-link credential path: ${current}`);
      }
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
