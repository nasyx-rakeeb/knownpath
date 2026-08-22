import type { KnownPathDatabase } from "@knownpath/database";
import {
  createSourceItemStateId,
  type SourceDocumentMetadata,
  type SourceItem,
  type SourceItemState,
  type SourceQuality,
  type SourceRegistry,
} from "@knownpath/domain";

import type { FetchValidators, SafeFetchResult } from "./types.js";

export async function persistUnchangedState(
  database: KnownPathDatabase,
  state: SourceItemState,
  result: SafeFetchResult,
  fetchedAt: Date,
): Promise<void> {
  await database.repositories.sourceItemStates.upsert({
    ...state,
    lastFetchedAt: fetchedAt,
    lastObservedAt: fetchedAt,
    ...(result.etag === undefined ? {} : { etag: result.etag }),
    ...(result.lastModified === undefined ? {} : { lastModified: result.lastModified }),
    audit: { ...state.audit, updatedAt: fetchedAt },
  });
}

export async function persistSourceItemState(
  database: KnownPathDatabase,
  input: {
    readonly canonicalUrl: string;
    readonly changed: boolean;
    readonly contentDigest: string;
    readonly documentMetadata?: SourceDocumentMetadata;
    readonly fetchedAt: Date;
    readonly identity: string;
    readonly itemType: SourceItem["itemType"];
    readonly latestSourceItemId?: SourceItem["_id"];
    readonly lifecycleStatus: SourceItemState["lifecycleStatus"];
    readonly observedRevision?: string;
    readonly previous: SourceItemState | null;
    readonly registry: SourceRegistry;
    readonly result: SafeFetchResult;
    readonly sourceQuality: SourceQuality;
  },
): Promise<void> {
  const now = input.fetchedAt;
  await database.repositories.sourceItemStates.upsert({
    _id: input.previous?._id ?? createSourceItemStateId(),
    schemaVersion: 1,
    sourceRegistryId: input.registry._id,
    sourceItemIdentity: input.identity,
    canonicalUrl: input.canonicalUrl,
    itemType: input.itemType,
    lifecycleStatus: input.lifecycleStatus,
    ...(input.latestSourceItemId === undefined
      ? {}
      : { latestSourceItemId: input.latestSourceItemId }),
    contentDigest: input.contentDigest,
    ...((input.result.etag ?? input.previous?.etag) === undefined
      ? {}
      : { etag: input.result.etag ?? input.previous?.etag }),
    ...((input.result.lastModified ?? input.previous?.lastModified) === undefined
      ? {}
      : { lastModified: input.result.lastModified ?? input.previous?.lastModified }),
    ...(input.observedRevision === undefined
      ? input.previous?.observedRevision === undefined
        ? {}
        : { observedRevision: input.previous.observedRevision }
      : { observedRevision: input.observedRevision }),
    lastFetchedAt: now,
    ...(input.changed
      ? { lastChangedAt: now }
      : input.previous?.lastChangedAt === undefined
        ? {}
        : { lastChangedAt: input.previous.lastChangedAt }),
    lastObservedAt: now,
    sourceQuality: input.sourceQuality,
    ...(input.documentMetadata === undefined ? {} : { documentMetadata: input.documentMetadata }),
    audit: {
      createdAt: input.previous?.audit.createdAt ?? now,
      updatedAt: now,
    },
  });
}

export function validatorsFromState(state: SourceItemState): FetchValidators {
  return {
    ...(state.etag === undefined ? {} : { etag: state.etag }),
    ...(state.lastModified === undefined ? {} : { lastModified: state.lastModified }),
  };
}
