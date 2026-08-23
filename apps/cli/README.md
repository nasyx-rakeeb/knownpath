# KnownPath

KnownPath is an open-source shared knowledge network for AI coding agents. This package installs
KnownPath MCP access and the portable KnownPath Agent Skill for supported coding clients.

> KnownPath is under active phased development. The current MCP capability is read-only.

## Quick start

KnownPath requires an operator-selected backend origin and an active API key with `knowledge:read`.
Set both variables in the environment that launches the installer and your coding agent:

```sh
export KNOWNPATH_API_URL='https://your-knownpath-origin.example'
read -rsp 'KnownPath API key: ' KNOWNPATH_API_KEY && export KNOWNPATH_API_KEY && printf '\n'
npx knownpath install
```

The installer has no URL fallback and never stores or prints either value. Agent configuration
contains references to `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`, not their contents.

## Commands

```text
knownpath install
knownpath status
knownpath update
knownpath uninstall
knownpath doctor
```

Use `--agent codex|claude|cursor|gemini|opencode|all`, `--scope global|project`, `--dry-run`,
`--yes`, or `--json` as needed. Run `npx knownpath --help` for the complete command reference.

Install is merge-safe and idempotent. Existing configuration is backed up before mutation, unknown
fields are preserved, conflicting unmanaged entries are not overwritten, and uninstall removes only
KnownPath-owned entries and skill files.

## Supported clients

- OpenAI Codex CLI
- Claude Code
- Cursor
- Gemini CLI
- OpenCode

## Documentation

- [Project repository](https://github.com/nasyx-rakeeb/knownpath)
- [Installer guide](https://github.com/nasyx-rakeeb/knownpath/blob/main/docs/INSTALLER.md)
- [MCP guide](https://github.com/nasyx-rakeeb/knownpath/blob/main/docs/MCP.md)
- [Agent Skill guide](https://github.com/nasyx-rakeeb/knownpath/blob/main/docs/AGENT_SKILL.md)

KnownPath is licensed under Apache-2.0.
