# KnownPath Architecture

## Scope

This document describes the intended completed-platform boundaries and the smaller subset
established in Phase 1. A boundary appearing here does not mean its future product behavior is
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

- `@knownpath/domain` is the framework-independent center. Domain entities, value objects,
  invariants, and public contracts belong here once specified.
- `@knownpath/config` is the sole environment-to-typed-config translation boundary.
- `@knownpath/database` owns MongoDB client construction and lifecycle. Collection schemas and
  repositories are deferred to Phase 2.
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

packages/domain ---> no internal dependencies
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

Later phases must define trust boundaries, provenance, idempotency, verification evidence, indexes,
and feedback semantics before implementing this flow.

## Phase 1 runtime flow

1. Docker Compose starts only MongoDB and binds it to loopback.
2. Applications parse their own subset of environment variables through `@knownpath/config`.
3. The API starts Fastify and exposes a liveness response.
4. The worker and MCP server start their process/transport boundaries without product work.
5. The web application serves a statically rendered status page.
6. The CLI reports that installation is unavailable and exits without side effects.

## Configuration and secrets

`.env.example` documents all variables known in Phase 1. `.env` and variant files are ignored.
MongoDB runs without authentication only in the loopback-bound local Compose environment. No secret
has a committed default. Production authentication, deployment topology, and secret storage are
deliberately outside Phase 1.

Invalid configuration fails before an application starts. Database callers supply a validated
`MongoConfig` to `createMongoClient`; the database package does not read process globals directly.

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
