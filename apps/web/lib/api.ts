import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { knownPathApiUrl } from "./environment";

export class KnownPathApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "KnownPathApiError";
  }
}

export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const requestHeaders = await headers();
  const response = await fetch(new URL(path, knownPathApiUrl()), {
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(requestHeaders.get("cookie") === null ? {} : { cookie: requestHeaders.get("cookie")! }),
    },
  });
  if (response.status === 401) redirect("/sign-in");
  if (!response.ok) throw await toApiError(response);
  return schema.parse(await response.json());
}

async function toApiError(response: Response): Promise<KnownPathApiError> {
  const fallback = `KnownPath API request failed with status ${response.status}`;
  try {
    const value = (await response.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    return new KnownPathApiError(
      response.status,
      typeof value.error?.code === "string" ? value.error.code : "api_error",
      typeof value.error?.message === "string" ? value.error.message : fallback,
    );
  } catch {
    return new KnownPathApiError(response.status, "api_error", fallback);
  }
}
