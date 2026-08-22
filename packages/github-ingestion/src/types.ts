import type { IngestionCounters, SourceItem, SourceRegistry } from "@knownpath/domain";

export type GitHubSourceType = "issues" | "discussions";

export interface GitHubSourceDefinition {
  readonly attributionUrl: string;
  readonly canonicalUrl: string;
  readonly defaultLookbackDays: number;
  readonly ecosystemHints: readonly string[];
  readonly enabled: boolean;
  readonly key: string;
  readonly licenseIdentifier: string;
  readonly licenseUrl?: string;
  readonly name: string;
  readonly owner: string;
  readonly repository: string;
  readonly repositoryName: string;
  readonly sourceQuality: {
    readonly authority: "first_party_official" | "maintainer" | "community" | "general_public";
    readonly classificationBasis:
      "official_domain" | "official_repository" | "provider_author_association" | "unverified";
    readonly publisher: string;
  };
  readonly types: readonly GitHubSourceType[];
}

export interface GitHubSourceManifest {
  readonly schemaVersion: 2;
  readonly sources: readonly GitHubSourceDefinition[];
}

export interface GitHubIngestionRequest {
  readonly all?: boolean;
  readonly backfill: boolean;
  readonly dryRun: boolean;
  readonly limit: number;
  readonly repository?: string;
  readonly since?: Date;
  readonly source?: string;
  readonly types?: readonly GitHubSourceType[];
  readonly until?: Date;
}

export interface GitHubIngestionLogger {
  debug(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export interface GitHubRepositoryIdentity {
  readonly canonicalUrl: string;
  readonly databaseId: number;
  readonly hasDiscussions: boolean;
  readonly hasIssues: boolean;
  readonly nameWithOwner: string;
  readonly nodeId: string;
}

export interface GitHubActor {
  readonly databaseId: number | null;
  readonly login: string | null;
  readonly nodeId: string | null;
  readonly siteAdmin: boolean | null;
  readonly type: string | null;
  readonly url: string | null;
}

export interface GitHubReaction {
  readonly actor: GitHubActor | null;
  readonly content: string;
  readonly createdAt: string | null;
  readonly databaseId: number | null;
  readonly nodeId: string | null;
}

export interface NormalizedGitHubObject {
  readonly author?: string;
  readonly body: string;
  readonly canonicalUrl: string;
  readonly itemType: Extract<
    SourceItem["itemType"],
    "issue" | "issue_comment" | "discussion" | "discussion_comment"
  >;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly observedAt: Date;
  readonly observedRevision: string;
  readonly parentSourceItemIdentity?: string;
  readonly publishedAt?: Date;
  readonly rootSourceItemIdentity?: string;
  readonly sourceItemIdentity: string;
  readonly title?: string;
}

export interface SourceCollectionResult {
  readonly counters: IngestionCounters;
  readonly cursor: Readonly<Record<string, string>>;
  readonly registry: SourceRegistry | null;
  readonly source: GitHubSourceDefinition;
}

export interface RateLimitSnapshot {
  readonly limit?: number;
  readonly remaining?: number;
  readonly resetAt?: string;
  readonly resource?: string;
}
