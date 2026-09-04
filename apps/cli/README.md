# knownpath

The `knownpath` package installs KnownPath MCP access and the portable KnownPath Agent Skill in
supported coding agents. It is an integration installer and local stdio bridge—not a packaged
KnownPath backend.

## Install

Install KnownPath into detected coding agents:

```sh
npx knownpath install
npx knownpath doctor
```

The CLI uses the official hosted KnownPath service by default. It opens a browser for signup or
sign-in, issues a dedicated machine credential, and stores the credential in macOS Keychain, Windows
Credential Manager, or Linux Secret Service. There is no plaintext fallback, and agent configuration
contains no KnownPath secret.

Preview filesystem/configuration changes without authenticating:

```sh
npx knownpath install --dry-run
```

Self-hosters can pass `--api-url https://knownpath.example`. The legacy
`KNOWNPATH_API_URL`/`KNOWNPATH_API_KEY` pair remains available with `--auth api-key` as an advanced
environment-based flow.

## Commands

```text
knownpath install
knownpath status
knownpath doctor
knownpath login
knownpath logout
knownpath whoami
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
