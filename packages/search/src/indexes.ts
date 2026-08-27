import type { KnownPathDatabase } from "@knownpath/database";

export interface SearchIndexNames {
  readonly lexical: string;
  readonly vector: string;
}

export interface AtlasSearchIndexInitialization {
  readonly created: readonly string[];
  readonly reused: readonly string[];
  readonly indexes: readonly Record<string, unknown>[];
  readonly ready: boolean;
}

export function createAtlasSearchIndexDefinitions(names: SearchIndexNames, dimensions: number) {
  return [
    {
      name: names.lexical,
      type: "search" as const,
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            active: { type: "boolean" },
            visibilityScope: { type: "token" },
            ownerUserId: { type: "token" },
            workspaceId: { type: "token" },
            knownPathStatus: { type: "token" },
            ecosystem: { type: "token" },
            packages: { type: "token" },
            platforms: { type: "token" },
            title: { type: "string" },
            problemSummary: { type: "string" },
            searchableText: { type: "string" },
            normalizedErrors: { type: "string" },
            solutions: { type: "string" },
          },
        },
      },
    },
    {
      name: names.vector,
      type: "vectorSearch" as const,
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding.values",
            numDimensions: dimensions,
            similarity: "cosine",
            quantization: "scalar",
          },
          { type: "filter", path: "active" },
          { type: "filter", path: "visibilityScope" },
          { type: "filter", path: "ownerUserId" },
          { type: "filter", path: "workspaceId" },
          { type: "filter", path: "knownPathStatus" },
          { type: "filter", path: "embedding.modelIdentifier" },
          { type: "filter", path: "embedding.modelVersion" },
          { type: "filter", path: "embedding.dimensions" },
          { type: "filter", path: "ecosystem" },
          { type: "filter", path: "packages" },
          { type: "filter", path: "platforms" },
        ],
      },
    },
  ] as const;
}

export async function createAtlasSearchIndexes(
  database: KnownPathDatabase,
  names: SearchIndexNames,
  dimensions: number,
  readyTimeoutMs: number,
): Promise<AtlasSearchIndexInitialization> {
  const definitions = createAtlasSearchIndexDefinitions(names, dimensions);
  const before = await inspectAtlasSearchIndexes(database);
  const existingNames = new Set(before.map(indexName).filter((name) => name !== undefined));
  const missing = definitions.filter((definition) => !existingNames.has(definition.name));
  const created =
    missing.length === 0
      ? []
      : await database.repositories.knownPathSearchDocuments.createAtlasIndexes(missing);
  const reused = definitions
    .filter((definition) => existingNames.has(definition.name))
    .map((definition) => definition.name);
  const deadline = Date.now() + readyTimeoutMs;
  let indexes = await inspectAtlasSearchIndexes(database);
  while (
    !allIndexesReady(
      indexes,
      definitions.map((definition) => definition.name),
    )
  ) {
    if (Date.now() >= deadline) return { created, reused, indexes, ready: false };
    await delay(Math.min(2_000, Math.max(1, deadline - Date.now())));
    indexes = await inspectAtlasSearchIndexes(database);
  }
  return { created, reused, indexes, ready: true };
}

export async function inspectAtlasSearchIndexes(
  database: KnownPathDatabase,
): Promise<readonly Record<string, unknown>[]> {
  return database.repositories.knownPathSearchDocuments.listAtlasIndexes();
}

function indexName(index: Record<string, unknown>): string | undefined {
  return typeof index["name"] === "string" ? index["name"] : undefined;
}

function allIndexesReady(
  indexes: readonly Record<string, unknown>[],
  requiredNames: readonly string[],
): boolean {
  return requiredNames.every((requiredName) => {
    const index = indexes.find((candidate) => indexName(candidate) === requiredName);
    return index?.["queryable"] === true || index?.["status"] === "READY";
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
