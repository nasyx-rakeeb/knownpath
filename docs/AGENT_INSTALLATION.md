# Install KnownPath in a coding agent

This guide is for developers connecting an existing coding agent to KnownPath. You do not need to
run MongoDB, Valkey, Gemini, or any KnownPath server when using a hosted deployment.

KnownPath currently supports:

- OpenAI Codex CLI
- Claude Code
- Cursor
- Gemini CLI
- OpenCode

## Before you install

You need:

- Node.js 24
- the URL of a hosted or self-hosted KnownPath API
- an active KnownPath API key with at least the `knowledge:read` scope
- one supported coding agent

The hosted KnownPath service currently uses closed registration. Ask the service operator for
access, or follow [Deployment](DEPLOYMENT.md) to operate your own instance.

Export the connection details in the shell that launches both the installer and your agent:

```sh
export KNOWNPATH_API_URL="https://your-knownpath.example"
read -rsp "KnownPath API key: " KNOWNPATH_API_KEY
export KNOWNPATH_API_KEY
printf "\n"
```

On PowerShell:

```powershell
$env:KNOWNPATH_API_URL = "https://your-knownpath.example"
$secret = Read-Host "KnownPath API key" -AsSecureString
$env:KNOWNPATH_API_KEY = [System.Net.NetworkCredential]::new("", $secret).Password
```

The CLI requires an HTTP or HTTPS origin with no path, query, fragment, or embedded credentials. It
does not fall back to localhost or a hard-coded hosted URL.

## Install

Preview the exact changes first:

```sh
npx knownpath install --dry-run
```

Then install interactively:

```sh
npx knownpath install
npx knownpath doctor
```

The installer detects supported agents, asks which ones to configure, installs the canonical
KnownPath Agent Skill, and registers a local stdio MCP bridge. The bridge calls the configured
KnownPath HTTP API; it never connects directly to product infrastructure.

For non-interactive installation, select targets and confirm explicitly:

```sh
npx knownpath install --agent codex --agent claude --yes
npx knownpath doctor --agent codex --agent claude
```

Use `--agent all` to target all five adapters.

## Global and project scope

`--scope global` is the default and makes KnownPath available across projects for the selected
agent. `--scope project` writes only to the repository identified by `--project-dir` or the current
directory:

```sh
npx knownpath install --agent cursor --scope project --dry-run
```

Not every client uses the same native config location, but the installer applies the documented
scope for each adapter. See [Installer behavior](INSTALLER.md) for exact paths and merge rules.

## Workspace profiles

A workspace-bound API key can be associated with a non-secret installer profile:

```sh
npx knownpath install \
  --agent codex \
  --profile mobile-team \
  --workspace-id 11111111-1111-4111-8111-111111111111
```

The profile label and expected workspace ID are safe metadata; the key remains in
`KNOWNPATH_API_KEY`. `doctor` verifies that the active key is actually bound to the expected
workspace and fails instead of silently using a personal or different workspace key.

Because all configured agents reference the same environment variable, install different workspace
profiles in separate launch environments. The CLI rejects conflicting workspace expectations that
would share one `KNOWNPATH_API_KEY`.

## What is stored

Agent configuration contains only references to:

- `KNOWNPATH_API_URL`
- `KNOWNPATH_API_KEY`

The installer never writes or prints their values. Its ownership state contains paths, content
digests, versions, ownership flags, profile metadata, and timestamps. Config files are backed up
before changes, and unknown settings are preserved.

Do not place the key in a committed environment file, agent config, command argument, or public
shell history. Use your operating system or process manager to provide persistent environment
variables. Keychain integration is not currently included.

## Maintain the installation

```sh
npx knownpath status
npx knownpath doctor
npx knownpath update
npx knownpath uninstall
```

- `status` compares the installed MCP and skill artifacts with installer ownership state.
- `doctor` checks Node.js, environment variables, backend authentication, agent configuration, skill
  version, and optional workspace binding.
- `update` reconciles installer-owned artifacts to the currently installed CLI package.
- `uninstall` removes only KnownPath-owned entries and files.

All commands accept `--agent`, `--scope`, `--project-dir`, and `--json` where applicable. Mutating
non-interactive commands require `--yes`.

## Troubleshooting

### Missing environment variables

Set both required variables in the same process environment that starts the agent. Restart the
terminal or desktop application after changing persistent environment settings.

### Authentication fails

Confirm the key is active and includes `knowledge:read`. Revoked keys fail without requiring a
configuration rewrite because the agent stores only the environment-variable reference.

### Backend is unreachable

Run `npx knownpath doctor`. Confirm that `KNOWNPATH_API_URL` is the API origin, that HTTPS and DNS
work from the agent process, and that the deployment readiness endpoint is healthy.

### Existing KnownPath entry conflicts

The CLI will not overwrite an unmanaged or locally modified `knownpath` entry. Inspect the reported
path, preserve any settings you need, and remove or rename the conflicting entry yourself before
retrying.

### Skill is not discovered

Restart or reload the agent after installation. Use `status` to inspect file placement and `doctor`
to verify both the MCP entry and packaged skill version.

For manual client configuration and transport details, see [MCP](MCP.md). For every CLI flag, backup
rule, and adapter path, see [Installer](INSTALLER.md).
