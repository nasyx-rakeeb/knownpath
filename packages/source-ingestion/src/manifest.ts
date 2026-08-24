import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { normalizeUrl } from "@knownpath/domain";
import { z } from "zod";

const sourceKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const httpsUrlSchema = z.url({ protocol: /^https$/u });
const regexSchema = z.string().trim().min(1).max(512);
const sourceQualitySchema = z.strictObject({
  authority: z.enum(["first_party_official", "maintainer", "community", "general_public"]),
  classificationBasis: z.enum([
    "official_domain",
    "official_repository",
    "provider_author_association",
    "unverified",
  ]),
  publisher: z.string().trim().min(1).max(256),
});
const documentTypeSchema = z.enum([
  "upgrade_guide",
  "troubleshooting",
  "release_note",
  "compatibility_reference",
  "migration_guide",
  "deprecation_notice",
  "breaking_change",
  "guide",
  "reference",
  "other",
]);
const commonShape = {
  key: sourceKeySchema,
  name: z.string().trim().min(1).max(256),
  canonicalUrl: httpsUrlSchema,
  ecosystemHints: z.array(z.string().trim().min(1).max(256)).min(1).max(32),
  enabled: z.boolean(),
  refreshIntervalMinutes: z.int().min(5).max(43_200),
  sourceQuality: sourceQualitySchema,
  attributionUrl: httpsUrlSchema,
  licenseIdentifier: z.string().trim().min(1).max(256),
  licenseUrl: httpsUrlSchema.optional(),
} as const;

const githubSourceSchema = z.strictObject({
  ...commonShape,
  adapter: z.literal("github_repository"),
  repository: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  types: z
    .array(z.enum(["issues", "discussions"]))
    .min(1)
    .max(2),
  defaultLookbackDays: z.int().min(1).max(3_650),
});

const documentRuleSchema = z.strictObject({
  pattern: regexSchema,
  documentType: documentTypeSchema,
});

const versionRuleSchema = z.strictObject({
  pattern: regexSchema,
  captureGroup: z.int().min(1).max(10).default(1),
});

const documentationSourceSchema = z.strictObject({
  ...commonShape,
  adapter: z.literal("documentation_site"),
  framework: z.string().trim().min(1).max(256),
  indexUrl: httpsUrlSchema,
  sitemapUrl: httpsUrlSchema.optional(),
  robotsUrl: httpsUrlSchema,
  allowedOrigins: z.array(httpsUrlSchema).min(1).max(8),
  allowedPathPrefixes: z.array(z.string().startsWith("/").max(512)).min(1).max(32),
  contentUrlSuffix: z.string().max(16).default(""),
  curatedRules: z.array(documentRuleSchema).min(1).max(100),
  classificationRules: z.array(documentRuleSchema).max(100).default([]),
  versionRules: z.array(versionRuleSchema).max(32).default([]),
});

const releaseFeedSourceSchema = z.strictObject({
  ...commonShape,
  adapter: z.literal("release_feed"),
  framework: z.string().trim().min(1).max(256),
  feedUrl: httpsUrlSchema,
  robotsUrl: httpsUrlSchema,
  allowedOrigins: z.array(httpsUrlSchema).min(1).max(8),
  contentPolicy: z.enum(["feed_summary", "feed_content"]),
  curatedRules: z.array(documentRuleSchema).min(1).max(100),
  versionRules: z.array(versionRuleSchema).max(32).default([]),
});

const manifestSchema = z.strictObject({
  schemaVersion: z.literal(2),
  sources: z
    .array(
      z.discriminatedUnion("adapter", [
        githubSourceSchema,
        documentationSourceSchema,
        releaseFeedSourceSchema,
      ]),
    )
    .min(1)
    .max(200),
});

export type SourceManifest = z.infer<typeof manifestSchema>;
export type SourceDefinition = SourceManifest["sources"][number];
export type GitHubManifestSource = Extract<SourceDefinition, { adapter: "github_repository" }>;
export type DocumentationSourceDefinition = Extract<
  SourceDefinition,
  { adapter: "documentation_site" }
>;
export type ReleaseFeedSourceDefinition = Extract<SourceDefinition, { adapter: "release_feed" }>;
export type OfficialSourceDefinition = DocumentationSourceDefinition | ReleaseFeedSourceDefinition;

export async function loadSourceManifest(path: string): Promise<SourceManifest> {
  const parsedJson = JSON.parse(await readFile(await resolveManifestPath(path), "utf8")) as unknown;
  const manifest = manifestSchema.parse(parsedJson);
  const seenKeys = new Set<string>();

  for (const source of manifest.sources) {
    if (seenKeys.has(source.key)) throw new Error(`Duplicate source key: ${source.key}`);
    seenKeys.add(source.key);
    validateCommonSource(source);
    if (source.adapter === "documentation_site") {
      validateAllowedUrl(source.indexUrl, source.allowedOrigins, source.allowedPathPrefixes);
      if (source.sitemapUrl !== undefined) {
        validateAllowedUrl(source.sitemapUrl, source.allowedOrigins, source.allowedPathPrefixes);
      }
      validateAllowedUrl(source.robotsUrl, source.allowedOrigins, ["/"]);
      validateRules(source.curatedRules, source.classificationRules, source.versionRules);
    } else if (source.adapter === "release_feed") {
      validateAllowedUrl(source.feedUrl, source.allowedOrigins, ["/"]);
      validateAllowedUrl(source.robotsUrl, source.allowedOrigins, ["/"]);
      validateRules(source.curatedRules, [], source.versionRules);
    } else {
      const expected = `https://github.com/${source.repository}`;
      if (normalizeUrl(source.canonicalUrl) !== expected) {
        throw new Error(`GitHub source ${source.key} canonicalUrl must match its repository`);
      }
    }
  }

  return manifest;
}

async function resolveManifestPath(path: string): Promise<string> {
  if (isAbsolute(path)) return path;
  let directory = process.cwd();
  while (true) {
    const candidate = resolve(directory, path);
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) return resolve(process.cwd(), path);
      directory = parent;
    }
  }
}

export function selectOfficialSources(
  manifest: SourceManifest,
  selection: { readonly all?: boolean; readonly source?: string },
): OfficialSourceDefinition[] {
  const sources = manifest.sources.filter(
    (source): source is OfficialSourceDefinition =>
      source.enabled &&
      source.adapter !== "github_repository" &&
      (selection.all === true || source.key === selection.source),
  );
  if (sources.length === 0) throw new Error("No enabled official source matched the selector");
  return sources;
}

function validateCommonSource(source: SourceDefinition): void {
  if (normalizeUrl(source.canonicalUrl) !== source.canonicalUrl) {
    throw new Error(`Source ${source.key} canonicalUrl must already be normalized`);
  }
  if (normalizeUrl(source.attributionUrl) !== source.attributionUrl) {
    throw new Error(`Source ${source.key} attributionUrl must already be normalized`);
  }
}

function validateAllowedUrl(
  value: string,
  allowedOrigins: readonly string[],
  allowedPathPrefixes: readonly string[],
): void {
  const url = new URL(value);
  if (!allowedOrigins.includes(url.origin)) throw new Error(`URL origin is not allowed: ${value}`);
  if (!allowedPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    throw new Error(`URL path is not allowed: ${value}`);
  }
}

function validateRules(
  documentRules: readonly { readonly pattern: string }[],
  classificationRules: readonly { readonly pattern: string }[],
  versionRules: readonly { readonly pattern: string }[],
): void {
  for (const rule of [...documentRules, ...classificationRules, ...versionRules]) {
    try {
      new RegExp(rule.pattern, "iu");
    } catch {
      throw new Error(`Invalid source registry regular expression: ${rule.pattern}`);
    }
  }
}
