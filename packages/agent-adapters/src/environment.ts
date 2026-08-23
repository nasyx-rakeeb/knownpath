import { apiKeyEnvironmentName, apiUrlEnvironmentName } from "./constants.js";
import { InstallerError, type DoctorCheck } from "./types.js";

export interface KnownPathEnvironmentStatus {
  readonly apiKeyPresent: boolean;
  readonly apiUrl?: string;
  readonly apiUrlValid: boolean;
  readonly checks: readonly DoctorCheck[];
}

export function inspectKnownPathEnvironment(
  environment: NodeJS.ProcessEnv,
): KnownPathEnvironmentStatus {
  const apiKeyPresent = (environment[apiKeyEnvironmentName]?.trim().length ?? 0) >= 16;
  const rawUrl = environment[apiUrlEnvironmentName]?.trim();
  const normalizedUrl = rawUrl === undefined ? undefined : normalizeApiUrl(rawUrl);
  const checks: DoctorCheck[] = [
    {
      code: apiUrlEnvironmentName.toLowerCase(),
      message:
        normalizedUrl === undefined
          ? `${apiUrlEnvironmentName} is missing or malformed`
          : `${apiUrlEnvironmentName} is a valid HTTP(S) origin`,
      status: normalizedUrl === undefined ? "fail" : "pass",
    },
    {
      code: apiKeyEnvironmentName.toLowerCase(),
      message: apiKeyPresent
        ? `${apiKeyEnvironmentName} is present`
        : `${apiKeyEnvironmentName} is missing or too short`,
      status: apiKeyPresent ? "pass" : "fail",
    },
  ];
  return {
    apiKeyPresent,
    ...(normalizedUrl === undefined ? {} : { apiUrl: normalizedUrl }),
    apiUrlValid: normalizedUrl !== undefined,
    checks,
  };
}

export function requireKnownPathEnvironment(environment: NodeJS.ProcessEnv): void {
  const status = inspectKnownPathEnvironment(environment);
  if (!status.apiUrlValid) {
    throw new InstallerError(
      "missing_or_invalid_api_url",
      `Set ${apiUrlEnvironmentName} to the KnownPath HTTP(S) origin before running install; no default is used`,
    );
  }
  if (!status.apiKeyPresent) {
    throw new InstallerError(
      "missing_api_key",
      `Set ${apiKeyEnvironmentName} before running install; the installer stores only its variable name`,
    );
  }
}

function normalizeApiUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}
