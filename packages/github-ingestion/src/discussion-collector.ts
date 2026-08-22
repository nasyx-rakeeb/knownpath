import type { GitHubGraphQlClient } from "./graphql-client.js";
import { normalizeDiscussion, normalizeDiscussionComment } from "./normalize.js";
import type {
  GitHubRepositoryIdentity,
  GitHubSourceDefinition,
  NormalizedGitHubObject,
} from "./types.js";

export interface DiscussionCollectionInput {
  readonly graphql: GitHubGraphQlClient;
  readonly limit: number;
  readonly onFailure: (error: unknown, identity: string) => Promise<void>;
  readonly onObject: (object: NormalizedGitHubObject) => Promise<void>;
  readonly repository: GitHubRepositoryIdentity;
  readonly since: Date;
  readonly source: GitHubSourceDefinition;
  readonly until?: Date;
}

export interface DiscussionCollectionResult {
  readonly maxUpdatedAt?: Date;
  readonly topLevelCount: number;
}

export async function collectDiscussions(
  input: DiscussionCollectionInput,
): Promise<DiscussionCollectionResult> {
  const summaries = await input.graphql.discoverDiscussions({
    owner: input.source.owner,
    repo: input.source.repositoryName,
    since: input.since,
    limit: input.limit,
    ...(input.until === undefined ? {} : { until: input.until }),
  });
  let maxUpdatedAt: Date | undefined;

  for (const summary of summaries) {
    try {
      const discussion = await input.graphql.getDiscussion(
        input.source.owner,
        input.source.repositoryName,
        summary.number,
      );
      const reactions = await input.graphql.listReactions(discussion.id);
      await input.onObject(normalizeDiscussion(input.repository, discussion, reactions));

      const comments = await input.graphql.listDiscussionComments(
        input.source.owner,
        input.source.repositoryName,
        discussion.number,
      );
      for (const comment of comments) {
        const commentReactions = await input.graphql.listReactions(comment.id);
        await input.onObject(
          normalizeDiscussionComment(input.repository, discussion, comment, commentReactions),
        );

        const replies = await input.graphql.listDiscussionReplies(comment.id);
        for (const reply of replies) {
          const replyReactions = await input.graphql.listReactions(reply.id);
          await input.onObject(
            normalizeDiscussionComment(
              input.repository,
              discussion,
              reply,
              replyReactions,
              comment.id,
            ),
          );
        }
      }
      const updatedAt = new Date(discussion.updatedAt);
      if (maxUpdatedAt === undefined || updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;
    } catch (error) {
      await input.onFailure(error, `discussion:${summary.id}`);
    }
  }

  return {
    ...(maxUpdatedAt === undefined ? {} : { maxUpdatedAt }),
    topLevelCount: summaries.length,
  };
}
