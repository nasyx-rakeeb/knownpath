import {
  normalizeInlineText,
  normalizeText,
  normalizeUrl,
  normalizeVersion,
  type SourceContentBlock,
} from "@knownpath/domain";
import { XMLParser } from "fast-xml-parser";
import { convert } from "html-to-text";
import { marked, type Token, type Tokens } from "marked";
import { z } from "zod";

import { sha256 } from "./canonical-json.js";
import type { DocumentationSourceDefinition, ReleaseFeedSourceDefinition } from "./manifest.js";
import type { NormalizedSourceDocument, SourceCandidate } from "./types.js";

const MAX_BLOCKS = 20_000;
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  maxNestedTags: 100,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: {
    enabled: true,
    maxEntityCount: 100,
    maxEntitySize: 10_000,
    maxExpandedLength: 100_000,
    maxExpansionDepth: 10,
    maxTotalExpansions: 1_000,
  },
  trimValues: true,
  isArray: (name) => ["item", "entry", "url"].includes(name),
});

const candidateSchema = z.strictObject({
  canonicalUrl: z.url({ protocol: /^https$/u }),
  documentType: z.enum([
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
  ]),
  fetchUrl: z.url({ protocol: /^https$/u }),
  observedRevision: z.string().trim().min(1).max(512).optional(),
  publishedAt: z.date().optional(),
  sourceIdentity: z.string().trim().min(1).max(256),
  sourceSection: z.string().trim().min(1).max(256).optional(),
  title: z.string().trim().min(1).max(10_000),
  versions: z.array(z.string().trim().min(1).max(256)).max(64),
});

export function parseLlmsIndex(
  source: DocumentationSourceDefinition,
  text: string,
  sitemap: ReadonlyMap<string, string>,
): SourceCandidate[] {
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();
  let section: string | undefined;

  for (const line of normalizeText(text).split("\n")) {
    const heading = /^(?:#{1,6})\s+(.+)$/u.exec(line);
    if (heading?.[1] !== undefined) {
      section = normalizeInlineText(heading[1]).slice(0, 256);
      continue;
    }
    const match = /^-\s+\[([^\n]+?)\]\(([^)]+)\)(?::\s*(.*))?$/u.exec(line.trim());
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const fetchUrl = new URL(match[2], source.indexUrl).toString();
    assertAllowedUrl(fetchUrl, source.allowedOrigins, source.allowedPathPrefixes);
    const canonicalUrl = canonicalizeDocumentUrl(fetchUrl);
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    const title = normalizeInlineText(match[1]);
    const material = `${canonicalUrl} ${title} ${section ?? ""} ${match[3] ?? ""}`;
    const documentType = classifyDocument(material, source.classificationRules, "guide");
    const observedRevision = sitemap.get(canonicalUrl);
    candidates.push(
      candidateSchema.parse({
        canonicalUrl,
        documentType,
        fetchUrl,
        ...(observedRevision === undefined ? {} : { observedRevision }),
        sourceIdentity: `doc:${sha256(canonicalUrl)}`,
        ...(section === undefined ? {} : { sourceSection: section }),
        title,
        versions: detectVersions(material, source.versionRules),
      }) as SourceCandidate,
    );
  }

  return candidates.sort((left, right) => left.canonicalUrl.localeCompare(right.canonicalUrl));
}

export function parseSitemap(text: string): ReadonlyMap<string, string> {
  const parsed = asRecord(xmlParser.parse(text));
  const urlset = asRecord(parsed["urlset"]);
  const entries = asArray(urlset["url"]);
  const result = new Map<string, string>();
  for (const value of entries) {
    const entry = asRecord(value);
    const location = readText(entry["loc"]);
    if (location === undefined) continue;
    const lastModified = readText(entry["lastmod"]);
    if (lastModified !== undefined && lastModified !== "") {
      result.set(normalizeUrl(location), lastModified);
    }
  }
  return result;
}

export function parseReleaseFeed(
  source: ReleaseFeedSourceDefinition,
  text: string,
): Array<{ readonly candidate: SourceCandidate; readonly rawContent: string }> {
  const parsed = asRecord(xmlParser.parse(text));
  const rssChannel = asRecord(asRecord(parsed["rss"])["channel"]);
  const atomFeed = asRecord(parsed["feed"]);
  const entries =
    Object.keys(rssChannel).length > 0 ? asArray(rssChannel["item"]) : asArray(atomFeed["entry"]);

  return entries.map((value) => {
    const entry = asRecord(value);
    const title = readRequiredText(entry["title"], "feed entry title");
    const canonicalUrl = normalizeUrl(readRequiredLink(entry));
    assertAllowedUrl(canonicalUrl, source.allowedOrigins, ["/"]);
    const guid = readText(entry["guid"]) ?? readText(entry["id"]) ?? canonicalUrl;
    const publishedValue =
      readText(entry["pubDate"]) ?? readText(entry["published"]) ?? readText(entry["updated"]);
    const publishedAt =
      publishedValue === undefined ? undefined : parseOptionalDate(publishedValue);
    const updated = readText(entry["updated"]) ?? publishedValue;
    const content =
      source.contentPolicy === "feed_content"
        ? (readText(entry["content:encoded"]) ?? readText(entry["content"]))
        : (readText(entry["description"]) ?? readText(entry["summary"]));
    const material = `${canonicalUrl} ${title}`;
    const documentType = classifyDocument(material, source.curatedRules, "release_note");
    const candidate = candidateSchema.parse({
      canonicalUrl,
      documentType,
      fetchUrl: source.feedUrl,
      ...(updated === undefined ? {} : { observedRevision: updated }),
      ...(publishedAt === undefined ? {} : { publishedAt }),
      sourceIdentity: `feed:${sha256(guid)}`,
      title,
      versions: detectVersions(material, source.versionRules),
    }) as SourceCandidate;
    return { candidate, rawContent: content ?? title };
  });
}

export function normalizeMarkdownDocument(
  candidate: SourceCandidate,
  markdown: string,
): NormalizedSourceDocument {
  const body = normalizeText(markdown);
  const tokens = marked.lexer(body, { gfm: true });
  const blocks = tokens.flatMap(tokenToBlocks).slice(0, MAX_BLOCKS);
  return {
    body,
    blocks,
    candidate,
    mediaType: "text/markdown; charset=utf-8",
    providerMetadata: { representation: "official-markdown", blockCount: blocks.length },
  };
}

export function normalizeFeedDocument(
  candidate: SourceCandidate,
  rawContent: string,
  contentPolicy: ReleaseFeedSourceDefinition["contentPolicy"],
): NormalizedSourceDocument {
  const body = normalizeText(
    convert(rawContent, {
      wordwrap: false,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
      ],
    }),
  );
  const blocks = body
    .split(/\n{2,}/u)
    .map((text) => normalizeInlineText(text))
    .filter((text) => text.length > 0)
    .slice(0, MAX_BLOCKS)
    .map((text) => ({ type: "paragraph" as const, text: text.slice(0, 100_000) }));
  return {
    body,
    blocks,
    candidate,
    mediaType: "text/plain; charset=utf-8",
    providerMetadata: { representation: contentPolicy, blockCount: blocks.length },
  };
}

export function selectCandidates(
  source: DocumentationSourceDefinition | ReleaseFeedSourceDefinition,
  candidates: readonly SourceCandidate[],
  selection: {
    readonly limit: number;
    readonly page?: string;
    readonly scope: "curated" | "all";
    readonly version?: string;
  },
): SourceCandidate[] {
  let selected = [...candidates];
  if (selection.page !== undefined) {
    const requested = normalizeUrl(selection.page);
    selected = selected.filter(
      (candidate) =>
        normalizeUrl(candidate.canonicalUrl) === requested ||
        normalizeUrl(candidate.fetchUrl) === requested,
    );
    if (selected.length === 0) throw new Error("Requested page is not present in the source index");
  }
  if (selection.scope === "curated" && selection.page === undefined) {
    selected = selected.flatMap((candidate) => {
      const material = `${candidate.canonicalUrl} ${candidate.title} ${candidate.sourceSection ?? ""}`;
      const rule = source.curatedRules.find((item) =>
        new RegExp(item.pattern, "iu").test(material),
      );
      return rule === undefined ? [] : [{ ...candidate, documentType: rule.documentType }];
    });
  }
  if (selection.version !== undefined) {
    selected = selected.filter((candidate) => candidate.versions.includes(selection.version!));
  }
  return selected.slice(0, selection.limit);
}

function tokenToBlocks(token: Token): SourceContentBlock[] {
  switch (token.type) {
    case "heading": {
      const heading = token as Tokens.Heading;
      return [{ type: "heading", text: cleanBlockText(heading.text), level: heading.depth }];
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      const text = cleanBlockText(paragraph.text);
      return [{ type: text.startsWith(":::") ? "admonition" : "paragraph", text }];
    }
    case "code": {
      const code = token as Tokens.Code;
      return [
        {
          type: "code",
          text: code.text.slice(0, 100_000),
          ...(code.lang === undefined || code.lang.trim() === ""
            ? {}
            : { language: code.lang.trim().slice(0, 64) }),
        },
      ];
    }
    case "blockquote": {
      const blockquote = token as Tokens.Blockquote;
      return [{ type: "blockquote", text: cleanBlockText(blockquote.text) }];
    }
    case "list": {
      const list = token as Tokens.List;
      return [
        {
          type: "list",
          text: list.items
            .map((item: Tokens.ListItem) => cleanBlockText(item.text))
            .join("\n")
            .slice(0, 100_000),
        },
      ];
    }
    case "table": {
      const table = token as Tokens.Table;
      return [{ type: "table", text: cleanBlockText(table.raw) }];
    }
    case "html": {
      const html = token as Tokens.HTML;
      const text = normalizeInlineText(convert(html.raw, { wordwrap: false }));
      return text === "" ? [] : [{ type: "paragraph", text: text.slice(0, 100_000) }];
    }
    default:
      return [];
  }
}

function cleanBlockText(value: string): string {
  return normalizeInlineText(value).slice(0, 100_000);
}

function classifyDocument(
  material: string,
  rules: readonly {
    readonly documentType: SourceCandidate["documentType"];
    readonly pattern: string;
  }[],
  fallback: SourceCandidate["documentType"],
): SourceCandidate["documentType"] {
  return (
    rules.find((rule) => new RegExp(rule.pattern, "iu").test(material))?.documentType ?? fallback
  );
}

function detectVersions(
  material: string,
  rules: readonly { readonly captureGroup: number; readonly pattern: string }[],
): string[] {
  const versions = new Set<string>();
  for (const rule of rules) {
    const expression = new RegExp(rule.pattern, "giu");
    for (const match of material.matchAll(expression)) {
      const value = match[rule.captureGroup];
      if (value !== undefined) versions.add(normalizeVersion(value));
    }
  }
  return [...versions].sort();
}

function canonicalizeDocumentUrl(value: string): string {
  const url = new URL(value);
  if (url.pathname.endsWith(".md")) url.pathname = url.pathname.slice(0, -3);
  return normalizeUrl(url.toString());
}

function assertAllowedUrl(
  value: string,
  allowedOrigins: readonly string[],
  allowedPathPrefixes: readonly string[],
): void {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !allowedOrigins.includes(url.origin) ||
    !allowedPathPrefixes.some(
      (prefix) =>
        prefix === "/" ||
        url.pathname === prefix ||
        url.pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
    )
  ) {
    throw new Error(
      `Discovered source URL is outside the configured allowlist: ${url.origin}${url.pathname}`,
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function readText(value: unknown): string | undefined {
  if (typeof value === "string") return normalizeText(value);
  const record = asRecord(value);
  const text = record["#text"] ?? record["#cdata"];
  return typeof text === "string" ? normalizeText(text) : undefined;
}

function readRequiredText(value: unknown, label: string): string {
  const text = readText(value);
  if (text === undefined || text === "") throw new Error(`Missing ${label}`);
  return text;
}

function readRequiredLink(entry: Readonly<Record<string, unknown>>): string {
  const direct = readText(entry["link"]);
  if (direct !== undefined) return direct;
  for (const value of asArray(entry["link"])) {
    const href = asRecord(value)["@_href"];
    if (typeof href === "string") return href;
  }
  throw new Error("Missing feed entry link");
}

function parseOptionalDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
