import type { GitHubConfig } from "@knownpath/config";
import type { Octokit } from "octokit";

import {
  githubRepositorySchema,
  githubRestIssueCommentSchema,
  githubRestIssueSchema,
  githubRestReactionSchema,
  type GitHubRestIssue,
  type GitHubRestIssueComment,
  type GitHubRestReaction,
} from "./github-schemas.js";
import type { GitHubRepositoryIdentity } from "./types.js";

export interface IssueDiscoveryPage {
  readonly etag?: string;
  readonly hasNextPage: boolean;
  readonly issues: readonly GitHubRestIssue[];
  readonly notModified: boolean;
}

export class GitHubRestClient {
  public constructor(
    private readonly client: Octokit,
    private readonly config: GitHubConfig,
  ) {}

  public async getRepository(owner: string, repo: string): Promise<GitHubRepositoryIdentity> {
    const response = await this.client.request("GET /repos/{owner}/{repo}", {
      owner,
      repo,
      headers: this.headers(),
    });
    const repository = githubRepositorySchema.parse(response.data);
    if (repository.private || repository.archived || repository.disabled) {
      throw new Error(`GitHub repository ${repository.full_name} is not an active public source`);
    }
    return {
      canonicalUrl: repository.html_url,
      databaseId: repository.id,
      hasDiscussions: repository.has_discussions,
      hasIssues: repository.has_issues,
      nameWithOwner: repository.full_name,
      nodeId: repository.node_id,
    };
  }

  public async listIssuesPage(input: {
    readonly etag?: string;
    readonly owner: string;
    readonly page: number;
    readonly repo: string;
    readonly since: Date;
  }): Promise<IssueDiscoveryPage> {
    try {
      const response = await this.client.request("GET /repos/{owner}/{repo}/issues", {
        owner: input.owner,
        repo: input.repo,
        state: "all",
        sort: "updated",
        direction: "desc",
        since: input.since.toISOString(),
        per_page: 100,
        page: input.page,
        headers: {
          ...this.headers(),
          ...(input.page === 1 && input.etag !== undefined ? { "if-none-match": input.etag } : {}),
        },
      });
      const issues = githubRestIssueSchema.array().parse(response.data);
      return {
        ...(response.headers.etag === undefined ? {} : { etag: response.headers.etag }),
        hasNextPage: hasNextLink(response.headers.link),
        issues,
        notModified: false,
      };
    } catch (error) {
      if (isNotModified(error)) {
        return { hasNextPage: false, issues: [], notModified: true };
      }
      throw error;
    }
  }

  public async listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubRestIssueComment[]> {
    return this.paginate(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
      { owner, repo, issue_number: issueNumber },
      githubRestIssueCommentSchema,
    );
  }

  public async listIssueReactions(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubRestReaction[]> {
    return this.paginate(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/reactions",
      { owner, repo, issue_number: issueNumber },
      githubRestReactionSchema,
    );
  }

  public async listIssueCommentReactions(
    owner: string,
    repo: string,
    commentId: number,
  ): Promise<GitHubRestReaction[]> {
    return this.paginate(
      "GET /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
      { owner, repo, comment_id: commentId },
      githubRestReactionSchema,
    );
  }

  private async paginate<Entity>(
    route: string,
    parameters: Readonly<Record<string, string | number>>,
    schema: { parse(value: unknown): Entity },
  ): Promise<Entity[]> {
    const results: Entity[] = [];
    let page = 1;
    while (true) {
      const response = await this.client.request(route, {
        ...parameters,
        per_page: 100,
        page,
        headers: this.headers(),
      });
      const data = Array.isArray(response.data) ? response.data : [];
      results.push(...data.map((item) => schema.parse(item)));
      if (!hasNextLink(response.headers.link)) return results;
      page += 1;
    }
  }

  private headers(): Record<string, string> {
    return {
      accept: "application/vnd.github+json",
      "x-github-api-version": this.config.apiVersion,
    };
  }
}

function hasNextLink(link: string | undefined): boolean {
  return link?.split(",").some((part) => /rel="next"/u.test(part)) ?? false;
}

function isNotModified(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { readonly status?: unknown }).status === 304
  );
}
