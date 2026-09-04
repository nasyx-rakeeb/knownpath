# Installer CLI

The public `knownpath` npm package installs the API-backed MCP bridge and canonical Agent Skill. It
does not contain or run the KnownPath backend.

## Commands

| Command     | Purpose                                                               |
| ----------- | --------------------------------------------------------------------- |
| `install`   | Authenticate, configure selected agents, install the skill, verify    |
| `status`    | Inspect local installer-owned state without network access            |
| `update`    | Reconcile owned files and migrate older KnownPath MCP entries         |
| `uninstall` | Remove only installer-owned MCP/skill entries                         |
| `doctor`    | Check runtime, authentication, backend, configs, skill, and workspace |
| `login`     | Run browser authorization and store a machine credential              |
| `logout`    | Revoke (when reachable) and remove the selected machine credential    |
| `whoami`    | Show safe authenticated service/key capability metadata               |
| `mcp`       | Run the stdio-to-HTTP bridge used by agent clients                    |

Run `npx knownpath --help` for authoritative flags.

## Connection precedence

The CLI resolves a connection in this order:

1. explicit `--api-url`;
2. the complete legacy `KNOWNPATH_API_URL`/`KNOWNPATH_API_KEY` environment pair;
3. the selected stored profile and native credential;
4. the versioned official hosted API default.

Providing only one legacy variable is an error. API origins must be credential-free HTTP(S) origins
without a path, query, or fragment. `--auth api-key` selects the advanced environment flow; browser
authorization is the default.

## Browser authorization

The CLI follows the OAuth 2.0 device-authorization pattern through Better Auth:

1. request a high-entropy device code and separate short user code;
2. open the dashboard verification URL;
3. let an authenticated user claim and explicitly approve or deny the request;
4. poll at the server-provided interval with `authorization_pending`/`slow_down` handling;
5. consume the approved grant once; and
6. exchange its short-lived session proof for a KnownPath API key marked `cli_device`.

The key is revocable, expires according to operator policy, and is shown only once to the CLI
process. The API stores its HMAC digest and non-secret metadata. Device codes expire, cannot be
replayed, and lifecycle events are audited without code values.

## Native credential storage

`@napi-rs/keyring` connects to Keychain (macOS), Credential Manager (Windows), and Secret Service
(Linux). Credential-store errors stop setup; there is no plaintext fallback.

`~/.knownpath/profiles.json` contains only API origin, key ID/prefix, scopes, expiry, keychain
account locator, and timestamps. It never contains the credential. Writes are atomic,
permission-restricted, and reject symbolic-link path components.

## Agent configuration

Every adapter invokes the same bridge:

```text
npx -y knownpath mcp
```

Named profiles append `--profile <name>`. No API key, token, URL, or KnownPath-specific environment
reference is stored in normal hosted configuration.

| Agent       | Global configuration                                | Project configuration           |
| ----------- | --------------------------------------------------- | ------------------------------- |
| Codex CLI   | `~/.codex/config.toml`                              | `.codex/config.toml`            |
| Claude Code | documented user MCP settings                        | documented project MCP settings |
| Cursor      | `~/.cursor/mcp.json`                                | `.cursor/mcp.json`              |
| Gemini CLI  | `~/.gemini/settings.json`                           | `.gemini/settings.json`         |
| OpenCode    | platform config directory `opencode/opencode.jsonc` | `opencode.jsonc`                |

Claude Code and Gemini CLI use official mutation commands when available. Other paths use
comment-preserving JSONC/TOML-safe merge logic based on current official client formats.

## Safety and ownership

Before writing, the installer detects clients, resolves platform paths, parses existing config, and
calculates an exact plan. It:

- preserves unknown fields/comments where the format allows;
- backs up existing user config before mutation;
- creates files atomically with restrictive permissions;
- refuses symlink traversal and non-regular managed files;
- refuses unmanaged or locally modified `knownpath` conflicts;
- records only paths, digests, versions, ownership flags, profile metadata, and timestamps;
- makes repeated installation idempotent; and
- removes only owned entries during uninstall.

`uninstall` does not log out. `logout` does not remove agent configuration.

## Dry-run and automation

```sh
npx knownpath install --agent all --dry-run
npx knownpath install --agent codex --yes
npx knownpath status --agent all --json
```

Dry-run does not open a browser, create a device code, or mutate credentials. JSON and non-TTY modes
require explicit agents and `--yes` for changes. Reports never include credentials or sensitive
headers.

## Profiles and workspace checks

`--profile` selects a stored connection/credential. `--workspace-id` stores only an expected UUID
and requires a profile. During `doctor`, the backend's authenticated binding must match that UUID;
local profile data cannot grant workspace access.

See [Agent installation](AGENT_INSTALLATION.md), [MCP](MCP.md), and [Workspaces](WORKSPACES.md).
