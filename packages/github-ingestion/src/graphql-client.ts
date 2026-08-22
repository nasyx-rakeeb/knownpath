import type { Octokit } from "octokit";
import { z } from "zod";

import {
  graphQlDiscussionCommentSchema,
  graphQlDiscussionSchema,
  graphQlDiscussionSummarySchema,
  graphQlPageInfoSchema,
  graphQlPullRequestSchema,
  graphQlRateLimitSchema,
  graphQlReactionSchema,
  type GraphQlDiscussion,
  type GraphQlDiscussionComment,
  type GraphQlPullRequest,
  type GraphQlReaction,
} from "./github-schemas.js";
import type { GitHubIngestionLogger } from "./types.js";

const DISCUSSION_FIELDS = `
  id databaseId number title body url
  author { __typename login url ... on Node { id } }
  authorAssociation
  category { id name slug }
  closed closedAt createdAt publishedAt updatedAt lastEditedAt
  isAnswered answerChosenAt
  answerChosenBy { __typename login url ... on Node { id } }
  answer { id }
  locked stateReason upvoteCount
  labels(first: 100) { nodes { id name color description } }
`;

const COMMENT_FIELDS = `
  id databaseId body url
  author { __typename login url ... on Node { id } }
  authorAssociation createdAt publishedAt updatedAt lastEditedAt deletedAt
  isAnswer isMinimized minimizedReason upvoteCount
  replyTo { id }
`;

const REACTION_FIELDS = `
  id databaseId content createdAt
  user { __typename id databaseId login url }
`;

export class GitHubGraphQlClient {
  public constructor(
    private readonly client: Octokit,
    private readonly logger: GitHubIngestionLogger,
  ) {}

  public async discoverDiscussions(input: {
    readonly limit: number;
    readonly owner: string;
    readonly repo: string;
    readonly since: Date;
    readonly until?: Date;
  }): Promise<
    Array<{
      readonly databaseId?: number | null;
      readonly id: string;
      readonly number: number;
      readonly updatedAt: string;
    }>
  > {
    const summaries: Array<{
      readonly databaseId?: number | null;
      readonly id: string;
      readonly number: number;
      readonly updatedAt: string;
    }> = [];
    let cursor: string | null = null;
    let complete = false;

    while (!complete && summaries.length < input.limit) {
      const raw = await this.client.graphql(
        `query KnownPathDiscussionDiscovery($owner: String!, $repo: String!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            discussions(first: 100, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
              nodes { id databaseId number updatedAt }
              pageInfo { hasNextPage endCursor }
            }
          }
          rateLimit { cost remaining resetAt }
        }`,
        { owner: input.owner, repo: input.repo, cursor },
      );
      const response = z
        .object({
          repository: z
            .object({
              discussions: z.object({
                nodes: z.array(graphQlDiscussionSummarySchema),
                pageInfo: graphQlPageInfoSchema,
              }),
            })
            .nullable(),
          rateLimit: graphQlRateLimitSchema,
        })
        .parse(raw);
      if (response.repository === null) throw new Error("GitHub repository was not found");
      this.logRateLimit(response.rateLimit);

      for (const summary of response.repository.discussions.nodes) {
        const updatedAt = new Date(summary.updatedAt);
        if (updatedAt < input.since) {
          complete = true;
          break;
        }
        if (input.until !== undefined && updatedAt > input.until) continue;
        summaries.push({
          id: summary.id,
          number: summary.number,
          updatedAt: summary.updatedAt,
          ...(summary.databaseId === undefined ? {} : { databaseId: summary.databaseId }),
        });
        if (summaries.length >= input.limit) break;
      }

      const pageInfo = response.repository.discussions.pageInfo;
      if (!pageInfo.hasNextPage || pageInfo.endCursor === null) complete = true;
      cursor = pageInfo.endCursor;
    }
    return summaries;
  }

  public async getDiscussion(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GraphQlDiscussion> {
    const raw = await this.client.graphql(
      `query KnownPathDiscussion($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $number) { ${DISCUSSION_FIELDS} }
        }
        rateLimit { cost remaining resetAt }
      }`,
      { owner, repo, number },
    );
    const response = z
      .object({
        repository: z.object({ discussion: graphQlDiscussionSchema.nullable() }).nullable(),
        rateLimit: graphQlRateLimitSchema,
      })
      .parse(raw);
    this.logRateLimit(response.rateLimit);
    const discussion = response.repository?.discussion;
    if (discussion === null || discussion === undefined) {
      throw new Error(`GitHub discussion #${number} was not found`);
    }
    return discussion;
  }

  public async listDiscussionComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GraphQlDiscussionComment[]> {
    const results: GraphQlDiscussionComment[] = [];
    let cursor: string | null = null;
    while (true) {
      const raw = await this.client.graphql(
        `query KnownPathDiscussionComments($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            discussion(number: $number) {
              comments(first: 100, after: $cursor) {
                nodes { ${COMMENT_FIELDS} }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
          rateLimit { cost remaining resetAt }
        }`,
        { owner, repo, number, cursor },
      );
      const response = z
        .object({
          repository: z
            .object({
              discussion: z
                .object({
                  comments: z.object({
                    nodes: z.array(graphQlDiscussionCommentSchema),
                    pageInfo: graphQlPageInfoSchema,
                  }),
                })
                .nullable(),
            })
            .nullable(),
          rateLimit: graphQlRateLimitSchema,
        })
        .parse(raw);
      this.logRateLimit(response.rateLimit);
      const comments = response.repository?.discussion?.comments;
      if (comments === undefined) throw new Error(`GitHub discussion #${number} was not found`);
      results.push(...comments.nodes);
      if (!comments.pageInfo.hasNextPage || comments.pageInfo.endCursor === null) return results;
      cursor = comments.pageInfo.endCursor;
    }
  }

  public async listDiscussionReplies(commentNodeId: string): Promise<GraphQlDiscussionComment[]> {
    const results: GraphQlDiscussionComment[] = [];
    let cursor: string | null = null;
    while (true) {
      const raw = await this.client.graphql(
        `query KnownPathDiscussionReplies($id: ID!, $cursor: String) {
          node(id: $id) {
            ... on DiscussionComment {
              replies(first: 100, after: $cursor) {
                nodes { ${COMMENT_FIELDS} }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
          rateLimit { cost remaining resetAt }
        }`,
        { id: commentNodeId, cursor },
      );
      const response = z
        .object({
          node: z
            .object({
              replies: z.object({
                nodes: z.array(graphQlDiscussionCommentSchema),
                pageInfo: graphQlPageInfoSchema,
              }),
            })
            .nullable(),
          rateLimit: graphQlRateLimitSchema,
        })
        .parse(raw);
      this.logRateLimit(response.rateLimit);
      if (response.node === null)
        throw new Error(`GitHub discussion comment ${commentNodeId} was not found`);
      results.push(...response.node.replies.nodes);
      if (
        !response.node.replies.pageInfo.hasNextPage ||
        response.node.replies.pageInfo.endCursor === null
      ) {
        return results;
      }
      cursor = response.node.replies.pageInfo.endCursor;
    }
  }

  public async listReactions(nodeId: string): Promise<GraphQlReaction[]> {
    const results: GraphQlReaction[] = [];
    let cursor: string | null = null;
    while (true) {
      const raw = await this.client.graphql(
        `query KnownPathReactions($id: ID!, $cursor: String) {
          node(id: $id) {
            ... on Reactable {
              reactions(first: 100, after: $cursor) {
                nodes { ${REACTION_FIELDS} }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
          rateLimit { cost remaining resetAt }
        }`,
        { id: nodeId, cursor },
      );
      const response = z
        .object({
          node: z
            .object({
              reactions: z.object({
                nodes: z.array(graphQlReactionSchema),
                pageInfo: graphQlPageInfoSchema,
              }),
            })
            .nullable(),
          rateLimit: graphQlRateLimitSchema,
        })
        .parse(raw);
      this.logRateLimit(response.rateLimit);
      if (response.node === null) throw new Error(`GitHub reactable node ${nodeId} was not found`);
      results.push(...response.node.reactions.nodes);
      if (
        !response.node.reactions.pageInfo.hasNextPage ||
        response.node.reactions.pageInfo.endCursor === null
      ) {
        return results;
      }
      cursor = response.node.reactions.pageInfo.endCursor;
    }
  }

  public async listClosingPullRequests(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GraphQlPullRequest[]> {
    const results: GraphQlPullRequest[] = [];
    let cursor: string | null = null;
    while (true) {
      const raw = await this.client.graphql(
        `query KnownPathClosingPullRequests($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            issue(number: $number) {
              closedByPullRequestsReferences(first: 100, after: $cursor) {
                nodes { id databaseId number url state merged createdAt updatedAt closedAt mergedAt }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
          rateLimit { cost remaining resetAt }
        }`,
        { owner, repo, number: issueNumber, cursor },
      );
      const response = z
        .object({
          repository: z
            .object({
              issue: z
                .object({
                  closedByPullRequestsReferences: z.object({
                    nodes: z.array(graphQlPullRequestSchema),
                    pageInfo: graphQlPageInfoSchema,
                  }),
                })
                .nullable(),
            })
            .nullable(),
          rateLimit: graphQlRateLimitSchema,
        })
        .parse(raw);
      this.logRateLimit(response.rateLimit);
      const references = response.repository?.issue?.closedByPullRequestsReferences;
      if (references === undefined) return results;
      results.push(...references.nodes);
      if (!references.pageInfo.hasNextPage || references.pageInfo.endCursor === null)
        return results;
      cursor = references.pageInfo.endCursor;
    }
  }

  private logRateLimit(rateLimit: z.infer<typeof graphQlRateLimitSchema>): void {
    this.logger.debug("GitHub GraphQL rate limit", {
      cost: rateLimit.cost,
      remaining: rateLimit.remaining,
      resetAt: rateLimit.resetAt,
    });
  }
}
