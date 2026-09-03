# KnownPath installer CLI

The `knownpath` npm package configures supported coding agents to use the KnownPath MCP server and
installs the canonical KnownPath Agent Skill. It is an integration installer, not a packaged
KnownPath backend.

```sh
npx knownpath install
```

The installed stdio bridge sends requests to the configured HTTP API. Authentication, authorization,
retrieval, contributions, outcomes, and auditing remain centralized in the backend.

## Requirements

The installer requires Node.js 24 and these environment variables:

```text
KNOWNPATH_API_URL=https://your-knownpath.example
KNOWNPATH_API_KEY=an-active-knownpath-api-key
```

The URL must be an HTTP or HTTPS origin without a path, query, fragment, or embedded credentials.
The CLI has no localhost or production fallback. The key must be at least 16 characters.

`install` and `update` validate both variables before writing. `doctor` reports missing, malformed,
unreachable, and unauthorized configurations separately. Agent configuration contains only
references to these names, never their values.

See [Agent installation](AGENT_INSTALLATION.md) for safe shell setup.

## Commands

| Command     | Purpose                                                               |
| ----------- | --------------------------------------------------------------------- |
| `install`   | Detect agents, preview changes, configure MCP, and install the skill  |
| `status`    | Compare installed files and entries with KnownPath ownership state    |
| `update`    | Reconcile installer-owned artifacts to the current CLI version        |
| `uninstall` | Remove only KnownPath-owned entries and files                         |
| `doctor`    | Diagnose runtime, environment, backend, MCP, skill, and profile state |
| `mcp`       | Run the stdio-to-HTTP MCP bridge used by configured clients           |

Common options:

| Option                    | Behavior                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| `--agent <id\|all>`       | Select `codex`, `claude`, `cursor`, `gemini`, `opencode`, or all  |
| `--scope global\|project` | Choose user-wide or repository-local configuration                |
| `--project-dir <path>`    | Set the project root instead of the current directory             |
| `--profile <label>`       | Record a non-secret profile label                                 |
| `--workspace-id <uuid>`   | Require the active key to match a workspace; requires `--profile` |
| `--dry-run`               | Print the planned changes without writing                         |
| `--yes`, `-y`             | Confirm a mutation non-interactively                              |
| `--json`                  | Emit one machine-readable JSON result                             |
| `--help`, `-h`            | Show CLI help                                                     |
| `--version`, `-v`         | Show the package version                                          |

`--agent` can be repeated or receive a comma-separated list. Without it, an interactive terminal
shows detected clients and asks which ones to configure. JSON/non-interactive use requires explicit
agent selection; non-interactive mutations also require `--yes`.

## Recommended lifecycle

```sh
npx knownpath install --agent all --dry-run
npx knownpath install --agent all
npx knownpath status --agent all
npx knownpath doctor --agent all
```

Running `install` again with current artifacts produces no changes. Use `update` after installing a
new CLI version. Use `uninstall --dry-run` before removal when you want to inspect ownership.

## Supported adapters

Every adapter registers an MCP server named `knownpath` that launches:

```text
npx -y knownpath mcp
```

| Client      | Global MCP configuration  | Project MCP configuration           | Skill location             |
| ----------- | ------------------------- | ----------------------------------- | -------------------------- |
| Codex CLI   | `~/.codex/config.toml`    | `.codex/config.toml`                | `.agents/skills/knownpath` |
| Claude Code | `~/.claude.json`          | `.mcp.json`                         | `.claude/skills/knownpath` |
| Cursor      | `~/.cursor/mcp.json`      | `.cursor/mcp.json`                  | `.agents/skills/knownpath` |
| Gemini CLI  | `~/.gemini/settings.json` | `.gemini/settings.json`             | `.agents/skills/knownpath` |
| OpenCode    | platform config directory | `opencode.jsonc` or `opencode.json` | `.agents/skills/knownpath` |

OpenCode's global directory follows the platform's configuration conventions. All path resolution
uses Node platform APIs and respects XDG and Windows application-data locations where applicable.

### Environment references

Each native format receives only its supported environment-reference syntax:

- Codex forwards `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` through `env_vars`.
- Claude Code stores `${KNOWNPATH_API_URL}` and `${KNOWNPATH_API_KEY}`.
- Cursor stores `${env:KNOWNPATH_API_URL}` and `${env:KNOWNPATH_API_KEY}`.
- Gemini CLI stores `$KNOWNPATH_API_URL` and `$KNOWNPATH_API_KEY`.
- OpenCode stores `{env:KNOWNPATH_API_URL}` and `{env:KNOWNPATH_API_KEY}`.

Claude Code and Gemini CLI use their official MCP mutation commands when their executables are
available. For an explicitly selected unavailable client, the adapter uses its documented file
format. Codex receives a bounded managed TOML block. JSONC edits preserve comments and trailing
commas.

## Detection and ownership

Detection is advisory. An explicitly selected client can be configured even when its executable is
not found; the result is marked unverified.

KnownPath records non-secret ownership state separately from agent configuration. State includes:

- target client and scope
- managed paths
- content digests and versions
- ownership flags
- profile label and expected workspace ID
- timestamps

A matching artifact that predates ownership remains unmanaged. A differing `knownpath` MCP entry or
a locally changed managed artifact is a conflict. The installer stops rather than adopting or
overwriting it.

## Merge, backup, and filesystem safety

- Existing config files are backed up beside the original as `*.knownpath-backup-<timestamp>` before
  mutation.
- JSON and JSONC edits preserve unknown fields; Codex edits are confined to a marked block.
- Writes are atomic and retain restrictive permissions.
- Managed targets must be absolute regular files or directories.
- Symlink components, symlinked skill contents, NUL paths, and non-regular targets are rejected.
- Temporary files use exclusive creation and no-follow behavior.
- `uninstall` removes only paths and entries recorded as KnownPath-owned.
- A shared `.agents/skills/knownpath` directory is removed only after no selected installation owns
  it.

Backups may contain unrelated user-owned agent settings. Protect them as you would the original
config.

## Profiles and workspaces

`--profile` is a non-secret label for the launch environment supplying a key. Adding
`--workspace-id` records the expected workspace binding. During `doctor`, the CLI calls the safe MCP
status endpoint and confirms that the key matches that workspace.

The installer never chooses a workspace or rewrites key scope. If selected installations require
different workspace bindings while sharing one `KNOWNPATH_API_KEY`, setup fails with an actionable
conflict.

## Machine-readable operation

`--json` writes exactly one JSON document to standard output. It is suitable for scripts and managed
provisioning. Sensitive environment values and authorization-like strings are redacted from normal
and error output.

## Contribution and outcome permissions

Installing KnownPath does not enable background sharing. Contributions require an API key with
`knowledge:contribute`, explicit consent for each submission, and account contribution mode that
permits asking. Outcomes require `knowledge:outcome` and an actual attempted result.

A read-only `knowledge:read` key can search but cannot contribute or report outcomes. These rules
are enforced by the backend, not by installer configuration. See [Contributions](CONTRIBUTIONS.md)
and [Outcomes](OUTCOMES.md).

## Adding another adapter

An adapter should be added only when the client has stable, public MCP and Agent Skill mechanisms.
It must support detection, scoped paths, merge-safe configuration, status, update, and precise
uninstall without changing the canonical skill. GitHub Copilot, Cline, and Windsurf are not current
installer targets.

The current client references are linked from [Agent installation](AGENT_INSTALLATION.md). Internal
adapter boundaries are documented in `packages/agent-adapters/README.md`.
