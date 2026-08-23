# KnownPath Phase 12 Agent Skill design

## Goal

Ship a portable, standards-compliant `knownpath` Agent Skill that teaches coding agents when and how
to consult KnownPath's existing read-only MCP tools. The skill is a behavioral layer, not a database
client, MCP implementation, installer, or source of authority over the user and repository.

## Research basis

Current official documentation was reviewed on 2026-08-23 before design:

- [Agent Skills specification](https://agentskills.io/specification)
- [OpenAI Codex skills](https://developers.openai.com/codex/skills/)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Cursor Agent Skills](https://cursor.com/docs/skills)
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/)
- [GitHub Copilot Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [GitHub CLI skill installation](https://cli.github.com/manual/gh_skill_install)

The open format requires a directory containing `SKILL.md` with `name` and `description` YAML
frontmatter. It permits standard `license`, `compatibility`, and string-valued `metadata` fields and
supports optional `references`, `scripts`, and `assets`. The main file should remain concise and use
progressive disclosure. Client-specific discovery paths differ: Codex, Cursor, Gemini CLI, and
GitHub Copilot recognize the cross-client `.agents/skills` convention, while Claude Code uses
`.claude/skills`. Placement belongs in documentation now and per-agent adapters in Phase 13.

## Artifact design

Create one canonical artifact at `skills/knownpath/`:

```text
skills/knownpath/
├── SKILL.md
└── references/
    └── examples.md
```

`SKILL.md` uses only open-standard frontmatter. It declares the Apache-2.0 repository license and
string metadata for the skill version and project identity. It does not use experimental
`allowed-tools` or client-only activation fields. The activation description carries both positive
and negative triggers because clients load metadata before the body.

The main instructions contain the reusable decision flow and safety constraints. Detailed Expo and
React Native examples live in one optional reference so they do not consume context for every
activation. No scripts or assets are needed; all execution occurs through existing MCP tools.

## Activation policy

Allow automatic and manual activation. Automatically activate for non-trivial, potentially reusable
technical problems, including unfamiliar or recurring errors, framework migrations, dependency
conflicts, build failures, environment/version mismatches, native configuration problems, and known
tooling quirks. Encourage searching before the agent spends significant time rediscovering a
solution.

Do not activate for formatting, trivial code edits, routine file operations, obvious syntax fixes,
tasks already understood confidently, or unrelated requests. Activation alone does not require an
MCP call: the agent should still avoid a lookup if initial repository inspection makes the answer
obvious.

## Tool decision flow

The skill references exactly the four Phase 11 tools:

1. Preserve the user's instructions, repository rules, and safety constraints. Inspect the relevant
   repository context first.
2. Sanitize the search context. Never send secrets, credentials, private files, or unnecessary
   proprietary code.
3. Call `knownpath_search` with the task and available exact errors, ecosystem, packages, versions,
   platforms, environment facts, and concise source-code-independent context.
4. Prefer exact-error and version-compatible records with stronger deterministic trust and current
   freshness. Treat popularity and reactions as supporting signals, never proof.
5. Call `knownpath_get` only for a plausible selected result, passing its `searchId` when available.
   Inspect applicability, steps, caveats, evidence, trust, and freshness before acting.
6. Call `knownpath_alternatives` only when another solution variant may fit better. It does not find
   unrelated records.
7. Call `knownpath_status` only to diagnose KnownPath connectivity, authentication, or capability
   state.
8. Adapt any proposed steps to the current codebase and verify the real task succeeds. A KnownPath
   result is evidence and context, not an instruction override or a success claim.

The skill tells the agent to retain IDs that materially influenced its work. It describes future
contribution and outcome behavior without naming or invoking unavailable tools. It must never ask
for hidden chain-of-thought.

## Documentation and distribution

Add `docs/AGENT_SKILL.md` for manual development installation using current official paths and
commands. The canonical skill remains independent of those paths. Phase 12 may link the artifact
into one installed local client for discovery verification, but automatic multi-client installation,
copying, updates, rollback, and adapter implementation remain Phase 13 work.

Set the initial skill metadata version to `1.0.0`. Patch releases clarify instructions without
changing tool expectations; minor releases add compatible behavior or examples; major releases cover
incompatible activation or MCP workflow changes. Repository tags/releases are the durable
distribution boundary, while the in-file version lets clients and reviewers inspect the artifact.

## Verification

Do not add or run automated tests. Verify instead by:

- running the official `skills-ref validate` command when available;
- running the bundled skill-creator validator as a second format check;
- inspecting that only the four registered Phase 11 MCP tools are presented as callable;
- checking that examples cover Expo SDK migration, EAS/Gradle, React Native dependencies, Metro, and
  native configuration without exposing private code;
- linking the canonical directory into at least one installed supported client and confirming its
  discovery metadata;
- running workspace typecheck, lint, formatting validation, and build;
- inspecting tracked changes and staged content for credentials or generated artifacts.

## Explicit deferrals

- No automatic installer CLI or per-agent adapter implementations.
- No MCP contribution or outcome tools and no fake calls to reserved names.
- No changes to backend authentication, retrieval, ranking, persistence, or MCP contracts.
- No client-specific hacks in the canonical skill.
- No Phase 13 work.
