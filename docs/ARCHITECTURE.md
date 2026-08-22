# KnownPath Architecture

## Scope

This document describes the intended completed-platform boundaries and the smaller subset
established through Phase 2. A boundary appearing here does not mean its future product behavior is
implemented.

KnownPath will turn high-signal public technical material into reusable, verified engineering
experiences that coding agents can retrieve and evaluate. MongoDB is the primary persistent
database.

## System boundaries

### Applications

- `@knownpath/api` owns Fastify HTTP transport, route composition, and API process lifecycle. Its
  only Phase 1 behavior is `GET /health`.
- `@knownpath/worker` owns future ingestion and background-processing process lifecycle. It does no
  processing in Phase 1.
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
apps/worker ------+
apps/mcp-server --+--> capability packages ---> packages/domain
apps/cli ---------+              |
apps/web ---------+              +-------------> packages/config
                                 +-------------> packages/database

packages/domain ---> no workspace dependencies
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
4. Database initialization creates/reconciles nine collections, critical-envelope validators, and
   named indexes idempotently.
5. Repository implementations parse writes and reads through `@knownpath/domain`; applications do
   not access raw collections.
6. The API still exposes only liveness, while worker, MCP, web, and installer boundaries remain
   Phase 1 scaffolds without product behavior.

## Configuration and secrets

`.env.example` documents all variables known through Phase 2. `.env` and variant files are ignored.
MongoDB runs without authentication only in the loopback-bound local Compose environment. No secret
has a committed default. Production authentication, deployment topology, and secret storage are
deliberately outside Phase 2.

Invalid configuration fails before an application starts. Database callers supply a validated
`MongoConfig`; only command entry points read process globals. The reusable database layer receives
configuration explicitly.

## Phase 2 persistence boundary

MongoDB contains separate collections for users, API keys, source registries, immutable source
items, ingestion runs, candidate experiences, KnownPaths, agent contributions, and agent outcomes.
Bounded evidence, solution, ecosystem/environment, score, visibility, moderation, freshness, and
search metadata are embedded for locality. Entities with independent growth or lifecycle remain
referenced.

Zod schemas are the full runtime authority. MongoDB validators enforce critical stored envelopes as
defense in depth. Provider-neutral embedding state exists in the domain, but vectors and vector
indexes do not. See [`docs/DATA_MODEL.md`](DATA_MODEL.md).

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
