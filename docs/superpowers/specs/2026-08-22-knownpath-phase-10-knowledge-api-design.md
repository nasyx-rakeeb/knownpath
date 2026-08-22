# KnownPath Phase 10 Knowledge API Design

Date: 2026-08-22
Status: Approved

## Goal

Expose KnownPath retrieval through a stable, versioned HTTP API for future MCP, web, CLI, and
integration clients without moving retrieval or authorization policy into route handlers. The API
must return concise, safe knowledge views rather than persisted domain records or source dumps.

Phase 10 does not add ingestion, extraction, scoring, canonicalization, outcome interpretation,
public anonymous access, team/private retrieval, or Phase 11 functionality.

## Current constraints

- Fastify 5 is the established HTTP framework and `/api/v1` is the established URL version boundary.
- Zod runtime schemas and `fastify-type-provider-zod` provide request and response validation.
- Authentication supports browser sessions and hashed bearer API keys.
- `knowledge:read` already exists as a closed API-key scope.
- The retrieval engine supports deterministic, lexical, and optional Atlas vector channels with an
  explainable deterministic reranker.
- The development Atlas dataset contains two real public-visibility KnownPaths in `review` state and
  no published KnownPaths.
- Review records must not be changed to `published` for verification.

## Researched platform guidance

The design follows current official guidance available on 2026-08-22:

- Fastify route schemas validate inputs and response schemas constrain serialization. Database
  access belongs in hooks or services, not validators.
- Fastify centralized error handling and request IDs provide a stable client and observability
  boundary.
- Fastify/Pino redaction prevents credential headers and cookies from entering logs.
- `@fastify/swagger` 9 supports Fastify 5 and derives OpenAPI from route schemas when registered
  before routes.
- `@fastify/rate-limit` 10 or later supports Fastify 5 and allows per-route policies; its in-memory
  store is suitable only for the current single-process development baseline.
- URL-based major versioning remains `/api/v1`; header negotiation is not introduced because it
  would add cache `Vary` requirements without a present need.

Official references:

- <https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/>
- <https://fastify.dev/docs/latest/Reference/Errors/>
- <https://fastify.dev/docs/latest/Reference/Logging/>
- <https://fastify.dev/docs/latest/Reference/Routes/>
- <https://github.com/fastify/fastify-swagger>
- <https://github.com/fastify/fastify-rate-limit>
- <https://www.rfc-editor.org/rfc/rfc9457>

KnownPath retains its existing stable error envelope instead of switching Phase 3 clients to RFC
9457 during this phase.

## Chosen architecture

### Shared contracts

Versioned Zod request and safe-response schemas live in the shared domain/contracts layer. The
schemas describe client concepts rather than MongoDB fields:

- search text and structured technical context;
- explicit review-access intent;
- concise ranked knowledge results;
- canonical detail and solution alternatives;
- safe provenance summaries;
- usage/selection reporting;
- opaque cursor envelopes; and
- stable knowledge API error codes.

Persisted `KnownPath`, revision, search-document, source-item, candidate, assessment, and embedding
schemas are not used as HTTP response schemas.

### Application service

A reusable knowledge-access service sits above retrieval and repositories. Fastify handlers only
authenticate, validate, construct an access context, invoke this service, and return its safe view
models.

The service owns:

- retrieval query translation;
- lifecycle and visibility enforcement;
- safe result/detail/provenance projection;
- alternative-solution pagination;
- review-access auditing; and
- search/selection usage recording.

This service is transport-independent so the future MCP server and CLI can reuse the same
authorization-aware knowledge boundary.

### Authorization policy

A centralized reusable knowledge-access policy derives capabilities from the authenticated
principal.

Normal sessions and API keys may access only records where:

- visibility is `public`; and
- lifecycle status is `published`.

Review access requires all of the following:

- bearer authentication using an API key;
- the key owner is an active administrator;
- the key includes `knowledge:read`; and
- the request explicitly asks for review records.

Admin ownership alone does not change the default. Admin sessions and admin keys without explicit
review intent remain published-only. Private/team records remain excluded.

An inaccessible or nonexistent record produces the same `knowledge_not_found` response so lifecycle
visibility cannot be enumerated. Every authorized review search or detail access records an
immutable audit event with actor user ID, API-key ID, action, request ID, timestamp, and bounded
target/query context. Credentials and unrestricted query/source text are never included.

### Routes

#### `POST /api/v1/knowledge/search`

Accepts a bounded body containing:

- natural-language problem text;
- error messages;
- ecosystem and package names;
- version constraints;
- platforms and environment/toolchain context;
- semantic retrieval preference;
- result limit and minimum quality; and
- `includeReview`, defaulting to `false`.

The service forces public visibility and derives allowed statuses from authorization; callers cannot
submit raw visibility or lifecycle arrays. Results contain safe summaries, applicability, caveats,
overall relevance, version compatibility, trust/freshness indicators, reason codes, concise
explanations, matched retrieval channels, and provenance links. Internal search-document IDs,
assessment IDs, embedding metadata/vectors, provider internals, policy digests, and raw documents
are omitted.

Search returns a server-generated `searchId` for later selection reporting. Search result limits are
bounded rather than cursor-paginated because ranking is a top-k operation and a later page could
change as the corpus or index changes.

#### `GET /api/v1/known-paths/:knownPathId`

Returns the latest safe canonical view: problem, symptoms, normalized error signatures,
applicability, solution variants, steps, caveats, lifecycle, trust/freshness summaries,
moderation-safe public status, and deduplicated safe provenance.

Provenance contains a source reference identifier, canonical/attribution URL, title when available,
source type, authority classification, relationship, bounded locator, and bounded evidence excerpt.
It excludes raw content, structured blocks, provider metadata, author private fields, hashes,
internal audit data, and extraction/model reasoning.

#### `GET /api/v1/known-paths/:knownPathId/alternatives`

Returns additional valid solution variants already represented by the same canonical problem. It
does not invent cross-record relationships from semantic similarity. Items use stable ordering and
an opaque, validated cursor. The cursor encodes only the continuation key and contract version and
is integrity-protected so clients cannot inject database fields.

Cross-KnownPath related-record discovery is deferred until the canonical model contains an explicit
relationship or the retrieval contract defines a reviewed relatedness policy.

#### `POST /api/v1/knowledge/searches/:searchId/selections`

Records that an authenticated caller selected a result returned by a prior search. Selection is
usage metadata, not evidence that the solution succeeded. The endpoint verifies that the selected
KnownPath appeared in that principal's bounded search result set.

Stored usage records contain IDs, actor/API-key identity, timestamps, request IDs, structured filter
summaries, a keyed or versioned digest of normalized query material, returned KnownPath
IDs/ranks/scores, and the optional selected result. They do not contain API keys, credentials,
embeddings, raw source content, or an outcome classification.

## Persistence additions

Add an append-oriented `knowledge_search_events` collection with a versioned runtime schema and
repository abstraction. One event represents a search execution and may receive a bounded selection
transition without becoming an agent outcome.

Indexes support:

- unique search event ID;
- actor plus creation time;
- API key plus creation time;
- request ID correlation;
- selected KnownPath plus selection time; and
- optional operational expiration only if a documented retention policy is chosen.

Review reads remain in the existing immutable audit-event stream. Search usage and security auditing
remain distinct because they have different purposes and retention expectations.

## Error contract

The existing envelope remains:

```json
{
  "error": {
    "code": "knowledge_not_found",
    "message": "The requested KnownPath was not found"
  },
  "requestId": "..."
}
```

Phase 10 adds stable codes where applicable:

- `knowledge_not_found`
- `knowledge_review_access_forbidden`
- `invalid_cursor`
- `search_backend_unavailable`
- `semantic_retrieval_unavailable`
- `search_event_not_found`
- `selection_not_in_results`
- `payload_too_large`

Validation errors continue using `validation_failed`. Authentication and API-key scope failures
continue using Phase 3 codes.

## Rate limits and request safety

New named rate-policy boundaries cover knowledge search, knowledge reads, and usage reporting. The
current implementation remains per-process and IP-oriented; distributed/principal-aware enforcement
can later replace the store without changing route metadata.

Search receives the strictest route limit because it can invoke Atlas Search and Gemini query
embeddings. Detail/alternatives receive a higher read limit. Selection reporting is bounded
separately.

Fastify receives explicit route body limits. Oversized bodies map to `payload_too_large`. All
request schemas are strict and bounded. Logs continue redacting authorization, cookies,
password/token/key fields and log only safe error metadata. Request IDs are returned and persisted
where needed for traceability.

## OpenAPI and documentation

OpenAPI 3.1 documents the authentication model, review-access restriction, route-specific rate
behavior, stable errors, and realistic Expo/React Native examples. Response schemas are complete
enough to act as allowlists.

Contributor documentation includes curl examples for:

- published-only search;
- explicit admin review search;
- detail and alternatives;
- selection reporting; and
- common error responses.

No example contains a real credential.

## Verification strategy

No automated tests are added. Verification will:

1. run formatting validation, lint, typecheck, and build;
2. initialize Atlas changes idempotently;
3. create a temporary development administrator through the existing safe CLI;
4. boot the API with generated local-only secrets;
5. issue an admin-owned `knowledge:read` API key;
6. prove default search returns no review records;
7. prove explicit review search returns the two existing real review records without publishing
   them;
8. fetch one record and inspect its safe response;
9. exercise alternatives and selection reporting;
10. verify invalid input, invalid/revoked key, nonexistent ID, forbidden review access, and
    oversized payload behavior;
11. inspect audit/usage persistence and logs for credential or internal-field leakage;
12. inspect OpenAPI output; and
13. revoke the temporary key and remove temporary verification account data where safe and
    supported.

The Gemini and Atlas credentials previously shared in conversation are treated as exposed secrets:
they are used only from ignored local environment configuration and never written to tracked files
or output.

## Rejected alternatives

### Separate admin route tree

A separate `/api/v1/admin/...` retrieval surface makes access visually obvious but duplicates
contracts, handlers, pagination, mapping, and future MCP behavior. Central policy plus explicit
intent offers the same security boundary with less drift.

### Development-only review bypass

A feature flag or local bypass would create a temporary path that later needs removal and risks
escaping into production. Durable admin-key authorization provides a real moderation primitive
instead.

### Publishing review records for verification

Changing lifecycle state would misrepresent evidence quality and violate the canonical review
workflow. Phase 10 must verify access controls against the records in their actual state.

### Returning persistence schemas directly

This would leak embeddings, model metadata, internal IDs, hashes, moderation details, and source
payloads while coupling clients to storage. Dedicated allowlisted response contracts are required.

### Anonymous public API now

Anonymous access is deferred. The current single-process rate limiter is not a sufficient
public-abuse boundary, and no published records presently exist. Authenticated access establishes a
safer initial contract.
