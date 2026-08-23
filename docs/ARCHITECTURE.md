# KnownPath Architecture

## Scope

This document describes the intended completed-platform boundaries and the smaller subset
established through Phase 12. A boundary appearing here does not mean its future product behavior is
implemented.

KnownPath will turn high-signal public technical material into reusable, verified engineering
experiences that coding agents can retrieve and evaluate. MongoDB is the primary persistent
database.

## System boundaries

### Applications

- `@knownpath/api` owns Fastify HTTP transport, route composition, request validation, OpenAPI,
  network security policy, and API process lifecycle. It exposes operational health,
  closed-registration session/account/API-key routes, and Phase 10's safe knowledge routes under
  `/api/v1`.
- `@knownpath/worker` owns ingestion and background-process lifecycle. It composes bounded GitHub,
  official-document, and AI extraction commands; it is not yet a scheduler or queue consumer.
- `@knownpath/mcp-server` is the thin local stdio-to-HTTP MCP bridge. The production Streamable HTTP
  transport is hosted by `@knownpath/api`; both use the shared `@knownpath/mcp` contracts.
- `@knownpath/web` owns the future user and administration interface. Phase 1 renders only a static,
  truthful project-status shell.
- `@knownpath/cli` owns the future installer user experience. It does not install or modify agent
  configuration through Phase 12.

### Reusable packages

- `@knownpath/domain` is the framework-independent center. It owns versioned runtime schemas, domain
  entities, value objects, lifecycle values, and deterministic canonicalization helpers.
- `@knownpath/config` is the sole environment-to-typed-config translation boundary.
- `@knownpath/database` owns MongoDB connection lifecycle, collection validators, named indexes,
  idempotent initialization, and repository implementations. Raw collections do not escape this
  package.
- `@knownpath/auth` owns Better Auth composition, API-key cryptography and lifecycle services,
  principal resolution, authorization policies, audit-event creation, and framework-neutral
  rate-limit policy contracts. It does not depend on Fastify.
- `@knownpath/github-ingestion` owns configured GitHub API collection, runtime response validation,
  provider-neutral normalization, incremental cursors, and ingestion-run orchestration.
- `@knownpath/source-ingestion` owns the shared source manifest plus safe official documentation and
  release-feed discovery, conditional fetching, normalization, and synchronization orchestration.
- `@knownpath/ai` owns provider-neutral extraction contracts, privacy enforcement, context assembly,
  versioned prompts, structured validation, Gemini integration, processing budgets, and candidate
  construction.
- `@knownpath/verification` owns deterministic provenance checks, objective evidence signals,
  versioned scoring policy, freshness/version-fit calculation, immutable assessment history, and
  human-readable score explanations.
- `@knownpath/canonicalization` owns technical normalization, deterministic profiles/blocking, pair
  decisions, membership operations, audit history, and canonical rebuilds.
- `@knownpath/search` owns provider-neutral embeddings, public-only Gemini adaptation, materialized
  search projections, local/Atlas retrieval adapters, version fit, explainable hybrid reranking, and
  the transport-independent safe knowledge-access service.
- `@knownpath/agent-adapters` will hold per-agent installer adapter contracts and implementations.
- `@knownpath/typescript-config` publishes reusable strict compiler configurations.

The Agent Skill distribution is the versioned `skills/knownpath` artifact, not an HTTP/UI concern.
It follows the open Agent Skills `SKILL.md` format and progressive-disclosure conventions. Phase 12
ships the canonical instructions and manual installation documentation; automatic installation and
per-agent adapters remain deferred.

## Dependency direction

```text
apps/api ---------+
apps/mcp-server --+--> capability packages ---> packages/domain
apps/cli ---------+              |
apps/web ---------+              +-------------> packages/config
                                 +-------------> packages/database

apps/worker --> packages/github-ingestion --> packages/domain
                       |                    --> packages/config
                       +---------------------> packages/database

apps/worker --> packages/source-ingestion --> packages/domain
                       |                    --> packages/config
                       +---------------------> packages/database

packages/github-ingestion --> packages/source-ingestion (shared manifest contracts only)

apps/worker --> packages/ai --> packages/domain
                  |          --> packages/database
                  +-----------> official Gemini SDK

apps/worker --> packages/verification --> packages/domain
                             +----------> packages/database

apps/worker --> packages/canonicalization --> packages/domain
                              |          --> packages/database
                              +----------> packages/search --> official Gemini SDK

packages/domain ---> no workspace dependencies
packages/auth ----> packages/domain + packages/database + packages/config
packages/* -------> never depend on apps/*
```

Transport layers translate requests and responses; they do not own reusable business rules.
Infrastructure packages implement capabilities defined by inward-facing contracts. The domain layer
must not import Fastify, Next.js, MongoDB, MCP, or provider SDKs. This direction keeps the system
replaceable and prevents circular dependencies.

## Intended completed-platform data flow

The following is a roadmap-level flow, not implemented behavior:

```text
public technical sources
          |
          v
ingestion workers ---> source normalization
          |
          v
AI extraction boundary ---> deterministic scoring and verification
          |                              |
          +------------------------------+
                         |
                         v
                      MongoDB
                         |
                         v
               search and retrieval
                 /       |       \
                v        v        v
              HTTP      MCP    Agent Skill
                         |
                         v
             usefulness/contribution feedback
```

Later phases must define trust enforcement, processing behavior, scoring, retrieval-specific
indexes, and feedback aggregation before implementing this complete flow.

## Current runtime and persistence flow

1. Docker Compose starts only MongoDB and binds it to loopback.
2. Applications and database commands parse their environment through `@knownpath/config`.
3. A process creates one MongoDB client, connects and pings, receives a repository registry, and
   closes the client during shutdown.
4. Database initialization creates/reconciles 24 collections, critical validators, and named indexes
   idempotently, including Better Auth sessions/accounts/verifications and append-only audit events.
5. Repository implementations parse writes and reads through `@knownpath/domain`; applications do
   not access raw collections.
6. The API constructs Better Auth and KnownPath auth services over that same database boundary,
   resolves either HttpOnly cookie sessions or bearer API keys into reusable principals, and applies
   route-specific authorization.
7. The worker composes provider adapters with one source manifest, configuration, and the repository
   registry. GitHub graphs and curated official documents become immutable source items. Mutable
   source-item state holds fetch validators and the latest snapshot pointer without rewriting
   provenance history.
8. The worker can assemble bounded public-only evidence contexts and invoke the configured Gemini
   provider. Strict output and provenance validation either create a candidate, record an objective
   non-solution classification, quarantine invalid output, or block disallowed visibility before any
   outbound call.
9. The worker can resolve a candidate back to immutable source snapshots, verify objective metadata,
   and append an immutable deterministic assessment. The candidate's latest pointer is updated only
   after the assessment exists; prior assessments remain unchanged.
10. The worker can create immutable technical-similarity profiles, find plausible pairs through
    indexed deterministic blocking, optionally embed only public candidates/sources, and persist an
    explainable pair decision. Strong deterministic gates alone authorize automatic merging.
11. Canonical membership operations append audit events, rebuild immutable KnownPath revisions, and
    update a stable current projection. Split/reassign operations never delete candidates or
    history.
12. The worker materializes versioned search documents from canonical revisions. Local MongoDB
    supplies exact/error and weighted-text retrieval; configured Atlas deployments add separately
    managed lexical/vector channels before deterministic trust/version/freshness reranking.
13. Fastify validates and authenticates versioned knowledge requests, then delegates to the shared
    knowledge-access service. Published public records are the default; explicit review reads
    require an admin-owned scoped API key and append audit events. Responses use safe view contracts
    rather than persisted schemas.
14. Search execution/selection metadata is stored separately from outcomes with a keyed query
    digest. Fastify also exposes health, account/API-key/session routes, OpenAPI JSON, and optional
    Swagger UI.
15. MCP exposes the same knowledge service through four bounded read tools. The portable Agent Skill
    teaches compatible clients when and how to use those tools, while preserving repository
    authority, privacy, and local verification. Dashboard and automatic installer behavior remain
    deferred.

## Configuration and secrets

`.env.example` documents all variables known through Phase 7. `.env` and variant files are ignored.
MongoDB runs without authentication only in the loopback-bound local Compose environment. Better
Auth and API-key HMAC secrets are required and have no committed default. Production startup rejects
an HTTP Better Auth base URL. CORS origins, trusted auth origins, proxy addresses, docs exposure,
cookie security, and rate-limit settings are explicit configuration rather than framework defaults.

Invalid configuration fails before an application starts. Database callers supply a validated
`MongoConfig`; only command entry points read process globals. The reusable database layer receives
configuration explicitly.

`GITHUB_TOKEN` has no committed default and is never logged. Public REST collection can operate
without it at GitHub's lower limit. Discussions require authenticated GraphQL and are reported as a
skipped capability when the token is absent.

`GEMINI_API_KEY` has no committed default and is never logged. Phase 6's provider capability and
environment policy are both `public_only`; private/team input blocks before provider construction.
Model, request, retry, spacing, and token/call/target budgets are centralized configuration.

Search defaults to the local non-vector backend. Atlas index names/readiness timeout and the
embedding model/version/dimensions are explicit environment configuration. A private/team query or
projection cannot silently use the unpaid public provider.

## Phase 2 persistence boundary

MongoDB contains separate collections for users, API keys, source registries, immutable source
items, ingestion runs, candidate experiences, KnownPaths, agent contributions, and agent outcomes.
Bounded evidence, solution, ecosystem/environment, score, visibility, moderation, freshness, and
search metadata are embedded for locality. Entities with independent growth or lifecycle remain
referenced.

Zod schemas are the full runtime authority. MongoDB validators enforce critical stored envelopes as
defense in depth. Provider-neutral embedding state exists in the domain, but vectors and vector
indexes do not. See [`docs/DATA_MODEL.md`](DATA_MODEL.md).

## Phase 3 authentication and HTTP boundary

Human identity uses Better Auth with its official MongoDB adapter and database-backed cookie
sessions. Public registration is disabled. The only user provisioning path is the masked
`pnpm auth:user:create` CLI, which calls Better Auth's server-side creation service so password
hashing and persistence hooks are identical to future framework-managed flows. Public signup,
verification, reset, OAuth, and administrative user-management routes are not mounted.

KnownPath owns agent/MCP API keys because their capability vocabulary and lifecycle belong to the
product domain. Keys have a public `kp_...` identifier plus 32 random secret bytes. The full value
is returned once; MongoDB stores only the identifier and an HMAC-SHA-256 digest protected by a
required pepper. Key management requires a human session. Bearer keys can authenticate allowed
machine routes only when their owner is active and the required scope is present.

Authentication produces an anonymous, session, or API-key principal. Framework-neutral policy
functions implement authenticated, session-only, scoped, and administrator checks so future MCP and
CLI transports can reuse the same decisions. Team/workspace context remains an additive future
principal field rather than a route-layer redesign.

Fastify supplies server-generated request IDs, Zod request/response schemas, a stable error
envelope, credential-safe structured logs, CORS allowlists, explicit proxy trust, security headers,
and a patched per-process rate limiter. The limiter boundary can receive distributed storage later;
Phase 10 intentionally adds no Redis or Valkey. Sensitive actions append bounded `audit_events`
without credentials. OpenAPI 3.1 is generated from route schemas at `/api/v1/openapi.json`; Swagger
UI is configuration-controlled at `/docs`.

## Phase 4 GitHub ingestion boundary

The versioned manifest at `config/sources/registry.json` identifies the initial Expo and React
Native repositories and supported source types. The worker verifies repository identity/capabilities
and uses Octokit against GitHub's official REST and GraphQL APIs. Requests are serial, paginated,
time bounded, retried with bounded backoff, and expose only safe rate telemetry to logs.

Issue threads use REST for issues, comments, labels, and reactions, with GraphQL enrichment for
closing pull requests when authenticated. Discussions use authenticated GraphQL for discussions,
answer state, comments/replies, and reactions. All response shapes are runtime validated and all
source text remains explicitly untrusted data.

Each issue, discussion, comment, and reply becomes its own immutable source snapshot. Parent/root
identities retain thread structure; provider metadata retains GitHub IDs, node IDs, association,
labels, reactions, state, and timestamps. Content hashes and unique deduplication keys make overlap
and reruns safe. Source-registry cursors track each source type independently; a default overlap
window catches late edits. Cursors advance only after all discovered objects persist successfully.
See [`docs/GITHUB_INGESTION.md`](GITHUB_INGESTION.md).

## Phase 5 official source ingestion boundary

The same versioned registry now uses discriminated `github_repository`, `documentation_site`, and
`release_feed` definitions. Expo and React Native documentation adapters discover their complete
official `llms.txt` indexes, enrich canonical URLs from sitemaps where available, and normally fetch
only configurable high-signal upgrade, migration, troubleshooting, compatibility, deprecation, and
breaking-change pages. Any indexed page remains available through an explicit targeted command;
bounded full-catalog synchronization is opt-in.

Official release material comes from Expo and React Native RSS feeds. Expo stores only metadata and
the summary supplied by its feed; React Native stores feed-supplied article content normalized to
plain text. General website HTML crawling is absent. Every request is HTTPS/origin allowlisted,
robots-aware, redirect validated, size/time bounded, serial, and conditionally fetched where the
source supplies ETag or Last-Modified.

`source_items` remains immutable. `source_item_states` is the mutable synchronization projection for
latest snapshot pointers, lifecycle, content hashes, validators, and fetch/change timestamps. A
`304` or stable normalized digest updates fetch state without creating a new snapshot. Deterministic
registry metadata classifies official documents as first-party evidence; GitHub author association
classifies maintainer versus community evidence without LLM inference. See
[`docs/OFFICIAL_SOURCE_INGESTION.md`](OFFICIAL_SOURCE_INGESTION.md).

## Phase 6 AI extraction boundary

Extraction starts from immutable source snapshots, never directly from network responses. GitHub
comments are reassembled around their latest thread root while official documents retain normalized
block structure. Complete evidence items are selected deterministically within a configured context
budget; roots and high-signal confirmations are never silently truncated. Context, prompt, schema,
provider, model, and generation settings are all versioned or digested for reproducible idempotency.

The real provider is Gemini through Google's official SDK and Interactions API. Requests disable
server-side interaction storage, tools, and thinking summaries. All source text is labeled untrusted
quoted evidence. The free/public provider path rejects a private/team registry, requested item, or
selected context item before provider creation, with no fallback.

Gemini returns a strict structured classification and candidate interpretation. Zod validation,
known-ID checks, exact-excerpt matching, and deterministic canonicalization run before persistence.
Only a grounded `reusable` result creates a candidate. Confidence/freshness scoring and verification
labels remain uncalculated/unverified for Phase 7. Operational history lives in the independent
`extraction_attempts` collection. See [`docs/AI_EXTRACTION.md`](AI_EXTRACTION.md).

## Phase 7 deterministic verification boundary

Verification starts from a persisted candidate and resolves all evidence references through the
repository layer. Missing sources or mismatched digests, URLs, excerpts, or visibility produce an
immutable ineligible assessment at score 0. GitHub authority, selected-answer state, closure, merged
closing pull requests, and reactions come only from captured provider metadata. First-party status
comes only from deterministic source classification. Model labels are suggestions until
independently verified.

`@knownpath/verification` computes source evidence, freshness, and version fit independently. The
0–100 result is a ranking score, not probability. Weak temporal/popularity signals are capped;
conflicts, unsupported claims, weak confirmation, and staleness are explicit penalties/caps. Agent
outcomes remain an unobserved, separate component so a future statistically conservative outcome
model can overtake seed evidence without rewriting it.

Assessments are append-only and include exact inputs, signals, versions, policy digest, score
breakdown, reason codes, and explanations. A candidate's `latestAssessmentId` is only a fast
pointer. See [`docs/SCORING.md`](SCORING.md).

## Phase 8 canonicalization boundary

Canonicalization starts only from candidates with immutable Phase 7 assessments. A versioned
normalizer preserves technical identifiers while replacing recognized transient paths, UUIDs,
timestamps, stack locations, and build IDs. Immutable profiles expose multiple indexed blocking
keys; ordinary processing never compares the full Cartesian product.

Blocked pairs receive deterministic ecosystem/package/platform/version/error/root-cause checks and
separate lexical problem/solution similarities. Hard incompatibilities remain separate. Ambiguous
pairs enter review. The public Gemini embedding provider is constructed only after candidate and
every referenced source are verified public; semantic similarity can strengthen or prioritize but
cannot authorize an automatic merge. No vector index or retrieval API exists.

Current candidate relationships live in `canonical_memberships`. Append-only events make create,
merge, split, reassign, and rebuild operations resumable on standalone local MongoDB. Every rebuild
first creates/reuses an immutable `known_path_revisions` snapshot and then updates the stable
`known_paths` projection. Multiple solution variants, all evidence excerpts, contributing assessment
IDs, and conflicts remain inspectable. See [`docs/CANONICALIZATION.md`](CANONICALIZATION.md).

## Phase 9 retrieval boundary

Search reads a rebuildable `known_path_search_documents` projection rather than joining canonical
history during every query. Deterministic error and metadata blocking runs first. Local MongoDB adds
a weighted text channel; Atlas configuration adds MongoDB Search lexical and Vector Search channels.
Application-side reranking then combines relevance with version compatibility, immutable trust
assessments, freshness, outcomes, conflict, moderation, and lifecycle signals.

The retrieval policy is versioned and digest-addressed. Results expose component scores, penalties,
caps, reason codes, and capability state. Vector similarity is never the sole rank and cannot erase
an explicit incompatibility. Published records are the default query scope; review records require
an explicit developer option.

The unpaid Gemini provider remains public-only for both document and query embeddings. Local
contributors retain useful non-vector retrieval without Atlas or paid infrastructure. Search is
available through the worker/developer CLI and is now exposed through the authorization-aware HTTP
knowledge service. MCP exposure remains a later phase. See [`docs/RETRIEVAL.md`](RETRIEVAL.md) and
[`docs/API.md`](API.md).

## Phase 10 knowledge API boundary

Fastify exposes search, canonical detail, solution alternatives, and result-selection reporting
under `/api/v1`. Shared versioned Zod contracts describe client concepts rather than MongoDB fields.
Response schemas are allowlists: raw source bodies, embeddings, provider/model internals, hashes,
assessment/candidate IDs, audit metadata, and private/team fields never leave the API.

`@knownpath/auth` centrally derives a knowledge-access authorization from a session or API-key
principal. Normal clients receive only public `published` records. Review access is explicit and
requires an admin-owned API key with `knowledge:read`; admin sessions are insufficient. Inaccessible
review details are indistinguishable from nonexistent IDs. Every allowed review query/read is
audited with its user/key/request identity.

`@knownpath/search` translates the safe request to the retrieval query, enforces the authorized
lifecycle set again, builds safe applicability/trust/freshness/provenance views, signs alternative
cursors, and records bounded usage. `knowledge_search_events` stores a keyed query digest and the
returned/selected IDs; a selection never becomes an `agent_outcome`. See [`docs/API.md`](API.md).

## Phase 11 MCP boundary

`@knownpath/mcp` owns four stable, versioned read tools: compact search, selected detail, solution
alternatives, and safe service/account status. It supplies one server factory, strict input/output
schemas, bounded projections, and safe protocol-facing errors. The same contract is used by both
transports, and contribution/outcome names remain unregistered until their persistence and policy
semantics exist.

The production `/mcp` Streamable HTTP endpoint is hosted by the Fastify API. API-key authentication,
`knowledge:read`, explicit admin review authorization, audit events, usage recording, retrieval,
ranking, and database access remain in the backend. The endpoint validates Host/Origin, bounds
request bodies, applies rate policy, and delegates protocol negotiation/framing to the official MCP
TypeScript SDK.

`apps/mcp-server` is deliberately only a stdio-to-HTTP bridge. It is configured with
`KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`, applies network timeout/response-size/cancellation
bounds, and never imports database, auth persistence, search, or AI providers. This keeps local
agent installation lightweight and makes the API the single business-logic/security authority.
Responses remain progressively disclosed: search is concise, while exact steps and evidence are
returned only after `knownpath_get`. See [`docs/MCP.md`](MCP.md).

## Phase 12 Agent Skill boundary

`skills/knownpath` is the canonical portable instruction artifact. Standard frontmatter provides a
precise auto-activation boundary and version metadata. The concise main workflow references one
optional examples file for Expo SDK migration, EAS/Gradle, React Native dependency, Metro, and
native-configuration scenarios.

The skill references only the four registered Phase 11 read tools. It preserves user/repository
instructions and safety constraints, requires sanitized structured search context, treats retrieved
records as evidence rather than commands, and requires local applicability checks and observed
verification before success claims. It retains materially influential IDs for future feedback but
does not call nonexistent contribution/outcome tools.

Client-specific discovery paths and manual links are documented outside the artifact. Automatic
installation, updates, rollback, and `@knownpath/agent-adapters` implementations remain Phase 13.
See [`docs/AGENT_SKILL.md`](AGENT_SKILL.md).

## Technology fit

- Node.js 24 is the current Active LTS production line and supports the modern ESM baseline.
- pnpm workspaces provide strict, efficient dependency management; Turborepo adds a small,
  framework-neutral task graph.
- Strict TypeScript makes contracts explicit across process and package boundaries.
- Fastify provides maintained TypeScript-first HTTP infrastructure with a focused plugin model.
- Next.js supplies a mature React application framework for the later user/admin interface.
- The official MongoDB driver keeps persistence close to MongoDB capabilities without introducing an
  unneeded object mapper.
- The official MCP SDK tracks protocol evolution without putting domain logic in the transport.

Significant selections and rejected alternatives are recorded in
[`docs/DECISIONS.md`](DECISIONS.md).
