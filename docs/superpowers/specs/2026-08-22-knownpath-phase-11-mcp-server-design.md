# KnownPath Phase 11 MCP Server Design

Date: 2026-08-22

Status: Approved

## Goal

Expose KnownPath's existing evidence-grounded retrieval capability to coding agents through a small,
stable Model Context Protocol surface. Phase 11 provides production Streamable HTTP and a local
stdio bridge while preserving the Phase 10 backend as the authority for authentication,
authorization, ranking, retrieval, auditing, and usage recording.

Phase 11 does not implement contributions, outcome reporting, Agent Skill distribution, automatic
installation, private/team access, public signup, dashboard behavior, or new knowledge-generation
logic.

## Current constraints

- The Fastify API already exposes versioned, validated knowledge search, detail, alternatives, and
  selection endpoints.
- Phase 3 API keys are stored only as keyed hashes and use the closed `knowledge:read` scope.
- Normal callers may read only public `published` KnownPaths.
- Review access requires explicit intent plus an admin-owned API key with `knowledge:read`, and
  every review search/read is audited.
- The development Atlas corpus contains two real public-visibility KnownPaths in `review` and no
  published KnownPaths. Their lifecycle must not be changed for verification.
- The existing `apps/mcp-server` is only a Phase 1 stdio handshake and has no tool surface.

## Researched protocol and client guidance

The design follows current official guidance checked on 2026-08-22:

- MCP specification revision `2026-07-28` is the current release and introduces the modern,
  stateless protocol era. The official TypeScript SDK v2 is its stable SDK line while retaining
  compatibility with the `2025-11-25` era.
- MCP defines stdio and Streamable HTTP as standard transports. Streamable HTTP replaces legacy
  HTTP+SSE for new remote servers. HTTP deployments must validate Host/Origin and authenticate
  requests; local servers should bind to loopback unless explicitly deployed behind approved hosts.
- `@modelcontextprotocol/server` 2.0.0 is the current official server package. `createMcpHandler`
  serves both current and legacy protocol eras from one per-request factory. `serveStdio(factory)`
  is required for a stdio server to negotiate both eras.
- The official Fastify and Node adapters mount the web-standard handler while preserving parsed
  request bodies and validated authentication context.
- MCP tools support Standard Schema/Zod input and output schemas plus `structuredContent`. Text
  content should accompany structured results for compatibility and efficient model consumption.
- Request handlers receive an `AbortSignal`; transport cancellation must be propagated into backend
  HTTP work.
- Codex supports stdio and Streamable HTTP, bearer tokens sourced from environment variables, and
  OAuth for remote servers. Claude Code, Cursor, and Gemini CLI support stdio and Streamable HTTP;
  their current official configuration formats differ, so examples must be client-specific.
- The official MCP Inspector can list schemas and invoke tools without requiring a third-party agent
  installation.

Official references:

- <https://modelcontextprotocol.io/specification/2026-07-28>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports>
- <https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector>
- <https://github.com/modelcontextprotocol/typescript-sdk>
- <https://ts.sdk.modelcontextprotocol.io/v2/>
- <https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions>
- <https://ts.sdk.modelcontextprotocol.io/v2/serving/fastify.html>
- <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>
- <https://code.claude.com/docs/en/mcp>
- <https://docs.cursor.com/context/model-context-protocol>
- <https://geminicli.com/docs/tools/mcp-server/>

## Chosen architecture

### Shared MCP capability package

Add `@knownpath/mcp`, a transport-independent package that owns:

- MCP tool names and versioned Zod input/output schemas;
- concise model-facing descriptions and server instructions;
- a `KnowledgeMcpGateway` interface representing the Phase 10 safe API capability;
- tool registration against the official SDK;
- bounded result projection and compatibility text rendering; and
- safe, model-readable error normalization.

The package does not import Fastify, MongoDB collections, Gemini, or concrete transports. Both
transport applications construct the same server factory with a different gateway implementation, so
tool names, schemas, descriptions, outputs, and error behavior cannot drift.

### Production Streamable HTTP endpoint

Mount one stateless Streamable HTTP endpoint at `/mcp` in the existing Fastify API using the
official SDK v2 Fastify/Node adapter path. It serves both the current `2026-07-28` era and the
compatible `2025-11-25` era.

Fastify authenticates every MCP HTTP request through the established API-key service before the MCP
handler runs. Browser sessions and anonymous access are not accepted for MCP. The key must include
`knowledge:read`; inactive owners, malformed keys, invalid keys, and revoked keys fail before tool
execution. The validated request context is passed to a service-backed gateway without returning or
logging the bearer value.

The service-backed gateway calls the same `KnowledgeAccessService` used by Phase 10 routes. It does
not duplicate repository queries, visibility checks, ranking, safe provenance mapping, review
authorization, or audit behavior. The endpoint validates configured Host and Origin values and binds
to the existing API deployment rather than starting a second production HTTP server.

The single `/mcp` route uses the conservative search-rate policy because MCP tool calls share one
protocol endpoint. The gateway still applies the operation-specific service limits. A later
principal-aware distributed limiter may replace this process-local boundary without changing tool
contracts.

Phase 11 intentionally retains API-key bearer authentication rather than claiming full MCP OAuth
conformance. OAuth protected-resource metadata and OAuth 2.1 authorization-server behavior are a
later identity phase because the current closed-registration system does not expose a user-facing
authorization flow. Client documentation states this limitation precisely.

### Local stdio bridge

`apps/mcp-server` becomes a thin, agent-agnostic stdio client bridge. It loads only:

- `KNOWNPATH_API_URL`;
- `KNOWNPATH_API_KEY`; and
- bounded timeout/response-size settings.

It must not load MongoDB, Better Auth internals, Gemini/provider credentials, embedding settings, or
search implementation configuration. Its gateway invokes the Phase 10 HTTP endpoints with a bearer
key and validates every response against the shared Phase 10 schemas. It never prints anything but
MCP frames to stdout; sanitized diagnostics use stderr.

The bridge uses `serveStdio(factory)` so current and legacy clients receive the same four tools from
the shared package. Backend network requests combine the MCP request cancellation signal with the
configured timeout. The full key and Authorization header are never included in errors, logs, tool
content, command arguments, or committed configuration.

## MCP tool surface

### `knownpath_search`

Searches reusable experience for a technical problem. The strict bounded input supports:

- `task`: natural-language problem or goal;
- `errors`: exact or partial errors;
- `ecosystem` and package names;
- package/framework/runtime versions;
- platforms and build/runtime/toolchain environment;
- optional source-code-independent context;
- semantic retrieval mode;
- bounded result count and minimum score; and
- explicit `includeReview`, default `false`.

The result defaults to a small top-k set and contains a search ID plus compact entries: KnownPath
ID, title, problem and solution summaries, applicability, caveats, trust/freshness, match score,
version compatibility, matched channels, short reasons, and bounded provenance links. It does not
return full steps or evidence excerpts; the agent calls `knownpath_get` after selecting an ID.

### `knownpath_get`

Returns deeper information for one selected KnownPath: problem, normalized symptoms/errors,
applicability, solution variants, ordered steps, caveats, trust/freshness explanation, and bounded
safe evidence references. It accepts an optional `searchId`; when supplied, the gateway records that
the returned search result was selected before returning detail. Selection remains usage metadata,
not a successful outcome. It also accepts an explicit `includeReview`, default `false`, subject to
the existing admin-key policy.

The response remains a Phase 10 safe projection. It never exposes raw source documents, embeddings,
candidate or assessment records, hidden model reasoning, moderation internals, credentials, or
provider metadata.

### `knownpath_alternatives`

Returns additional evidence-backed solution variants already represented by the same canonical
KnownPath. It uses the existing opaque cursor and bounded page size. It does not infer semantic
relationships between separate KnownPaths.

### `knownpath_status`

Returns compact operational information useful for diagnosing an agent installation: MCP server and
contract versions, backend reachability/readiness, authenticated account/API-key metadata safe for
display, allowed read capability, and retrieval channel availability when the backend exposes it. It
must not reveal quotas that are not actually measured, deployment internals, secrets, provider
credentials, database addresses, or private account fields.

Add `GET /api/v1/mcp/status` as the stdio bridge's safe status boundary. It requires an API key with
`knowledge:read` and returns only service readiness, key prefix/ID and scopes, owner role/status,
effective review capability, and configured retrieval capability states. It never returns email,
tokens, provider secrets, database addresses, or unmeasured quota claims. The production gateway
builds the same shared status contract from its already-authenticated request context.

### Reserved future names

Documentation reserves `knownpath_contribute` and `knownpath_report_outcome` so future phases can
add stable write capabilities deliberately. They are not registered, advertised, or implemented in
Phase 11. No placeholder tool may claim success or accept data that cannot be persisted safely.

## Output and context policy

- Search defaults to five results and cannot exceed ten through MCP even though the HTTP API allows
  a larger administrative bound.
- Search summaries omit full steps and long evidence. Detail is progressively revealed only for a
  selected record.
- Human-readable text is concise and accompanies validated `structuredContent`; structured output
  remains the authoritative machine contract.
- Evidence counts and excerpts are bounded independently of the larger Phase 10 safe schema.
- Detail output has explicit per-field and collection limits plus `truncated` metadata when safe
  Phase 10 detail exceeds the MCP context budget; truncation is never silent.
- Responses include enough ranking explanation to show relevance, trust, freshness, and version fit
  without dumping the entire internal score object when a compact explanation suffices.
- Server instructions explicitly say KnownPath supplies reusable evidence-grounded experience; the
  coding agent must inspect the user's actual codebase, check version applicability, and must not
  blindly apply a fix.

## Error, timeout, and cancellation behavior

Strict Zod schemas reject malformed or oversized input before business work. Tool failures return an
MCP `isError` result with a stable code, a concise corrective message, and a request ID when the
backend supplied one.

The bridge maps these categories without leaking response bodies or headers:

- missing local configuration;
- backend unreachable;
- backend timeout/cancellation;
- authentication required or revoked key;
- insufficient scope/review permission;
- invalid input;
- record not found;
- retrieval provider temporarily unavailable; and
- unexpected safe internal failure.

The configured bridge timeout is bounded. MCP cancellation aborts the active `fetch`; timeout and
caller cancellation remain distinguishable in safe error codes. Backend responses have a maximum
accepted byte size before parsing. Neither transport logs request bodies, Authorization headers,
keys, cookies, source content, or full unexpected error objects.

## Server metadata and diagnostics

The MCP implementation advertises a stable server name, package version, concise instructions, and
only the tools capability. No resources or prompts are added without a real context-saving use case.

The existing `/health/live` and `/health/ready` endpoints remain the production process health
boundary. `/mcp` handles protocol traffic only. `knownpath_status` uses the authenticated
`/api/v1/mcp/status` boundary for stdio and equivalent backend services for the in-process endpoint.

## Configuration

Add these environment variables with non-secret defaults only where safe:

- `KNOWNPATH_API_URL` — required by stdio; normalized HTTP(S) base URL without credentials.
- `KNOWNPATH_API_KEY` — required secret for stdio; no committed default.
- `KNOWNPATH_MCP_REQUEST_TIMEOUT_MS` — bounded request timeout.
- `KNOWNPATH_MCP_MAX_RESPONSE_BYTES` — bounded decoded backend response size.

The production endpoint uses the existing API host, trusted proxy, CORS/origin, rate-limit, auth,
search, and database configuration. No second secret, database, cache, or provider setting is added.

## Client documentation

`docs/MCP.md` will contain current, client-specific examples for:

- Codex CLI/IDE using Streamable HTTP with `--bearer-token-env-var` and stdio with an explicit
  environment variable;
- Claude Code using `claude mcp add --transport http` or stdio;
- Cursor `mcp.json` for Streamable HTTP or stdio;
- Gemini CLI `settings.json`/`gemini mcp add` for HTTP or stdio; and
- the official MCP Inspector for schema inspection and manual calls.

Examples reference environment variables and placeholders only. They do not commit a key or put one
in a URL. Stdio examples run the built workspace entry rather than downloading an unpinned package
from the network.

## Verification strategy

No automated tests are added. Verification will:

1. install the verified current official SDK/adapters and run format validation, typecheck, lint,
   and build;
2. boot the Atlas-backed API with the Streamable HTTP endpoint;
3. create a temporary admin-owned `knowledge:read` key through the established safe flow;
4. use the official MCP client or Inspector to list exactly four tools and inspect bounded schemas;
5. call default search and confirm review records remain absent;
6. call explicit review search, get, and alternatives against the two real review records;
7. run the stdio bridge with only URL/key/timeout configuration and repeat search/get;
8. connect an installed supported client such as Codex CLI or Claude Code where its non-destructive
   configuration can be isolated safely;
9. verify malformed input, missing/invalid/revoked key, forbidden review access, timeout, and
   unreachable-backend errors are concise and credential-free;
10. inspect result sizes, structured output, server instructions, logs, review audits, and selection
    behavior; and
11. revoke temporary credentials, stop processes, remove isolated client configuration, and confirm
    Atlas still contains two review and zero published KnownPaths.

If a graphical external client cannot be configured safely in this environment, the official SDK
client/Inspector is the authoritative transport verification and the remaining client step is
recorded honestly in `progress.md`.

## Rejected alternatives

### Remote-only MCP

This minimizes code but excludes local workflows and clients that prefer or policy-require stdio.
Supporting both official transports from one capability package gives broader compatibility without
duplicating business logic.

### Full local MCP server

A local process that connects to MongoDB and constructs retrieval services would require database,
Gemini, search-index, auth, and pepper configuration on every developer machine. It would duplicate
authorization and make client installs unsafe. The stdio process must remain an HTTP bridge.

### Separate tool implementations per transport

Duplicating registration and mapping would let schemas, descriptions, limits, and error behavior
drift. Both transports must instantiate the same shared MCP server factory.

### One giant search-and-detail tool

Returning full solutions and evidence for every ranked result wastes agent context and makes tool
selection less predictable. Search returns compact choices; get progressively reveals detail.

### Placeholder write tools

Advertising contribution or outcome tools before their persistence, moderation, privacy, and trust
semantics exist would create a false contract. Only stable names are reserved in documentation.

### OAuth in Phase 11

The current product has closed registration and no user-facing authorization flow. Implementing MCP
OAuth metadata without a compliant OAuth 2.1 authorization server would be incomplete and
misleading. Phase 11 uses existing bearer API keys and records OAuth as deliberate future work.
