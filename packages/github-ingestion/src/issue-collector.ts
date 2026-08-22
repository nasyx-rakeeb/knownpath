import type { GitHubGraphQlClient } from "./graphql-client.js";
import { normalizeIssue, normalizeIssueComment } from "./normalize.js";
import type { GitHubRestClient } from "./rest-client.js";
import type {
  GitHubRepositoryIdentity,
  GitHubSourceDefinition,
  NormalizedGitHubObject,
} from "./types.js";

export interface IssueCollectionInput {
  readonly etag?: string;
  readonly etagSince?: string;
  readonly graphql?: GitHubGraphQlClient;
  readonly limit: number;
  readonly onFailure: (error: unknown, identity: string) => Promise<void>;
  readonly onObject: (object: NormalizedGitHubObject) => Promise<void>;
  readonly repository: GitHubRepositoryIdentity;
  readonly rest: GitHubRestClient;
  readonly since: Date;
  readonly source: GitHubSourceDefinition;
  readonly until?: Date;
}

export interface IssueCollectionResult {
  readonly conditionalNotModified: boolean;
  readonly etag?: string;
  readonly maxUpdatedAt?: Date;
  readonly observedObjectCount: number;
  readonly topLevelCount: number;
}

export async function collectIssues(input: IssueCollectionInput): Promise<IssueCollectionResult> {
  const issues = [];
  let page = 1;
  let firstPageEtag: string | undefined;
  let conditionalNotModified = false;
  let complete = false;

  while (!complete && issues.length < input.limit) {
    const pageResult = await input.rest.listIssuesPage({
      owner: input.source.owner,
      repo: input.source.repositoryName,
      page,
      since: input.since,
      ...(page === 1 && input.etag !== undefined && input.etagSince === input.since.toISOString()
        ? { etag: input.etag }
        : {}),
    });
    if (page === 1) firstPageEtag = pageResult.etag;
    if (pageResult.notModified) {
      conditionalNotModified = true;
      break;
    }

    for (const issue of pageResult.issues) {
      if (issue.pull_request !== undefined) continue;
      const updatedAt = new Date(issue.updated_at);
      if (input.until !== undefined && updatedAt > input.until) continue;
      issues.push(issue);
      if (issues.length >= input.limit) break;
    }
    complete = !pageResult.hasNextPage;
    page += 1;
  }

  let maxUpdatedAt: Date | undefined;
  let observedObjectCount = 0;
  for (const issue of issues) {
    try {
      const reactions = await input.rest.listIssueReactions(
        input.source.owner,
        input.source.repositoryName,
        issue.number,
      );
      const closingPullRequests =
        input.graphql === undefined
          ? []
          : await input.graphql.listClosingPullRequests(
              input.source.owner,
              input.source.repositoryName,
              issue.number,
            );
      await input.onObject(normalizeIssue(input.repository, issue, reactions, closingPullRequests));
      observedObjectCount += 1;

      const comments = await input.rest.listIssueComments(
        input.source.owner,
        input.source.repositoryName,
        issue.number,
      );
      for (const comment of comments) {
        const commentReactions = await input.rest.listIssueCommentReactions(
          input.source.owner,
          input.source.repositoryName,
          comment.id,
        );
        await input.onObject(
          normalizeIssueComment(input.repository, issue, comment, commentReactions),
        );
        observedObjectCount += 1;
      }
      const updatedAt = new Date(issue.updated_at);
      if (maxUpdatedAt === undefined || updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;
    } catch (error) {
      await input.onFailure(error, `issue:${issue.node_id}`);
    }
  }

  return {
    conditionalNotModified,
    ...(firstPageEtag === undefined ? {} : { etag: firstPageEtag }),
    ...(maxUpdatedAt === undefined ? {} : { maxUpdatedAt }),
    observedObjectCount,
    topLevelCount: issues.length,
  };
}
