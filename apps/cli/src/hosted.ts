export const officialHostedApiUrl = "https://knownpath-api.onrender.com";
export const defaultProfileName = "default";

export function normalizeApiUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The KnownPath API URL must be a valid HTTP(S) origin");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "" && url.pathname !== "/")
  ) {
    throw new Error("The KnownPath API URL must be a credential-free HTTP(S) origin");
  }
  return url.origin;
}
