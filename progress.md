# KnownPath Progress

KnownPath is an open-source shared knowledge network intended to let AI coding agents reuse verified
technical problem/solution experiences instead of independently rediscovering them. Delivery is
phased; this file records what is actually complete and what remains intentionally absent.

## Phase 1 — Architecture and monorepo foundation

### Phase goal

Establish a current, maintainable, TypeScript-first architecture and development baseline without
implementing KnownPath product features.

### Research performed

Official documentation and release metadata were checked on 2026-08-22 before implementation:

- [Node.js release status and production guidance](https://nodejs.org/en/about/previous-releases/)
- [pnpm workspace documentation](https://pnpm.io/workspaces) and current registry metadata
- [Turborepo TypeScript guidance](https://turborepo.com/docs/guides/tools/typescript)
- [TypeScript 7 announcement and transition constraints](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Fastify TypeScript and ESM guidance](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Next.js App Router installation and runtime requirements](https://nextjs.org/docs/app/getting-started/installation)
- [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MongoDB Node.js driver connection and TypeScript guidance](https://www.mongodb.com/docs/drivers/node/current/connect/)
- [Agent Skills open format specification](https://agentskills.io/specification)

Exact package releases and declared engine/peer compatibility were verified through the public npm
registry rather than selected from memory.

### Architecture and technology decisions

- pnpm 11 workspace with `apps/*`, `packages/*`, a central catalog, and Turborepo 2.
- Node.js 24 Active LTS, strict ESM, and reusable TypeScript configurations.
- TypeScript 6.0.3 until TypeScript 7 exposes the APIs required by current lint/framework tooling.
- ESLint 10 flat config, `typescript-eslint`, Next.js rules, and Prettier 3.
- Fastify 5 API, Next.js 16/React 19 web shell, official MCP SDK v2 boundary.
- MongoDB as the only database, using the official driver and a MongoDB-only Compose setup.
- Zod-based centralized environment parsing with no committed secret values.
- Inward dependency direction: applications and infrastructure depend on domain contracts, never the
  reverse.

The detailed rationale and rejected alternatives are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

### Files, applications, and packages created

- Root workspace, task, lint, formatting, environment, Node, pnpm, Git ignore, and Compose
  configuration.
- Applications: `@knownpath/api`, `@knownpath/worker`, `@knownpath/mcp-server`, `@knownpath/web`,
  and `@knownpath/cli`.
- Packages: `@knownpath/domain`, `@knownpath/config`, `@knownpath/database`, `@knownpath/ai`,
  `@knownpath/search`, `@knownpath/agent-adapters`, and `@knownpath/typescript-config`.
- Root README, architecture guide, decision log, and approved Phase 1 design specification.

### Commands successfully verified

- `pnpm install --frozen-lockfile`
- `pnpm typecheck` — 12 workspace typecheck tasks passed
- `pnpm lint` — 11 workspace lint tasks passed
- `pnpm format:check`
- `pnpm build` — 11 build tasks passed; Next.js compiled and prerendered `/`
- `pnpm dev` — all 11 persistent development tasks started together with explicit workspace
  concurrency; the API and web endpoints responded before controlled shutdown
- `pnpm dev:infra` — MongoDB container became healthy
- `docker compose exec -T mongodb mongosh --quiet --eval "JSON.stringify(db.adminCommand('ping'))"`
  returned `{"ok":1}`
- `pnpm --filter @knownpath/api start` and `curl http://127.0.0.1:3001/health` returned
  `{"service":"knownpath-api","status":"ok"}`
- `pnpm --filter @knownpath/web start` served the Phase 1 status shell at `http://127.0.0.1:3000`
- `pnpm --filter @knownpath/worker start` remained active until graceful shutdown
- `pnpm --filter @knownpath/mcp-server start` completed a real stdio initialization handshake for
  protocol `2025-11-25` and returned the expected empty capability set
- The built `@knownpath/config` and `@knownpath/database` packages connected through the official
  driver and received `{"ok":1}` from a database ping
- `pnpm --filter @knownpath/cli start` exited without side effects and reported the Phase 1 boundary

No tests were created or run, as required for this phase.

### Environment and manual setup still required

- Install or select Node.js 24 LTS, then enable Corepack.
- Run `pnpm install`.
- Copy `.env.example` to `.env`; change values for non-local deployments.
- Start Docker Desktop or another Docker Engine before `pnpm dev:infra`.
- Production MongoDB authentication, network topology, deployment configuration, and secrets must be
  designed before any production deployment.

### Known limitations intentionally left for later phases

- No knowledge experience domain model, MongoDB collections, indexes, or repositories.
- No ingestion, source normalization, queue, scheduler, or processing logic.
- No Gemini or other extraction provider, prompts, scoring, or deterministic verification.
- No semantic/hybrid search, embeddings, ranking, or retrieval endpoints.
- No KnownPath MCP tools, resources, or prompts.
- No dashboard features or API data fetching.
- No Agent Skill artifact, automatic installer, or per-agent adapter implementation.
- No contribution, usefulness reporting, trust, authentication, authorization, or deployment logic.
- No auxiliary database, Redis, Valkey, or dedicated vector store.
- No automated tests, by explicit Phase 1 requirement.

### Exact next phase

**Phase 2: define the canonical knowledge experience domain model and MongoDB persistence layer,
including validated contracts, collection/index design, and repository boundaries.** Do not begin
ingestion, extraction, search, MCP tools, Agent Skill installation, or contribution workflows until
their later phases.

## Phase 2 — Durable domain model and MongoDB persistence

### Phase goal

Define the versioned domain vocabulary, deterministic metadata normalization, MongoDB lifecycle,
collection validators, index inventory, and repository boundary that future ingestion, extraction,
retrieval, MCP, contribution, and dashboard work can share.

### Research performed

Official documentation was checked on 2026-08-22 before implementation:

- [MongoDB data modeling](https://www.mongodb.com/docs/manual/data-modeling/),
  [schema design process](https://www.mongodb.com/docs/manual/data-modeling/schema-design-process/),
  [embedding](https://www.mongodb.com/docs/manual/data-modeling/embedding/), and
  [referencing](https://www.mongodb.com/docs/manual/data-modeling/referencing/)
- [MongoDB JSON Schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/specify-json-schema/),
  [validation behavior](https://www.mongodb.com/docs/manual/core/schema-validation/handle-invalid-documents/),
  and
  [validation tips](https://www.mongodb.com/docs/manual/core/schema-validation/specify-json-schema/json-schema-tips/)
- [MongoDB compound indexes](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-compound/create-compound-index/),
  [ESR ordering](https://www.mongodb.com/docs/v8.0/tutorial/equality-sort-range-guideline/),
  [unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/),
  [partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/), and
  [multikey restrictions](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-multikey/)
- [MongoDB index creation behavior](https://www.mongodb.com/docs/manual/core/indexes/create-index/),
  [Node.js driver connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/),
  and [TypeScript driver guidance](https://www.mongodb.com/docs/drivers/node/current/typescript/)
- [Zod 4 schemas and formats](https://zod.dev/api), [codecs](https://zod.dev/codecs), and
  [JSON Schema conversion constraints](https://zod.dev/json-schema)

### Architecture and technology decisions

- Nine lifecycle-oriented collections balance independent growth with embedded read locality.
- Branded UUID v4 strings are stable domain IDs; explicit timestamps provide chronology.
- Strict Zod schemas are the authoritative persisted/external runtime boundary and normalize ISO
  timestamps to BSON-compatible `Date` values internally.
- Minimal strict/error MongoDB validators protect critical envelopes without duplicating the full
  Zod model.
- One official-driver client/pool is reused per process. Public database consumers receive only
  named repositories, ping, and close—not `Db`, `MongoClient`, or collections.
- Source items are immutable. Operational state remains in ingestion runs/candidates.
- Visibility, moderation, audit, evidence, environment, confidence, freshness, and provider-neutral
  search state are embedded where read-local and bounded.
- Conservative versioned canonicalization and SHA-256 keys support deterministic identity and
  exact-ish deduplication without claiming semantic deduplication.
- Named ordinary indexes cover identity, processing state, ecosystem/package/platform/version, error
  fingerprint, canonical status, visibility, confidence/freshness, and deduplication.
- Vector and TTL indexes remain deferred.

Detailed choices and rejected alternatives are in [`docs/DECISIONS.md`](docs/DECISIONS.md). The
collection/index reference is [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

### Collections, schemas, and files created

- Collections: `users`, `api_keys`, `source_registries`, `source_items`, `ingestion_runs`,
  `candidate_experiences`, `known_paths`, `agent_contributions`, and `agent_outcomes`.
- Domain modules for common values, canonicalization, users/API keys, sources, ingestion,
  candidate/KnownPath knowledge, contributions, and outcomes.
- Database modules for private typed collections, connection lifecycle, named repositories,
  collection validators, index declarations, and idempotent initialization.
- Database commands: `pnpm db:init`, `pnpm db:inspect`, and `pnpm db:verify`.
- `docs/DATA_MODEL.md` plus Phase 2 updates to architecture, decisions, package READMEs, root
  README, environment example, and this progress log.
- Approved design specification:
  `docs/superpowers/specs/2026-08-22-knownpath-phase-2-data-model-design.md`.

### Indexes created

- 2 indexes for users, 2 for API keys, 4 for source registries, 3 for source items, 3 for ingestion
  runs, 4 for candidate experiences, 9 for KnownPaths, 3 for contributions, and 3 for outcomes,
  excluding MongoDB's automatic `_id_` indexes.
- Unique indexes enforce user email, API-key hash, source identity, source snapshot/run/candidate/
  contribution/outcome deduplication, and KnownPath canonical identity.
- Partial indexes cover private/team visibility and optional contribution targets.
- Array indexes for platform, version, and error fingerprints are separate to avoid compound
  parallel-array multikey restrictions.

### Commands successfully verified

- `pnpm install`
- `pnpm typecheck` — 13 tasks successful
- `pnpm lint` — 11 tasks successful
- `pnpm format:check`
- `pnpm build` — 11 tasks successful; the Next.js shell compiled and prerendered `/`
- The built API started coherently and `GET http://127.0.0.1:3001/health` returned
  `{"service":"knownpath-api","status":"ok"}` before graceful SIGINT shutdown
- `docker compose up -d mongodb` and a direct `mongosh` ping returned `1`
- `pnpm db:init` against `knownpath_phase2` created all nine collections and all declared indexes
- Repeating `pnpm db:init` reported `created: false` for all nine collections and completed
  successfully
- `pnpm db:inspect` returned all nine collection validators with `validationLevel: strict`,
  `validationAction: error`, and the expected named indexes
- `pnpm db:verify` inserted, read, disabled, reread, and removed a temporary source registry through
  `SourceRegistryRepository`; it returned `cleanupConfirmed: true`, `readAfterUpdateEnabled: false`,
  and `removed: true`
- A direct post-verification `mongosh` inspection returned the nine expected collection names and
  `sourceRegistryCount: 0`

No automated tests were created or run, as required for this phase.

### Environment and manual setup still required

- Use Node.js 24 LTS and pnpm 11 as pinned by the repository.
- Copy `.env.example` to `.env`; set a real authenticated MongoDB URI outside loopback-only local
  development.
- Start Docker Desktop or another Docker Engine before `pnpm dev:infra`.
- Run `pnpm db:init` for every new database and as an explicit schema/index reconciliation step
  during deployment.
- Production authentication, authorization/team membership, MongoDB topology, backup, retention,
  migration rollout, and secret management still require design before deployment.

### Known limitations intentionally left for later phases

- No source network clients, GitHub/documentation ingestion, scheduler, queue, or processing loop.
- No extraction provider, prompts, candidate creation behavior, deterministic scoring algorithm, or
  canonical promotion workflow.
- No semantic deduplication, embeddings, vector values/indexes, lexical/hybrid retrieval, or
  ranking.
- No API endpoints beyond Phase 1 health, and no MCP tools/resources/prompts.
- No Agent Skill artifact, automatic installation, or per-agent adapter behavior.
- No authentication provider, authorization enforcement, team membership model, contribution
  promotion, outcome aggregation, or dashboard.
- No automatic retention/TTL policy and no auxiliary database or cache.
- No automated tests, by explicit Phase 2 requirement.

### Exact next phase

**Phase 3: implement source-registry-driven ingestion for the first approved public source type,
including immutable source snapshot capture, provenance, idempotent ingestion runs, and bounded
processing-state transitions through the Phase 2 repositories.** Do not begin AI extraction,
semantic search, MCP knowledge tools, Agent Skill distribution, contributions, or dashboards until
their designated later phases.

## Phase 3 — Secure authentication and backend API foundation

### Phase goal

Establish closed-registration human identity and sessions, secure machine API keys, reusable
authorization/audit/rate-policy primitives, and a versioned, validated, documented Fastify API that
future web, CLI, MCP, contribution, and private/team knowledge clients can share.

This phase was deliberately resequenced by the later explicit Phase 3 instruction. The ingestion
phase named above remains historical Phase 2 intent and moves to Phase 4.

### Research performed

Official documentation and registries were checked on 2026-08-22 before implementation:

- [Fastify documentation](https://fastify.dev/docs/latest/),
  [logging/redaction](https://fastify.dev/docs/latest/Reference/Logging/),
  [server/proxy configuration](https://fastify.dev/docs/latest/Reference/Server/), and the Fastify 5
  full-JSON-schema guidance
- Official Fastify plugins for [CORS](https://github.com/fastify/fastify-cors),
  [security headers](https://github.com/fastify/fastify-helmet),
  [OpenAPI](https://github.com/fastify/fastify-swagger), and
  [rate limiting](https://github.com/fastify/fastify-rate-limit); the selected limiter is 11.2.0 or
  newer because that is the official IPv6-normalization security fix boundary
- [Better Auth installation](https://www.better-auth.com/docs/installation),
  [options](https://better-auth.com/docs/reference/options),
  [MongoDB adapter](https://better-auth.com/docs/adapters/mongo),
  [Fastify integration](https://better-auth.com/docs/integrations/fastify),
  [session management](https://better-auth.com/docs/concepts/session-management),
  [database schema/hooks](https://better-auth.com/docs/concepts/database),
  [admin plugin](https://better-auth.com/docs/plugins/admin),
  [email/password](https://better-auth.com/docs/authentication/email-password), and
  [security](https://better-auth.com/docs/reference/security)
- Better Auth documentation for passwordless/OAuth options and the API-key plugin; those flows were
  assessed but intentionally not enabled in this closed-registration phase
- [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html),
  [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
  and
  [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Node.js 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) for secure random bytes,
  HMAC, and constant-time comparison
- Current package versions and peer compatibility through the public npm registry, including Better
  Auth 1.7.1, Fastify 5.12.1, Fastify Type Provider Zod 7.0.0, and the official Fastify plugin lines

The approved implementation design is
[`docs/superpowers/specs/2026-08-22-knownpath-phase-3-auth-api-design.md`](docs/superpowers/specs/2026-08-22-knownpath-phase-3-auth-api-design.md).

### Architecture and technology decisions

- Better Auth with the official MongoDB adapter owns scrypt password credentials and revocable,
  database-backed cookie sessions. It shares the single `users` identity source with KnownPath.
- Registration is closed. A masked `pnpm auth:user:create` CLI is the only user/admin provisioning
  path. Signup, verification, reset, OAuth, email mutation/deletion, and HTTP admin-user routes are
  absent.
- Better Auth's MongoDB `"uuid"` mode stores BSON UUIDs, so a UUID-generating function preserves the
  Phase 2 string-ID contract.
- KnownPath retains its domain API-key model. Keys use `kp_<public-id>_<32-byte-secret>`, return
  plaintext only on issue/rotation, and persist only an HMAC-SHA-256 digest protected by an
  independent required pepper.
- API-key scopes are closed/versioned: `account:read`, `api-keys:read`, `api-keys:write`,
  `knowledge:read`, and `knowledge:contribute`. Phase 3 exposes no knowledge route.
- Human sessions alone may list, issue, rotate, or revoke keys. Bearer keys may access scoped routes
  only while both key and owner remain active.
- Framework-neutral principals and public/authenticated/session/scoped/admin policies live in
  `@knownpath/auth`, not Fastify routes.
- Sensitive actions write append-only, credential-free audit events. Key last-use writes are
  throttled.
- Fastify provides `/api/v1`, Zod validation/serialization, one error envelope, server request IDs,
  Pino credential redaction, explicit CORS/proxy/cookie settings, security headers, and OpenAPI 3.1.
- Rate limiting is intentionally in-process behind reusable policy boundaries. No Redis/Valkey or
  second database was added.

### Collections, indexes, and files created or evolved

- Evolved `users` for Better Auth-compatible timestamps, email verification placeholder, role, and
  soft-ban state while preserving string UUID identity and normalized email.
- Evolved `api_keys` with a unique public prefix, fixed scopes, keyed digest verification, rotation,
  revocation, and last-use repository operations.
- Added `auth_sessions`, `auth_accounts`, `auth_verifications`, and `audit_events`, bringing the
  initialized collection count to 13.
- Initialization now declares 46 named indexes excluding automatic `_id_`, including auth token,
  user/expiry, provider identity, verification expiry, actor/target/time, request correlation, API
  prefix, and user email/status paths.
- Added `@knownpath/auth` with Better Auth composition, API-key/audit services, authentication,
  authorization, rate policies, and masked CLI provisioning.
- Expanded `@knownpath/config`, `@knownpath/database`, and `@knownpath/domain` for secure config,
  adapter/repository boundaries, identities/scopes, and audit schemas.
- Expanded `@knownpath/api` with security plugins, centralized errors/logging, health/readiness,
  explicit auth bridge routes, account/key routes, OpenAPI JSON, and Swagger UI.
- Updated `.env.example`, root/package READMEs, architecture, data model, decisions, and this
  progress log.

### Commands and behavior successfully verified

- `pnpm install`
- `pnpm format` and `pnpm format:check`
- `pnpm typecheck` — 16 tasks successful
- `pnpm lint` — 12 tasks successful
- `pnpm build` — 12 tasks successful; Next.js compiled and prerendered `/`
- `pnpm dev:infra` started the loopback MongoDB container
- `pnpm db:init` created all 13 collections and 46 declared indexes; repeated initialization
  reported `created: false` for every collection and completed successfully
- Direct `mongosh` inspection confirmed the user/session/account/API-key/audit index names and
  strict validators
- `pnpm auth:user:create --email ... --name ... --role admin` prompted twice with masked input and
  created one valid admin plus a 161-character Better Auth scrypt credential record
- API booted at `127.0.0.1:3001`; liveness and readiness returned 200 with no secret/config details
- OpenAPI JSON returned 200 (42,336 bytes during verification), declared OpenAPI 3.1 with 14 paths,
  documented the account route, and contained no signup route; Swagger UI returned 200
- An attempted `POST /api/v1/auth/sign-up/email` returned the stable 404 error envelope
- Email/password sign-in returned 200 and a cookie session; session-authenticated
  `GET /api/v1/account/me` returned 200
- API-key issuance returned plaintext once; database inspection confirmed a 64-character digest, no
  plaintext field, and a recorded last-use timestamp
- The issued bearer key returned 200 from `/api/v1/account/me`; a random key returned 401
- Rotation returned a new one-time key, made the old key return 401, and let the new key return 200
- Key listing returned metadata without plaintext; revocation made the rotated key return 401
- Sign-out with a trusted Origin returned 200, removed the session, and made the
  cookie-authenticated account request return 401
- Captured API logs contained method/path/request ID/status/duration but no Authorization header,
  cookie, password, session token, plaintext API key, or key digest
- Bounded cleanup removed the temporary admin, credential account, revoked key, session, and six
  matching audit events; a direct post-cleanup inspection returned zero for all five categories

No automated tests were created or run, as required for this phase.

### Environment and manual setup still required

- Use the pinned Node.js 24 and pnpm 11 versions, copy `.env.example` to `.env`, and generate
  independent high-entropy `BETTER_AUTH_SECRET` and `API_KEY_PEPPER` values.
- Configure the exact externally visible HTTPS Better Auth URL, trusted browser origins, CORS
  origins, and proxy addresses for each deployment. Production rejects an HTTP auth URL.
- Start MongoDB and run `pnpm db:init` before provisioning users or starting the API.
- Run `pnpm auth:user:create` interactively to provision the real first administrator; no committed
  account remains from verification.
- Production MongoDB authentication/topology, backups, secret management/rotation, audit retention,
  and distributed rate limiting still need deployment-specific decisions.

### Known limitations intentionally left for later phases

- No public signup, email verification, password reset/recovery, OAuth, magic links, passkeys, or
  user-facing authentication UI.
- No team/workspace membership or team-scoped authorization; the principal model is ready to extend.
- Rate limits are per process and reset on restart; no distributed limiter/store exists.
- No automated audit retention, expired session/key cleanup, or administrator management dashboard.
- No ingestion, extraction, deterministic scoring, search/retrieval, MCP knowledge tools, Agent
  Skill distribution, automatic installation, contributions, outcomes aggregation, or dashboard
  features.
- No automated tests, by explicit Phase 3 requirement.

### Exact next phase

**Phase 4: implement source-registry-driven ingestion for the first approved public source type,
including immutable source snapshot capture, provenance, idempotent ingestion runs, and bounded
processing-state transitions through the existing repositories.** Do not begin AI extraction,
semantic search, MCP knowledge tools, Agent Skill distribution, contributions, or dashboards until
their designated later phases.
