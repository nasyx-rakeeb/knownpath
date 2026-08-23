# KnownPath Agent Skill

## Purpose

The canonical [`knownpath` Agent Skill](../skills/knownpath/SKILL.md) teaches coding agents when and
how to consult KnownPath's read-only MCP capability. It does not contain knowledge records, connect
to MongoDB, call the HTTP API directly, or replace MCP configuration. It helps an agent decide when
a lookup is worthwhile, supply safe structured context, inspect evidence and caveats, and validate a
selected solution against the current repository.

The skill auto-activates for relevant non-trivial debugging, migration, dependency, build,
environment/version, native-configuration, and unfamiliar-error work. It remains manually invocable.
Its description explicitly excludes formatting, trivial edits, obvious syntax fixes, routine file
operations, confidently understood tasks, and unrelated requests.

## Portable artifact

```text
skills/knownpath/
├── SKILL.md
└── references/
    └── examples.md
```

The artifact follows the open Agent Skills specification. Its frontmatter uses only standard fields:
`name`, `description`, `license`, and string-valued `metadata`. It has no client-specific commands,
dynamic prompt syntax, pre-approved tools, executable scripts, or UI metadata. Detailed Expo and
React Native examples are loaded only when useful.

The current skill version is `1.0.0`.

## Required MCP setup

Configure KnownPath MCP before using the skill. The skill expects exactly these current tools:

- `knownpath_search`
- `knownpath_get`
- `knownpath_alternatives`
- `knownpath_status`

See [the MCP guide](MCP.md) for remote Streamable HTTP and local stdio configuration. The local
bridge needs only `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`; never place the key in a tracked
skill file or agent configuration.

No contribution or outcome-reporting tool exists through Phase 13. The skill remembers materially
used IDs for future reporting but never instructs an agent to call an unavailable write capability.

## Automatic installation

Phase 13 packages this canonical directory into the `knownpath` installer. Configure the required
environment and use `pnpm knownpath -- install` from this checkout; see the complete
[installer guide](INSTALLER.md). The intended post-release command is `npx knownpath install`.

The installer supports Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode without maintaining
divergent skill text. Manual links remain useful only when editing the skill itself.

## Manual development links

Use an absolute source path so the link continues to work from other repositories.

### OpenAI Codex

Codex discovers repository and user skills in `.agents/skills`. From this checkout, create a
user-level development link:

```sh
mkdir -p "$HOME/.agents/skills"
ln -s "$(pwd)/skills/knownpath" "$HOME/.agents/skills/knownpath"
```

Use `$knownpath` for explicit invocation. Codex can also activate it automatically from its
description. Run `/skills` or restart Codex if a newly linked skill does not appear.

### Claude Code

Claude Code uses `.claude/skills` at project scope and `~/.claude/skills` at user scope:

```sh
mkdir -p "$HOME/.claude/skills"
ln -s "$(pwd)/skills/knownpath" "$HOME/.claude/skills/knownpath"
```

Invoke `/knownpath` manually or let Claude select it when relevant. Claude Code follows symlinked
skill directories and detects changes; restart only if the new top-level directory is not detected.

### Cursor

Cursor discovers `.agents/skills` and `.cursor/skills` at project or user scope. The same
`~/.agents/skills/knownpath` link used for Codex is portable to Cursor. Invoke `/knownpath` or
inspect it under **Customize → Skills**. Cursor was not installed in the Phase 12 or Phase 13
development environment.

### Gemini CLI

Gemini CLI supports `.agents/skills` as a user/workspace alias and provides a development link
command:

```sh
gemini skills link "$(pwd)/skills/knownpath" --scope user
```

Inside Gemini CLI, use `/skills list` to inspect discovery and `/skills reload` after changes.
Gemini asks for activation consent. Gemini CLI was not installed in the Phase 12 or Phase 13
development environment.

### GitHub Copilot

GitHub Copilot supports project skills under `.github/skills`, `.claude/skills`, or
`.agents/skills`, and personal skills under `~/.copilot/skills` or `~/.agents/skills`. The shared
`.agents/skills/knownpath` link therefore works for Copilot and the other clients above. GitHub
CLI's preview `gh skill` commands can install and update released skills later, but manual
development uses a local link to preserve one editable source.

## Safe use flow

1. Inspect the actual repository and preserve user, repository, and safety instructions.
2. Search only when the problem is non-trivial and prior experience could prevent substantial
   rediscovery.
3. Send sanitized technical context, not secrets or unnecessary private code.
4. Prefer exact/version-compatible/current records with stronger deterministic evidence.
5. Retrieve details only for a plausible selected record and inspect caveats/provenance.
6. Adapt the evidence to the current codebase and verify the real result before claiming success.

Normal clients search published public KnownPaths. `includeReview` remains false unless an
authorized administrator explicitly requests moderation access. Popularity and reactions are
signals, not proof.

## Release and update policy

- Patch: clarify activation, safety, wording, or examples without changing the MCP workflow.
- Minor: add backward-compatible behavior, examples, or support for a newly available tool.
- Major: change activation semantics, privacy expectations, or required MCP contracts incompatibly.

Update `metadata.version` in `SKILL.md`, this guide, and relevant decisions/progress records in the
same change. Validate before release and tag the repository release used for distribution. The CLI
build copies the canonical directory into its distributable; `knownpath update` reconciles only
installer-owned copies and refuses locally modified content.

## Validation

Validate the open format with the reference implementation:

```sh
skills-ref validate skills/knownpath
skills-ref read-properties skills/knownpath
```

The repository also uses the bundled skill-creator validator as a second structural check. These are
format validations, not automated product tests.

## Official references

- [Agent Skills specification](https://agentskills.io/specification)
- [OpenAI Codex skills](https://developers.openai.com/codex/skills/)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Cursor Agent Skills](https://cursor.com/docs/skills)
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/)
- [GitHub Copilot Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [GitHub CLI skill installation](https://cli.github.com/manual/gh_skill_install)
