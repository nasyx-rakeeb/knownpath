import { platform } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

import openBrowser from "open";
import { z } from "zod";

import { CredentialStore, type StoredProfile } from "./credential-store.js";
import { defaultProfileName, normalizeApiUrl, officialHostedApiUrl } from "./hosted.js";

const deviceScope = "knowledge:read knowledge:contribute knowledge:outcome";
const deviceGrant = "urn:ietf:params:oauth:grant-type:device_code";
const deviceCodeSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.url(),
  verification_uri_complete: z.url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
});
const tokenSchema = z.object({ access_token: z.string().min(16) });
const exchangeSchema = z.object({
  apiKey: z.object({
    id: z.uuidv4(),
    prefix: z.string(),
    scopes: z.array(z.string()),
    expiresAt: z.iso.datetime().optional(),
  }),
  plaintext: z.string().min(16),
});

export type AuthMode = "api-key" | "browser";

export interface RuntimeCredential {
  readonly apiKey: string;
  readonly apiUrl: string;
  readonly profileName: string;
  readonly source: "environment" | "keychain";
}

export interface ResolveCredentialOptions {
  readonly allowLogin: boolean;
  readonly apiUrl?: string;
  readonly authMode?: AuthMode;
  readonly profileName?: string;
  readonly print?: (message: string) => void;
}

export async function resolveRuntimeCredential(
  options: ResolveCredentialOptions,
): Promise<RuntimeCredential | undefined> {
  const profileName = options.profileName ?? defaultProfileName;
  const environmentKey = process.env["KNOWNPATH_API_KEY"]?.trim();
  const environmentUrl = process.env["KNOWNPATH_API_URL"]?.trim();
  if ((environmentKey === undefined) !== (environmentUrl === undefined)) {
    throw new Error("KNOWNPATH_API_URL and KNOWNPATH_API_KEY must be provided together");
  }
  if (options.authMode === "api-key" || environmentKey !== undefined) {
    if (environmentKey === undefined || environmentUrl === undefined) {
      throw new Error("Manual API-key mode requires KNOWNPATH_API_URL and KNOWNPATH_API_KEY");
    }
    return {
      apiKey: environmentKey,
      apiUrl: normalizeApiUrl(options.apiUrl ?? environmentUrl),
      profileName,
      source: "environment",
    };
  }

  const store = new CredentialStore();
  const profile = await store.getProfile(profileName);
  const requestedUrl = normalizeApiUrl(
    options.apiUrl ?? environmentUrl ?? profile?.apiUrl ?? officialHostedApiUrl,
  );
  if (profile !== undefined && profile.apiUrl === requestedUrl) {
    const apiKey = await store.getCredential(profile);
    if (apiKey !== undefined) {
      const credential = {
        apiKey,
        apiUrl: profile.apiUrl,
        profileName,
        source: "keychain" as const,
      };
      if (!options.allowLogin) return credential;
      const response = await validateRuntimeCredential(credential);
      if (response.ok) return credential;
      if (![401, 403].includes(response.status)) {
        throw new Error(`KnownPath credential check returned HTTP ${response.status}`);
      }
      await store.remove(profileName);
      options.print?.("The stored credential is unavailable or revoked; signing in again.");
    }
  }
  if (!options.allowLogin) return undefined;
  return loginWithDeviceFlow(requestedUrl, profileName, store, options.print ?? consoleLine);
}

export async function validateRuntimeCredential(credential: RuntimeCredential): Promise<Response> {
  const response = await fetch(new URL("api/v1/mcp/status", `${credential.apiUrl}/`), {
    headers: { Accept: "application/json", Authorization: `Bearer ${credential.apiKey}` },
    signal: AbortSignal.timeout(60_000),
  });
  return response;
}

export async function loginWithDeviceFlow(
  apiUrl: string,
  profileName = defaultProfileName,
  store = new CredentialStore(),
  print: (message: string) => void = consoleLine,
): Promise<RuntimeCredential> {
  const deviceResponse = await fetch(new URL("api/v1/auth/device/code", `${apiUrl}/`), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "knownpath-cli", scope: deviceScope }),
    signal: AbortSignal.timeout(90_000),
  });
  const grant = deviceCodeSchema.parse(await readSuccessfulJson(deviceResponse));
  print("Opening your browser to sign in and authorize KnownPath CLI...");
  print(`If it does not open, visit ${grant.verification_uri_complete}`);
  print(`Authorization code: ${grant.user_code}`);
  await openBrowser(grant.verification_uri_complete, { wait: false }).catch(() => undefined);

  const deadline = Date.now() + grant.expires_in * 1_000;
  let intervalMs = Math.max(1_000, grant.interval * 1_000);
  let accessToken: string | undefined;
  while (Date.now() < deadline) {
    await delay(intervalMs);
    const response = await fetch(new URL("api/v1/auth/device/token", `${apiUrl}/`), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: deviceGrant,
        device_code: grant.device_code,
        client_id: "knownpath-cli",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) {
      accessToken = tokenSchema.parse(await response.json()).access_token;
      break;
    }
    const code = await readErrorCode(response);
    if (code === "authorization_pending") continue;
    if (code === "slow_down") {
      intervalMs += 5_000;
      continue;
    }
    if (code === "access_denied") throw new Error("KnownPath device authorization was denied");
    if (code === "expired_token") throw new Error("KnownPath device authorization expired");
    throw new Error(`KnownPath device authorization failed (${code})`);
  }
  if (accessToken === undefined) throw new Error("KnownPath device authorization expired");

  const exchangeResponse = await fetch(
    new URL("api/v1/device-credentials/exchange", `${apiUrl}/`),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ label: machineLabel() }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const issued = exchangeSchema.parse(await readSuccessfulJson(exchangeResponse));
  await store.save(
    profileName,
    {
      apiUrl,
      keyId: issued.apiKey.id,
      keyPrefix: issued.apiKey.prefix,
      scopes: issued.apiKey.scopes,
      ...(issued.apiKey.expiresAt === undefined ? {} : { expiresAt: issued.apiKey.expiresAt }),
    },
    issued.plaintext,
  );
  print("Signed in and stored the machine credential in the native OS credential store.");
  return { apiKey: issued.plaintext, apiUrl, profileName, source: "keychain" };
}

export async function logoutProfile(
  profileName = defaultProfileName,
): Promise<{ readonly revoked: boolean; readonly removed: boolean }> {
  const store = new CredentialStore();
  const profile = await store.getProfile(profileName);
  if (profile === undefined) return { revoked: false, removed: false };
  const apiKey = await store.getCredential(profile);
  let revoked = false;
  if (apiKey !== undefined) {
    const response = await fetch(
      new URL("api/v1/device-credentials/revoke-current", `${profile.apiUrl}/`),
      {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      },
    ).catch(() => undefined);
    revoked = response?.ok === true;
  }
  return { revoked, removed: await store.remove(profileName) };
}

export async function storedProfile(name = defaultProfileName): Promise<StoredProfile | undefined> {
  return new CredentialStore().getProfile(name);
}

async function readSuccessfulJson(response: Response): Promise<unknown> {
  if (response.ok) return response.json();
  const code = await readErrorCode(response);
  throw new Error(`KnownPath returned HTTP ${response.status} (${code})`);
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : "request_failed";
  } catch {
    return "request_failed";
  }
}

function machineLabel(): string {
  const operatingSystem =
    platform() === "darwin" ? "macOS" : platform() === "win32" ? "Windows" : "Linux";
  return `KnownPath CLI on ${operatingSystem}`;
}

function consoleLine(message: string): void {
  process.stdout.write(`${message}\n`);
}
