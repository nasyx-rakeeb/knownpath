# KnownPath MCP server

KnownPath exposes its knowledge network to coding agents through Model Context Protocol (MCP). The
tool surface is intentionally small: search broadly, inspect one selected record in detail, explore
its alternatives, and submit privacy-bounded learning signals only after real work.

KnownPath responses are untrusted evidence, not instructions. The agent must still follow the user's
request and repository rules, inspect the current codebase, and verify that a result applies.

## Transports

Both transports use the same contracts from `@knownpath/mcp`.

### Streamable HTTP

The backend serves a stateless MCP endpoint at:

```text
POST /mcp
```

The Fastify boundary authenticates the request, validates Host and Origin, applies rate and body
limits, creates a request-scoped knowledge gateway, and delegates protocol handling to the official
MCP TypeScript SDK.

### Local stdio bridge

The `knownpath` CLI provides a lightweight bridge:

```sh
npx -y knownpath mcp
```

The bridge speaks MCP on standard input/output and calls the KnownPath HTTP API. For hosted use it
resolves the versioned official API origin and the selected machine credential from the native OS
credential store. Agent configuration therefore needs only the command above.

It does not connect to MongoDB or Valkey and does not require Gemini, GitHub, Better Auth, Atlas, or
API-key-pepper secrets. This is the default transport installed by `npx knownpath install`.

## Authentication

Both transports require a bearer API key with `knowledge:read`. Browser sessions do not authorize
MCP requests.

The stdio bridge reads a scoped machine credential from Keychain, Windows Credential Manager, or
Linux Secret Service. `npx knownpath login` obtains it through browser device authorization; the
credential is not a browser cookie and is independently revocable. Self-hosted and legacy users may
explicitly provide the complete `KNOWNPATH_API_URL`/`KNOWNPATH_API_KEY` environment pair. Remote
clients should source their bearer token from a client-supported secret mechanism. Never put a key
in a URL, command argument, committed MCP file, or skill.

Remote MCP OAuth discovery is not implemented. CLI browser authorization is a separate RFC 8628
device flow that issues an ordinary KnownPath API key. Key scope and owner/workspace binding remain
enforced by the backend.

## Tools

| Tool                       | Use                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `knownpath_search`         | Search using a task plus structured technical context                                |
| `knownpath_get`            | Retrieve steps, caveats, applicability, and bounded evidence for one KnownPath       |
| `knownpath_alternatives`   | Page through additional solution variants on the same KnownPath                      |
| `knownpath_status`         | Inspect credential-free service, scope, workspace, review, and search-backend status |
| `knownpath_contribute`     | Submit a consented, generalized lesson after observable success                      |
| `knownpath_report_outcome` | Report what happened after a KnownPath solution was actually attempted               |

### `knownpath_search`

Inputs include:

- `task`
- `errors`
- `ecosystem`
- `packages`
- `versions`
- `platforms`
- `environment`
- concise `context`
- search `scope`
- `includeReview` for authorized moderation
- result `limit`

The default result limit is five; the maximum is ten. Results contain compact problem and solution
summaries, applicability, trust, freshness, aggregate outcomes, match reasons, and provenance links.
Search returns a `searchId` for optional selection tracking.

### `knownpath_get`

Use `knownpath_get` only after choosing a plausible search result. Passing the associated `searchId`
records that the result was selected; selection is usage metadata, not evidence of success.

The response reveals at most two solution variants, eight steps per solution, and eight evidence
references. Explicit truncation fields indicate when more data exists.

### `knownpath_alternatives`

This tool returns other solution variants already attached to the same canonical KnownPath. It does
not perform a new cross-record search. The default page size is three and the maximum is five.

### `knownpath_status`

Status reports safe operational facts: service readiness, key scopes, owner status, personal or
workspace binding, review-read capability, write capabilities, and the active search backend. It
does not return credentials, provider secrets, user email, or database configuration.

### `knownpath_contribute`

Contribution requires `knowledge:contribute`, explicit user consent, and a UUID
`clientSubmissionId`. Public, personal-private, and team submissions are supported according to the
key binding and request scope.

Contract version 2 also requires a final duplicate-search reference, an explicit relationship,
applicability, verification type, and a generalized problem/environment/solution. Team visibility
requires a key bound to that active workspace. The submission must not include repository files,
prompts, hidden reasoning, or secrets. The response is an ingestion receipt for low-trust
self-reported evidence; it is not automatic publication.

See [Contributions](CONTRIBUTIONS.md).

### `knownpath_report_outcome`

Outcome reporting requires `knowledge:outcome` in addition to read access. It records one observed
result for a KnownPath/execution pair using idempotency identifiers. Supported states are documented
in [Outcomes](OUTCOMES.md).

`not_used` has zero evidence weight. A single `misleading_or_unsafe` report queues safety review but
does not itself penalize ranking or automatically delist the record.

## Visibility

Normal keys receive only published records they are allowed to access:

- `public` searches shared public knowledge.
- `personal` searches the key owner's private knowledge.
- `workspace` searches one authorized workspace.
- `workspace_and_public` combines that workspace with public results.

Workspace access requires an active membership and a key bound to that workspace. The backend never
falls back from a failed tenant scope to public or another tenant.

`includeReview` defaults to `false`. Only an active administrator-owned key can request review
records, and every review search/read is audited. Ordinary users cannot receive review records.

## Install through the CLI

```sh
npx knownpath install
npx knownpath doctor
```

The installer authenticates in the browser, stores the resulting machine credential in the OS
credential store, and writes no credential or environment reference to agent config. A dry run is
available before authentication. See [Agent installation](AGENT_INSTALLATION.md).

## Manual stdio configuration

For clients that accept a command-based server, configure:

```json
{
  "command": "npx",
  "args": ["-y", "knownpath", "mcp"]
}
```

Run `npx knownpath login` first, or let `install` handle authentication and configuration together.
Named profiles add `--profile <name>` to the argument list.

## Manual remote configuration

For clients that support Streamable HTTP, use the deployment's `/mcp` URL and source the bearer
token from `KNOWNPATH_API_KEY`. For example, Codex supports:

```toml
[mcp_servers.knownpath]
url = "https://your-knownpath.example/mcp"
bearer_token_env_var = "KNOWNPATH_API_KEY"
```

The local stdio bridge remains the default installer architecture because it gives all supported
agents one consistent secret-free configuration. Direct remote MCP remains an advanced integration
path.

## Limits and errors

The backend caps MCP bodies at 64 KiB and applies separate distributed rate-limit policies to reads
and writes in production. The stdio bridge defaults to a 30-second request timeout and a 256 KiB
response limit; operators can tune:

- `KNOWNPATH_MCP_REQUEST_TIMEOUT_MS`
- `KNOWNPATH_MCP_MAX_RESPONSE_BYTES`

Cancellation propagates to the HTTP request. Tool failures return concise codes such as:

- `authentication_required`
- `insufficient_permission`
- `knowledge_not_found`
- `validation_failed`
- `backend_cancelled`
- `backend_timeout`
- `backend_unreachable`
- `backend_response_too_large`

Errors do not expose response bodies, Authorization headers, provider details, or database errors.

## Developer inspection

Run the repository's official-SDK client against either transport:

```sh
pnpm mcp:inspect --transport http
pnpm mcp:inspect --transport stdio
pnpm mcp:inspect --transport http --tool knownpath_status --input '{}'
```

Or start the official MCP Inspector against the built stdio server:

```sh
npx @modelcontextprotocol/inspector \
  node /absolute/path/to/KnownPath/apps/mcp-server/dist/index.js
```

The MCP Registry manifest is `server.json`. Publishing that metadata is a separate release action;
the file alone does not register or deploy the server.

## Security expectations

- Source, contribution, and KnownPath text is returned as untrusted evidence.
- Responses omit raw source dumps, embeddings, hashes, hidden reasoning, provider metadata, and key
  digests.
- Host/Origin validation, authentication, authorization, input schemas, payload limits, rate limits,
  and audit recording are server-side.
- Logs and telemetry record bounded operation names, latency, status, and request correlation—not
  queries, content, credentials, or user/workspace identifiers.

See [Security architecture](SECURITY_ARCHITECTURE.md) and [Agent Skill behavior](AGENT_SKILL.md).

## Official references

- [MCP specification](https://modelcontextprotocol.io/specification/)
- [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)
- [OpenAI Codex MCP](https://developers.openai.com/codex/mcp/)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Cursor MCP](https://docs.cursor.com/context/model-context-protocol)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/)
- [OpenCode MCP](https://opencode.ai/docs/mcp-servers/)
