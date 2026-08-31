# KnownPath MCP server

## Scope and philosophy

The MCP surface exposes retrieval plus privacy-safe generalized contributions. KnownPath returns
compact, evidence-grounded experience; the coding agent still inspects the actual codebase, checks
version applicability, and decides whether a proposed fix is safe. A result is not an instruction to
modify code blindly.

`knownpath_contribute` and `knownpath_report_outcome` are real idempotent additive writes. The
former submits a consented generalized lesson; the latter reports only an observed result after an
actual attempt.

## Architecture

There are two transports with one shared tool contract:

- **Production Streamable HTTP:** the Fastify API serves `/mcp`. It authenticates a KnownPath API
  key, applies the same centralized authorization, retrieval, ranking, review auditing, and usage
  recording as the Phase 10 HTTP routes, then delegates protocol framing to the official MCP SDK.
- **Local stdio bridge:** `apps/mcp-server` speaks MCP over stdin/stdout and calls the Phase 10 HTTP
  API. It needs only `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`. It never connects to MongoDB and
  never receives Gemini, Atlas, Better Auth, or API-key-pepper secrets.

Both paths create their servers from `@knownpath/mcp`. Consequently tool names, input validation,
bounded output projection, error mapping, server instructions, and protocol-era behavior cannot
drift between transports. The server supports the current `2026-07-28` era and the SDK's documented
2025-compatible fallback.

Tool discovery advertises only the strict input schemas to keep agent context small. Full success
and error response schemas remain versioned and runtime-validated inside `@knownpath/mcp`; compact
structured results are still returned with each call.

## Tools

| Tool                       | Purpose                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `knownpath_search`         | Search with a task plus optional errors, ecosystem, packages, versions, platform, and context  |
| `knownpath_get`            | Reveal deeper steps, caveats, and bounded evidence for one selected ID                         |
| `knownpath_alternatives`   | Page through other solution variants on the same canonical KnownPath                           |
| `knownpath_status`         | Inspect safe service, key-scope, review-access, and search-backend state                       |
| `knownpath_contribute`     | Submit a consented generalized lesson after observable success                                 |
| `knownpath_report_outcome` | Report solved/partial/failed/compatibility/staleness/safety/not-used after the result is known |

Search defaults to five results and allows at most ten. Detail returns at most two solution
variants, eight steps per solution, and eight bounded evidence references. Alternatives defaults to
three and allows at most five. Every response carries explicit truncation state where deeper content
may exist. Search provides `searchId`; pass it to `knownpath_get` to record selection as usage. A
selection is never counted as a successful outcome.

`includeReview` always defaults to `false`. It succeeds only for an active administrator-owned API
key with `knowledge:read`, and every permitted review read uses the existing audit boundary. Normal
keys cannot receive review records. Search/get/alternatives accept an explicit public, personal, or
workspace scope. Workspace access requires a live membership and matching workspace-bound key;
tenant retrieval disables public-provider semantics and never falls back to another scope.

`knownpath_contribute` requires `knowledge:contribute`, explicit consent, and a UUID
`clientSubmissionId`. It accepts public or owner-private lessons; team visibility requires a
matching workspace-bound key and explicit `workspaceId`. Private data never uses an unpaid/public
provider. The response is a receipt for low-trust self-reported evidence, not publication or proof.

`knownpath_report_outcome` requires `knowledge:outcome` plus the normal MCP `knowledge:read` scope.
It accepts one KnownPath/execution result, bounded environment/version metadata, and an optional
sanitized note. `not_used` has zero evidence weight. Review-record reporting also requires explicit
`includeReview: true` and an administrator-owned key. One safety report queues a separate review but
does not itself penalize ranking or delist the record. See [`OUTCOMES.md`](OUTCOMES.md).

## Configuration

Phase 13's recommended local-client setup is the installer, which configures `npx -y knownpath mcp`
and environment-variable references without persisting their values:

```sh
pnpm knownpath install --dry-run --agent all
pnpm knownpath install --agent all
```

The published equivalent is `npx knownpath install`. See [the installer guide](INSTALLER.md) for
required environment setup, supported agents, backups, and uninstall behavior. The manual
configurations below remain useful for transport development and troubleshooting.

The root `server.json` is the MCP Registry-compatible distribution manifest for
`io.github.nasyx-rakeeb/knownpath`. It points to the same `knownpath` npm package and `mcp`
subcommand, with required environment-variable declarations. Registry publication is an explicit
maintainer release step; the manifest does not publish or authenticate anything by itself.

Build the workspace, then configure the bridge in the ignored `.env` or the agent's process
environment:

```sh
pnpm build
export KNOWNPATH_API_URL=http://127.0.0.1:3001
export KNOWNPATH_API_KEY='the-key-returned-once-at-creation'
```

Optional bridge limits are `KNOWNPATH_MCP_REQUEST_TIMEOUT_MS` (default `30000`) and
`KNOWNPATH_MCP_MAX_RESPONSE_BYTES` (default `262144`). `KNOWNPATH_API_URL` must be an HTTP(S) origin
without credentials or a path. Never commit the key or put it in a URL.

Start the API for either transport:

```sh
pnpm --filter @knownpath/api dev
```

Run the local stdio bridge directly only for an MCP client; its stdout is protocol traffic:

```sh
pnpm mcp:stdio
```

## Current client configurations

All paths below are placeholders. Replace `/absolute/path/to/KnownPath` with the checkout's absolute
path and export the two environment variables before launching the agent.

### OpenAI Codex

Codex currently supports both stdio and Streamable HTTP, including bearer tokens sourced from an
environment variable. The remote configuration is the simplest production-style setup:

```toml
[mcp_servers.knownpath]
url = "http://127.0.0.1:3001/mcp"
bearer_token_env_var = "KNOWNPATH_API_KEY"
```

For the local bridge:

```toml
[mcp_servers.knownpath]
command = "node"
args = ["/absolute/path/to/KnownPath/apps/mcp-server/dist/index.js"]
env_vars = ["KNOWNPATH_API_URL", "KNOWNPATH_API_KEY"]
```

Use `codex mcp list` to inspect configuration, then `/mcp` in Codex to inspect connection state.

### Claude Code

Claude Code supports environment expansion in project `.mcp.json` files, including headers:

```json
{
  "mcpServers": {
    "knownpath": {
      "type": "http",
      "url": "http://127.0.0.1:3001/mcp",
      "headers": {
        "Authorization": "Bearer ${KNOWNPATH_API_KEY}"
      }
    }
  }
}
```

Use `/mcp` to verify that the server is connected. Keep project configuration free of literal
credentials.

### Cursor

Cursor supports project `.cursor/mcp.json` and user-level MCP configuration with stdio and remote
HTTP transports. Use its MCP settings UI to add `http://127.0.0.1:3001/mcp` with an Authorization
header, or configure the stdio bridge command shown above. Store the actual key in an environment
variable or Cursor's secret-capable settings rather than a tracked project file. Cursor was not
installed in the Phase 11 development environment, so contributors should confirm connection state
in Cursor's MCP settings after configuration.

### Gemini CLI

Gemini CLI's `settings.json` supports an `httpUrl` Streamable HTTP endpoint and environment-variable
expansion in string values:

```json
{
  "mcpServers": {
    "knownpath": {
      "httpUrl": "http://127.0.0.1:3001/mcp",
      "headers": {
        "Authorization": "Bearer ${KNOWNPATH_API_KEY}"
      },
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Run `/mcp list` in Gemini CLI. Gemini CLI was not installed in the Phase 11 development environment,
so this remains a client-side connection check for contributors.

## Manual inspection

KnownPath includes a small official-SDK client that negotiates the protocol era, lists exact
schemas, and can call either transport:

```sh
pnpm mcp:inspect --transport http
pnpm mcp:inspect --transport stdio
pnpm mcp:inspect --transport http --tool knownpath_status --input '{}'
pnpm mcp:inspect --transport http --tool knownpath_search \
  --input '{"task":"Expo EAS build cannot resolve an imported file","includeReview":true}'
pnpm mcp:inspect --transport http --tool knownpath_report_outcome \
  --input '{"contractVersion":1,"clientOutcomeId":"UUID","clientExecutionId":"UUID","knownPathId":"UUID","outcome":"not_used","agentClient":{"name":"manual-inspector"},"environment":{},"includeReview":true}'
```

The official MCP Inspector is also suitable:

```sh
npx @modelcontextprotocol/inspector \
  node /absolute/path/to/KnownPath/apps/mcp-server/dist/index.js
```

## Security and failure behavior

Phase 20 applies a distributed Valkey transport policy and a stricter per-key mutation gate to
`knownpath_contribute` and `knownpath_report_outcome`. Tool output is labeled untrusted evidence,
instruction-like markup/control characters are neutralized, and manual OpenTelemetry instrumentation
records only the fixed tool name, duration, and success/error—not inputs, record IDs, user/workspace
IDs, or returned content.

- MCP accepts bearer API keys only. Browser sessions do not authenticate the MCP endpoint.
- OAuth discovery/authorization is not implemented. Clients must be configured with a KnownPath key;
  this is documented rather than pretending OAuth compliance.
- The backend validates Host and Origin, limits protocol bodies to 64 KiB, applies distributed
  Valkey-backed production policies (or explicitly configured local memory limits), and sends
  `Cache-Control: no-store`.
- The stdio bridge bounds request duration and response bytes, propagates cancellation through
  `fetch`, and emits only safe diagnostics on stderr. Keys and Authorization headers are never
  logged.
- Tool failures use short stable codes such as `authentication_required`, `insufficient_permission`,
  `knowledge_not_found`, `validation_failed`, `backend_timeout`, and `backend_unreachable`.
  Provider/database details are not returned.
- Safe response schemas omit raw source bodies, embeddings, content hashes, hidden reasoning,
  provider metadata, key hashes, and unrestricted account/private metadata.

## Official references

- [MCP specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [MCP Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector)
- [OpenAI Codex MCP](https://developers.openai.com/codex/mcp/)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Cursor MCP](https://cursor.com/docs/mcp)
- [Gemini CLI MCP servers](https://geminicli.com/docs/tools/mcp-server/)
