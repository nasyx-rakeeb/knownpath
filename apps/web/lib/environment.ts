import "server-only";

let cachedApiUrl: URL | undefined;

export function knownPathApiUrl(): URL {
  if (cachedApiUrl !== undefined) return cachedApiUrl;
  const raw = process.env["KNOWNPATH_API_URL"];
  if (raw === undefined || raw.trim() === "") {
    throw new Error("KNOWNPATH_API_URL is required for the KnownPath dashboard");
  }
  const parsed = new URL(raw);
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("KNOWNPATH_API_URL must be a credential-free HTTP(S) URL");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/u, "");
  cachedApiUrl = parsed;
  return parsed;
}
