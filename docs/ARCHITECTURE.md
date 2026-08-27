# KnownPath Architecture

## Scope

This document describes the intended completed-platform boundaries and the smaller subset
established through Phase 18. A boundary appearing here does not mean its future product behavior is
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
- `@knownpath/worker` owns background-process lifecycle. It runs bounded manual commands and the
  BullMQ consumers that operationalize ingestion, extraction, scoring, canonicalization, projection,
  contribution, outcome, and maintenance jobs.
- `@knownpath/mcp-server` is the thin local stdio-to-HTTP MCP bridge. The production Streamable HTTP
  transport is hosted by `@knownpath/api`; both use the shared `@knownpath/mcp` contracts.
- `@knownpath/web` owns the developer dashboard, public product introduction, and server-guarded
  Phase 18 administration console. Its server-first Next.js routes consume safe API DTOs through a
  narrow same-origin bridge. It owns no ranking, authorization, contribution, session, moderation,
  or queue business logic.
- `knownpath` is the publishable installer CLI. It owns interactive/machine-readable presentation,
  packages the canonical skill, and exposes the thin `mcp` stdio command; it delegates all
  client-specific behavior to `@knownpath/agent-adapters`.

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
- `@knownpath/contributions` owns pre-persistence sanitization, consent/idempotency processing,
  private-provider gates, low-trust candidate projection, and safe developer inspection.
- `@knownpath/privacy` owns reusable boundary text normalization, Secretlint scanning, and narrow
  PII/path/credential redaction used by contributions and outcome notes.
- `@knownpath/outcomes` owns authenticated observed-result ingestion, durable abuse controls,
  immutable reliability assessments, safety events, trend detection, and recomputation commands.
- `@knownpath/jobs` is the sole BullMQ/Valkey boundary. It owns typed dispatch, queue topology,
  retries, rate limits, schedules, graceful shutdown, and durable operational status projection.
- `@knownpath/pipelines` composes existing domain services into idempotent job handlers and bounded
  downstream chains without importing transport or queue implementation details.
- `@knownpath/search` owns provider-neutral embeddings, public-only Gemini adaptation, materialized
  search projections, local/Atlas retrieval adapters, version fit, explainable hybrid reranking, and
  the transport-independent safe knowledge-access service.
- `@knownpath/agent-adapters` owns client detection, merge-safe MCP configuration, canonical skill
  installation, backups, ownership state, status/doctor checks, updates, and uninstall behavior.
- `@knownpath/workspaces` owns workspace lifecycle, live membership and role authorization,
  existing-user invitations, and tenant administration services.
- `@knownpath/typescript-config` publishes reusable strict compiler configurations.

The Agent Skill distribution is the versioned `skills/knownpath` artifact, not an HTTP/UI concern.
It follows the open Agent Skills `SKILL.md` format and progressive-disclosure conventions. Phase 13
packages this one artifact into the installer rather than maintaining client-specific copies.

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

apps/worker --> packages/pipelines --> capability packages
                    +-------------> packages/jobs --> BullMQ --> Valkey
packages/jobs --> packages/database --> MongoDB

packages/domain ---> no workspace dependencies
packages/auth ----> packages/domain + packages/database + packages/config
packages/workspaces --> packages/auth + packages/domain + packages/database
packages/* -------> never depend on apps/*
```

Transport layers translate requests and responses; they do not own reusable business rules.
Infrastructure packages implement capabilities defined by inward-facing contracts. The domain layer
must not import Fastify, Next.js, MongoDB, MCP, or provider SDKs. This direction keeps the system
replaceable and prevents circular dependencies.

The dashboard never connects to MongoDB and never receives provider credentials. Browser mutations
use an allowlisted `/api/knownpath/*` bridge that forwards only cookie, content type, user agent,
and safe response headers to `KNOWNPATH_API_URL`; it refuses arbitrary API paths and never forwards
an Authorization header. Fastify remains the authority for session validity, owner scoping,
visibility, rate policies, audit events, and response serialization. See
[the dashboard guide](DASHBOARD.md).

The `/admin` route group uses the same bridge through an explicit administration allowlist. Fastify
projects safe operational DTOs and centrally enforces admin capabilities. Sensitive mutations also
require a session no older than 30 minutes, an exact target confirmation, and a reason. MongoDB
repositories, BullMQ controls, canonicalization primitives, and audit writes remain behind an
administration application service; Next.js never invokes them directly. Private contribution
content is hidden by default and can reveal only the persisted sanitized payload through a distinct
fresh-admin capability. See [the administration runbook](ADMIN_OPERATIONS.md).

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

1. Docker Compose provides loopback-bound Valkey for queues and an optional loopback MongoDB for
   contributors not using Atlas.
2. Applications and database commands parse their environment through `@knownpath/config`.
3. A process creates one MongoDB client, connects and pings, receives a repository registry, and
   closes the client during shutdown.
4. Database initialization creates/reconciles 29 collections, critical validators, and named indexes
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
15. MCP exposes the same knowledge service through four bounded read tools plus consented
    contribution and observed-outcome writes. The portable Agent Skill teaches compatible clients
    when and how to use them while preserving repository authority, privacy, and local verification.
16. Outcome submission stores immutable private reports, recomputes immutable time-decayed Wilson
    assessments, advances only the KnownPath latest pointer, and queues safety review separately.
    Search projections include privacy-thresholded aggregates and versioned ranking components.
17. The installer detects supported agents and configures `npx -y knownpath mcp` plus the canonical
    skill. Config files contain only references to `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`;
    retrieval and authorization remain centralized in the API. Dashboard behavior remains deferred.
18. BullMQ consumers run six workload-isolated queues. MongoDB stores pipeline intent before
    dispatch; source-specific schedulers, retries with jitter, global provider limits, stalled-job
    recovery, reconciliation, quarantine, heartbeats, and graceful shutdown are centralized in
    `@knownpath/jobs` and composed through `@knownpath/pipelines`.

## Configuration and secrets

`.env.example` documents all variables known through Phase 16. `.env` and variant files are ignored.
MongoDB runs without authentication only in the loopback-bound local Compose environment. Better
Auth and API-key HMAC secrets are required and have no committed default. Production startup rejects
an HTTP Better Auth base URL. CORS origins, trusted auth origins, proxy addresses, docs exposure,
cookie security, and rate-limit settings are explicit configuration rather than framework defaults.

Invalid configuration fails before an application starts. Database callers supply a validated
`MongoConfig`; only command entry points read process globals. The reusable database layer receives
configuration explicitly.

Valkey is auxiliary, not a product datastore. MongoDB records pipeline intent before dispatch and
retains auditable run/step history. Valkey owns only queue delivery, scheduler state, retries,
provider rate limiting, locks, and ephemeral worker coordination. API reads remain available when
queues are disabled or degraded; workers require Valkey. See [OPERATIONS.md](OPERATIONS.md).

`GITHUB_TOKEN` has no committed default and is never logged. Public REST collection can operate
without it at GitHub's lower limit. Discussions require authenticated GraphQL and are reported as a
skipped capability when the token is absent.

`GEMINI_API_KEY` has no committed default and is never logged. Phase 6's provider capability and
environment policy are both `public_only`; private/team input blocks before provider construction.
Model, request, retry, spacing, and token/call/target budgets are centralized configuration.

Search defaults to the local non-vector backend. Atlas index names/readiness timeout and the
embedding model/version/dimensions are explicit environment configuration. A private/team query or
projection cannot silently use the unpaid public provider.

The installer requires `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` in the launching environment. It
has no URL default and stores only provider-specific references to these names. Its state file holds
non-secret ownership/digest/version metadata. Agent configs are backed up before mutation, comments
and unknown fields are preserved where their documented format permits, and conflicting unmanaged
entries stop rather than being overwritten. The stdio bridge remains a client of the HTTP API and
receives no database or AI-provider configuration.

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

`@knownpath/mcp` owns four stable read tools plus the consented `knownpath_contribute` and observed
`knownpath_report_outcome` additive writes. It supplies one server factory, strict input/output
schemas, bounded projections, and safe protocol-facing errors. The same contract is used by both
transports; write authorization and business logic remain in the API.

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

The skill references the registered retrieval/status tools, `knownpath_contribute`, and
`knownpath_report_outcome`. It preserves user/repository instructions and safety constraints,
requires sanitized structured search context, treats retrieved records as evidence rather than
commands, and requires local applicability checks and observed verification before success claims.
It offers contribution only after success and explicit consent, retains materially influential IDs,
and reports a result only after an actual attempt is known. Search/view/selection never becomes a
success claim.

Client-specific discovery paths and manual links are documented outside the artifact. Automatic
Phase 13's installer owns installation, update, inspection, and reversible removal. The skill stays
transport- and client-neutral.

## Phase 13 installer boundary

The `knownpath` CLI supports `install`, `status`, `update`, `uninstall`, `doctor`, and the internal
`mcp` bridge command. An adapter describes Codex CLI, Claude Code, Cursor, Gemini CLI, or OpenCode
without importing API/database/retrieval code. Global paths follow the current client and operating
system conventions; project paths remain inside the selected repository.

Claude Code and Gemini CLI use official MCP mutation commands when installed. Codex uses a bounded
managed TOML block because its current CLI cannot express inherited environment-variable references.
Cursor and OpenCode use documented JSON/JSONC structures. Structural edits preserve unrelated
fields/comments, existing files are backed up, writes are atomic, and a separate state record makes
ownership explicit. A matching pre-existing artifact is unmanaged; an incompatible `knownpath` entry
is a conflict. This prevents install/update/uninstall from claiming or deleting user work.

Codex, Cursor, Gemini CLI, and OpenCode share the open `.agents/skills/knownpath` location; Claude
uses its documented `.claude/skills/knownpath` path. Shared removal happens only once after selected
installer owners are removed. The CLI bundles the canonical source artifact during build, so all
adapters receive identical instructions and version metadata. See
[`docs/INSTALLER.md`](INSTALLER.md). See [`docs/AGENT_SKILL.md`](AGENT_SKILL.md).

## Phase 14 contribution boundary

`@knownpath/contributions` accepts only strict, consented, generalized public, owner-private, or
workspace-scoped lessons. Sanitized structured content becomes immutable source/candidate/assessment
provenance at a low self-report trust cap; it never publishes canonical truth directly. Private and
workspace records cannot cross a public/unpaid provider boundary. See
[`docs/CONTRIBUTIONS.md`](CONTRIBUTIONS.md).

## Phase 15 outcome boundary

`@knownpath/outcomes` accepts one observed state per account/execution, stores every report
privately and immutably, and caps influence per account/KnownPath/version/30-day window. Durable
per-key and per-account limits complement the HTTP policy. Optional notes pass through the shared
privacy sanitizer; raw code, prompts, and chain-of-thought are outside the contract.

Each deterministic recomputation appends an immutable `known_path_outcome_assessments` record with
input IDs, algorithm/policy versions, time-decayed effective sample size, Wilson lower bounds,
version distribution, trend, penalties, and explanations. `known_paths.latestOutcomeAssessmentId` is
only a fast pointer. Search ranking policy version 2 gives this conservative component up to 15
points without erasing source trust, freshness, or version fit.

Safety state is independent. One `misleading_or_unsafe` outcome appends a safety event and queues
review but does not itself penalize ranking, change lifecycle/moderation, or delist a public record.
Only corroborated independent reports, verified moderation, or measurable degradation can affect
ranking/restriction under explicit policy. Safe API/MCP views disclose detailed aggregate outcomes
only after three independent accounts. See [`docs/OUTCOMES.md`](OUTCOMES.md).

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
