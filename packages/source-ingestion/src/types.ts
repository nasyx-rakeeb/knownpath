import type {
  IngestionCounters,
  SourceContentBlock,
  SourceDocumentMetadata,
  SourceItem,
  SourceQuality,
  SourceRegistry,
} from "@knownpath/domain";

import type { OfficialSourceDefinition } from "./manifest.js";

export type SourceSyncAction = "discover" | "sync";
export type SourceSyncScope = "curated" | "all";

export interface SourceIngestionRequest {
  readonly action: SourceSyncAction;
  readonly all?: boolean;
  readonly dryRun: boolean;
  readonly limit: number;
  readonly page?: string;
  readonly scope: SourceSyncScope;
  readonly source?: string;
  readonly version?: string;
}

export interface SourceIngestionLogger {
  debug(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export interface FetchValidators {
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface SafeFetchResult {
  readonly body?: string;
  readonly contentType?: string;
  readonly etag?: string;
  readonly finalUrl: string;
  readonly lastModified?: string;
  readonly notModified: boolean;
  readonly retryAfterSeconds?: number;
  readonly status: number;
}

export interface SourceCandidate {
  readonly canonicalUrl: string;
  readonly documentType: SourceDocumentMetadata["documentType"];
  readonly fetchUrl: string;
  readonly observedRevision?: string;
  readonly publishedAt?: Date;
  readonly sourceIdentity: string;
  readonly sourceSection?: string;
  readonly title: string;
  readonly versions: readonly string[];
}

export interface NormalizedSourceDocument {
  readonly blocks: readonly SourceContentBlock[];
  readonly body: string;
  readonly candidate: SourceCandidate;
  readonly mediaType: string;
  readonly providerMetadata: Readonly<Record<string, unknown>>;
}

export interface OfficialSourceCollectionResult {
  readonly counters: IngestionCounters;
  readonly registry: SourceRegistry | null;
  readonly source: OfficialSourceDefinition;
}

export interface SnapshotInput {
  readonly document: NormalizedSourceDocument;
  readonly documentMetadata: SourceDocumentMetadata;
  readonly sourceQuality: SourceQuality;
}

export type OfficialSourceItemType = Extract<
  SourceItem["itemType"],
  "documentation_page" | "release_note" | "other"
>;
