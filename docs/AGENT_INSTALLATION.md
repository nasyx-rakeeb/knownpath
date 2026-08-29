# Agent installation

The `knownpath` npm package installs one canonical Agent Skill plus a thin stdio bridge that calls
the configured KnownPath HTTP API. It never connects to MongoDB, Valkey, GitHub, or Gemini.

## Prerequisites

- Node.js 24 or a compatible runtime accepted by the package engines
- a deployed KnownPath API origin
- an active API key with `knowledge:read`
- one supported client: Codex CLI, Claude Code, Cursor, Gemini CLI, or OpenCode

Export both required variables in the shell or process manager that launches the coding agent:

```sh
export KNOWNPATH_API_URL='https://knownpath.example'
read -rsp 'KnownPath API key: ' KNOWNPATH_API_KEY && export KNOWNPATH_API_KEY && printf '\n'
npx knownpath doctor --agent all
npx knownpath install --dry-run --agent all
npx knownpath install --agent all
```

There is no localhost or production URL fallback. Configuration stores only references to
`KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY), not their values.

### Windows PowerShell

```powershell
$env:KNOWNPATH_API_URL = 'https://knownpath.example'
$env:KNOWNPATH_API_KEY = Read-Host 'KnownPath API key'
npx knownpath doctor --agent all
```

For persistence, configure environment variables through the operating system or a trusted secret
manager. Do not put keys in shell profile files, agent configuration, project files, or command
history.

## Safe lifecycle

- `install` detects clients, previews targets, backs up modified user files, and refuses unmanaged
  conflicts.
- `status` compares installed ownership and skill version without contacting private providers.
- `update` applies the same merge-safe ownership rules.
- `doctor` checks runtime, variables, endpoint/auth, MCP configuration, and skill discovery.
- `uninstall` removes only KnownPath-owned entries/files.

Use `--scope project` to keep changes inside a repository where the adapter supports it;
`--scope global` is the normal personal installation. Use `--json` for automation. Exact paths,
config formats, backup behavior, and client-specific limitations are in [Installer](INSTALLER.md).

The API key is shown only when created/rotated in the dashboard or API. Revocation takes effect at
the backend without rewriting agent configuration.
