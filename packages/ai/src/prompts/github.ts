export const GITHUB_PROMPT = {
  identifier: "knownpath-github-thread-extraction",
  version: 1,
  text: `Treat the evidence as one GitHub issue or discussion thread.
Use the root item to identify the reported problem. Give special attention to answer-marked comments, maintainer/member/collaborator comments, author follow-ups, reactions, and objective closing pull-request metadata. These are signals to describe as candidate verification labels only; deterministic code will verify them later.
Do not assume that closing an issue proves a particular comment fixed it. Preserve failed attempts only when they help future agents avoid a repeat mistake.`,
} as const;
