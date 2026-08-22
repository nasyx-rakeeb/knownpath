# Architecture Decision Log

Architecture-level decisions are appended to this file. Existing entries should not be silently
rewritten when circumstances change; add a superseding entry instead.

## 2026-08-22 — Use Node.js 24 LTS

**Decision:** Support the Node.js 24 LTS major, with `package.json` enforcing the currently tested
24.18-or-newer range below Node 25 and `.nvmrc` resolving the supported major.

**Why:** The Node.js project recommends Active or Maintenance LTS releases for production. Node 24
is Active LTS and is compatible with pnpm 11, Fastify 5, Next.js 16, ESLint 10, and the MongoDB 7
driver.

**Reference:** [Node.js releases](https://nodejs.org/en/about/previous-releases/)

## 2026-08-22 — Use pnpm workspaces with Turborepo

**Decision:** Use pnpm 11 workspaces, a central dependency catalog, and Turborepo 2 for task
orchestration.

**Why:** pnpm provides first-class workspace dependency semantics and efficient installs. Turborepo
supplies a mature, low-ceremony task graph and caching without imposing code generators or
framework-specific project structure.

**Rejected:** Nx adds useful generators and project tooling but more repository machinery than the
new foundation needs. Package-manager-only scripts lack a dependency-aware build graph.

**References:** [pnpm workspaces](https://pnpm.io/workspaces),
[Turborepo TypeScript guide](https://turborepo.com/docs/guides/tools/typescript)

## 2026-08-22 — Use strict ESM TypeScript 6 temporarily

**Decision:** Author all code in strict ESM TypeScript and use TypeScript 6.0.3 for Phase 1.

**Why:** TypeScript 7.0 is stable and substantially faster, but it does not yet expose the compiler
API. The current `typescript-eslint` release declares TypeScript support below 6.1. A dual
TypeScript 6/7 installation is possible but would make a new baseline harder to understand. This
decision must be revisited when the lint/framework ecosystem supports TypeScript 7 directly.

**Rejected:** A TypeScript 7 CLI beside the TypeScript 6 compatibility API package introduces two
compiler identities before repository scale justifies it. CommonJS is unnecessary for the selected
runtime and dependencies.

**References:**
[TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/),
[TypeScript 6 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)

## 2026-08-22 — Use ESLint flat config and Prettier

**Decision:** Use ESLint 10's flat configuration, current recommended JavaScript/TypeScript rules,
Next.js rules for the web app, and Prettier 3 for formatting.

**Why:** Flat config is ESLint's current configuration model. Separating correctness linting from
formatting avoids conflicting rule sets and deprecated `.eslintrc` conventions.

**Reference:**
[ESLint configuration files](https://eslint.org/docs/latest/use/configure/configuration-files)

## 2026-08-22 — Use Fastify for HTTP

**Decision:** Use Fastify 5 for the backend API process.

**Why:** Fastify has maintained TypeScript support, clean ESM usage, schema-oriented validation, and
a focused plugin model. Reusable behavior remains outside Fastify handlers.

**Rejected:** Express has a larger ecosystem but requires more assembly for the same typed baseline.
Next.js route handlers would couple the backend API to the dashboard deployment.

**References:**
[Fastify TypeScript reference](https://fastify.dev/docs/latest/Reference/TypeScript/),
[Fastify v5 migration guidance](https://fastify.dev/docs/v5.0.x/Guides/Migration-Guide-V5/)

## 2026-08-22 — Use Next.js App Router for the web boundary

**Decision:** Use Next.js 16 with React 19 and the App Router.

**Why:** It is a maintained TypeScript/React framework that can grow into both public and
administrative server-rendered interfaces. Phase 1 contains only a static status shell.

**Reference:** [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)

## 2026-08-22 — Use MongoDB and its official Node.js driver

**Decision:** MongoDB is the only persistent database. Use the official MongoDB Node.js driver and
run MongoDB 8.0 locally through Docker Compose.

**Why:** MongoDB is a product constraint and fits evolving document-shaped knowledge records. The
official driver exposes MongoDB capabilities directly while persistence schemas are still undefined.

**Rejected:** Mongoose would introduce a second schema abstraction before domain invariants exist.
Redis, Valkey, PostgreSQL, and dedicated vector databases have no Phase 1 requirement.

**References:**
[MongoDB Node.js connection guide](https://www.mongodb.com/docs/drivers/node/current/connect/),
[MongoDB TypeScript guide](https://www.mongodb.com/docs/drivers/node/current/typescript/)

## 2026-08-22 — Isolate MCP and Agent Skill distribution

**Decision:** Keep MCP transport in `apps/mcp-server`, future per-agent installation logic in
`packages/agent-adapters`, and the future Agent Skill as a separate distribution artifact. Use the
official MCP TypeScript SDK v2. Phase 1 registers no MCP capabilities and ships no Agent Skill.

**Why:** MCP is a protocol adapter; an Agent Skill is a portable instruction/resource artifact.
Neither should own domain or retrieval behavior. The open Agent Skills convention requires a
`SKILL.md` with YAML metadata and supports progressive disclosure through optional resources.

**References:**
[official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk),
[Agent Skills specification](https://agentskills.io/specification)

## 2026-08-22 — Use lifecycle-oriented MongoDB collections

**Decision:** Use nine collections for users, API keys, source registries, immutable source items,
ingestion runs, candidate experiences, KnownPaths, agent contributions, and agent outcomes. Embed
bounded evidence, problem/solution, environment, scoring, visibility, moderation, freshness, and
search metadata.

**Why:** These top-level entities grow or change independently, while their embedded structures are
normally read with their owner. This follows MongoDB's access-pattern-first modeling guidance
without fragmenting documents into relational-style tables.

**Rejected:** Embedding snapshots, runs, contributions, or outcomes into parent documents would
create unbounded arrays and update contention. A collection per small value object would require
avoidable lookups and weaken read locality.

**References:** [MongoDB data modeling](https://www.mongodb.com/docs/manual/data-modeling/),
[embedding](https://www.mongodb.com/docs/manual/data-modeling/embedding/),
[referencing](https://www.mongodb.com/docs/manual/data-modeling/referencing/)

## 2026-08-22 — Use versioned Zod contracts plus minimal MongoDB validators

**Decision:** Every important entity has a strict Zod 4 runtime schema and `schemaVersion: 1`.
Persisted timestamps are BSON dates, while the schemas accept ISO timestamps at external boundaries.
MongoDB validators enforce only critical document-envelope invariants with strict/error validation.

**Why:** One expressive Zod contract prevents TypeScript types and runtime validation from drifting.
Minimal database validation protects direct writes without maintaining a second complete schema that
would compete with Zod or mishandle BSON-specific values.

**Rejected:** TypeScript-only interfaces do not validate external or stored data. Generating full
MongoDB validators directly from Zod is not selected because Zod JSON Schema and MongoDB's BSON
draft-4 dialect differ, particularly for `Date`.

**References:** [Zod schemas](https://zod.dev/api), [Zod JSON Schema](https://zod.dev/json-schema),
[MongoDB JSON Schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/specify-json-schema/)

## 2026-08-22 — Use branded UUID strings and conservative versioned canonicalization

**Decision:** Store branded UUID v4 strings as entity `_id` values. Store deterministic identity,
deduplication, canonical, and error keys as versioned SHA-256 digests of ordered, conservatively
normalized inputs.

**Why:** String IDs keep domain contracts independent from MongoDB's `ObjectId` and cross protocol
boundaries without conversion. Explicit timestamps, not IDs, provide chronology. Versioned helpers
make normalization changes migratable and avoid claiming semantic equivalence prematurely.

**Rejected:** `ObjectId` would couple core contracts to MongoDB. Time-ordered IDs are unnecessary
because chronological queries already require explicit indexed timestamps. Aggressive error/version
rewriting is semantic deduplication and belongs to a later phase.

## 2026-08-22 — Keep MongoDB access behind named repositories

**Decision:** `@knownpath/database` creates one reusable client per process and exposes named
repositories. Initialization creates missing collections, reapplies validators with `collMod`, and
requests explicitly named indexes in an idempotent routine. Index conflicts fail visibly.

**Why:** A process-scoped client uses the driver's connection pools correctly. Repositories prevent
driver calls from spreading across HTTP, workers, and future transports. Explicit names and an
inspect command make index intent auditable.

**Rejected:** Exporting collections would make validation and access patterns optional. An ODM would
duplicate the selected Zod schema layer. Automatically dropping/replacing conflicting indexes is too
destructive for an initialization command.

**References:**
[MongoDB connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/),
[create indexes](https://www.mongodb.com/docs/manual/core/indexes/create-index/),
[partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/),
[ESR guideline](https://www.mongodb.com/docs/v8.0/tutorial/equality-sort-range-guideline/)

## 2026-08-22 — Defer vector and automatic retention indexes

**Decision:** Store provider-neutral search/embedding state but no vector values or vector indexes.
Create no TTL index until retention requirements are known.

**Why:** Phase 2 must preserve future provider flexibility without selecting retrieval
infrastructure or deleting operational history before real retention needs exist.

**Rejected:** Adding a vector index now would prematurely design a later search phase. Adding Redis,
Valkey, a vector database, or TTL policy has no Phase 2 requirement.
