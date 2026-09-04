# Install KnownPath in a coding agent

This guide is for developers connecting an existing coding agent to KnownPath. Hosted users do not
need to run MongoDB, Valkey, Gemini, Atlas, or any KnownPath server.

Supported adapters: OpenAI Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode.

## Hosted installation

Node.js 24 and one supported agent are the only local prerequisites.

```sh
npx knownpath install
npx knownpath doctor
```

The installer detects available agents, shows its change plan, and asks for confirmation. It then:

1. selects the official hosted KnownPath API;
2. opens the dashboard for signup or sign-in;
3. asks you to approve a short-lived CLI authorization request;
4. creates a dedicated machine credential with `knowledge:read`, `knowledge:contribute`, and
   `knowledge:outcome` scopes;
5. saves it in the native OS credential store;
6. installs the secret-free stdio MCP entry and canonical Agent Skill; and
7. verifies the backend, authentication, MCP configuration, and skill.

The write scopes do not enable silent sharing. Public contributions still require explicit consent,
account contribution mode remains `ask` by default, and outcomes require a real attempted result.

Use `--dry-run` to inspect local changes without opening a browser or creating credentials:

```sh
npx knownpath install --dry-run
```

## Credential lifecycle

```sh
npx knownpath login
npx knownpath whoami
npx knownpath logout
```

`login` reuses a valid stored credential. A revoked or expired stored credential triggers a clean
browser authorization on the next install/login. `logout` attempts server revocation and removes the
local credential. `uninstall` is separate: it removes MCP/skill configuration but does not revoke
authentication.

Machine credentials appear on the dashboard API-key page with their device label, prefix, scopes,
creation/last-use time, expiry, and status. Full credentials are never displayed there.

| Platform | Credential backend         |
| -------- | -------------------------- |
| macOS    | Keychain                   |
| Windows  | Windows Credential Manager |
| Linux    | Secret Service/libsecret   |

KnownPath does not silently fall back to plaintext when the native credential service is missing or
locked. Non-secret profile metadata is stored in `~/.knownpath/profiles.json` with restrictive file
permissions where supported.

## Agent and scope selection

```sh
npx knownpath install --agent codex
npx knownpath install --agent claude --agent cursor
npx knownpath install --agent all --yes
npx knownpath install --scope project --project-dir /path/to/repository
```

Interactive installation selects detected agents. JSON/non-interactive modes require explicit
`--agent` values. Global and project paths follow each client's current documented conventions; see
[Installer behavior](INSTALLER.md).

## Profiles and workspaces

Profiles keep separate non-secret connection metadata and OS-stored credentials:

```sh
npx knownpath install --profile my-team
npx knownpath doctor --profile my-team
npx knownpath install --profile my-team --workspace-id 00000000-0000-4000-8000-000000000000
```

The backend—not local metadata—authorizes workspace access. `doctor` verifies the authenticated key
binding and fails on a mismatch. Workspace-bound credential issuance and selection remain controlled
through the authenticated dashboard/API.

## Self-hosted installation

A compatible self-hosted instance can use the same browser flow:

```sh
npx knownpath install --api-url https://knownpath.example
```

Self-hosted operators choose `AUTH_REGISTRATION_MODE=open|closed`. Closed instances still allow
existing operator-created users to sign in and authorize a device.

The earlier manual key flow remains an explicit compatibility option. Supply both variables
together; neither is written to agent configuration:

```sh
export KNOWNPATH_API_URL="https://knownpath.example"
read -rsp "KnownPath API key: " KNOWNPATH_API_KEY && export KNOWNPATH_API_KEY && printf "\n"
npx knownpath install --auth api-key
```

In this advanced mode, the environment must also be available to the `knownpath mcp` process. Never
put the key in command arguments, agent JSON/TOML, shell history, or a repository.

## Update, status, and uninstall

```sh
npx knownpath status
npx knownpath update
npx knownpath doctor
npx knownpath uninstall
```

- `status` inspects installer-owned MCP and skill state without network access.
- `update` reconciles owned files and migrates older environment-reference MCP entries to the
  secret-free bridge configuration.
- `doctor` checks Node, agent detection, MCP/skill state, backend readiness, authentication, and an
  expected workspace binding.
- `uninstall` removes only KnownPath-owned entries/files and preserves unrelated configuration.

Changes are merge-safe, idempotent, backed up where needed, and refused if an unmanaged or locally
modified `knownpath` entry would be overwritten.

## Troubleshooting

- **Browser did not open:** use the verification URL and code printed by the terminal. Restart after
  expiry.
- **Credential store unavailable:** unlock/configure the native credential service; KnownPath does
  not write an unencrypted fallback.
- **Credential revoked:** run `knownpath install` or `knownpath login` to authorize again.
- **Backend unreachable:** run `knownpath doctor`. Hosted free infrastructure may cold-start.
- **Config conflict:** rename/remove the unmanaged entry deliberately or restore owned content.

See [MCP](MCP.md), [Agent Skill](AGENT_SKILL.md), and [Privacy](PRIVACY.md).
