# KnownPath HTTP API

The Fastify API is the authorization and business-logic boundary for the dashboard, MCP server,
installer diagnostics, and direct integrations. Route handlers validate shared runtime contracts and
call domain services; clients never access MongoDB directly.

## Base URL and discovery

All JSON endpoints use the stable `/api/v1` prefix. A deployment exposes its OpenAPI 3.1 document
at:

```text
GET /api/v1/openapi.json
```

Swagger UI is available at `/docs/` only when `API_DOCS_ENABLED=true`. The MCP endpoint at `/mcp` is
intentionally outside OpenAPI because it speaks MCP rather than a REST contract.

## Authentication

KnownPath supports:

- a Better Auth cookie session for dashboard and workspace-management routes;
- `Authorization: Bearer <KnownPath API key>` for agent and integration routes.

API keys use explicit scopes:

| Scope                  | Capability                              |
| ---------------------- | --------------------------------------- |
| `account:read`         | Read safe account metadata              |
| `api-keys:read`        | List API-key metadata                   |
| `api-keys:write`       | Issue, rotate, and revoke personal keys |
| `knowledge:read`       | Search and read KnownPaths              |
| `knowledge:contribute` | Submit generalized experiences          |
| `knowledge:outcome`    | Report attempted-solution outcomes      |

Full API keys are returned only at creation or rotation. Responses otherwise expose only metadata
such as prefix, status, scopes, binding, and last-used time.

## Error envelope

Errors use a stable envelope and include the request ID used in logs and traces:

```json
{
  "error": {
    "code": "knowledge_not_found",
    "message": "The requested KnownPath was not found"
  },
  "requestId": "server-generated-id"
}
```

Validation errors may include bounded field details. Responses never include stack traces,
credentials, provider responses, or database internals.

## Knowledge API

### Search

```http
POST /api/v1/knowledge/search
```

Requires `knowledge:read` or an authenticated session. The request accepts natural-language `text`
plus optional errors, ecosystem, packages, versions, platforms, environment tokens, context,
semantic mode, result limit, minimum score, scope, and review intent.

```sh
curl "$KNOWNPATH_API_URL/api/v1/knowledge/search" \
  -H "Authorization: Bearer $KNOWNPATH_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{
    "text": "EAS build cannot resolve a generated file",
    "errors": ["None of these files exist"],
    "ecosystem": "expo",
    "platforms": ["build"],
    "semanticMode": "optional",
    "limit": 5
  }'
```

Results include a `searchId`, access mode, semantic capability state, ranked KnownPaths,
applicability, trust, freshness, aggregate outcomes, match components, and safe provenance links.
Search is bounded top-k rather than cursor-paginated because rankings may change between calls.

### Detail

```http
GET /api/v1/known-paths/:id
```

```sh
curl "$KNOWNPATH_API_URL/api/v1/known-paths/$KNOWN_PATH_ID" \
  -H "Authorization: Bearer $KNOWNPATH_API_KEY"
```

Detail includes the generalized problem, symptoms, normalized errors, applicability, solution
variants, steps, caveats, trust, freshness, outcomes, and bounded provenance. It excludes raw source
bodies, embeddings, provider metadata, internal hashes, and individual reporter data.

### Alternatives

```http
GET /api/v1/known-paths/:id/alternatives?limit=10&cursor=...
```

This endpoint pages through solution variants on the same canonical KnownPath. Cursors are opaque,
integrity-protected, and bound to the record.

### Record selection

```http
POST /api/v1/knowledge/searches/:searchId/selections
```

```json
{ "knownPathId": "known-path-uuid" }
```

The selected record must have appeared in that principal's search. A selection is usage metadata,
not a successful outcome. Stored search events use a keyed query digest and bounded dimensions
instead of raw query text.

## Visibility and review access

The default is published public knowledge. Supported scopes are:

- `public`
- `personal`
- `workspace`
- `workspace_and_public`

Workspace scopes require an exact `workspaceId`, live membership, and a compatible key binding.
Detail and alternatives apply the same checks as search. Inaccessible tenant records are not
distinguishable from nonexistent records.

`includeReview: true` is never implied. It requires an active administrator-owned API key with
`knowledge:read`, and each review search or read creates an audit event. Sessions and ordinary keys
cannot retrieve review records.

## Contributions

```http
POST /api/v1/contributions
GET  /api/v1/contributions/:id
GET  /api/v1/account/contribution-settings
PATCH /api/v1/account/contribution-settings
POST /api/v1/known-paths/:id/share-public
```

Submission requires `knowledge:contribute`, explicit consent, a UUID `clientSubmissionId`, and a
structured generalized lesson. The maximum body is 48 KiB. Team submissions also require a
workspace-bound key and matching `workspaceId`.

The detail endpoint returns only the sanitized record to its owner. Account settings are
session-only and support `ask` or `disabled`. Public sharing creates a separately sanitized public
contribution; it never changes the source record's visibility.

See [Contributions](CONTRIBUTIONS.md).

## Outcomes

```http
POST /api/v1/outcomes
```

Requires `knowledge:read` and `knowledge:outcome`. The maximum body is 24 KiB. The contract records
one KnownPath/execution result with bounded environment metadata:

```json
{
  "contractVersion": 1,
  "clientOutcomeId": "uuid",
  "clientExecutionId": "uuid",
  "knownPathId": "uuid",
  "outcome": "solved",
  "attemptedAt": "2026-09-03T00:00:00.000Z",
  "agentClient": { "name": "codex" },
  "environment": {
    "ecosystem": "expo",
    "packages": [{ "name": "expo", "version": "55.0.0" }],
    "platforms": ["android"],
    "versions": ["expo@55.0.0"],
    "toolchain": ["pnpm"]
  },
  "includeReview": false
}
```

Review targets need the same explicit admin review authorization as reads. See
[Outcomes](OUTCOMES.md) for states, deduplication, aggregation, and safety handling.

## Account and API-key routes

Cookie-session and scoped account routes include:

```text
GET  /api/v1/account/me
GET  /api/v1/api-keys
POST /api/v1/api-keys
POST /api/v1/api-keys/:id/rotate
POST /api/v1/api-keys/:id/revoke
GET  /api/v1/account/dashboard
GET  /api/v1/account/search-activity
GET  /api/v1/account/contributions
GET  /api/v1/account/outcomes
PATCH /api/v1/account/profile
GET  /api/v1/account/sessions
POST /api/v1/account/sessions/:id/revoke
```

Sign-in and password/session lifecycle are mounted under `/api/v1/auth`. Registration, public
signup, email verification, password reset, and OAuth are not exposed. Accounts are provisioned by
an operator using `pnpm auth:user:create`.

## Workspace routes

Workspace management uses an authenticated browser session:

```text
GET|POST        /api/v1/workspaces
GET|PATCH       /api/v1/workspaces/:workspaceId
POST            /api/v1/workspaces/:workspaceId/invitations
POST            /api/v1/workspace-invitations/:invitationId/accept
POST            /api/v1/workspace-invitations/:invitationId/reject
POST            /api/v1/workspace-invitations/:invitationId/revoke
PATCH           /api/v1/workspaces/:workspaceId/members/:userId
POST            /api/v1/workspaces/:workspaceId/members/:userId/remove
GET|POST        /api/v1/workspaces/:workspaceId/api-keys
POST            /api/v1/workspaces/:workspaceId/api-keys/:id/revoke
```

Invitation targets must already be registered KnownPath users. See [Workspaces](WORKSPACES.md).

## Administration

Admin routes live under `/api/v1/admin` and always require a server-verified administrator session.
High-impact mutations additionally require a session authenticated within 30 minutes, exact target
confirmation, and a stated reason. Sensitive actions are audited.

The routes cover operational overview, paginated resources, moderation, queue control, job retry,
source actions, canonicalization preview/execute, user suspension/restore, and reason-gated reveal
of sanitized private contribution content. See [Admin operations](ADMIN_OPERATIONS.md).

## Pagination

High-volume list endpoints and alternatives use opaque integrity-protected cursors. Pass a returned
`nextCursor` unchanged. Do not parse or synthesize it. Search uses bounded top-k results instead.

## Rate and payload limits

Policy classes distinguish authentication, key mutations, search, detail, selections, contributions,
outcomes, MCP reads/writes, provider-heavy operations, and administration. Production rate limiting
uses Valkey and fails closed if that critical dependency is unavailable. In-memory limiting is
accepted only through explicit local-development configuration.

Current knowledge-route limits include:

- search: 32 KiB and 30 requests/minute;
- detail and alternatives: 120 requests/minute;
- selections: 120 requests/minute;
- outcomes: 10 requests/minute plus durable per-key and per-account limits.

Clients should honor `429` responses and retry conservatively.

## Safe handling

- Never place an API key in a URL, log, source file, or committed environment file.
- Logs correlate request and trace IDs but redact Authorization, cookies, credentials, and bodies.
- Public responses expose concise provenance, not complete copyrighted source pages.
- Private/team records never use the unpaid/public Gemini path.

See [MCP](MCP.md) and [Security architecture](SECURITY_ARCHITECTURE.md). On a running deployment,
the machine-readable contract is available at `GET /api/v1/openapi.json`.
