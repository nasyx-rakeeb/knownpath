# Knowledge HTTP API

## Administration API

Phase 18 exposes versioned, cookie-session-only administration routes under `/api/v1/admin`. Every
route validates strict shared contracts and enforces an active administrator on the server. The
surface includes overview/health, cursor-paginated resource list/detail, source controls,
moderation, queue controls, preserved-history job retry, private sanitized-content reveal, user
suspension/restore, and canonical preview/execute.

Sensitive requests include `confirmation.version`, `action`, exact `target`, operator `reason`, and
the phrase `CONFIRM <action> <target>`. They fail with `fresh_admin_session_required` when the
session is older than 30 minutes and `admin_confirmation_invalid` when action, target, or phrase do
not match. Browser confirmation alone cannot authorize a mutation. All sensitive outcomes are
audited.

Admin responses are safe projections: source content is bounded escaped text; user key data is
prefix/status/scope metadata only; credentials, session tokens, key hashes/plaintext, provider
secrets, connection strings, raw embeddings, and hidden reasoning are absent. Private contribution
detail omits content until `/api/v1/admin/private-content/reveal` verifies a fresh session, the
dedicated capability, a stated reason, and exact confirmation. Only sanitized V2 content can be
returned, with `no-store` caching. See [`ADMIN_OPERATIONS.md`](ADMIN_OPERATIONS.md).

## Scope

Phase 10 exposes safe canonical knowledge through Fastify under `/api/v1`. The transport composes
the reusable authorization and knowledge-access services; route handlers do not query MongoDB or
implement ranking. The API does not expose anonymous knowledge access, private/team retrieval, raw
source documents, embeddings, model internals, individual agent outcomes, or reporter identity.

Phase 11 additionally mounts the authenticated MCP Streamable HTTP endpoint at `/mcp` and a safe
bridge-status endpoint at `/api/v1/mcp/status`. They reuse the same access service and policies
rather than reimplementing routes. See [the MCP guide](MCP.md); `/mcp` is intentionally omitted from
OpenAPI because its wire contract is MCP rather than an ordinary JSON REST route.

OpenAPI 3.1 is available at `/api/v1/openapi.json`. When `API_DOCS_ENABLED=true`, Swagger UI is
available at `/docs/`.

## Authentication and lifecycle access

All knowledge routes accept a Better Auth session or `Authorization: Bearer <KnownPath API key>`.
API keys require `knowledge:read`.

The default access mode is always:

- visibility `public`; and
- lifecycle `published`.

`includeReview: true` is accepted only from an API key whose active owner is an administrator and
whose scopes include `knowledge:read`. It is never inferred from the owner role. Sessions, normal
user keys, missing credentials, and admin keys without explicit review intent cannot read review
records. Inaccessible and nonexistent details both return `knowledge_not_found`.

Every authorized review search/detail/alternatives read appends an `audit_events` record with the
admin user ID, API-key ID, request ID, target, and timestamp. Credentials and unrestricted query or
source content are not included.

## Routes

### User dashboard data

Phase 17 adds cookie-session-only, owner-scoped dashboard DTOs. These routes do not return raw query
text, secret session tokens, API-key hashes, source bodies, embeddings, or individual users' outcome
data:

- `GET /api/v1/account/dashboard` returns 30-day aggregate counts and a bounded safe activity feed.
- `GET /api/v1/account/search-activity` returns safe query dimensions, result counts, and selections
  using an integrity-protected cursor.
- `GET /api/v1/account/contributions` and `GET /api/v1/account/outcomes` return only the current
  owner's sanitized history.
- `PATCH /api/v1/account/profile` updates the display name and records an audit event.
- `GET /api/v1/account/sessions` exposes non-secret session metadata.
  `POST /api/v1/account/sessions/:id/revoke` revokes an owned session by its non-secret ID and is
  audited.

API-key creation and rotation continue to reveal the plaintext key exactly once. The dashboard keeps
that value only in transient component state and requires the user to acknowledge saving it before
closing the reveal dialog.

### Search

`POST /api/v1/knowledge/search` accepts natural-language text plus optional errors, ecosystem,
packages, versions, platforms, environment tokens, context, semantic mode, limit, and minimum score.
Callers cannot provide raw database visibility or status filters.

```sh
curl --request POST http://127.0.0.1:3001/api/v1/knowledge/search \
  --header "Authorization: Bearer $KNOWNPATH_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "text": "EAS build cannot resolve a generated file",
    "errors": ["None of these files exist"],
    "ecosystem": "expo",
    "platforms": ["build"],
    "semanticMode": "optional",
    "limit": 5
  }'
```

An administrator may explicitly inspect review records:

```sh
curl --request POST http://127.0.0.1:3001/api/v1/knowledge/search \
  --header "Authorization: Bearer $KNOWNPATH_ADMIN_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "text": "Expo EAS build ignored file",
    "includeReview": true,
    "minimumScore": 0
  }'
```

The response returns `searchId`, effective access mode, retrieval capability states, and concise
ranked results. Each result includes applicability, caveats, deterministic trust/freshness, version
compatibility, relevance components, penalties, explanations, and bounded safe provenance. It omits
search-document IDs, assessment/candidate IDs, policy digests, embeddings, provider metadata,
content hashes, and raw documents. Privacy-thresholded aggregate outcome verification is included
separately: fewer than three independent reporters produce only `limited`; qualifying aggregates
expose conservative confidence, effective sample size, recent successes, compatibility/staleness
counts, and trend.

Search is deliberately bounded top-k rather than cursor-paginated because the ranking/index corpus
can change between pages.

### Detail

```sh
curl http://127.0.0.1:3001/api/v1/known-paths/KNOWN_PATH_UUID \
  --header "Authorization: Bearer $KNOWNPATH_API_KEY"
```

For an authorized review read, append `?includeReview=true`. Detail returns the generalized problem,
symptoms, normalized errors, applicability, solution variants/steps/caveats, deterministic trust,
freshness, and safe provenance. A provenance item contains only a source ID, canonical link, title,
source type/kind, deterministic authority/publisher classification, relationship, bounded locator,
and bounded excerpt.

### Alternatives

```sh
curl "http://127.0.0.1:3001/api/v1/known-paths/KNOWN_PATH_UUID/alternatives?limit=10" \
  --header "Authorization: Bearer $KNOWNPATH_API_KEY"
```

This route lists additional solution variants already attached to the same canonical problem. It
does not infer cross-record relatedness. `nextCursor` is opaque, integrity-protected, and bound to
the KnownPath; pass it unchanged as `cursor`. Invalid or modified cursors return `invalid_cursor`.

### Selection usage

```sh
curl --request POST \
  http://127.0.0.1:3001/api/v1/knowledge/searches/SEARCH_UUID/selections \
  --header "Authorization: Bearer $KNOWNPATH_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"knownPathId":"KNOWN_PATH_UUID"}'
```

The selected KnownPath must have appeared in that exact principal's search results. A selection is
usage metadata only; it is never interpreted as a successful outcome. The stored event contains a
keyed query digest and bounded filter/result metadata, not raw query text.

### Privacy-safe contribution

`POST /api/v1/contributions` requires an API key with `knowledge:contribute`, a UUID
`clientSubmissionId`, public or private visibility, explicit consent policy version 1, agent-client
metadata, and the structured generalized lesson. It accepts at most 48 KiB. See the inspectable
OpenAPI example/schema and [`CONTRIBUTIONS.md`](CONTRIBUTIONS.md); avoid placing even fake-looking
credentials in shell history when manually exercising it.

`GET /api/v1/contributions/:id` returns only the sanitized record to its owning user/key. Browser
sessions can read or update `ask|disabled` at `/api/v1/account/contribution-settings`; submissions
themselves require a scoped API key. Team submissions fail explicitly.

### Verified outcome

`POST /api/v1/outcomes` requires an API key with both `knowledge:read` and `knowledge:outcome`;
review targets additionally require the normal explicit admin review authorization. The body is
strictly versioned and limited to 24 KiB. A typical attempted report is:

```sh
curl --request POST http://127.0.0.1:3001/api/v1/outcomes \
  --header "Authorization: Bearer $KNOWNPATH_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "contractVersion": 1,
    "clientOutcomeId": "CLIENT_OUTCOME_UUID",
    "clientExecutionId": "CLIENT_EXECUTION_UUID",
    "knownPathId": "KNOWN_PATH_UUID",
    "outcome": "solved",
    "attemptedAt": "2026-08-24T00:00:00.000Z",
    "agentClient": { "name": "codex" },
    "environment": {
      "ecosystem": "expo",
      "packages": [{ "name": "expo", "version": "55.0.0" }],
      "platforms": ["android"],
      "versions": ["expo@55.0.0"],
      "toolchain": ["pnpm"]
    },
    "includeReview": false
  }'
```

Valid states are `solved`, `partially_helped`, `attempted_failed`, `incompatible_environment`,
`stale_or_outdated`, `misleading_or_unsafe`, and `not_used`. `not_used` must omit `attemptedAt` and
has zero evidence weight. See [`OUTCOMES.md`](OUTCOMES.md) for idempotency, privacy, rate limits,
assessment history, and safety policy.

## Errors and limits

Errors retain the stable envelope:

```json
{
  "error": {
    "code": "knowledge_not_found",
    "message": "The requested KnownPath was not found"
  },
  "requestId": "server-generated-uuid"
}
```

Knowledge-specific codes include `knowledge_not_found`, `knowledge_review_access_forbidden`,
`invalid_cursor`, `semantic_retrieval_unavailable`, `search_backend_unavailable`,
`search_event_not_found`, `selection_not_in_results`, `selection_conflict`, and `payload_too_large`.
Contribution codes include `contribution_disabled`, `contribution_consent_required`,
`contribution_content_rejected`, `contribution_idempotency_conflict`,
`team_contributions_not_supported`, and `contribution_owner_forbidden`. Existing
auth/validation/rate-limit codes remain stable. Outcome codes include
`outcome_idempotency_conflict`, `outcome_execution_conflict`, `outcome_rate_limited`,
`outcome_note_rejected`, and `outcome_target_not_accessible`.

Search has a 32 KiB body limit and a 30-request/minute process-local policy. Detail/alternatives
have a 120-request/minute policy. Selection reporting has a separate 120-request/minute policy. The
current limiter is IP-oriented and process-local; a distributed store is deferred until a
multi-instance deployment is introduced. Outcome submission has an additional process-local
10-request/minute route policy plus durable 10-per-key/hour and 20-per-account/day checks in
MongoDB.

## Security notes

- Never place API keys in URLs, examples, source files, or committed environment files.
- Fastify logs method, safe URL, request ID, response status, and latency. Authorization/cookie/key
  fields are redacted and bodies are not logged.
- Normal clients cannot use review records even when they know a review UUID.
- Private/team records are not queryable in Phase 10 and cannot use unpaid Gemini embeddings.
- Rotate any credential that has been pasted into chat, logs, shell history, or another untrusted
  location.

## Official references

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify errors](https://fastify.dev/docs/latest/Reference/Errors/)
- [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/)
- [`@fastify/swagger`](https://github.com/fastify/fastify-swagger)
- [`@fastify/rate-limit`](https://github.com/fastify/fastify-rate-limit)
