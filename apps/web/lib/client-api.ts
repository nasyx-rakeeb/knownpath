export async function readApiError(response: Response): Promise<string> {
  try {
    const value = (await response.json()) as { error?: { message?: unknown }; message?: unknown };
    if (typeof value.error?.message === "string") return value.error.message;
    if (typeof value.message === "string") return value.message;
  } catch {
    // Non-JSON upstream errors use the status fallback below.
  }
  return `Request failed with status ${response.status}`;
}
export async function clientJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/knownpath/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return (await response.json()) as T;
}
