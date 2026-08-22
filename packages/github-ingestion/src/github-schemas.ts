import { z } from "zod";

export const githubRestUserSchema = z
  .object({
    login: z.string(),
    id: z.number().int(),
    node_id: z.string(),
    type: z.string(),
    site_admin: z.boolean(),
    html_url: z.url(),
  })
  .nullable();

export const githubRestReactionSchema = z.object({
  id: z.number().int(),
  node_id: z.string(),
  content: z.string(),
  created_at: z.string().nullable().optional(),
  user: githubRestUserSchema,
});

export const githubRestLabelSchema = z.union([
  z.string(),
  z.object({
    id: z.number().int().optional(),
    node_id: z.string().optional(),
    name: z.string().optional(),
    color: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  }),
]);

export const githubRestIssueSchema = z.object({
  id: z.number().int(),
  node_id: z.string(),
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.url(),
  url: z.url(),
  state: z.string(),
  state_reason: z.string().nullable().optional(),
  locked: z.boolean(),
  comments: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  author_association: z.string(),
  user: githubRestUserSchema,
  labels: z.array(githubRestLabelSchema),
  closed_by: githubRestUserSchema.optional(),
  pull_request: z.record(z.string(), z.unknown()).optional(),
});

export const githubRestIssueCommentSchema = z.object({
  id: z.number().int(),
  node_id: z.string(),
  body: z.string().nullable(),
  html_url: z.url(),
  url: z.url(),
  created_at: z.string(),
  updated_at: z.string(),
  author_association: z.string(),
  user: githubRestUserSchema,
  performed_via_github_app: z
    .object({ id: z.number().int(), node_id: z.string(), name: z.string(), slug: z.string() })
    .nullable()
    .optional(),
});

export const githubRepositorySchema = z.object({
  id: z.number().int(),
  node_id: z.string(),
  full_name: z.string(),
  html_url: z.url(),
  private: z.boolean(),
  archived: z.boolean(),
  disabled: z.boolean(),
  has_issues: z.boolean(),
  has_discussions: z.boolean(),
});

export const graphQlActorSchema = z
  .object({
    __typename: z.string(),
    login: z.string().nullable().optional(),
    id: z.string(),
    databaseId: z.number().int().nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .nullable();

export const graphQlReactionSchema = z.object({
  id: z.string(),
  databaseId: z.number().int().nullable().optional(),
  content: z.string(),
  createdAt: z.string(),
  user: graphQlActorSchema,
});

export const graphQlPageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

export const graphQlRateLimitSchema = z.object({
  cost: z.number().int(),
  remaining: z.number().int(),
  resetAt: z.string(),
});

export const graphQlDiscussionSummarySchema = z.object({
  id: z.string(),
  databaseId: z.number().int().nullable().optional(),
  number: z.number().int(),
  updatedAt: z.string(),
});

export const graphQlDiscussionSchema = z.object({
  id: z.string(),
  databaseId: z.number().int().nullable().optional(),
  number: z.number().int(),
  title: z.string(),
  body: z.string(),
  url: z.url(),
  author: graphQlActorSchema,
  authorAssociation: z.string(),
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  closed: z.boolean(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  lastEditedAt: z.string().nullable(),
  isAnswered: z.boolean().nullable(),
  answerChosenAt: z.string().nullable(),
  answerChosenBy: graphQlActorSchema,
  answer: z.object({ id: z.string() }).nullable(),
  locked: z.boolean(),
  stateReason: z.string().nullable(),
  upvoteCount: z.number().int().nonnegative(),
  labels: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        description: z.string().nullable(),
      }),
    ),
  }),
});

export const graphQlDiscussionCommentSchema = z.object({
  id: z.string(),
  databaseId: z.number().int().nullable().optional(),
  body: z.string(),
  url: z.url(),
  author: graphQlActorSchema,
  authorAssociation: z.string(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  lastEditedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  isAnswer: z.boolean(),
  isMinimized: z.boolean(),
  minimizedReason: z.string().nullable(),
  upvoteCount: z.number().int().nonnegative(),
  replyTo: z.object({ id: z.string() }).nullable().optional(),
});

export const graphQlPullRequestSchema = z.object({
  id: z.string(),
  databaseId: z.number().int().nullable().optional(),
  number: z.number().int(),
  url: z.url(),
  state: z.string(),
  merged: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  mergedAt: z.string().nullable(),
});

export type GitHubRestIssue = z.infer<typeof githubRestIssueSchema>;
export type GitHubRestIssueComment = z.infer<typeof githubRestIssueCommentSchema>;
export type GitHubRestReaction = z.infer<typeof githubRestReactionSchema>;
export type GraphQlDiscussion = z.infer<typeof graphQlDiscussionSchema>;
export type GraphQlDiscussionComment = z.infer<typeof graphQlDiscussionCommentSchema>;
export type GraphQlPullRequest = z.infer<typeof graphQlPullRequestSchema>;
export type GraphQlReaction = z.infer<typeof graphQlReactionSchema>;
