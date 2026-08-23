# KnownPath Phase 13 multi-agent installer design

## Goal

Ship a publishable TypeScript CLI with the conceptual entry point `npx knownpath install`. It
detects supported coding agents, safely configures the existing Phase 11 stdio-to-HTTP MCP bridge,
installs the canonical Phase 12 Agent Skill, and reports every proposed or completed change. The
installer must be idempotent, reversible, cross-platform, and unable to persist or disclose a
KnownPath API key.

## Research basis

Current official documentation and installed CLI help were reviewed on 2026-08-23 before design:

- [OpenAI Codex MCP](https://developers.openai.com/codex/mcp/) and
  [skills](https://developers.openai.com/codex/skills/)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp) and
  [skills](https://code.claude.com/docs/en/skills)
- [Cursor MCP](https://cursor.com/docs/mcp) and [Agent Skills](https://cursor.com/docs/skills)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) and
  [Agent Skills](https://geminicli.com/docs/cli/skills/)
- [OpenCode MCP](https://opencode.ai/v2/docs/mcp-servers) and
  [Agent Skills](https://opencode.ai/docs/skills)
- [GitHub Copilot Agent Skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
- [Cline MCP](https://docs.cline.bot/mcp/mcp-overview) and
  [skills](https://docs.cline.bot/customization/skills)

Codex, Claude Code, Cursor, and Gemini CLI all support stdio MCP and scoped skill installation.
Their remote HTTP credential interpolation differs, whereas every client can pass explicitly named
environment variables to a local process. The installed Codex 0.149.0 and Claude Code 2.1.185 help
also confirmed their current mutation commands. The unscoped npm name `knownpath` returned not found
from the public registry at design time, so the desired invocation is available if the package is
published later.

## Selected architecture

Use a shared stdio bridge, invoked as `npx -y knownpath mcp`, as the default configuration for every
adapter. The command is a thin entry point over the existing Phase 11 HTTP bridge: it receives
`KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` from the agent process environment and calls the
backend. It does not connect to MongoDB or receive Gemini, Atlas, Better Auth, or API-key-pepper
secrets.

This keeps authentication, authorization, ranking, retrieval, contribution, and other business logic
centralized in the API. It also gives every agent the same MCP tool contracts without relying on
inconsistent remote-header interpolation.

The CLI application owns command parsing and presentation. `@knownpath/agent-adapters` owns agent
detection, scope mapping, desired configuration, skill targets, status inspection, and safe change
plans. Shared execution code owns process invocation, atomic filesystem changes, backups, ownership
state, and redaction. Adapters never implement KnownPath business logic.

## Commands and options

The public surface is:

- `knownpath install`: detect/select agents, validate configuration, show the plan, then apply it.
- `knownpath status`: inspect agent detection, MCP entry, skill version, and ownership without
  network mutation.
- `knownpath update`: reconcile KnownPath-owned entries and skill copies to the packaged version.
- `knownpath uninstall`: remove only installer-owned KnownPath entries and files.
- `knownpath doctor`: combine local inspection with safe API readiness/authentication diagnostics.
- `knownpath mcp`: run the stdio bridge; stdout remains MCP protocol traffic.

Common options are `--agent <id>` (repeatable or comma-delimited), `--scope global|project`,
`--project-dir <path>`, `--dry-run`, `--yes`, and `--json`. Interactive install shows detected
targets and awaits confirmation. Non-interactive use requires explicit targets and `--yes`.
Machine-readable output contains stable status/change/error codes and never credential values.

## Credential and endpoint model

Both `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` are required in the installer's current
environment. Install and doctor validate that the URL is an HTTP(S) origin without embedded
credentials and that the key is present without printing it. There is no localhost fallback and no
invented production default.

Agent configurations store only references to the two variable names. They never contain the
resolved values. The CLI never prints, logs, serializes into ownership state, or passes the key as a
literal shell argument. Child processes are launched with argument arrays instead of a shell.

Documentation explains environment setup for POSIX shells, PowerShell, and Windows Command Prompt,
including the requirement to launch GUI clients from an environment that receives the variables.
Credential resolution is represented behind a small interface so a later OS-keychain provider can
supply process environment values without changing any agent configuration shape. Phase 13 does not
implement keychain storage.

## Adapter support

### OpenAI Codex

Detect `codex`. Use the documented `codex mcp list/get` commands for inspection. Its current add
command cannot express the documented `env_vars` forwarding references without taking literal
values, so merge the bounded `mcp_servers.knownpath` TOML table with `env_vars` containing only the
two variable names; use the official remove command when it targets exactly the owned entry. Global
MCP state lives in the documented Codex config; project MCP state uses trusted-project
`.codex/config.toml`. Install the skill to `~/.agents/skills/knownpath` globally or
`.agents/skills/knownpath` for the project.

### Claude Code

Detect `claude`. Prefer `claude mcp add/remove/get/list` with `user` scope globally and `project`
scope locally when the command can preserve literal environment references without resolving them.
Otherwise merge only the documented `mcpServers.knownpath` entry in `~/.claude.json` or project
`.mcp.json`. The stdio entry passes environment references rather than values. Install the skill to
`~/.claude/skills/knownpath` or `.claude/skills/knownpath`.

### Cursor

Detect the documented Cursor application/CLI locations. Cursor exposes inspection commands but no
general documented non-extension add/remove command, so merge its `mcpServers.knownpath` entry into
`~/.cursor/mcp.json` or `.cursor/mcp.json`. Use JSONC-aware structural edits to retain comments and
unknown fields. Install the skill to the portable `~/.agents/skills/knownpath` or
`.agents/skills/knownpath` location that Cursor officially scans.

### Gemini CLI

Detect `gemini`. Prefer `gemini mcp add/remove/list` and documented user/project scopes. Configure
the stdio server's `env` values as environment references so Gemini explicitly forwards variables
that its sanitization would otherwise remove. Use Gemini's documented skill installation/status/
uninstall commands where they can install the packaged local artifact without persisting a transient
source path; otherwise use its official user/workspace skill location with ownership tracking.

### OpenCode

Include OpenCode as one additional adapter because its official current configuration supports local
stdio MCP, environment references, project/global JSON or JSONC config, and the portable
`.agents/skills` discovery locations. Merge only `mcp.servers.knownpath` and use the same canonical
skill copy. The adapter remains optional when OpenCode is not detected.

GitHub Copilot, Cline, Windsurf, and other clients are documented as researched but deferred when
their integration is preview-only, surface-specific, lacks one stable combined MCP/skill target, or
cannot be safely verified. Absence is reported honestly rather than treated as success.

## Skill distribution

`skills/knownpath` remains the only authored skill. The published CLI includes that directory and
copies it byte-for-byte into each required client target. A transient `npx` extraction directory
cannot safely be a symlink target, and Windows symlink creation may require elevated privileges, so
copying is the portable default.

Each installed copy is tracked with canonical version and content digest. Update replaces only a
copy whose current contents still match a digest previously written by KnownPath. A differing
pre-existing or user-edited skill is a conflict requiring explicit resolution; it is never silently
overwritten. Shared `.agents/skills` targets are planned once even when several clients use them.

## Change planning, ownership, and rollback

Every mutation starts as a deterministic change plan containing agent, scope, operation, path or
safe command description, reason, and whether a backup is required. Dry-run renders the same plan
without invoking commands or writing files.

Before changing a documented user-owned configuration file, make a timestamped sibling backup with
restricted permissions. Prefer official mutation commands because they preserve the client's own
format and invariants; snapshot the documented target before invoking them when it exists. Direct
file updates parse first, preserve unknown fields and comments where technically possible, write a
temporary sibling, fsync/close as practical, then atomically rename.

A versioned installer-state manifest records only non-secret ownership facts: adapter, scope,
target, installed skill digest/version, MCP server name, safe command shape, backup reference, and
timestamps. Project state lives under `.knownpath/`; global state uses the operating system's
standard per-user configuration/data directory resolved through platform APIs. No home directory is
hardcoded.

Repeated install is a no-op when desired and actual state match. Update reconciles only owned state.
Uninstall verifies ownership and removes only the `knownpath` server entry plus unchanged
KnownPath-owned skill artifacts. Unrelated configuration and backups remain untouched. A conflicting
entry or changed installed file produces an actionable error rather than destructive cleanup.

## Detection, status, and diagnostics

Detection checks executable resolution plus documented configuration/application locations. It
distinguishes installed, configured, unavailable, and unverified states. Interactive mode lists all
detections before changes; explicit `--agent` can configure a documented target even when its binary
is absent, but reports that client-side verification remains pending.

Doctor reports:

- supported Node/npm runtime availability;
- agent executable/version and supported scope;
- config parse health and exact KnownPath MCP-entry status;
- canonical skill presence, version, digest, and local modification conflicts;
- presence and validity of the two required environment variables;
- backend readiness, reachability, and API-key authorization through bounded, redacted requests;
- stale ownership metadata, missing files, or partial installation.

Network and authentication failures map to stable, actionable codes. Logs and error messages redact
headers, key-shaped values, query credentials, and child-process environment values.

## Verification

Do not add or run automated tests. Verify instead by:

- installing dependencies, then running typecheck, lint, formatting validation, and build;
- running install dry-run for all adapters and inspecting machine-readable output;
- installing into every supported client available on the development machine;
- running status and doctor, then repeating install to observe no changes;
- uninstalling and comparing unrelated config before/after, then reinstalling as appropriate;
- exercising operations against isolated temporary HOME/config roots for unavailable clients while
  recording that actual client discovery remains manually unverified;
- manually inspecting configurations, backups, ownership manifests, and skill copies;
- scanning tracked/staged content and command output for credentials or generated artifacts.

## Explicit deferrals

- No OS keychain, credential-manager, OAuth, or shell-profile mutation.
- No hardcoded API URL or localhost fallback.
- No remote-header configuration as the default agent path.
- No marketplace/plugin publishing or client-specific divergent skill content.
- No backend, MCP tool, retrieval, contribution, or outcome behavior changes.
- No automated tests.
- No Phase 14 work.
