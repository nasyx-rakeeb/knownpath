# KnownPath installer

The `knownpath` CLI installs the canonical Agent Skill and a thin stdio MCP bridge for supported
coding agents. Retrieval, authentication, authorization, ranking, and audit behavior remain in the
KnownPath backend. The installed bridge needs no MongoDB or Gemini configuration.

> KnownPath is under phased development. The installer is published as
> [`knownpath`](https://www.npmjs.com/package/knownpath). From this checkout,
> `pnpm knownpath <command>` runs the same implementation.

The npm artifact bundles KnownPath workspace implementation code and the canonical skill. Its only
runtime packages are maintained public dependencies; it does not require unpublished `@knownpath/*`
packages or a repository checkout.

## Required environment

Set both variables in the environment that launches the installer and every configured agent:

```text
KNOWNPATH_API_URL=<the HTTP(S) origin selected by the operator>
KNOWNPATH_API_KEY=<an active key with knowledge:read>
```

`KNOWNPATH_API_URL` must be an origin only: `http` or `https`, with no credentials, query, fragment,
or path. The CLI has no localhost or production fallback. The key must be at least 16 characters.
`install` and `update` fail before writing when either value is absent or malformed; `doctor`
reports each problem independently.

The installer writes only environment-variable references. It never writes or prints either value.
Keep shell profile files private and do not commit project-local environment files.

### macOS and Linux shells

For one terminal session:

```sh
export KNOWNPATH_API_URL='https://your-knownpath-origin.example'
read -rsp 'KnownPath API key: ' KNOWNPATH_API_KEY && export KNOWNPATH_API_KEY && printf '\n'
```

For persistent setup, add equivalent exports to the startup file used by the shell that launches the
agent, such as `~/.zshrc` or `~/.bashrc`. Do not paste the key into the command line of the
installer itself because that can enter shell history.

### Windows PowerShell

For the current PowerShell process:

```powershell
$env:KNOWNPATH_API_URL = 'https://your-knownpath-origin.example'
$secret = Read-Host 'KnownPath API key' -AsSecureString
$env:KNOWNPATH_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
```

Set persistent user variables through Windows Settings or a controlled PowerShell profile. Restart
the terminal and agent after changing persistent variables. Phase 13 deliberately does not add OS
keychain integration; a future secret source can supply the same environment names without changing
agent configuration.

## Commands

```text
knownpath install
knownpath status
knownpath update
knownpath uninstall
knownpath doctor
knownpath mcp
```

Common options:

- `--agent <id|all>` selects `codex`, `claude`, `cursor`, `gemini`, `opencode`, or every adapter.
  Repeat the flag or use a comma-separated list for specific clients.
- `--scope global|project` selects user-wide or repository-local configuration.
- `--project-dir <path>` sets the project root; it defaults to the current directory.
- `--dry-run` reports the exact plan without writing.
- `--yes` confirms a non-interactive mutation.
- `--json` emits one machine-readable JSON document. JSON/non-interactive use requires an explicit
  agent selection; mutations also require `--yes`.

Without `--agent`, an interactive terminal shows detected clients and asks which to configure.
Detection is advisory: explicitly selected, unavailable clients can still be configured from their
official documented formats, and the report marks them unverified.

Recommended first setup:

```sh
pnpm knownpath install --dry-run --agent all
pnpm knownpath install --agent all
pnpm knownpath status --agent all
pnpm knownpath doctor --agent all
```

`update` reconciles installer-owned artifacts to the bundled skill/config version. `uninstall`
removes only entries and skill directories recorded as installer-owned. A matching pre-existing
skill or MCP entry is reported as unmanaged and is never adopted destructively.

## What each adapter changes

All adapters create an MCP server named `knownpath` whose command is:

```text
npx -y knownpath mcp
```

That command starts the shared stdio-to-HTTP bridge. The environment expressions below resolve only
when the agent starts, so the credential itself is absent from configuration and installer state.

| Client      | Global MCP config         | Project MCP config                  | Skill location             | Environment reference syntax                            |
| ----------- | ------------------------- | ----------------------------------- | -------------------------- | ------------------------------------------------------- |
| Codex CLI   | `~/.codex/config.toml`    | `.codex/config.toml`                | `.agents/skills/knownpath` | `env_vars = ["KNOWNPATH_API_URL", "KNOWNPATH_API_KEY"]` |
| Claude Code | `~/.claude.json`          | `.mcp.json`                         | `.claude/skills/knownpath` | `${KNOWNPATH_API_URL}` / `${KNOWNPATH_API_KEY}`         |
| Cursor      | `~/.cursor/mcp.json`      | `.cursor/mcp.json`                  | `.agents/skills/knownpath` | `${env:KNOWNPATH_API_URL}` / `${env:KNOWNPATH_API_KEY}` |
| Gemini CLI  | `~/.gemini/settings.json` | `.gemini/settings.json`             | `.agents/skills/knownpath` | `$KNOWNPATH_API_URL` / `$KNOWNPATH_API_KEY`             |
| OpenCode    | platform config directory | `opencode.jsonc` or `opencode.json` | `.agents/skills/knownpath` | `{env:KNOWNPATH_API_URL}` / `{env:KNOWNPATH_API_KEY}`   |

Claude Code and Gemini CLI use their official `mcp add/remove` commands when the executable is
available. The documented file format is used when configuring an explicitly selected unavailable
client. Codex is changed inside a bounded marked TOML block. JSON/JSONC clients are edited
structurally with comment/trailing-comma support, preserving unknown fields.

OpenCode's global base follows platform conventions: XDG configuration on Linux/macOS and roaming
application data on Windows. KnownPath ownership state is stored separately under the project
`.knownpath` directory or the platform-appropriate per-user application/configuration directory. It
contains paths, content digests, versions, ownership flags, and timestamps only—never environment
values.

## Safety, backups, and conflicts

- Existing config files are backed up beside the original as `*.knownpath-backup-<timestamp>` before
  mutation. Writes are atomic and retain restrictive file permissions.
- Unknown config fields and JSONC comments remain intact. The installer never rewrites a complete
  user configuration from a generated template.
- A pre-existing non-owned `knownpath` MCP entry or changed installer-owned artifact is a conflict.
  The CLI stops with an actionable error instead of overwriting it.
- Repeating `install` with current artifacts produces an empty change plan.
- `uninstall` removes the shared `.agents/skills/knownpath` directory once only after all selected
  installer owners are removed. Unrelated skills and agent settings remain untouched.
- Output and errors redact current environment values and authorization-like data. Backups can
  contain other user-owned agent settings, so keep them private.

## Doctor checks

`doctor` reports the Node runtime, required environment variables, agent detection, MCP config,
skill presence/version, and backend reachability/authentication. A missing agent executable is a
warning when its config is otherwise valid. Backend checks are skipped—not guessed—until both
required variables are valid. Network/auth failures are reported without response bodies, headers,
or credentials.

## Contribution privacy

Installer 0.2.1 bundles skill 1.1.0 and the real `knownpath_contribute` contract. Installation does
not enable background sharing: the skill offers a contribution only after observed success and asks
for explicit consent for that submission. A key must deliberately include `knowledge:contribute`; a
read-only key continues to retrieve only. Account contribution mode defaults to `ask` and can be
changed to `disabled` through the authenticated account API.

The installer still stores only the same environment references. It cannot see, copy, or upload a
repository. Public/private handling, sanitization, authorization, audit, and provider privacy gates
remain centralized in the backend. See [`CONTRIBUTIONS.md`](CONTRIBUTIONS.md).

## Current support boundary

Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode have stable documented MCP and Agent Skill
surfaces and therefore have adapters. GitHub Copilot, Cline, and Windsurf were researched but are
not Phase 13 adapters: their current combined skill/MCP installation surfaces are preview,
extension-oriented, or insufficiently stable for a merge-safe reversible installer. Support should
be added only when official configuration and ownership semantics can be implemented without
client-specific hacks in the canonical skill.

## Official references

- [OpenAI Codex MCP configuration](https://developers.openai.com/codex/mcp/)
- [OpenAI Codex Agent Skills](https://developers.openai.com/codex/skills/)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code Agent Skills](https://code.claude.com/docs/en/skills)
- [Cursor MCP](https://cursor.com/docs/context/mcp)
- [Cursor Agent Skills](https://cursor.com/docs/context/skills)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/)
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/)
- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/)
- [OpenCode Agent Skills](https://opencode.ai/docs/skills/)
- [Node.js environment variables](https://nodejs.org/api/environment_variables.html)
