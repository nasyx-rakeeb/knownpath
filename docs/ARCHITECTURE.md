# Architecture

KnownPath is a hosted shared knowledge network for coding agents, with a complete self-hosting path.
It turns consented, reusable solutions learned during real development work into provenance-backed
canonical records that agents can search through HTTP or MCP. Targeted public sources remain an
optional operator evidence path. MongoDB is the durable system of record.

## System overview

```text
verified agent experience / targeted public evidence
                         │
                         ▼
 consent + sanitization + deterministic quality gate
                         │
                         ▼
    immutable source/candidate representation
                         │
                         ▼
       deterministic evidence verification and scoring
                         │
                         ▼
       canonical KnownPaths + immutable revisions
                         │
                         ▼
 exact + lexical + semantic retrieval and deterministic reranking
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           HTTP API   MCP server   dashboard
                         │
                         ▼
              contribution and outcome loop
```

The ordinary contribution path does not call Gemini. Gemini may interpret explicitly selected,
untrusted public sources through a validated candidate schema; it does not determine objective
metadata, trust scores, publication, or automatic semantic-only merges.

## Applications

- **`@knownpath/api`** — Fastify HTTP API, session/API-key authentication, remote Streamable HTTP
  MCP, request validation, authorization, rate policy, OpenAPI, and health/readiness.
- **`@knownpath/worker`** — source, extraction, verification, canonicalization, embedding,
  contribution, outcome, and maintenance commands plus BullMQ consumers.
- **`@knownpath/web`** — Next.js user dashboard and server-guarded admin console. It consumes safe
  API DTOs and owns no database, ranking, or authorization logic.
- **`@knownpath/mcp-server`** — thin local stdio bridge to the HTTP API. Hosted use resolves a
  versioned API origin and native OS-stored machine credential; explicit environment overrides
  remain available for self-hosters.
- **`knownpath`** — public installer/integration CLI. It configures supported agents and packages
  the canonical Agent Skill and stdio bridge command. Browser device authorization exchanges a
  one-time proof for an existing scoped API-key credential rather than duplicating auth logic.

## Core packages

The framework-independent center is `@knownpath/domain`, which owns versioned runtime schemas,
identifiers, lifecycle values, and canonicalization helpers. Other important boundaries are:

| Package                       | Responsibility                                                              |
| ----------------------------- | --------------------------------------------------------------------------- |
| `@knownpath/config`           | Environment parsing and production validation                               |
| `@knownpath/database`         | MongoDB lifecycle, validators, indexes, repositories                        |
| `@knownpath/auth`             | Better Auth, API keys, principals, policies, audit and rate-limit contracts |
| `@knownpath/workspaces`       | Workspace lifecycle, roles, membership and invitations                      |
| `@knownpath/github-ingestion` | GitHub REST/GraphQL collection and normalization                            |
| `@knownpath/source-ingestion` | Source manifests and SSRF-safe official-source sync                         |
| `@knownpath/ai`               | Provider-neutral extraction, privacy gate, prompts and Gemini adapter       |
| `@knownpath/verification`     | Deterministic evidence verification and immutable assessments               |
| `@knownpath/canonicalization` | Profiles, pair decisions, membership and revision history                   |
| `@knownpath/search`           | Embeddings, projections, local/Atlas retrieval and reranking                |
| `@knownpath/privacy`          | Secret/PII/path redaction and boundary normalization                        |
| `@knownpath/contributions`    | Consent, sanitization and low-trust contribution processing                 |
| `@knownpath/outcomes`         | Result ingestion, abuse controls and reliability assessment                 |
| `@knownpath/jobs`             | BullMQ/Valkey queues, schedules, retry and worker lifecycle                 |
| `@knownpath/pipelines`        | Idempotent job handlers and bounded downstream chaining                     |
| `@knownpath/mcp`              | Shared MCP tool schemas, server factory and error mapping                   |
| `@knownpath/agent-adapters`   | Safe client detection/configuration and skill installation                  |
| `@knownpath/observability`    | Privacy-bounded OpenTelemetry instrumentation                               |

## Dependency direction

```text
apps and transports
        │
        ▼
capability/application packages
        │
        ├── domain contracts
        ├── repository interfaces/implementations
        └── external adapters at explicit boundaries
```

Packages never depend on applications. The domain package imports no Fastify, Next.js, MongoDB, MCP,
queue, or provider SDK. Raw MongoDB collections do not escape `@knownpath/database`. Transport
handlers validate and translate; reusable business rules remain in services shared by HTTP, MCP,
workers, and dashboards.

The dashboard uses a bounded same-origin server bridge to the API. It never connects to MongoDB or
receives provider credentials. The stdio MCP bridge similarly delegates authentication,
authorization, ranking, contributions, outcomes, and tenant checks to the API.

## Durable data flow

1. After observable success, the Agent Skill applies the cross-project reuse rule, performs a final
   duplicate search, previews the generalized lesson, and requires explicit consent.
2. The backend sanitizes the contribution and writes an immutable, deterministic quality assessment.
   Obvious trivial or repository-local noise stops before candidate creation.
3. Plausible contributions become immutable source items and candidates with weak self-report trust.
   Approval schedules durable, idempotent canonicalization; publication remains manual.
4. For targeted research, a versioned source registry identifies GitHub repositories, documentation
   sites, and release feeds. Collectors normalize each observed object into an immutable
   `source_item`; mutable `source_item_states` retain latest pointers, hashes, ETags, and refresh
   lifecycle.
5. Selected public source snapshots may be assembled into bounded evidence contexts and classified
   by Gemini through strict structured output. Invalid output is quarantined.
6. Verification resolves references to immutable snapshots and writes an immutable assessment using
   deterministic source metadata. The candidate stores only a latest pointer.
7. Canonicalization creates versioned technical profiles and compares plausible blocked pairs.
   Deterministic gates authorize safe merges; semantic similarity only strengthens or flags a pair.
8. Membership changes append events and produce immutable KnownPath revisions plus a stable current
   projection. Candidates and provenance remain intact.
9. Search projections support exact error/metadata matching and local weighted text retrieval. Atlas
   deployments add lexical and vector channels. Application reranking combines relevance, version
   fit, trust, freshness, outcomes, conflicts, moderation, and lifecycle.
10. Contributions and outcomes write durable MongoDB records before asynchronous dispatch. Their
    processing updates candidates, assessments, canonical projections, and ranking through the same
    boundaries as seeded public knowledge.

## Authentication and API boundary

Better Auth supplies database-backed human sessions. Registration is an operator setting: the
official hosted service enables public signup, while self-hosters can keep it closed. Browser/device
authorization exchanges a short-lived one-time grant for a scoped CLI machine key; manual keys
remain available for advanced integrations. MongoDB stores only identification metadata and an HMAC
digest, and the CLI keeps the machine secret in the native OS credential store. Principals and
policy functions are shared across HTTP, MCP, workspaces, and administration.

The API exposes versioned Zod contracts under `/api/v1`. Response schemas are allowlists: raw source
bodies, embeddings, credentials, provider internals, and hidden tenant fields never leave the
boundary. Public published knowledge is the default. Review access is explicit, admin-key-only, and
audited. Private/team access is derived from ownership or live workspace membership.

See [API](API.md), [MCP](MCP.md), and [Workspaces](WORKSPACES.md).

## MongoDB and Valkey

MongoDB stores product entities, immutable histories, audit records, pipeline intent, and derived
search projections. Initialization creates/reconciles 35 collections, critical validators, and named
indexes idempotently. See [Data model](DATA_MODEL.md).

Valkey is auxiliary and ephemeral. BullMQ uses it for delivery, schedules, retries, leases, and
coordination; the API uses it for distributed production rate limits. Product intent is stored in
MongoDB before dispatch, so queue loss cannot become product-data loss. Production fails closed if
the distributed limiter is unavailable; queue-only failures can report a degraded state while
durable writes remain available for reconciliation.

## Search and AI provider boundaries

The embedding and extraction interfaces are provider-neutral, but the configured implementation is
Gemini. Model names, versions, dimensions, prompt/schema versions, token budgets, and content hashes
are persisted or configured so work can be reproduced and regenerated.

The unpaid/public Gemini capability is hard-blocked for private and team content—including queries
and embeddings—with no downgrade path. Private/team retrieval uses deterministic and lexical paths
unless an explicitly approved private-safe provider is added.

MongoDB local search is the free fallback. Atlas Search and Vector Search are optional deployment
capabilities, not a second database or a requirement for contributors.

## Visibility and tenancy

The shared domain structures use `public`, `private`, or `team` visibility:

- private records require an owner;
- team records require a workspace; and
- public records have neither tenant owner.

Repository methods accept server-derived scope predicates for both lists and direct IDs. Private and
team outcomes, embeddings, counts, and existence do not influence or leak into public retrieval.
Public sharing creates a separate sanitized contribution rather than changing proprietary data in
place.

## Trust model

KnownPath separates source evidence, freshness, version fit, and outcome confidence. Assessments are
immutable and versioned, with complete signals, weights, caps, reason codes, and explanations.
First- party documentation and machine-verifiable GitHub metadata are stronger signals; reactions
are only bounded popularity evidence. Outcome aggregation uses decay, version buckets,
independent-account limits, and small-sample protection.

Safety review is separate from ranking. A single unsafe report queues review but does not directly
penalize or delist a record.

## Agent integration

The canonical `skills/knownpath` artifact teaches agents when to search, how to inspect evidence,
and when consented contribution/outcome reporting is appropriate. It preserves user and repository
instructions and treats KnownPath results as evidence, never an instruction override.

The installer configures Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode using the same
skill and stdio bridge. Client files contain environment-variable references, not API-key values.

## Deployment topology

A self-hosted deployment runs stateless API, web, and worker processes with external MongoDB and
Valkey. An OpenTelemetry Collector and Atlas Search/Vector Search are optional. Images run as a
non-root Node user. See [Deployment](DEPLOYMENT.md), [Operations](OPERATIONS.md), and
[Security architecture](SECURITY_ARCHITECTURE.md).

## Architectural principles

- MongoDB is the only durable product database.
- Evidence and model interpretation remain separate.
- Scores and merge decisions are deterministic, versioned, explainable, and reversible.
- External and agent-supplied content is untrusted.
- Authorization and privacy are server-enforced on every path.
- Public AI processing never receives private/team data.
- Valkey failure never discards the only copy of business state.
- HTTP, MCP, dashboard, and CLI reuse the same services and contracts.
- Hosted use and self-hosted operation are separate user journeys.

Architecture decision history is maintained in [Decisions](DECISIONS.md).
