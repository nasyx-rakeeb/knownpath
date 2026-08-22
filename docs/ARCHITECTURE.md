# KnownPath Architecture

## Scope

This document describes the intended completed-platform boundaries and the smaller subset
established through Phase 4. A boundary appearing here does not mean its future product behavior is
implemented.

KnownPath will turn high-signal public technical material into reusable, verified engineering
experiences that coding agents can retrieve and evaluate. MongoDB is the primary persistent
database.

## System boundaries

### Applications

- `@knownpath/api` owns Fastify HTTP transport, route composition, request validation, OpenAPI,
  network security policy, and API process lifecycle. Phase 3 exposes operational health,
  closed-registration session routes, account inspection, and API-key lifecycle routes under
  `/api/v1`.
- `@knownpath/worker` owns ingestion and background-process lifecycle. Phase 4 exposes a bounded
  GitHub collection command; it is not yet a scheduler or queue consumer.
- `@knownpath/mcp-server` owns MCP protocol and transport adaptation. It uses the official SDK but
  registers no tools, prompts, or resources in Phase 1.
- `@knownpath/web` owns the future user and administration interface. Phase 1 renders only a static,
  truthful project-status shell.
- `@knownpath/cli` owns the future installer user experience. It does not install or modify anything
  in Phase 1.

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
- `@knownpath/ai` will hold provider-neutral extraction contracts and provider implementations.
- `@knownpath/search` will hold indexing and hybrid/semantic retrieval contracts and
  implementations.
- `@knownpath/agent-adapters` will hold per-agent installer adapter contracts and implementations.
- `@knownpath/typescript-config` publishes reusable strict compiler configurations.

The future Agent Skill distribution is a versioned artifact, not an HTTP/UI concern. When it is
introduced, it will follow the open Agent Skills `SKILL.md` format and progressive-disclosure
conventions. No Skill artifact is published in Phase 1.

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
4. Database initialization creates/reconciles 13 collections, critical validators, and named indexes
   idempotently, including Better Auth sessions/accounts/verifications and append-only audit events.
5. Repository implementations parse writes and reads through `@knownpath/domain`; applications do
   not access raw collections.
6. The API constructs Better Auth and KnownPath auth services over that same database boundary,
   resolves either HttpOnly cookie sessions or bearer API keys into reusable principals, and applies
   route-specific authorization.
7. The worker composes `@knownpath/github-ingestion`, the source manifest, configuration, and the
   repository registry. It collects bounded issue/discussion graphs into immutable source items and
   advances a cursor only after a failure-free run.
8. Fastify exposes `/health/live`, `/health/ready`, versioned account/API-key/session routes,
   OpenAPI JSON, and optional Swagger UI. MCP, dashboard, and installer product behavior remains
   deferred.

## Configuration and secrets

`.env.example` documents all variables known through Phase 4. `.env` and variant files are ignored.
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
Phase 3 intentionally adds no Redis or Valkey. Sensitive actions append bounded `audit_events`
without credentials. OpenAPI 3.1 is generated from route schemas at `/api/v1/openapi.json`; Swagger
UI is configuration-controlled at `/docs`.

## Phase 4 GitHub ingestion boundary

The versioned manifest at `config/sources/github.json` identifies the initial Expo and React Native
repositories and supported source types. The worker verifies repository identity/capabilities and
uses Octokit against GitHub's official REST and GraphQL APIs. Requests are serial, paginated, time
bounded, retried with bounded backoff, and expose only safe rate telemetry to logs.

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
