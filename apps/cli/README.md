# knownpath

The `knownpath` package installs KnownPath MCP access and the portable KnownPath Agent Skill in
supported coding agents. It is an integration installer and local stdio bridge—not a packaged
KnownPath backend.

## Install

Obtain an API origin and scoped key from the hosted KnownPath operator or your self-hosted
deployment. Export both values in the environment that will launch the installer and coding agent:

```sh
export KNOWNPATH_API_URL="https://your-knownpath.example"
read -rsp 'KnownPath API key: ' KNOWNPATH_API_KEY && export KNOWNPATH_API_KEY && printf '\n'

npx knownpath install --dry-run
npx knownpath install
npx knownpath doctor
```

There is no implicit URL. The installer stores references to `KNOWNPATH_API_URL` and
`KNOWNPATH_API_KEY`, never their values, and never prints the key.

## Commands

```text
knownpath install
knownpath status
knownpath doctor
knownpath update
knownpath uninstall
```

Supported adapters are OpenAI Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode. Use
`--agent codex|claude|cursor|gemini|opencode|all`, `--scope global|project`, `--dry-run`, `--yes`,
or `--json` as needed. Run `npx knownpath --help` for the current command reference.

Installation is merge-safe and idempotent. Existing files are backed up before mutation, unknown
configuration is preserved, unmanaged conflicts stop safely, and uninstall removes only
KnownPath-owned entries and skill files.

The Agent Skill teaches agents to consult KnownPath for non-trivial reusable technical problems,
inspect evidence before applying a solution, contribute only with explicit consent after observed
success, and report outcomes only after a real attempt.

## Documentation

- [Agent installation](https://github.com/nasyx-rakeeb/knownpath/blob/main/docs/AGENT_INSTALLATION.md)
- [Installer behavior](https://github.com/nasyx-rakeeb/knownpath/blob/main/docs/INSTALLER.md)
- [MCP tools and transports](https://github.com/nasyx-rakeeb/knownpath/blob/main/docs/MCP.md)
- [Agent Skill behavior](https://github.com/nasyx-rakeeb/knownpath/blob/main/docs/AGENT_SKILL.md)

KnownPath is licensed under Apache-2.0.
