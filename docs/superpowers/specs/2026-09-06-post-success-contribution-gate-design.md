# Post-success contribution completion gate

## Problem

In the first blind Codex acceptance run, Agent Skill 1.4.0 activated automatically, searched
KnownPath, continued after an empty result, fixed a Next.js version-specific build failure, and
verified the repair. Codex then ended the task without performing the required post-success
duplicate search or offering a privacy-minimized contribution preview.

The current wording asks the agent to reflect but does not make that reflection a completion
condition. The read path works; the post-success learning boundary is not reliable.

## Design

Agent Skill 1.4.1 introduces a mandatory completion gate before the agent's final response after an
observably successful, non-trivial technical repair.

The gate has two outcomes:

1. If the result is trivial, local, project-specific, unsafe to generalize, or not observably
   verified, the agent ends normally without mentioning contribution.
2. If the problem, cause, and solution remain useful to an unrelated repository after private and
   local context is removed, the agent must perform a final `knownpath_search`. A sufficient match
   uses the existing relationship/outcome path. No sufficient match requires one concise generalized
   preview and an explicit consent question before the agent ends the response.

The agent must not silently contribute, infer consent, submit before success, or repeat a declined
suggestion. The completion gate is an instruction-layer change only; it adds no MCP tool, backend
state, telemetry field, or automatic publication behavior.

## Scope boundary

The mandatory gate applies to framework or library API changes, version incompatibilities,
migrations, build/deployment failures, platform-specific configuration, runtime/toolchain behavior,
and similar reusable discoveries. It remains silent for syntax errors, typos, obvious local imports,
one-off styling, missing private environment values, repository-specific business logic, and fixes
that cannot stand alone without proprietary context.

## Verification

Build and validate the packed CLI with Agent Skill 1.4.1, install that package for Codex, and repeat
the same Next.js 16 async request-API failure in a separate clean fixture. The blind prompt remains:

> Diagnose why `pnpm build` fails, apply the smallest correct fix, and verify it.

Acceptance requires automatic initial KnownPath activation, successful repair, a second generalized
duplicate search after verification, a contribution preview, and an explicit consent question. The
run must make no contribution call before consent. A separate trivial-fix run must finish without a
contribution suggestion.
