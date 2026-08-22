import { z } from "zod";

const actorSchema = z.object({
  databaseId: z.number().int().optional().nullable(),
  nodeId: z.string().optional().nullable(),
  login: z.string().optional().nullable(),
});
const reactionSchema = z.object({
  content: z.string(),
  actor: actorSchema.optional().nullable(),
  user: actorSchema.optional().nullable(),
  databaseId: z.number().int().optional().nullable(),
  nodeId: z.string().optional().nullable(),
});
const closingPullRequestSchema = z.object({
  nodeId: z.string(),
  merged: z.boolean(),
  mergedAt: z.string().optional().nullable(),
});

const githubPayloadSchema = z.object({
  object: z.object({
    kind: z.string(),
    nodeId: z.string(),
    databaseId: z.number().int().optional().nullable(),
  }),
  root: z.object({ kind: z.string(), nodeId: z.string() }).optional(),
  author: actorSchema.optional().nullable(),
  authorAssociation: z.string().optional(),
  state: z.string().optional(),
  closedAt: z.string().optional().nullable(),
  answerNodeId: z.string().optional().nullable(),
  answerChosenAt: z.string().optional().nullable(),
  isAnswer: z.boolean().optional(),
  upvoteCount: z.number().int().nonnegative().optional(),
  reactions: z.array(reactionSchema).optional(),
  reactionSummary: z.record(z.string(), z.number().int().nonnegative()).optional(),
  closingPullRequests: z.array(closingPullRequestSchema).optional(),
});

export type GitHubFacts = z.infer<typeof githubPayloadSchema>;

export function parseGitHubFacts(payload: unknown): GitHubFacts | null {
  const result = githubPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function isCurrentRepositoryAuthority(association: string | undefined): boolean {
  return association !== undefined && ["OWNER", "MEMBER", "COLLABORATOR"].includes(association);
}

export function reactionCounts(facts: GitHubFacts): { positive: number; negative: number } {
  const positiveKinds = new Set(["THUMBS_UP", "HEART", "HOORAY", "ROCKET", "EYES", "+1"]);
  const negativeKinds = new Set(["THUMBS_DOWN", "CONFUSED", "-1"]);
  if (facts.reactions !== undefined && facts.reactions.length > 0) {
    const unique = new Map<string, string>();
    for (const reaction of facts.reactions) {
      const actor = reaction.actor ?? reaction.user;
      const identity = actor?.nodeId ?? actor?.databaseId?.toString() ?? actor?.login;
      if (identity !== undefined) unique.set(`${identity}:${reaction.content}`, reaction.content);
    }
    return countKinds([...unique.values()], positiveKinds, negativeKinds);
  }
  let positive = facts.upvoteCount ?? 0;
  let negative = 0;
  for (const [kind, count] of Object.entries(facts.reactionSummary ?? {})) {
    if (positiveKinds.has(kind)) positive += count;
    if (negativeKinds.has(kind)) negative += count;
  }
  return { positive, negative };
}

function countKinds(
  values: readonly string[],
  positiveKinds: Set<string>,
  negativeKinds: Set<string>,
) {
  return values.reduce(
    (counts, kind) => ({
      positive: counts.positive + (positiveKinds.has(kind) ? 1 : 0),
      negative: counts.negative + (negativeKinds.has(kind) ? 1 : 0),
    }),
    { positive: 0, negative: 0 },
  );
}
