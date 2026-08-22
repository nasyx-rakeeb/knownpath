import {
  createSourceItemId,
  createVersionedKey,
  sourceItemSchema,
  type SourceItem,
  type SourceRegistry,
} from "@knownpath/domain";

import { canonicalizeJson, sha256 } from "./canonical-json.js";
import type {
  GitHubRestIssue,
  GitHubRestIssueComment,
  GitHubRestReaction,
  GraphQlDiscussion,
  GraphQlDiscussionComment,
  GraphQlPullRequest,
  GraphQlReaction,
} from "./github-schemas.js";
import type {
  GitHubActor,
  GitHubReaction,
  GitHubRepositoryIdentity,
  NormalizedGitHubObject,
} from "./types.js";

export function normalizeIssue(
  repository: GitHubRepositoryIdentity,
  issue: GitHubRestIssue,
  reactions: readonly GitHubRestReaction[],
  closingPullRequests: readonly GraphQlPullRequest[],
): NormalizedGitHubObject {
  const identity = issueIdentity(issue.node_id);
  return {
    sourceItemIdentity: identity,
    itemType: "issue",
    title: issue.title,
    body: issue.body ?? "",
    canonicalUrl: issue.html_url,
    ...(issue.user === null ? {} : { author: issue.user.login }),
    publishedAt: new Date(issue.created_at),
    observedAt: new Date(issue.updated_at),
    observedRevision: issue.updated_at,
    metadata: {
      repository: normalizeRepository(repository),
      object: {
        kind: "issue",
        databaseId: issue.id,
        nodeId: issue.node_id,
        number: issue.number,
        apiUrl: issue.url,
      },
      author: normalizeRestActor(issue.user),
      authorAssociation: issue.author_association,
      state: issue.state,
      stateReason: issue.state_reason ?? null,
      locked: issue.locked,
      commentCount: issue.comments,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at,
      closedBy: normalizeRestActor(issue.closed_by ?? null),
      labels: normalizeRestLabels(issue.labels),
      reactions: normalizeRestReactions(reactions),
      reactionSummary: summarizeReactions(reactions.map((reaction) => reaction.content)),
      closingPullRequests: [...closingPullRequests]
        .sort((left, right) => left.number - right.number)
        .map((pullRequest) => ({
          databaseId: pullRequest.databaseId ?? null,
          nodeId: pullRequest.id,
          number: pullRequest.number,
          url: pullRequest.url,
          state: pullRequest.state,
          merged: pullRequest.merged,
          createdAt: pullRequest.createdAt,
          updatedAt: pullRequest.updatedAt,
          closedAt: pullRequest.closedAt,
          mergedAt: pullRequest.mergedAt,
        })),
    },
  };
}

export function normalizeIssueComment(
  repository: GitHubRepositoryIdentity,
  issue: GitHubRestIssue,
  comment: GitHubRestIssueComment,
  reactions: readonly GitHubRestReaction[],
): NormalizedGitHubObject {
  const rootIdentity = issueIdentity(issue.node_id);
  return {
    sourceItemIdentity: issueCommentIdentity(comment.node_id),
    rootSourceItemIdentity: rootIdentity,
    parentSourceItemIdentity: rootIdentity,
    itemType: "issue_comment",
    body: comment.body ?? "",
    canonicalUrl: comment.html_url,
    ...(comment.user === null ? {} : { author: comment.user.login }),
    publishedAt: new Date(comment.created_at),
    observedAt: new Date(comment.updated_at),
    observedRevision: comment.updated_at,
    metadata: {
      repository: normalizeRepository(repository),
      object: {
        kind: "issue_comment",
        databaseId: comment.id,
        nodeId: comment.node_id,
        apiUrl: comment.url,
      },
      root: { kind: "issue", nodeId: issue.node_id, number: issue.number },
      author: normalizeRestActor(comment.user),
      authorAssociation: comment.author_association,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      performedViaGitHubApp:
        comment.performed_via_github_app === null || comment.performed_via_github_app === undefined
          ? null
          : {
              databaseId: comment.performed_via_github_app.id,
              nodeId: comment.performed_via_github_app.node_id,
              name: comment.performed_via_github_app.name,
              slug: comment.performed_via_github_app.slug,
            },
      reactions: normalizeRestReactions(reactions),
      reactionSummary: summarizeReactions(reactions.map((reaction) => reaction.content)),
    },
  };
}

export function normalizeDiscussion(
  repository: GitHubRepositoryIdentity,
  discussion: GraphQlDiscussion,
  reactions: readonly GraphQlReaction[],
): NormalizedGitHubObject {
  const identity = discussionIdentity(discussion.id);
  return {
    sourceItemIdentity: identity,
    itemType: "discussion",
    title: discussion.title,
    body: discussion.body,
    canonicalUrl: discussion.url,
    ...(discussion.author?.login === undefined || discussion.author.login === null
      ? {}
      : { author: discussion.author.login }),
    publishedAt: new Date(discussion.publishedAt ?? discussion.createdAt),
    observedAt: new Date(discussion.updatedAt),
    observedRevision: discussion.lastEditedAt ?? discussion.updatedAt,
    metadata: {
      repository: normalizeRepository(repository),
      object: {
        kind: "discussion",
        databaseId: discussion.databaseId ?? null,
        nodeId: discussion.id,
        number: discussion.number,
      },
      author: normalizeGraphQlActor(discussion.author),
      authorAssociation: discussion.authorAssociation,
      category: discussion.category,
      state: discussion.closed ? "closed" : "open",
      stateReason: discussion.stateReason,
      locked: discussion.locked,
      isAnswered: discussion.isAnswered,
      answerNodeId: discussion.answer?.id ?? null,
      answerChosenAt: discussion.answerChosenAt,
      answerChosenBy: normalizeGraphQlActor(discussion.answerChosenBy),
      createdAt: discussion.createdAt,
      publishedAt: discussion.publishedAt,
      updatedAt: discussion.updatedAt,
      lastEditedAt: discussion.lastEditedAt,
      closedAt: discussion.closedAt,
      upvoteCount: discussion.upvoteCount,
      labels: [...discussion.labels.nodes].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      reactions: normalizeGraphQlReactions(reactions),
      reactionSummary: summarizeReactions(reactions.map((reaction) => reaction.content)),
    },
  };
}

export function normalizeDiscussionComment(
  repository: GitHubRepositoryIdentity,
  discussion: GraphQlDiscussion,
  comment: GraphQlDiscussionComment,
  reactions: readonly GraphQlReaction[],
  parentNodeId?: string,
): NormalizedGitHubObject {
  const rootIdentity = discussionIdentity(discussion.id);
  const parentIdentity =
    parentNodeId === undefined ? rootIdentity : discussionCommentIdentity(parentNodeId);
  return {
    sourceItemIdentity: discussionCommentIdentity(comment.id),
    rootSourceItemIdentity: rootIdentity,
    parentSourceItemIdentity: parentIdentity,
    itemType: "discussion_comment",
    body: comment.body,
    canonicalUrl: comment.url,
    ...(comment.author?.login === undefined || comment.author.login === null
      ? {}
      : { author: comment.author.login }),
    publishedAt: new Date(comment.publishedAt ?? comment.createdAt),
    observedAt: new Date(comment.updatedAt),
    observedRevision: comment.lastEditedAt ?? comment.updatedAt,
    metadata: {
      repository: normalizeRepository(repository),
      object: {
        kind: "discussion_comment",
        databaseId: comment.databaseId ?? null,
        nodeId: comment.id,
      },
      root: { kind: "discussion", nodeId: discussion.id, number: discussion.number },
      parentNodeId: parentNodeId ?? discussion.id,
      replyToNodeId: comment.replyTo?.id ?? null,
      author: normalizeGraphQlActor(comment.author),
      authorAssociation: comment.authorAssociation,
      createdAt: comment.createdAt,
      publishedAt: comment.publishedAt,
      updatedAt: comment.updatedAt,
      lastEditedAt: comment.lastEditedAt,
      deletedAt: comment.deletedAt,
      isAnswer: comment.isAnswer,
      isMinimized: comment.isMinimized,
      minimizedReason: comment.minimizedReason,
      upvoteCount: comment.upvoteCount,
      reactions: normalizeGraphQlReactions(reactions),
      reactionSummary: summarizeReactions(reactions.map((reaction) => reaction.content)),
    },
  };
}

export function createSourceItemSnapshot(
  registry: SourceRegistry,
  object: NormalizedGitHubObject,
  capturedAt: Date,
): SourceItem {
  const providerMetadata = {
    provider: "github",
    formatVersion: 1,
    payload: object.metadata,
  } as const;
  const snapshotMaterial = canonicalizeJson({
    body: object.body,
    metadata: providerMetadata,
    title: object.title ?? null,
  });

  return sourceItemSchema.parse({
    _id: createSourceItemId(),
    schemaVersion: 1,
    sourceRegistryId: registry._id,
    itemType: object.itemType,
    ...(object.title === undefined ? {} : { title: object.title }),
    provenance: {
      canonicalUrl: object.canonicalUrl,
      sourceItemIdentity: object.sourceItemIdentity,
      ...(object.rootSourceItemIdentity === undefined
        ? {}
        : { rootSourceItemIdentity: object.rootSourceItemIdentity }),
      ...(object.parentSourceItemIdentity === undefined
        ? {}
        : { parentSourceItemIdentity: object.parentSourceItemIdentity }),
      observedRevision: object.observedRevision,
      ...(object.author === undefined ? {} : { author: object.author }),
      ...(object.publishedAt === undefined ? {} : { publishedAt: object.publishedAt }),
      observedAt: object.observedAt,
    },
    providerMetadata,
    content: {
      digest: sha256(object.body),
      mediaType: "text/markdown; charset=utf-8",
      text: object.body,
      byteLength: Buffer.byteLength(object.body, "utf8"),
    },
    deduplicationKey: createVersionedKey([
      registry._id,
      object.sourceItemIdentity,
      sha256(snapshotMaterial),
    ]),
    capturedAt,
    visibility: { scope: "public" },
    audit: { createdAt: capturedAt, updatedAt: capturedAt },
  });
}

function normalizeRepository(repository: GitHubRepositoryIdentity) {
  return {
    databaseId: repository.databaseId,
    nodeId: repository.nodeId,
    nameWithOwner: repository.nameWithOwner,
    url: repository.canonicalUrl,
  };
}

function normalizeRestActor(actor: GitHubRestIssue["user"]): GitHubActor | null {
  if (actor === null || actor === undefined) return null;
  return {
    databaseId: actor.id,
    nodeId: actor.node_id,
    login: actor.login,
    type: actor.type,
    siteAdmin: actor.site_admin,
    url: actor.html_url,
  };
}

function normalizeGraphQlActor(actor: GraphQlDiscussion["author"]): GitHubActor | null {
  if (actor === null) return null;
  return {
    databaseId: actor.databaseId ?? null,
    nodeId: actor.id,
    login: actor.login ?? null,
    type: actor.__typename,
    siteAdmin: null,
    url: actor.url ?? null,
  };
}

function normalizeRestReactions(reactions: readonly GitHubRestReaction[]): GitHubReaction[] {
  return [...reactions]
    .sort((left, right) => left.id - right.id)
    .map((reaction) => ({
      databaseId: reaction.id,
      nodeId: reaction.node_id,
      content: reaction.content,
      createdAt: reaction.created_at ?? null,
      actor: normalizeRestActor(reaction.user),
    }));
}

function normalizeGraphQlReactions(reactions: readonly GraphQlReaction[]): GitHubReaction[] {
  return [...reactions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((reaction) => ({
      databaseId: reaction.databaseId ?? null,
      nodeId: reaction.id,
      content: reaction.content,
      createdAt: reaction.createdAt,
      actor: normalizeGraphQlActor(reaction.user),
    }));
}

function normalizeRestLabels(labels: GitHubRestIssue["labels"]) {
  return labels
    .map((label) =>
      typeof label === "string"
        ? { name: label, databaseId: null, nodeId: null, color: null, description: null }
        : {
            name: label.name ?? "",
            databaseId: label.id ?? null,
            nodeId: label.node_id ?? null,
            color: label.color ?? null,
            description: label.description ?? null,
          },
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

function summarizeReactions(contents: readonly string[]): Record<string, number> {
  return contents.reduce<Record<string, number>>((counts, content) => {
    counts[content] = (counts[content] ?? 0) + 1;
    return counts;
  }, {});
}

function issueIdentity(nodeId: string): string {
  return `github:issue:${nodeId}`;
}

function issueCommentIdentity(nodeId: string): string {
  return `github:issue-comment:${nodeId}`;
}

function discussionIdentity(nodeId: string): string {
  return `github:discussion:${nodeId}`;
}

function discussionCommentIdentity(nodeId: string): string {
  return `github:discussion-comment:${nodeId}`;
}
