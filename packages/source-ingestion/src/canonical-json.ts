import { createHash } from "node:crypto";

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)]),
    );
  }
  if (["string", "number", "boolean"].includes(typeof value) || value === null) return value;
  throw new TypeError(`Cannot canonicalize JSON value of type ${typeof value}`);
}
