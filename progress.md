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

## Phase 4 — Expo and React Native GitHub source collection

### Phase goal

Implement the first real, source-registry-driven collector for high-signal public Expo and React
Native GitHub material. Preserve objective source text and provenance as immutable MongoDB snapshots
for a later extraction phase without inferring fixes or creating knowledge records.

### Research performed

Official documentation and live public repository metadata were checked on 2026-08-22 before
implementation:

- [GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions),
  [pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api),
  [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
  and
  [best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- GitHub's official [issues](https://docs.github.com/en/rest/issues/issues),
  [comments](https://docs.github.com/en/rest/issues/comments),
  [reactions](https://docs.github.com/en/rest/reactions/reactions), and
  [GraphQL Discussions](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)
  documentation
- [GitHub credential guidance](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure)
  and the maintained [Octokit JavaScript SDK](https://github.com/octokit/octokit.js)
- Current [Expo documentation](https://docs.expo.dev/),
  [React Native contributing overview](https://reactnative.dev/contributing/overview), and
  [React Native support locations](https://reactnative.dev/community/support)

Live GitHub API checks confirmed `expo/expo`, the current `react/react-native` canonical repository,
`react-native-community/discussions-and-proposals`, `reactwg/react-native-new-architecture`, and
`react-native-community/upgrade-support`. They also confirmed the old `facebook/react-native` path
redirects, React Native core has no enabled Discussions, and the other selected source capabilities
match the manifest. GitHub's current REST version is `2026-03-10`; authenticated and unauthenticated
primary limits and the authenticated-only GraphQL boundary were verified from both documentation and
live response telemetry.

### Architecture and technology decisions

- A versioned JSON manifest makes the five initial sources, ecosystem hints, types, lookbacks, and
  enabled state data-driven.
- Octokit 5 supplies maintained REST/GraphQL requests, retry, throttling, and pagination support.
  Zod still validates every response shape consumed by normalization.
- REST collects repositories, issues, comments, labels, reactions, and conditional ETags. GraphQL
  collects Discussions, answer/thread/reaction graphs, and closing pull-request enrichment.
- Public REST works without a token at the lower limit. Discussions are explicitly skipped and
  counted without authenticated GraphQL rather than silently producing incomplete records.
- Issues, discussions, comments, and replies are separate immutable snapshots with root/parent
  identities, objective versioned provider metadata, content hashes, and deterministic deduplication
  keys. All source text remains untrusted.
- Per-type updated-time cursors use a configurable overlap window, and issue-list ETags avoid
  unchanged transfers when request bounds match. Cursors advance only after failure-free runs.
- Requests remain serial and bounded. Transient retry/rate waiting is capped; permanent failures
  receive safe error codes. Phase 4 adds no scheduler, queue, cache, or second database.

Detailed rationale is in [`docs/DECISIONS.md`](docs/DECISIONS.md); operating guidance is in
[`docs/GITHUB_INGESTION.md`](docs/GITHUB_INGESTION.md).

### Collections, schemas, indexes, and files created or evolved

- Added `@knownpath/github-ingestion` with manifest selection, official API clients, runtime
  schemas, issue/discussion collectors, normalization, orchestration, error handling, and CLI
  parsing.
- Added `config/sources/github.json` with five verified Expo/React Native source definitions.
- Evolved source items with `issue_comment`/`discussion_comment`, thread provenance, and versioned
  provider metadata. Evolved ingestion counters with required created/updated/unchanged/failed/
  rate-limited dimensions.
- Evolved repositories for registry definition/cursors, immutable snapshot insert-or-observe, and
  queued/running/succeeded/failed ingestion-run transitions.
- Added `ix_source_items_registry_type_observed_at`, bringing the declared named index count to 47
  across the existing 13 collections, excluding automatic `_id_` indexes.
- Added `pnpm ingest:github`, worker signal handling, typed GitHub configuration, and documented
  environment variables with no token default.
- Added this progress entry and Phase 4 updates to README, architecture, data model, decision log,
  package documentation, and the approved Phase 4 design specification.

### Commands and behavior successfully verified

- `pnpm install` installed all 15 workspace projects and Octokit 5.0.5.
- `pnpm typecheck` — 18 tasks successful across 14 packages.
- `pnpm lint` — 13 tasks successful.
- `pnpm build` — 13 tasks successful; the Next.js shell compiled and prerendered `/`.
- Authenticated dry runs discovered one Expo issue and one Expo Discussion without database writes.
- An unauthenticated Expo REST dry run returned a live primary limit of 60; an unauthenticated
  Discussion dry run completed with `capabilitySkipped: 1` and no fabricated data.
- A bounded authenticated Expo issue run stored one issue plus three comments. Inspection confirmed
  source text, labels, one reaction, contributor/collaborator author associations, closing pull
  request metadata, URLs, IDs, timestamps, and root/parent relationships.
- A bounded authenticated Expo Discussion run stored a discussion and its comment. Inspection
  confirmed untrusted Markdown content, association/answer/reaction metadata, content digest, and
  correct root/parent identities.
- Repeating the issue sample reported `created: 0`, `unchanged: 4`; repeating the discussion/comment
  sample reported `created: 0`, `unchanged: 2`. No duplicate snapshots were created.
- One live response exposed GitHub's nullable `isAnswered` value; runtime validation safely failed
  and recorded the run. The schema was corrected to match the observed API, and the same bounded run
  then succeeded. The failed operational record remains as honest ingestion history.
- Captured debug logs showed safe status/rate-limit/request-ID telemetry. Exact token and credential
  pattern scans were clean; no token, authorization header, or bearer credential appeared.
- `pnpm db:init` completed twice with `created: false` for all 13 collections. Direct MongoDB
  inspection found the four declared source indexes plus `_id_`, six valid source snapshots across
  all four implemented item kinds, no malformed GitHub item envelope, and succeeded/failed run
  history.
- `pnpm format` and `pnpm format:check` completed successfully.

No automated tests were created or run, as required for this phase.

### Environment and manual setup still required

- Use the pinned Node.js 24/pnpm 11 toolchain, copy `.env.example` to `.env`, start MongoDB, and run
  `pnpm db:init` before collection.
- Supply a read-only `GITHUB_TOKEN` for the normal authenticated limit and Discussions. Public REST
  can run without one at its lower limit; never place a token in command arguments or source files.
- Review `config/sources/github.json`, use `--dry-run`, and begin with small `--limit` values. An
  intentional historical backfill requires `--backfill` plus an explicit `--since`; advance bounded
  windows manually while monitoring rate telemetry.
- Production scheduling, worker leases, deployment topology, token rotation, observability, and
  operational retention remain deployment/later-phase work.

### Known limitations intentionally left for later phases

- No AI/Gemini extraction, prompt execution, candidate experience creation, fix inference, semantic
  deduplication, deterministic trust scoring, or canonical KnownPath promotion.
- No documentation-site ingestion, webhooks, scheduler, distributed queue, parallel collector, or
  automatic failed-run retry process.
- No vector embeddings/indexes, lexical/hybrid retrieval, public knowledge API, or search ranking.
- No MCP knowledge tools, Agent Skill artifact/installer, agent contributions/outcomes processing,
  team model, or dashboard ingestion controls.
- Top-level collection is bounded per enabled source type, but related thread comments/replies/
  reactions are intentionally complete; very large-thread operational chunking may be added when
  real workload evidence exists.
- No automated tests, by explicit Phase 4 requirement.

### Exact next phase

**Phase 5: implement provider-neutral AI extraction of immutable source snapshots into validated
candidate experiences, including the first configured extraction provider, prompt/version
provenance, bounded processing lifecycle, and deterministic output validation.** Do not implement
canonical promotion, search/retrieval, MCP knowledge tools, Agent Skill distribution, contribution
workflows, or dashboards until their designated later phases.

## Phase 6 — Gemini structured experience extraction

### Phase goal

Convert immutable public GitHub and official-source records into strictly validated candidate
experiences while keeping deterministic provenance separate from model interpretation and blocking
all private/team material from the unpaid Gemini path.

### Research performed

Current official documentation and release metadata were checked on 2026-08-22 before
implementation:

- [Google Gen AI JavaScript SDK](https://googleapis.github.io/js-genai/) and the
  [official repository](https://github.com/googleapis/js-genai)
- [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions)
- [Gemini 3.5 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [token counting/context guidance](https://ai.google.dev/gemini-api/docs/tokens)
- [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and
  [troubleshooting/status behavior](https://ai.google.dev/gemini-api/docs/troubleshooting)
- [Batch API](https://ai.google.dev/gemini-api/docs/batch-api)
- [API-key guidance](https://ai.google.dev/gemini-api/docs/api-key),
  [pricing/free tier](https://ai.google.dev/gemini-api/docs/pricing), and
  [Gemini API terms](https://ai.google.dev/gemini-api/terms)

Registry/package metadata confirmed `@google/genai` 2.18.0 as the current official release, its Node
compatibility, and the announced 3.0 Node 22 floor. The legacy `@google/generative-ai` package is
not actively maintained. Official model documentation confirmed stable `gemini-3.5-flash-lite`,
1,048,576 input tokens, 65,536 output tokens, structured output, Batch API support, and a usable
free tier. Interactions documentation confirmed that storage defaults on, usage metadata fields, and
explicit `store: false`; terms confirmed that unpaid-service content can be used for
improvement/human review, making public-only enforcement mandatory.

### Architecture and technology decisions

- `@knownpath/ai` defines provider/config contracts but implements only the real Gemini provider.
  Provider identity, model, capability, timeouts, retries, spacing, output bounds, and command
  budgets are configuration-driven.
- The Interactions request disables storage, tools, and thought summaries, uses minimal thinking,
  and requires JSON-schema output. KnownPath never requests or stores hidden chain-of-thought.
- Provider capabilities distinguish `public_only` from future `approved_private`. Phase 6 config
  accepts only public-only. Registry/requested/context visibility is checked before provider
  construction; private/team work records `ai_private_data_not_approved` and fails with no fallback.
- Versioned shared/GitHub/official prompt source files treat evidence JSON as quoted untrusted data.
  GitHub and official documents share one candidate output schema but use distinct strategies.
- GitHub context resolves the latest root/comment revisions and selects complete records by root,
  accepted-answer, maintainer, author-follow-up, reaction, and chronological signals. Root and
  high-signal confirmation text is never silently truncated. Official source blocks and
  deterministic metadata retain structure.
- A strict Zod boundary plus known-ID/exact-excerpt checks quarantines malformed or ungrounded
  output. URLs, hashes, visibility, normalized metadata, and error fingerprints come from
  deterministic code. Candidate authority labels remain unverified for Phase 7.
- `extraction_attempts` has an independent lifecycle and idempotency across source/context hashes,
  provider/model/capability, prompt digests, schema, and generation config. Only `reusable` creates
  a candidate; other classifications remain attempt outcomes.
- Candidate experiences no longer contain numeric confidence/freshness. Those remain canonical
  KnownPath fields for Phase 7 deterministic scoring.
- Requests are serial with bounded retry/backoff and target/call/input/actual-token budgets. The
  async Batch API is deliberately deferred until measured operational volume justifies it.

Detailed behavior and operations are in [`docs/AI_EXTRACTION.md`](docs/AI_EXTRACTION.md); decisions
and the approved design are in [`docs/DECISIONS.md`](docs/DECISIONS.md) and
[`docs/superpowers/specs/2026-08-22-knownpath-phase-6-gemini-extraction-design.md`](docs/superpowers/specs/2026-08-22-knownpath-phase-6-gemini-extraction-design.md).

### Collections, schemas, commands, and files created or evolved

- Added the official `@google/genai` 2.18.0 dependency and its audited pnpm build-script policy.
- Added versioned extraction attempt IDs/statuses, prompt/usage/validation records, provider
  capabilities, candidate root cause/attempt/caveat/conflict/label provenance, and per-symptom/step
  evidence IDs in `@knownpath/domain`.
- Added `extraction_attempts`, its repository lifecycle, source thread/target queries, idempotent
  validator initialization, and four named indexes. MongoDB now has 15 declared collections and 56
  named indexes, excluding automatic `_id_` indexes.
- Added provider contracts, Gemini Interactions adapter, versioned prompt sources, deterministic
  prompt/context/config digests, GitHub/official context assembly, strict output schema, provenance
  validation, canonical candidate construction, privacy gating, retry/budget controls, batch
  selection, CLI parsing, and inspection formatting in `@knownpath/ai`.
- Added `pnpm extract` with `one`, `pending`, `batch`, and candidate/attempt `inspect` operations to
  the worker. Sensitive data and raw provider output are absent from operational logs.
- Added typed Phase 6 environment configuration, `.env.example` placeholders, this progress entry,
  the AI extraction guide, and architecture/data-model/decision/README updates.

### Commands and behavior successfully verified

- `pnpm install` completed across all 16 workspace projects and installed the pinned official Gemini
  SDK.
- `pnpm typecheck` — 21 tasks successful across 15 packages.
- `pnpm lint` — 14 tasks successful.
- `pnpm format` and `pnpm format:check` completed successfully.
- `pnpm build` — 14 tasks successful; the Next.js shell compiled and prerendered `/`.
- The built worker booted and printed the complete GitHub, official-source, and extraction command
  contracts.
- `pnpm db:init` completed twice. The second run reported `created: false` for all 15 collections.
  Direct inspection found the strict extraction validator, all four declared extraction indexes, and
  56 named indexes overall.
- A temporary private source containing a harmless prompt-injection-like sentence was processed
  through the service boundary. It produced a `blocked` attempt, the provider factory call count
  remained exactly zero, the attempt repository update/read round trip succeeded, and the attempt,
  source, and registry were all removed and confirmed absent.
- A temporary public source passed through a local malformed provider-boundary response. It became
  `quarantined` with `schema_validation_failed`; an unchanged repeat reused the attempt with one
  total provider-boundary call. All temporary records were removed and confirmed absent.
- A grounded local structured-response boundary created a `succeeded` attempt and candidate with a
  deterministic error fingerprint, step-level source IDs, official-support label candidate, and
  reported token usage. An unchanged repeat reused it with one total call; candidate, attempt,
  source, and registry cleanup were all confirmed.
- Initial shell inspection confirmed no key was available. A later local key was added only to the
  ignored `.env`, after which bounded live Gemini verification completed successfully.
- Live extraction created grounded candidates from an official Expo EAS troubleshooting document and
  a closed Expo issue with a maintainer response. Exact source IDs, excerpts, URLs, model usage,
  prompt/schema versions, and candidate labels were inspected directly.
- A public zero-comment Expo issue was classified `insufficient_evidence` instead of becoming fake
  knowledge. Its unchanged rerun reported `providerCalls: 0` and `reused: 1`.
- Live output exposed two boundary mismatches: empty optional strings and excerpts drawn from
  structured blocks. Response schema version 2 now normalizes empty optional strings to absence,
  still rejects missing reusable fields, and validates exact excerpts against either persisted text
  representation. Reprocessing then produced valid grounded candidates.
- A temporary public source containing a harmless instruction-like sentence was processed by live
  Gemini. It remained `reusable`, cited only the technical problem/solution/verification text, and
  ignored the embedded classification instruction. Its unchanged rerun reported `providerCalls: 0`;
  its candidate, attempt, source item, and registry were then removed and confirmed absent.
- Observed pnpm 11 execution showed that root scripts must receive arguments without an extra `--`.
  CLI usage output and contributor documentation were corrected to the executable command form.

No automated tests were created or run, as required for this phase.

### Environment and manual setup still required

- Use the pinned Node.js 24/pnpm 11 toolchain, copy `.env.example` to `.env`, start MongoDB, and run
  `pnpm db:init`.
- Configure `GEMINI_API_KEY` only in an ignored local environment file or deployment secret manager.
  Keep `AI_DATA_HANDLING=public_only`; do not submit private, team, sensitive, confidential, or
  personal source material to unpaid Gemini.
- Review current project/model rate limits in AI Studio before increasing the conservative command
  budgets. Free-tier quotas are project/model-specific and can change.

### Known limitations intentionally left for later phases

- Candidate labels are evidence-grounded but intentionally `unverified`; no numeric trust score,
  freshness calculation, contradiction resolution, semantic deduplication, or canonical promotion
  exists yet.
- Context selection is bounded at complete source-item boundaries while preserving document blocks.
  Multi-call synthesis and the asynchronous Batch API are deferred; an oversized root or high-signal
  confirmation fails rather than being silently truncated.
- No private/team AI provider is enabled. The provider capability boundary can accept one later only
  after an account/provider is explicitly approved for private data.
- No vector/lexical indexing, public retrieval, MCP knowledge tools, Agent Skill/installer,
  contribution processing, dashboard controls, scheduler, distributed limiter, or queue exists.
- No automated tests, by explicit Phase 6 requirement.

### Exact next phase

**Phase 7: deterministically verify candidate evidence/authority signals, calculate versioned
confidence and freshness scores, resolve or surface contradictions, and promote eligible candidates
into canonical KnownPaths.** Do not begin search/retrieval, MCP knowledge tools, Agent Skill
distribution, contribution workflows, or dashboards until their designated later phases.

## Phase 5 — Official Expo and React Native knowledge sources

### Phase goal

Extend seed collection beyond community threads with authoritative Expo and React Native
documentation and release material. Normal synchronization remains curated toward reusable technical
knowledge, while complete official indexes stay discoverable for targeted or future bounded
full-catalog ingestion. This phase stores normalized, attributed source material only.

### Research performed

Official sources and maintained parser documentation were checked on 2026-08-22 before
implementation:

- Expo's current [`llms.txt`](https://docs.expo.dev/llms.txt),
  [sitemap](https://docs.expo.dev/sitemap.xml), [robots policy](https://docs.expo.dev/robots.txt),
  [changelog feed](https://expo.dev/changelog/rss.xml), and
  [documentation source repository](https://github.com/expo/expo/tree/main/docs)
- React Native's current [`llms.txt`](https://reactnative.dev/llms.txt),
  [sitemap](https://reactnative.dev/sitemap.xml),
  [robots policy](https://reactnative.dev/robots.txt),
  [release feed](https://reactnative.dev/rss.xml), and
  [documentation repository](https://github.com/reactjs/react-native-website)
- Expo's repository license and React Native website's CC-BY-4.0 documentation license, plus the
  official sites' attribution and reuse boundaries
- [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser),
  [`marked`](https://marked.js.org/),
  [`html-to-text`](https://github.com/html-to-text/node-html-to-text), and
  [`robots-parser`](https://github.com/samclarke/robots-parser) documentation, release metadata,
  licenses, and supported Node.js ranges

Live discovery found 553 Expo documentation links and 281 React Native documentation links in the
official `llms.txt` indexes. It also confirmed the current Expo and React Native release feeds and
their available metadata. Package releases and engine compatibility were selected from current
registry metadata rather than memory.

### Architecture and technology decisions

- Replaced the GitHub-only source manifest with a versioned, runtime-validated source registry that
  discriminates `github_repository`, `documentation_site`, and `release_feed` adapters.
- Curated rules are data, not adapter code. They target upgrade, migration, troubleshooting,
  compatibility, deprecation, breaking-change, and release material for normal sync. Any indexed
  page can be requested explicitly, and `--scope all` preserves a future bounded full-catalog path.
- Official `llms.txt` plus Markdown page endpoints are the primary documentation interface; sitemaps
  enrich update metadata, robots rules constrain requests, and official feeds supply release
  summaries. Expo changelog HTML is not scraped or copied.
- Immutable source snapshots retain processing provenance. A separate mutable fetch-state document
  holds ETag, Last-Modified, last-fetch, latest hash/snapshot, and lifecycle state so conditional
  refreshes do not rewrite history.
- Source authority, quality tier, license, attribution, document type, ecosystem/framework, and
  detected version are deterministic registry/parser metadata. They are not inferred by an LLM.
- Markdown becomes bounded structured blocks plus normalized text. Feed HTML is converted to text;
  navigation, scripts, styles, and full page payloads are not retained. XML entity expansion,
  nesting, response size, redirects, timeouts, retries, origins, and content types are bounded.
- Complete changed documentation indexes can mark missing documents deprecated. Feed absence is not
  treated as deletion because feeds are not authoritative catalogs.
- No second database, scheduler, queue, search index, extraction provider, or publication surface
  was added.

Detailed rationale is in [`docs/DECISIONS.md`](docs/DECISIONS.md), data structures and indexes are
in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), and operating/attribution guidance is in
[`docs/OFFICIAL_SOURCE_INGESTION.md`](docs/OFFICIAL_SOURCE_INGESTION.md).

### Collections, schemas, indexes, and files created or evolved

- Added `@knownpath/source-ingestion` with registry validation, source selection, safe HTTP and
  robots handling, official catalog/feed discovery, Markdown/feed normalization, snapshot/state
  persistence, lifecycle handling, orchestration, and CLI parsing.
- Added `config/sources/registry.json` with nine data-driven sources: the five existing GitHub
  repositories, Expo and React Native documentation catalogs, the Expo changelog feed, and the React
  Native release feed.
- Evolved source registry and source-item contracts with adapter kinds, first-party/community
  authority classifications, licensing/attribution, document types, structured content blocks,
  version metadata, lifecycle state, and provenance fields.
- Added `source_item_states` as the fourteenth collection with three indexes for unique source/item
  identity, fetch scheduling, and lifecycle inspection.
- Added document-oriented source-item indexes for canonical URL identity and common
  ecosystem/framework/version/document-type queries. The database now declares 52 named indexes
  across 14 collections, excluding automatic `_id_` indexes. No vector index was added.
- Updated GitHub ingestion to consume the shared registry and attach deterministic source-quality
  metadata without changing its raw-source responsibility.
- Added `pnpm ingest:sources`, worker `sources`/`github` command routing, typed fetch limits, and
  documented environment settings with no credential defaults.
- Added this progress entry and Phase 5 updates to the root README, architecture, data model,
  decision log, GitHub ingestion guide, package documentation, and approved Phase 5 design
  specification.

### Commands and behavior successfully verified

- `pnpm install` completed for all 16 workspace projects.
- `pnpm typecheck` — 20 tasks successful.
- `pnpm lint` — 14 tasks successful.
- `pnpm build` — 14 tasks successful; the Next.js shell compiled and prerendered `/`.
- `pnpm format` and `pnpm format:check` completed successfully after documentation formatting.
- Discovery parsed all 553 Expo and 281 React Native indexed documentation links while normal
  commands selected only the bounded curated set. Both official release feeds were also discovered
  with bounded selection.
- A targeted Expo upgrade-guide sync created one source item/snapshot with 39 structured blocks,
  title, canonical URL, first-party authority, MIT attribution, ETag, fetch timestamps, and content
  hashes. Repeating it reported one unchanged item and left one immutable snapshot.
- A bounded React Native 0.87 release sync created one source item/snapshot with 87 structured
  blocks, canonical/published timestamps, detected version, first-party authority, CC-BY-4.0
  attribution, and no script/navigation chrome. Both a repeat and `--version 0.87` refresh reported
  unchanged and left one snapshot.
- A non-curated Expo Camera page was successfully selected through `--page --dry-run`; direct
  MongoDB counts before and after remained three source items, three states, and four ingestion
  runs, confirming dry-run made no persistence changes.
- A live GitHub dry run through the shared registry successfully discovered one Expo issue. Two
  later external rechecks received a safely classified retryable GitHub HTTP 504; no incompatible
  manifest or normalization error was observed.
- `pnpm db:init` completed twice. The second run reported `created: false` for all 14 collections,
  confirming idempotence. Direct inspection found all three state indexes and 52 declared named
  indexes overall.
- `pnpm db:verify` completed the repository insert/read/update/delete round trip and confirmed
  cleanup.

No automated tests were created or run, as required for this phase.

### Environment and manual setup still required

- Use the pinned Node.js 24/pnpm 11 toolchain, copy `.env.example` to `.env`, start MongoDB, and run
  `pnpm db:init` before source ingestion.
- Configure fetch timeouts, response-size limits, retry count, and an identifying user agent if the
  documented defaults do not suit the deployment. No official-source credential is required.
- Review `config/sources/registry.json`; use `discover`, `--dry-run`, and small `--limit` values
  before expanding curated rules or running `--scope all`. Use `--page` or `--version` for targeted
  work.
- A read-only `GITHUB_TOKEN` remains recommended for the GitHub sources and is required for their
  GraphQL Discussion collection. It is unrelated to official documentation/feed fetching.
- Production scheduling, worker leases, deployment topology, operational alerting, and automated
  retention enforcement remain later operational work.

### Known limitations intentionally left for later phases

- No AI/Gemini extraction, prompt execution, candidate experience creation, fix inference, semantic
  deduplication, deterministic scoring, contradiction resolution, or canonical KnownPath promotion.
- No vector or lexical indexes, public knowledge retrieval, search ranking, MCP knowledge tools,
  Agent Skill/installer flow, contribution processing, or dashboard controls.
- Curated patterns and version extraction are deterministic metadata heuristics and will need normal
  configuration maintenance as official documentation structures evolve.
- Feed entries store normalized summaries and provenance, not full linked changelog pages. Exact
  upstream modification dates are retained only when catalogs or HTTP responses expose them.
- Deprecation marking is intentionally limited to changed, complete, authoritative documentation
  indexes; physical snapshot deletion and retention automation are not implemented.
- No automated tests, by explicit Phase 5 requirement.

### Exact next phase

**Phase 6: implement provider-neutral AI extraction of immutable source snapshots into validated
candidate experiences, including the first configured extraction provider, prompt/version
provenance, bounded processing lifecycle, and deterministic output validation.** Do not implement
canonical promotion, search/retrieval, MCP knowledge tools, Agent Skill distribution, contribution
workflows, or dashboards until their designated later phases.

## Phase 7 — Deterministic evidence verification and trust scoring

### Phase goal

Resolve Gemini-extracted candidate evidence back to immutable source snapshots, verify objective
authority/confirmation/conflict signals, and produce reproducible, explainable seed-confidence
assessments without allowing an LLM to choose the score. Preserve every result as immutable history
while keeping a latest pointer on the candidate. Do not merge or promote candidates yet.

### Research performed

Current primary/official references were consulted on 2026-08-22 before implementation:

- GitHub's GraphQL `CommentAuthorAssociation` enum and Discussion object fields for repository
  authority, selected answers, answer timestamps, upvotes, and answer identity
- GitHub's official Reactions REST API and closing-issue pull-request/merge metadata
- NIST's binomial interval guidance, including Wilson confidence intervals for later outcome data
- Semantic Versioning 2.0.0 for explicit version interpretation boundaries
- Elasticsearch's explicit date-decay model as a mature reference for inspectable freshness decay
- OpenSSF Scorecard's versioned, per-check explainability as a ranking-system design reference

References and their application are recorded in [`docs/SCORING.md`](docs/SCORING.md) and
[`docs/DECISIONS.md`](docs/DECISIONS.md).

### Architecture and technology decisions

- Added framework/provider-independent `@knownpath/verification`; it calls no AI provider and reads
  persistence only through Phase 2 repositories.
- Added immutable `candidate_assessments`. Candidates carry only `latestAssessmentId`; rescoring
  appends history and then atomically updates that pointer through the candidate repository.
- Assessment idempotency covers candidate material, exact resolved source IDs/digests, algorithm,
  policy version/digest, verifier version, and explicit evaluation timestamp. Default CLI evaluation
  is stable for the current UTC day; `--force` explicitly creates another audit record.
- Evidence-reference source existence, digest, canonical URL, exact excerpt, and visibility are hard
  integrity boundaries. A mismatch creates an `ineligible` assessment at score 0.
- Official authority, GitHub author association, accepted-answer identity, original-author identity,
  merged closing PRs, closure timing, and reactions are verified from persisted deterministic
  metadata. Reactions and closure timing remain weak, capped signals and never imply
  truth/causality.
- Seed scoring is integer 0–100 ranking, not probability. Source evidence, freshness, version fit,
  and future agent outcomes are separate components. Complete inputs, points, caps, reason codes,
  and explanations are stored with each result.
- Outcome confidence is `unobserved` in Phase 7. Its future observed schema requires sample counts,
  observed proportion, Wilson bounds, method version, and timestamp, preventing small-sample success
  rates from silently masquerading as confidence.
- A runtime-validated JSON policy can be supplied explicitly with `--policy`; environment variables
  cannot silently change scoring. The bundled algorithm/policy are version 1 and the finalized
  verifier implementation is version 5 after development corrections remained visible in local
  immutable audit history.

### Collections, schemas, indexes, and files created or evolved

- Added versioned candidate-assessment, evidence-signal, source-input, score-component, outcome, and
  final-score schemas plus branded assessment IDs in `@knownpath/domain`.
- Added `latestAssessmentId` to candidate experiences.
- Added the sixteenth MongoDB collection, `candidate_assessments`, with five explicit indexes:
  unique idempotency; candidate/evaluation history; algorithm/policy history; status/score review;
  and affected-source lookup.
- Added repository methods for batch source resolution, candidate scoring queues/latest pointer,
  immutable assessment creation/idempotency lookup/history, and bounded manual cleanup.
- Added `@knownpath/verification` with stable hashing, policy validation, GitHub metadata
  validation, provenance resolution, deterministic scoring, batch orchestration, inspection, and
  command parsing.
- Added worker/root `pnpm score` commands for `one`, `pending`, `all`, `inspect`, and `history`,
  plus reproducible `--as-of`, explicit `--policy`, bounded `--limit`, and intentional `--force`
  options.
- Added [`docs/SCORING.md`](docs/SCORING.md), the approved design specification, and Phase 7 updates
  to the architecture, data model, decision log, README, workspace lockfile, and this progress log.
- No new environment variables or secrets were needed; `.env.example` remains complete.

### Commands and behavior successfully verified

- `pnpm install` completed across all 17 workspace projects.
- `pnpm typecheck` — 23 tasks successful.
- `pnpm lint` — 15 tasks successful.
- `pnpm build` — 15 tasks successful; the Next.js shell compiled and prerendered `/`.
- `pnpm format` and `pnpm format:check` completed successfully.
- `pnpm db:init` created `candidate_assessments` with its strict validator and five indexes. A
  repeat reported `created: false` for all 16 collections. Direct `mongosh` inspection found the
  automatic `_id_` plus all five declared indexes.
- Two real extracted candidates were assessed: first-party Expo EAS troubleshooting scored 70/high;
  an Expo issue with a verified `MEMBER` solution comment and later closure scored 63/moderate.
  Inspected signals came from source authority/Google-independent GitHub metadata, not Gemini
  labels.
- Repeating the same two-candidate command at the same `evaluatedAt` reported `created: 0` and
  `reused: 2`, with unchanged assessment IDs.
- Evaluating the official candidate four years later produced freshness 9/stale and reduced its
  score from 70 to 51 with an explicit `stale_applicability` cap; restoring the original evaluation
  reused the original assessment and latest pointer.
- A runtime-validated development policy changed the same official candidate from 70 to 52 and
  stored a distinct policy version/digest. History inspection retained the default, stale, changed-
  policy, and earlier verifier records without overwriting any result.
- A temporary repository-created clone of the real official candidate added a deterministic
  authoritative conflict. It scored 45 with the `authoritative_conflict` signal/cap, then both the
  temporary assessment and candidate were removed through repository cleanup.
- A direct MongoDB inspection found 16 collections, 61 named non-`_id_` indexes, two candidates, ten
  retained immutable development/audit assessments at that checkpoint, no candidate without a latest
  pointer, and no temporary candidate record.
- Final verifier-v5 scoring created the two current assessments at 70/high and 63/moderate; an exact
  repeat reported `created: 0` and `reused: 2`. The built worker booted and printed the complete
  scoring command contract alongside existing worker commands. Final direct inspection found 12
  immutable assessment records, two verifier-v5 records, two candidates, and no dangling latest
  pointer.

No automated tests were created or run, as required for this phase.

### Environment and manual setup still required

- Use the pinned Node.js 24/pnpm 11 toolchain, configure the existing ignored `.env`, start MongoDB,
  and run `pnpm db:init` before scoring.
- Keep source ingestion/extraction current before rescoring. Use `--as-of` for historical comparison
  and commit a deliberate policy/version change before production-wide `score all` operations.
- No additional credential is required for scoring; Gemini and GitHub are not contacted.

### Known limitations intentionally left for later phases

- Phase 7 does not semantically merge duplicate candidates or promote them into canonical
  KnownPaths. Independent convergence currently requires distinct persisted source roots and does
  not claim semantic equivalence.
- Agent outcomes do not affect seed scores yet. Wilson interval fields are modeled, but outcome
  aggregation/calibration waits for the contribution/outcome phase and real samples.
- Version fit is deterministic normalized metadata overlap, not dependency solving or semantic
  compatibility inference. Freshness policy will need versioned calibration from observed use.
- Assessment immutability is enforced by domain/repository APIs and append-only application flow;
  operational database roles must later deny direct update/delete privileges in production.
- No automated scheduler, canonical promotion, search/retrieval, vector index, MCP knowledge tools,
  Agent Skill/installer, contribution workflow, or dashboard was added.
- No automated tests, by explicit Phase 7 requirement.

### Exact next phase

**Phase 8: deterministically identify materially duplicate candidates, preserve conflicts and
provenance, and promote eligible groups into versioned canonical KnownPaths.** Do not begin public
search/retrieval, MCP knowledge tools, Agent Skill distribution, contribution workflows, or
dashboards until their designated later phases.

## Phase 8 — Canonicalization and deterministic deduplication

### Phase goal

Convert overlapping scored candidate experiences into stable, auditable KnownPath projections while
preserving every candidate and evidence relationship. Use deterministic blocking and merge gates
first; use public-only embeddings only to support plausible comparisons, never as an automatic merge
authority.

### Research performed

Current primary and official references were checked on 2026-08-22 before implementation:

- [Fellegi-Sunter record linkage](https://www.cs.cornell.edu/~shmat/courses/cs6434/fellegi-sunter.pdf)
  for explainable comparison fields and bounded candidate-pair blocking.
- [Broder resemblance and containment](https://www.cs.princeton.edu/courses/archive/spring13/cos598C/broder97resemblance.pdf)
  and [Sentence-BERT](https://arxiv.org/abs/1908.10084) for shingle/semantic similarity tradeoffs.
- [Sentry issue grouping](https://docs.sentry.io/concepts/data-management/event-grouping/) and
  [OpenTelemetry exception attributes](https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-spans/)
  for conservative technical-error identity and preserved exception identifiers.
- [MongoDB unique/partial indexes](https://www.mongodb.com/docs/manual/core/index-unique/),
  [transactions](https://www.mongodb.com/docs/manual/core/transactions/), and the
  [document versioning pattern](https://www.mongodb.com/blog/post/building-with-patterns-the-document-versioning-pattern)
  for current membership constraints, resumable operations, and immutable revisions.
- Official [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings),
  [`gemini-embedding-2` model details](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2),
  and [pricing/data-use terms](https://ai.google.dev/gemini-api/docs/pricing) for current model,
  dimensions, token limits, and the public-only unpaid-data boundary.

### Architecture and technology decisions

- Immutable normalizer/profile version 1 preserves error codes and exception classes while replacing
  narrowly recognized user/temp paths, UUIDs, timestamps, transient build segments, and stack
  locations. Multiple indexed blocking keys avoid all-pairs comparison.
- Versioned deterministic policy checks ecosystem, package, platform, version, error, root-cause,
  lexical problem, and lexical solution compatibility. Only strong deterministic evidence can
  produce `auto_merge`; hard incompatibilities separate and ambiguity enters review.
- `@knownpath/search` now provides only a provider-neutral embedding boundary and cosine utility.
  The real configurable Gemini adapter stores public candidate embeddings as ordinary documents;
  there is no vector index or retrieval feature.
- Candidate and every evidence source must be public before a `public_only` provider is constructed.
  Private/team data fails clearly and cannot fall back or force its way through unpaid Gemini.
- Stable KnownPaths use current memberships and a latest-revision pointer. Pair assessments, events,
  and complete revisions are immutable; merge/split/reassign/rebuild operations are idempotent and
  reversible. Different valid solution keys remain separate solution variants.
- Canonical trust is an inspectable projection of immutable Phase 7 assessments. Phase 8 does not
  invent or let Gemini assign another confidence score.

The detailed design is in
[`docs/superpowers/specs/2026-08-22-knownpath-phase-8-canonicalization-design.md`](docs/superpowers/specs/2026-08-22-knownpath-phase-8-canonicalization-design.md),
with operating behavior in [`docs/CANONICALIZATION.md`](docs/CANONICALIZATION.md).

### Collections, schemas, indexes, and commands added

- Added versioned schemas and repositories for `candidate_similarity_profiles`,
  `candidate_embeddings`, `candidate_pair_assessments`, `canonical_memberships`,
  `canonicalization_events`, and `known_path_revisions`; evolved `known_paths` into the stable
  current canonical projection. MongoDB now has 22 declared collections and 88 named non-primary
  indexes.
- Added `@knownpath/canonicalization` with technical normalization, profile/block construction,
  bounded embedding input, pair assessment, discovery, conservative auto-merge, manual merge/split/
  reassign, canonical rebuild, history, and inspection services.
- Added provider/model/version/dimension/time-aware embeddings to `@knownpath/search`, corresponding
  typed configuration, `.env.example` placeholders, worker composition, and root `pnpm canonicalize`
  commands.
- Updated architecture, data-model, decision, package, canonicalization, root README, environment,
  and progress documentation.

### Commands successfully verified

- `pnpm install` completed for all 18 workspace projects with the pinned lockfile.
- `pnpm typecheck` completed all 26 tasks successfully.
- `pnpm lint`, `pnpm format:check`, and `pnpm build` completed successfully.
- `pnpm db:init` completed twice; the repeat reported no collection creation, confirming idempotent
  collection/validator/index reconciliation. Direct MongoDB inspection found 22 collections and 88
  declared named non-`_id_` indexes.
- Similarity profiling of both retained real candidates was idempotent. Discovery left the distinct
  Expo official-document and GitHub candidates unpaired instead of forcing a match.
- Two real duplicated Expo issue reports were collected and extracted, but Gemini correctly marked
  both `insufficient_evidence`; they did not become fake reusable candidates.
- A temporary development clone of the real scored official Expo candidate varied paths, line
  numbers, and timestamps. Normalization converged without removing `ERR_MODULE_NOT_FOUND`,
  `TS2307`, `TypeError`, or `java.net.ConnectException`. The blocked pair had strong deterministic
  agreement and public Gemini cosine similarity `0.9923935`; an unchanged repeat reused profiles,
  embeddings, and pair assessment without another provider call.
- The safe automatic merge created a two-member, one-solution KnownPath. Manual split, remerge,
  reassign to another temporary KnownPath, split again, rebuild, and history inspection preserved
  ordered events, inactive memberships, all four distinct evidence references, stable identity, and
  immutable revisions. A repeated unchanged rebuild reused the same latest revision.
- A temporary public candidate referencing a private source was rejected with
  `embedding_provider_visibility_forbidden` before provider access and created no embedding.
- All temporary candidates, source, assessments, canonical records, memberships, events, revisions,
  pair result, and clone embedding were explicitly removed after inspection. The two real candidates
  and their prior statuses remain; legitimate immutable profiles and the public original embedding
  remain available for regeneration/audit.
- A tracked-file secret scan found no Gemini key or credential value. No tests were added or run, as
  required.

### Environment and manual setup still required

- Use Node.js 24.18.0/pnpm 11, configure the ignored `.env`, start MongoDB, and run `pnpm db:init`.
- Public embeddings require `GEMINI_API_KEY`. Review the configured model/version/dimensions and
  provider-call budget before a batch. A private/team-capable provider is intentionally unavailable.
- Run `canonicalize auto-merge` in dry-run mode first. Human review remains required for every
  `review` pair and all judgment-based manual merge/split/reassign operations.
- Docker Desktop was not running during final Phase 8 verification; the already-running local
  MongoDB instance was used and inspected directly.

### Known limitations intentionally left for later phases

- The retained development corpus currently has only two reusable scored candidates and no two
  independently sourced solved candidates suitable for a permanent real canonical merge. The
  complete merge lifecycle was therefore verified with a temporary, provenance-preserving variant of
  real official-source candidate data and cleaned afterward; no fabricated production knowledge
  remains.
- GitHub's unauthenticated paginated issue API returned a provider `422` before a narrow older
  client-side `until` backfill could reach additional solved examples. Authenticated, cursor-bounded
  source expansion is operational follow-up, not a Phase 8 canonicalization shortcut.
- Semantic similarity is pair-local only. There is no vector index, vector/lexical retrieval, search
  API, clustering over unblocked candidates, or semantic-only auto merge.
- Private/team embeddings remain hard-blocked until an explicitly approved private-data provider or
  account is configured. No paid or self-hosted provider was added speculatively.
- Automatic canonical summary regeneration is deterministic selection/aggregation, not LLM
  rewriting. Human adjudication UI, production role enforcement for append-only collections,
  distributed operation leases, and replica-set transactions remain future operational work.
- No MCP knowledge tools, Agent Skill/installer, contribution workflow, agent-outcome calibration,
  public registration, or dashboard was added. No automated tests were added by explicit Phase 8
  requirement.

### Exact next phase

**Phase 9: build visibility-aware semantic/hybrid retrieval and production search indexing over
canonical KnownPaths, including the vector-index lifecycle and explainable ranking, without starting
MCP, Agent Skill/installer, contribution, or dashboard phases early.**

## Phase 9 — Hybrid semantic retrieval and explainable ranking

### Phase goal

Let a developer describe an Expo/React Native problem and retrieve the most relevant canonical
KnownPaths through exact technical matching, lexical relevance, optional semantic similarity,
version applicability, deterministic trust, freshness, and future outcome signals. Keep MongoDB as
the only database, preserve a useful local path, and make every ranking decision inspectable.

### Research performed

Current official and primary references were checked on 2026-08-22 before implementation:

- MongoDB's current
  [Vector Search index fields](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-type/),
  [`$vectorSearch` stage](https://www.mongodb.com/docs/manual/reference/operator/aggregation/vectorsearch/),
  [Search index management](https://www.mongodb.com/docs/atlas/atlas-search/create-index/), and
  [hybrid-search guidance](https://www.mongodb.com/docs/atlas/atlas-vector-search/hybrid-search/)
  for current index definitions, first-stage query requirements, filtering, candidate pools, and
  server-side fusion availability.
- MongoDB's current
  [Search deployment documentation](https://www.mongodb.com/docs/manual/core/search/) and
  [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) for the
  local `mongot` boundary, Free-cluster storage/search-index limits, and the possibility that Free
  clusters require Atlas UI index creation.
- Official [Gemini embedding guidance](https://ai.google.dev/gemini-api/docs/embeddings),
  [`gemini-embedding-2`](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2), and
  [pricing/data-use terms](https://ai.google.dev/gemini-api/docs/pricing) for the current stable
  model, 8,192-token input limit, 128–3,072 configurable dimensions, asymmetric retrieval task
  formatting, and unpaid-service privacy boundary.
- [Semantic Versioning](https://semver.org/) and the maintained `node-semver` implementation for
  exact/range compatibility and explicit unknown/incompatible states.

### Architecture and technology decisions

- Added a rebuildable `known_path_search_documents` projection so retrieval never performs a large
  canonical-history join. Each document records its canonical revision, content digest,
  projection/text/ranking versions, visibility/lifecycle, exact identifiers, applicability, trust
  assessment IDs, freshness/outcome state, and provider/model/version/dimensions/input-hash/time.
- Retrieval is staged: deterministic indexed error/metadata blocking, lexical retrieval, optional
  Atlas vector retrieval, then versioned application-side reranking. The ranker returns component
  values, penalties, caps, reason codes, and explanations rather than one opaque score.
- Local MongoDB is the default free path using exact indexes plus a weighted text index. Atlas is an
  explicit optional backend with `search` and `vectorSearch` definitions and an idempotent,
  readiness-polled index lifecycle. MongoDB remains the sole database.
- `gemini-embedding-2` is the real configurable embedding provider at 768 dimensions by default.
  Model/version/dimensions and input versions make re-embedding safe. Semantic relevance cannot
  overrule explicit version incompatibility, conflict, moderation, deprecation, or weak trust.
- The unpaid provider remains `public_only` for both documents and queries. KnownPath, candidate,
  and source visibility is checked before provider construction; private/team query text fails with
  `embedding_provider_visibility_forbidden` and is never silently downgraded. The developer CLI also
  rejects non-public retrieval without future owner/team authorization context.
- Published records are the normal query scope. Review records require an explicit CLI option, so
  the verification corpus was not falsely published.

The detailed design is in
[`docs/superpowers/specs/2026-08-22-knownpath-phase-9-retrieval-design.md`](docs/superpowers/specs/2026-08-22-knownpath-phase-9-retrieval-design.md),
with operations and ranking behavior in [`docs/RETRIEVAL.md`](docs/RETRIEVAL.md).

### Collections, schemas, indexes, commands, and verification data

- Added strict domain/API-facing query, search-document, capability, version-fit, result, and score
  breakdown schemas; deterministic query/error normalization and semver/range evaluation; and the
  versioned `knownpath-retrieval-ranking` policy.
- Added the `known_path_search_documents` repository, validator, materialization service, exact,
  local text, Atlas Search, and Atlas Vector Search queries. MongoDB now has 23 declared collections
  and 96 named non-primary indexes, including eight ordinary search-document indexes.
- Added Atlas lexical/vector index printing, creation/readiness, and status commands; bounded
  projection/re-embedding; redacted inspection; and manual hybrid query commands under
  `pnpm run search`.
- Added centralized local/Atlas backend, index-name, readiness, candidate-pool, result-limit, and
  minimum-score configuration plus documented `.env.example` values.
- The database had **0 canonical KnownPaths at Phase 9 start**. As explicitly approved, the two
  existing real scored candidates were promoted separately—not merged—into public `review` records
  `0853accf-9e56-4b6f-9952-a4263c91d537` and `00fddedd-4666-453c-9732-a20219bc99e3`. Each has
  exactly one supporting membership, immutable revision, original candidate ID, source evidence, and
  latest immutable assessment ID. Neither was marked published or verified, and no additional
  canonical knowledge was fabricated.

### Commands successfully verified

- `pnpm install` completed for all 18 workspace projects after adding current `semver` and type
  declarations.
- `pnpm typecheck` completed all 26 tasks; `pnpm lint` completed all 16 tasks; `pnpm format:check`
  passed; and `pnpm build` completed all 16 build tasks.
- `pnpm db:init` completed twice. The first created only `known_path_search_documents`; the repeat
  reported every collection as existing. Direct MongoDB inspection found 23 collections and 96 named
  non-`_id_` indexes.
- Both approved review KnownPaths were projected with real public Gemini embeddings using
  `gemini-embedding-2`, 768 dimensions. Direct inspection found two active ready projections. An
  unchanged repeat and `reembed --all` each reported two reused documents and **0 provider calls**.
  With the key explicitly absent, a no-embedding projection reused the unchanged ready document;
  explicit re-embedding failed clearly with `embedding_provider_not_configured`.
- The exact `ERR_INVALID_ARG_VALUE`/Expo 26.7.0 query ranked its matching real review KnownPath
  first at 68 with visible exact-error 18, lexical 15, metadata 12, exact-version 10, trust 8,
  freshness 5, and outcome 0 components. Querying the same material with Expo 999.0.0 classified it
  incompatible, applied the penalty/cap, and returned zero results at the default 35 threshold.
- A separate EAS `None of these files exist` query ranked the official-document-backed record above
  the unrelated Node/TypeScript record. Local optional semantic mode explicitly reported Vector
  Search unavailable while exact and weighted-text retrieval continued.
- A private semantic query failed before Gemini with `embedding_provider_visibility_forbidden`.
  Atlas `search` and `vectorSearch` definitions printed successfully without exposing credentials.
  `git diff --check` passed.
- Direct revision inspection confirmed the original source IDs/URLs/excerpts and immutable Phase 7
  assessment IDs remain attached to both review records. No tests were added or run, as required.
- Follow-up Atlas verification used the contributor-provided Atlas Free cluster after the Phase 9
  implementation commit. The existing real database was copied into an initially empty `knownpath`
  database without losing provenance. Direct inspection found the same 23 collections, 96 ordinary
  named indexes, two review KnownPaths, two active memberships/revisions, and two active ready
  search projections.
- Programmatic Atlas initialization created `knownpath_lexical_v1` (`search`) and
  `knownpath_vector_v1` (`vectorSearch`, 768-dimensional cosine with scalar quantization). Both
  reached `READY` and `queryable: true`; a repeat created nothing and reused both ready indexes.
- A live required-semantic `ERR_INVALID_ARG_VALUE`/Expo 26.7.0 query used exact, MongoDB Search, and
  MongoDB Vector Search together. The correct record ranked first at 82: exact error 18, lexical 15,
  semantic 14, metadata 12, exact version 10, trust 8, freshness 5, outcomes 0.
- A live natural-language EAS/gitignored-file query ranked the correct official-document record at
  42 above the unrelated record at 27. Repeating the exact query with Expo 999.0.0 remained
  incompatible and returned zero results at the default threshold even with semantic retrieval.
- Atlas `pnpm db:init` was repeated with zero collections created, and index status again reported
  both Search indexes ready/queryable. The Homebrew `mongodb-community` service was then stopped and
  port 27017 was confirmed not listening; the ignored `.env` now selects Atlas. No Atlas credential
  was written to tracked files.

### Environment and manual setup still required

- Use Node.js 24.18.0/pnpm 11, configure the ignored `.env`, make the selected MongoDB deployment
  reachable, and run `pnpm db:init`.
- Public document/query embeddings require `GEMINI_API_KEY`; review call budgets and rotate the key
  if it has ever been exposed outside the ignored local environment.
- Atlas semantic retrieval requires `SEARCH_BACKEND=atlas` and ready Search/Vector Search indexes.
  The current ignored development environment is configured and verified against Atlas; other
  contributors must supply their own URI/credentials and run `indexes create` or use the Atlas UI.
- Keep review records opt-in until actual moderation/publication logic justifies a status change.

### Known limitations intentionally left for later phases

- The retained real verification corpus has only two unrelated review records. It validates
  exact/lexical/version/trust/freshness behavior but is too small to evaluate production recall,
  semantic ranking calibration, or result diversity.
- Local standalone MongoDB has no configured Search service, so it intentionally cannot execute
  semantic vector retrieval. The fallback does not pretend cosine scores exist.
- Outcome contribution is modeled and explained as unobserved/zero; real agent outcomes and
  conservative small-sample calibration remain a later contribution phase.
- Atlas index-definition drift currently remains an explicit operator inspection/versioning task; an
  existing same-name definition is reused rather than silently mutated.
- No public search HTTP route, MCP knowledge tool, Agent Skill/installer, contribution workflow,
  public registration, team/workspace authorization model, or dashboard was added. No tests were
  added by explicit Phase 9 requirement.

### Exact next phase

**Phase 10: expose the existing visibility-aware retrieval service through a secure, versioned MCP
knowledge interface with bounded results and transparent ranking/provenance, without starting Agent
Skill installation, contribution/outcome collection, or dashboard work early.**

## Phase 10 — Stable knowledge HTTP API

### Phase goal

Expose canonical retrieval through a secure, versioned HTTP contract for future MCP, web, CLI, and
integration clients. Keep ranking, persistence, lifecycle authorization, safe response projection,
review auditing, and usage semantics out of Fastify handlers. Do not expose raw sources, embeddings,
model internals, private/team records, or unapproved review records.

This phase deliberately implements the HTTP API requested by the Phase 10 prompt before the MCP
transport previously anticipated at the end of Phase 9. That sequencing change does not alter the
retrieval/domain boundaries and is recorded rather than rewriting prior phase history.

### Research performed and official references consulted

- Rechecked Fastify 5.12.1's current route, validation/serialization, error, and logging guidance.
  Route schemas remain the request/response authority; database work stays in services/hooks;
  response schemas act as serialization allowlists; request IDs and Pino redaction remain the safe
  logging boundary.
- Rechecked `@fastify/swagger` 9's Fastify 5 support and register-before-routes requirement. OpenAPI
  3.1 continues to be generated from the Zod route schemas.
- Rechecked `@fastify/rate-limit` 11 behavior and per-route configuration. Phase 10 adds named route
  policy metadata while retaining the explicitly limited in-memory/IP-oriented store until a
  multi-instance topology justifies distributed infrastructure.
- Reviewed URL versioning and error/pagination standards. KnownPath retains `/api/v1` rather than
  adding header negotiation; retains its Phase 3 stable error envelope rather than breaking clients
  for RFC 9457; and uses a bounded top-k search plus an integrity-protected opaque cursor only for
  stable solution-variant lists.

Official references consulted:

- <https://fastify.dev/docs/latest/Reference/Routes/>
- <https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/>
- <https://fastify.dev/docs/latest/Reference/Errors/>
- <https://fastify.dev/docs/latest/Reference/Logging/>
- <https://github.com/fastify/fastify-swagger>
- <https://github.com/fastify/fastify-rate-limit>
- <https://www.rfc-editor.org/rfc/rfc8288>
- <https://www.rfc-editor.org/rfc/rfc9457>

### Architecture and technology decisions

- Added versioned shared Zod contracts for knowledge search, safe ranked results, detail,
  alternatives, provenance, usage selection, access modes, cursors, and stable response envelopes.
  Persisted KnownPath/source/search/assessment records are never HTTP response schemas.
- Added centralized `authorizeKnowledgeRead`. Normal sessions and keys are forced to public
  `published` records. Review access requires an explicit flag plus an admin-owned active API key
  with `knowledge:read`; even admin sessions remain published-only. Inaccessible review IDs return
  the same `knowledge_not_found` response as nonexistent IDs.
- Extended `@knownpath/search` with a transport-independent knowledge-access service. It translates
  safe inputs to retrieval queries, rechecks lifecycle/visibility, maps applicability/trust/
  freshness, resolves bounded safe provenance, signs/validates alternative cursors, records usage,
  and appends review audit events. Fastify handlers only validate, authenticate, authorize, and
  delegate.
- Added `knowledge_search_events` for bounded search/selection usage. It stores a keyed/versioned
  query digest, structured counts, returned IDs/ranks/scores, and at most one selected result. It
  stores no raw query and never creates or implies an `agent_outcome`.
- Added four authenticated routes: `POST /api/v1/knowledge/search`, `GET /api/v1/known-paths/:id`,
  `GET /api/v1/known-paths/:id/alternatives`, and
  `POST /api/v1/knowledge/searches/:searchId/selections`.
- Added explicit 32 KiB/4 KiB mutation body limits, named search/read/usage rate policies, stable
  knowledge error codes, no-store caching, OpenAPI examples/descriptions, and safe provider-error
  mapping. Anonymous public access and private/team retrieval remain disabled.
- Kept multiple solutions as variants of one canonical KnownPath. The alternatives endpoint does not
  invent cross-record semantic relationships. Search remains top-k; cursor pagination is used only
  where stable variant ordering exists.
- Fixed a live Phase 3 audit boundary discovered during verification: Better Auth may supply an
  empty/one-character session IP representation. The audit service now omits invalid IP metadata
  rather than failing sign-in or weakening the persisted audit schema.

The approved design is
[`docs/superpowers/specs/2026-08-22-knownpath-phase-10-knowledge-api-design.md`](docs/superpowers/specs/2026-08-22-knownpath-phase-10-knowledge-api-design.md).
The operational contract and curl examples are in [`docs/API.md`](docs/API.md).

### Files and persistence created or materially updated

- Added `packages/domain/src/knowledge-access.ts` and extended common/audit contracts with search
  event identity and review audit types.
- Added `packages/search/src/access.ts` for the reusable knowledge-access/safe-projection service.
- Added `apps/api/src/knowledge-routes.ts`; updated API composition, startup configuration,
  centralized errors, caching, OpenAPI, and the API workspace dependency graph.
- Extended `@knownpath/auth` with centralized knowledge authorization, review-specific authorization
  errors, named rate policies, and safe IP normalization in audit writes.
- Added the `knowledge_search_events` collection, strict validator, repository, selection update,
  collection registry, and five named indexes. MongoDB now has 24 declared collections and 101
  ordinary named non-`_id_` indexes.
- Added `docs/API.md`; updated `README.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`,
  `docs/RETRIEVAL.md`, `docs/DECISIONS.md`, and the lockfile.
- `.env.example` required no new secret or setting: Phase 10 reuses the required `API_KEY_PEPPER`
  for HMAC query digests/cursors and the existing search/embedding/API configuration.

### Commands and behavior successfully verified

- `pnpm install` reconciled the API's new workspace dependency and passed the repository's
  supply-chain lockfile policy.
- `pnpm typecheck` completed **26/26** tasks; `pnpm lint` completed **16/16** tasks; `pnpm build`
  completed **16/16** tasks; and `pnpm format`/`pnpm format:check` completed without formatting
  failures. No tests were created or run.
- Atlas `pnpm db:init` created only `knowledge_search_events` on the first Phase 10 run. A repeated
  run reported **24 collections, 0 created**, and all five search-event indexes. Direct Atlas
  inspection counted **24 collections and 101 ordinary named indexes**.
- The API booted against Atlas with process-local generated auth secrets. `/health/live` and
  `/health/ready` returned 200; readiness reported MongoDB/auth healthy. OpenAPI 3.1 and Swagger
  registration loaded successfully with all four knowledge routes and strict request/response
  schemas.
- Users were created only through the masked closed-registration CLI. An admin and normal user each
  received a temporary hashed `knowledge:read` API key through the session-only issuance route; no
  full key was printed or persisted after the verification process.
- With the same admin key, default `published` search returned HTTP 200 and **0 results**. Explicit
  `includeReview` search returned HTTP 200 and both existing real records, each still `review`;
  semantic capability reported `used` through Atlas Vector Search. Atlas still contained **2 review,
  0 published** KnownPaths after verification.
- Explicit admin detail returned 200 with only `contractVersion`, identity/title/problem, symptoms,
  normalized errors, applicability, solutions, trust, freshness, and safe provenance. The inspected
  provenance contained only its source ID/link/title/type/kind/authority/publisher/relationship/
  locator/excerpt. A recursive field check found **0** embedding, content-digest, provider-metadata,
  assessment, candidate, audit, or key-hash fields.
- The same review detail without explicit review intent returned 404 `knowledge_not_found`.
  Alternatives returned 200 with the truthful empty list for the current one-solution record. A
  malformed cursor returned 400 `invalid_cursor`.
- Selection reporting returned 200 and persisted the selected KnownPath/rank/request time on the
  originating search record. Direct inspection showed only the HMAC query digest, bounded query
  counts, two returned IDs/ranks/scores, and selected ID/rank/time—not raw text or an outcome. A
  final current-build pass confirmed first selection 200, same-selection retry 200 idempotently, and
  a different second selection 409 `selection_conflict` after the atomic select-once guard.
- Direct audit inspection found `knowledge.review_searched` and `knowledge.review_read` records with
  the admin user ID, API-key ID, request ID, target, success outcome, and timestamps.
- A normal-user key requesting review returned 403 `knowledge_review_access_forbidden`; invalid
  input returned 400 `validation_failed`; an invalid key returned 401 `authentication_required`; a
  nonexistent UUID returned 404 `knowledge_not_found`; and a body over the route limit returned 413
  `payload_too_large`.
- `/api/v1/account/me` returned 200 with API-key authentication metadata. Both verification keys
  revoked successfully, then the revoked admin key returned 401. Direct Atlas inspection found **0
  active Phase 10 verification keys**. All six temporary verification identities created while
  diagnosing the sign-in boundary were suspended through the repository layer.
- Observed structured request logs contained method, safe URL, request ID, status, and latency but
  no Authorization header, cookie, plaintext key, password, or request body. Temporary cookie files
  and in-process credential variables were removed.

### Environment and manual setup still required

- Contributors must configure ignored `MONGODB_URI`/`MONGODB_DATABASE`, generate independent
  `BETTER_AUTH_SECRET` and `API_KEY_PEPPER`, configure trusted origins/proxy settings, and run
  `pnpm db:init`.
- Create users only through `pnpm auth:user:create`; issue keys through an authenticated session.
  Normal agent/MCP clients need `knowledge:read`. Review inspection additionally requires an admin
  owner and explicit request intent.
- Atlas semantic retrieval requires the documented Search/Vector Search indexes and a configured
  public-only Gemini key. Local MongoDB remains useful through deterministic/weighted-text fallback.
- Rotate the Gemini and Atlas credentials previously pasted into conversation; they were kept only
  in the ignored local environment but should be treated as exposed.

### Known limitations intentionally left for later phases

- The development corpus remains only two unrelated review records. No record was fabricated,
  merged, verified, or published for API verification.
- Anonymous public access remains disabled. The current per-process/IP-oriented limiter is not a
  production distributed abuse-control system.
- Private/team knowledge authorization and an explicitly approved private-data embedding provider
  remain future work; Phase 10 never sends such data through unpaid Gemini.
- Alternatives currently represent additional solution variants on the same KnownPath. Reviewed
  cross-record relatedness is not modeled and semantic similarity alone does not create it.
- Search events have no TTL/retention automation yet. The intended retention policy must be chosen
  from measured operational/privacy needs before adding deletion.
- Search selection is usage only. Real agent success/failure outcomes and conservative confidence
  updates remain deferred.
- No MCP knowledge tool, Agent Skill/installer, web dashboard, contribution workflow, public signup,
  OAuth, password reset, email verification, or team/workspace administration was added. No tests
  were added by explicit Phase 10 requirement.

### Exact next phase

**Phase 11: expose the existing authorization-aware knowledge-access service through the official
MCP TypeScript SDK with bounded, explainable search/detail tools, without starting Agent Skill
installation, contribution/outcome collection, or dashboard work early.**

## Phase 11 — KnownPath MCP server

### Phase goal

Expose mature read/search knowledge capabilities to coding agents through a compact official MCP
surface. Keep production authorization, ranking, audit, usage, and persistence in the backend, with
a thin agent-agnostic stdio bridge that calls the Phase 10 HTTP API and needs no database or AI
provider secrets.

### Research performed and official references consulted

- Verified the current MCP specification release is `2026-07-28` and reviewed lifecycle, tools,
  cancellation, authorization, security, stdio, and Streamable HTTP requirements.
- Verified the stable official TypeScript SDK v2 packages and current split package layout. Phase 11
  pins `@modelcontextprotocol/server`, `@modelcontextprotocol/client`, and
  `@modelcontextprotocol/node` at `2.0.0`; the SDK supplies current-era negotiation plus its
  documented 2025-compatible fallback.
- Reviewed the current official MCP Inspector. It supports web, CLI, and TUI clients, negotiates
  modern/legacy protocol eras, and currently requires Node 22.19 or newer.
- Reviewed official current client documentation for OpenAI Codex, Claude Code, Cursor, and Gemini
  CLI. All support stdio and remote HTTP MCP paths; exact configuration behavior and environment
  handling are recorded in `docs/MCP.md`. Codex 0.149.0 and Claude Code 2.1.185 were present in the
  development environment; Cursor and Gemini CLI were not installed.
- Rechecked MCP Host/Origin validation, bearer-auth handling, transport migration away from legacy
  HTTP+SSE, bounded/cancellable requests, and model-oriented tool description guidance.

Official references consulted:

- <https://modelcontextprotocol.io/specification/2026-07-28>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>
- <https://ts.sdk.modelcontextprotocol.io/v2/>
- <https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector>
- <https://developers.openai.com/codex/mcp/>
- <https://code.claude.com/docs/en/mcp>
- <https://docs.cursor.com/en/context/mcp>
- <https://geminicli.com/docs/tools/mcp-server/>

### Architecture and technology decisions

- Added `@knownpath/mcp` as the one versioned capability contract/server boundary. It owns strict
  inputs, full runtime-validated outputs, compact projections, safe error mapping, HTTP gateway, and
  one server factory shared by both transports.
- Mounted stateless Streamable HTTP at `/mcp` in the Fastify API. Fastify authenticates only bearer
  API keys with `knowledge:read`, validates Host/Origin, applies body/rate bounds, and supplies a
  request-scoped gateway backed by the existing `KnowledgeAccessService`.
- Rebuilt `apps/mcp-server` as a thin stdio bridge. It uses only `KNOWNPATH_API_URL`,
  `KNOWNPATH_API_KEY`, timeout, and maximum-response settings; it calls Phase 10 routes and imports
  no database, search implementation, auth persistence, or Gemini provider.
- Advertised exactly four read tools: `knownpath_search`, `knownpath_get`, `knownpath_alternatives`,
  and `knownpath_status`. Contribution/outcome names are documentation-only reservations, not fake
  writes.
- Search returns bounded summaries and match/trust/freshness/applicability indicators. `get` reveals
  deeper steps and evidence only after selection; optional `searchId` records usage without creating
  a successful outcome. Output truncation is explicit.
- Normal clients remain public/published-only. `includeReview` is explicit and requires an active
  admin-owned key; the existing central authorization and audit service remain authoritative.
- Tool discovery advertises only input schemas to reduce client context. Complete output schemas
  remain versioned and enforced at runtime; discovery fell from 52,999 bytes during initial
  inspection to 7,709 bytes without changing structured results.
- Bearer API keys are the deliberate Phase 11 MCP authentication mechanism. OAuth was not
  superficially added or claimed; it remains a future deployment/authentication decision.

The approved design is
[`docs/superpowers/specs/2026-08-22-knownpath-phase-11-mcp-server-design.md`](docs/superpowers/specs/2026-08-22-knownpath-phase-11-mcp-server-design.md).
The operational/client guide is [`docs/MCP.md`](docs/MCP.md).

### Files and packages created or materially updated

- Added `packages/mcp` with shared contracts, server factory, bounded projections, gateway
  abstraction, and the real Phase 10 HTTP gateway.
- Added `apps/api/src/mcp-routes.ts` and `apps/api/src/mcp-gateway.ts`; updated API composition,
  no-store handling, safe authentication errors, dependencies, and OpenAPI status documentation.
- Replaced the Phase 1 MCP placeholder with the stdio bridge in `apps/mcp-server/src/index.ts` and
  added `apps/mcp-server/src/inspect.ts`, an official-SDK manual client for both transports.
- Added root `mcp:stdio` and `mcp:inspect` commands, MCP bridge environment configuration, current
  SDK catalog entries/lockfile state, and small exported safe-domain helper types.
- Added `docs/MCP.md`; updated `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`,
  `docs/DECISIONS.md`, `.env.example`, and this progress record.
- Phase 11 changed no MongoDB collection, validator, or index definition.

### Commands and behavior successfully verified

- `pnpm install` reconciled 19 workspaces and passed the lockfile supply-chain policy.
- `pnpm typecheck` completed **28/28** tasks; `pnpm lint` completed **17/17** tasks; `pnpm build`
  completed **17/17** tasks; `pnpm format` and `pnpm format:check` completed successfully. No tests
  were created or run.
- The Atlas-backed API booted and readiness reported MongoDB/auth healthy. The official SDK client
  negotiated the modern era over both HTTP and stdio and listed exactly the same four tool names.
  Post-optimization stdio discovery was 7,709 bytes.
- `knownpath_status` reported ready, Atlas search, one scoped permission, and explicit admin review
  capability without email, credentials, URI, or provider secrets.
- Default MCP search used `published` access and returned zero records. Explicit admin review search
  returned the two existing real records, both still `review`; no record was published or
  fabricated.
- MCP detail returned one real solution and one bounded evidence reference with selection recorded;
  alternatives truthfully returned zero for the one-solution record. The same review detail worked
  through the stdio bridge. A recursive response-field inspection found zero embedding, digest,
  key-hash, candidate, assessment, provider-metadata, or Authorization paths.
- A normal-user key requesting review received model-readable `knowledge_review_access_forbidden`.
  Empty task input was rejected by the tool schema. Invalid and revoked keys failed connection, an
  untrusted Origin returned 403, and an unreachable backend returned the safe `backend_unreachable`
  tool code.
- Review search/read audit types were present in Atlas and the selected search event persisted.
  Direct lifecycle inspection still found exactly **2 review and 0 published** KnownPaths.
- Structured API logs contained request IDs, method, safe URL, status, and latency. Exact generated
  passwords/API keys and credential-header patterns each had zero matches.
- All temporary verification keys were revoked and every temporary Phase 11 user created during
  implementation/diagnosis was suspended. Final inspection found **0 active temporary keys** and no
  listener on port 3001.

### Environment and manual setup still required

- Run the API with configured ignored MongoDB/auth/search settings, then create an API key through
  the closed-registration session flow. Agent keys require `knowledge:read`.
- Configure either the remote `/mcp` URL with a bearer key or the stdio bridge with
  `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`. Never commit the key or place it in a URL.
- Cursor and Gemini CLI were not installed in this environment. Their official-doc-based examples
  are documented, but contributors using those clients must perform the final client-side connection
  check. The official SDK client verified the server and both transports here.
- Production deployment should use HTTPS and an explicit public Host/origin configuration. OAuth
  remains absent rather than partially implemented.
- Rotate the Gemini and Atlas credentials previously pasted into conversation; tracked files contain
  neither value, but pasted credentials must be treated as exposed.

### Known limitations intentionally left for later phases

- MCP is read-only. Contribution and outcome-reporting tools, their scopes, validation, persistence,
  abuse controls, and confidence effects are not implemented.
- Agent Skill packaging, automatic installer CLI behavior, per-agent adapters, and dashboard/client
  UX are not implemented.
- Anonymous/public MCP access, OAuth, private/team authorization, distributed rate limiting, and
  multi-instance session/event transport are deferred deliberately.
- The real development corpus remains two unrelated review records with no published knowledge. This
  verifies authorization and transport behavior but is not a production relevance evaluation.
- The HTTP endpoint is stateless and currently uses the process-local rate limiter inherited from
  Phase 3/10. Long-running resumable MCP sessions were unnecessary for the read-only tool set.
- No tests were added by explicit Phase 11 requirement.

### Exact next phase

**Phase 12 (awaiting its prompt): package the existing MCP capability as an Agent Skill and build
the safe installer/per-agent adapter foundation, without implementing contribution/outcome writes or
a dashboard unless the Phase 12 requirements explicitly request them.**

## Phase 12 — Portable KnownPath Agent Skill

### Phase goal

Create a portable behavioral/instruction layer that teaches compatible coding agents when and how to
consult the existing KnownPath MCP read tools. Keep the artifact concise, evidence-oriented,
privacy-preserving, and independent of client-specific installation behavior.

### Research performed and official references consulted

Current official documentation was checked on 2026-08-23 before implementation:

- The [Agent Skills specification](https://agentskills.io/specification) for the required directory,
  `SKILL.md` frontmatter constraints, standard metadata, progressive disclosure, optional resources,
  and `skills-ref` validation.
- [OpenAI Codex skills](https://developers.openai.com/codex/skills/) for automatic/manual
  activation, `.agents/skills` repository/user discovery, symlink support, and current skill
  inspection behavior.
- [Claude Code skills](https://code.claude.com/docs/en/skills) for its open-standard support,
  `.claude/skills` locations, symlink behavior, automatic invocation, and standard-versus-extension
  frontmatter boundary.
- [Cursor Agent Skills](https://cursor.com/docs/skills) for `.agents/skills` interoperability,
  native locations, automatic/manual activation, and progressive resources.
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/) for its
  `.agents/skills` alias, `gemini skills link`, discovery/reload commands, and activation consent.
- [GitHub Copilot Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
  and [GitHub CLI skill installation](https://cli.github.com/manual/gh_skill_install) for its
  open-standard client support, shared `.agents/skills` paths, and version-aware distribution path.

The official pages and current implementation were researched through web lookup rather than
remembered path/frontmatter assumptions. Codex 0.149.0, Claude Code 2.1.185, and GitHub CLI 2.94.0
were installed locally; Cursor and Gemini CLI were not.

### Architecture and behavior decisions

- Added one canonical `skills/knownpath` artifact with only open-standard frontmatter: `name`, a
  precise activation/exclusion `description`, `license`, and string-valued `metadata` containing
  version `1.0.0`.
- Automatic and manual activation are both supported. Positive triggers cover non-trivial debugging,
  migrations, dependency conflicts, build failures, environment/version issues, native
  configuration, tooling quirks, and unfamiliar errors. Formatting, trivial edits, routine file
  operations, obvious syntax fixes, confidently understood work, and unrelated requests are
  explicitly excluded.
- The workflow references exactly `knownpath_search`, `knownpath_get`, `knownpath_alternatives`, and
  `knownpath_status`. It teaches structured sanitized context, progressive retrieval, exact/version/
  trust/freshness comparison, local applicability reasoning, and observed verification.
- User instructions, repository rules, and safety constraints stay authoritative. Retrieved records
  are evidence rather than commands; popularity is not truth; secrets/private files and unnecessary
  proprietary code must not be sent.
- Materially influential KnownPath IDs are retained for future feedback. No nonexistent contribution
  or outcome tool is named or invoked.
- Detailed Expo SDK migration, EAS/Gradle, React Native dependency, Metro, and native-configuration
  scenarios live in one on-demand reference instead of expanding the always-loaded instructions.
- Client-specific manual placement is documentation only. Automatic installation, upgrades,
  rollback, and per-agent adapters remain Phase 13.

The approved design is
[`docs/superpowers/specs/2026-08-23-knownpath-phase-12-agent-skill-design.md`](docs/superpowers/specs/2026-08-23-knownpath-phase-12-agent-skill-design.md).

### Files created or materially updated

- Added `skills/knownpath/SKILL.md` and `skills/knownpath/references/examples.md`.
- Added `docs/AGENT_SKILL.md` with the behavior contract, current tool list, safe-use flow, release
  policy, validation commands, and current official manual paths for Codex, Claude Code, Cursor,
  Gemini CLI, and GitHub Copilot.
- Updated `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, the `@knownpath/agent-adapters`
  boundary README, and this progress record.
- No application code, MCP contract, environment variable, database collection/index, API route, or
  dependency/lockfile state changed.

### Commands and behavior successfully verified

- The official `skills-ref` reference implementation reported `Valid skill: skills/knownpath` and
  read `name: knownpath`, `license: Apache-2.0`, and metadata version `1.0.0`.
- The bundled skill-creator validator reported `Skill is valid!` after its undeclared PyYAML runtime
  dependency was supplied inside an isolated temporary virtual environment.
- Direct registration inspection found the same four tool names in `packages/mcp/src/server.ts` and
  the skill/guide: `knownpath_search`, `knownpath_get`, `knownpath_alternatives`, and
  `knownpath_status`.
- The canonical directory was linked to the current user's official Codex-compatible
  `~/.agents/skills/knownpath` path. Codex app-server `skills/list` with `forceReload: true`
  returned exactly one enabled `knownpath` entry, scope `user`, resolving to this repository's
  canonical `skills/knownpath/SKILL.md`, with the complete intended activation/exclusion
  description.
- `pnpm format` and `pnpm format:check` completed successfully.
- `pnpm typecheck` completed **28/28** tasks.
- `pnpm lint` completed **17/17** tasks.
- `pnpm build` completed **17/17** tasks, including the Next.js production build and static routes.
- No automated tests were created or run, as required.

### Environment and manual setup still required

- Configure the KnownPath MCP server and an API key with `knowledge:read` before expecting the skill
  to retrieve records. The skill stores no credentials and does not replace MCP setup.
- Use `docs/AGENT_SKILL.md` to link the canonical skill into the desired client. The Phase 12 Codex
  link is user-local and is not part of the Git repository.
- Cursor and Gemini CLI were not installed, so their current official installation/discovery flows
  remain contributor-side manual verification. Claude Code was installed but Codex satisfied the
  required live client-discovery check.
- Release tags and a public distribution location do not yet exist. The artifact version is
  inspectable, but Phase 13 must implement safe installation and update behavior.
- Rotate the Gemini and Atlas credentials previously pasted into conversation. The skill and tracked
  documentation contain neither secret.

### Known limitations intentionally left for later phases

- No automatic installer CLI, client detection, per-agent adapter, upgrade, rollback, or uninstall
  behavior exists.
- MCP remains read-only. Contribution and outcome-reporting tools, validation, persistence, abuse
  controls, and scoring effects are not implemented or advertised as callable.
- The skill cannot make private/team data eligible for the unpaid/public Gemini path and introduces
  no new private/team retrieval behavior.
- The dashboard, user-facing authentication flow, anonymous/public MCP, OAuth, and distributed rate
  limiting remain deferred.
- The development corpus still contains two unrelated review records and no published records; the
  skill changes agent behavior, not knowledge lifecycle state.
- No automated tests were added by explicit Phase 12 requirement.

### Exact next phase

**Phase 13: implement the automatic installer CLI and per-agent adapters that safely install,
configure, update, inspect, and remove the canonical KnownPath skill/MCP integration across
supported clients. Do not begin contribution/outcome writes or dashboard work unless the Phase 13
prompt explicitly requires them.**

## Phase 13 — Automatic multi-agent KnownPath installer

### Phase goal

Provide a frictionless, merge-safe, idempotent, and reversible installer for KnownPath MCP access
and the canonical Agent Skill. Support Codex CLI, Claude Code, Cursor, and Gemini CLI as required,
plus only additional clients with stable official MCP/skill surfaces. Keep all credentials outside
agent configuration and all product behavior centralized in the backend.

### Research performed and official references consulted

Current official documentation was checked on 2026-08-23 before implementation:

- [OpenAI Codex MCP configuration](https://developers.openai.com/codex/mcp/) and
  [Codex Agent Skills](https://developers.openai.com/codex/skills/) for global/project TOML,
  inherited `env_vars`, `.agents/skills`, and current CLI limitations.
- [Claude Code MCP](https://code.claude.com/docs/en/mcp) and
  [Claude Code skills](https://code.claude.com/docs/en/skills) for official mutation commands,
  user/project scopes, environment interpolation, and `.claude/skills`.
- [Cursor MCP](https://cursor.com/docs/context/mcp) and
  [Cursor Agent Skills](https://cursor.com/docs/context/skills) for JSON configuration,
  `${env:NAME}` references, global/project paths, and open skill discovery.
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) and
  [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/) for official
  commands, user/project settings, explicit environment forwarding, and `.agents/skills` support.
- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/) and
  [OpenCode Agent Skills](https://opencode.ai/docs/skills/) for its stable local MCP structure,
  `{env:NAME}` references, platform/project configuration, and open skill locations.
- [Agent Skills specification](https://agentskills.io/specification),
  [Node.js environment variables](https://nodejs.org/api/environment_variables.html), and
  Microsoft's [jsonc-parser](https://github.com/microsoft/node-jsonc-parser) for the portable
  artifact, cross-platform process configuration, and comment-preserving JSON edits.

GitHub Copilot, Cline, and Windsurf were researched but not added: their current combined MCP/skill
installer surfaces are preview, extension-specific, or insufficiently stable for safe reversible
ownership. The npm registry returned no published `knownpath` package at research time. Current
versions were selected from registry/official metadata rather than memory; `jsonc-parser` 3.3.1 and
esbuild 0.28.2 are maintained MIT dependencies.

### Architecture and technology decisions

- Renamed the private workspace root to `knownpath-monorepo` and made `apps/cli` the publishable
  `knownpath` 0.1.0 package with the intended `npx knownpath` binary. The artifact bundles private
  workspace implementation and the canonical skill, while maintained public runtime libraries stay
  normal pinned dependencies; it does not require unpublished `@knownpath/*` packages.
- Added `install`, `status`, `update`, `uninstall`, `doctor`, and `mcp`, with global/project scope,
  repeatable or `all` agent selection, dry-run, explicit non-interactive confirmation, and a single
  JSON document output mode.
- `@knownpath/agent-adapters` owns detection, paths, structural configuration, backups, atomic
  writes, content digests, non-secret ownership state, conflict handling, status, update, doctor,
  and precise shared-skill removal. The CLI owns interaction/rendering only.
- All clients launch `npx -y knownpath mcp`. This uses the shared Phase 11 stdio bridge and
  therefore keeps authentication, authorization, ranking, retrieval, auditing, and future writes in
  the HTTP backend. Agent installations need no MongoDB, Atlas, Gemini, Better Auth, or pepper
  secrets.
- `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` are required both at install/update and agent launch.
  There is no localhost or production URL fallback. Config files store only each client's documented
  variable-reference syntax; the state file stores only paths, versions, digests, ownership flags,
  and timestamps. Phase 13 adds no keychain behavior.
- Claude Code and Gemini CLI use official MCP mutation commands when available. Codex receives a
  bounded managed TOML block because its CLI cannot express inherited references. Cursor and
  OpenCode use JSONC structural edits. Current OpenCode runtime validation confirmed the official
  `mcp.knownpath` shape.
- A matching pre-existing artifact is unmanaged; a differing `knownpath` entry is a conflict.
  Existing configs are backed up before mutation, unknown JSON/JSONC fields and comments are
  retained, writes are atomic, changed owned content is not overwritten, and uninstall removes only
  recorded installer ownership. Shared `.agents/skills/knownpath` writes/removals occur once.
- The canonical `skills/knownpath` text remains client-neutral. Build-time copying supplies the same
  1.0.0 artifact to every adapter rather than maintaining divergent copies.

The approved design is
[`docs/superpowers/specs/2026-08-23-knownpath-phase-13-installer-design.md`](docs/superpowers/specs/2026-08-23-knownpath-phase-13-installer-design.md).
Operational behavior is documented in [`docs/INSTALLER.md`](docs/INSTALLER.md).

### Files and packages created or materially updated

- Implemented the publishable CLI in `apps/cli`, including argument parsing, interactive and JSON
  output, packaged-skill resolution, bundled build, and the shared `mcp` entry point.
- Implemented `packages/agent-adapters` with adapters for Codex CLI, Claude Code, Cursor, Gemini
  CLI, and OpenCode plus environment, filesystem, path, process, configuration, ownership-state, and
  orchestration modules.
- Extracted `runKnownPathStdioBridge` into `@knownpath/mcp`; `apps/mcp-server` and the installer CLI
  now invoke the same bridge implementation.
- Added esbuild/jsonc-parser catalog and lockfile state, the root `pnpm knownpath …` command, and a
  blank required `KNOWNPATH_API_URL` example rather than a committed fallback.
- Added `docs/INSTALLER.md`; updated `README.md`, `docs/ARCHITECTURE.md`, `docs/AGENT_SKILL.md`,
  `docs/MCP.md`, `docs/DECISIONS.md`, the adapter README, the approved design correction, and this
  progress record.
- Phase 13 changed no database collection/index, API route, MCP tool name/schema, Agent Skill
  instruction, knowledge lifecycle state, or production data.

### Commands and behavior successfully verified

- `pnpm install` reconciled all 19 workspaces and passed the lockfile supply-chain policy.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm format:check` completed successfully. No
  automated tests were created or run.
- A packed `knownpath-0.1.0.tgz` was installed in an empty temporary npm project. Its binary
  returned `0.1.0` and help successfully, its canonical skill/reference were present, its package
  had no runtime dependency on unpublished `@knownpath/*` packages, and no tarball was left in the
  repo.
- A fresh isolated home installed all five adapters. `status` reported MCP and skill `current` for
  every target. Repeated install produced zero changes. The shared open skill was written twice
  physically—once for `.agents/skills` and once for Claude's `.claude/skills`—not once per agent.
  Uninstall removed those two owned copies once and returned every target to `absent`.
- Codex CLI 0.149.0, Claude Code 2.1.185, and OpenCode 1.18.21 were installed on this machine and
  configured in the isolated home. Codex `mcp list` recognized the bridge and masked both inherited
  environment values. Claude `mcp get knownpath` showed only `${KNOWNPATH_*}` references. OpenCode's
  runtime config validator accepted `mcp.knownpath` and listed the server; connection failure was
  expected at that verification point because the npm package and backend URL were not yet live.
- Cursor and OpenCode JSONC fixtures retained unrelated fields, comments, and trailing commas after
  install/uninstall. Four timestamped backups were created across the two mutations, and neither
  temporary credential value nor URL appeared in final configs. The real user configuration audit
  found no Phase 13-owned MCP entry, state file, or backup left behind; the pre-existing Phase 12
  canonical skill link remained unmanaged.
- Project-scope dry-run resolved the five documented repository-local config paths without writes.
  Missing environment, malformed URL, and unreachable backend each returned exit code 1 with clear
  machine-readable checks/errors. Output contained neither the supplied temporary key nor URL.
- `install --json --yes` emitted one valid JSON document, non-interactive mutations required
  `--yes`, and invalid/combined `--agent all` usage produced stable safe error codes.
- Release follow-up connected the clean `main` history to the public
  [`nasyx-rakeeb/knownpath`](https://github.com/nasyx-rakeeb/knownpath) repository and verified the
  local/remote commit IDs matched.
- The exact seven-file release tarball was published as public `knownpath@0.1.0` with the `latest`
  dist-tag. A fresh registry installation returned CLI version `0.1.0`, included the canonical
  skill, and ran help successfully. The temporary publish credential was never written to the
  repository or command output, and the clipboard was cleared after publication.

### Environment and manual setup still required

- `knownpath@0.1.0` was published after the Phase 13 implementation commit. End users can run
  `npx knownpath`; repository development can continue to use `pnpm knownpath …`.
- Set a real operator-selected `KNOWNPATH_API_URL` and active `KNOWNPATH_API_KEY` with
  `knowledge:read` in the shell/process that launches each agent. No active Phase 11 temporary key
  remains, so authenticated live `doctor` backend checks were not claimed in Phase 13.
- Cursor and Gemini CLI were not installed here. Their official-doc-based file adapters passed the
  isolated structural lifecycle, but their final native client discovery/connection checks remain
  manual on machines with those clients.
- macOS/Linux/Windows environment setup is documented. Windows path/config behavior is implemented
  with Node platform APIs but needs final verification on Windows hardware.
- Rotate the Gemini and Atlas credentials previously pasted into conversation. Tracked files contain
  neither value, but pasted credentials must be treated as exposed.

### Known limitations intentionally left for later phases

- No OS keychain integration, hosted installer distribution, npm publish automation, signed release,
  telemetry, or auto-update daemon exists. The stable environment-reference model allows a future
  keychain adapter without rewriting client configs.
- GitHub Copilot, Cline, Windsurf, and clients without stable documented MCP plus skill placement
  are unsupported rather than modified through fragile internals.
- MCP remains read-only. Contribution/outcome tools, validation, persistence, abuse controls, and
  scoring effects are not implemented or advertised.
- The dashboard, user-facing authentication flow, anonymous/public MCP, OAuth, private/team access,
  and distributed rate limiting remain deferred.
- No canonical record was published or fabricated. The development corpus remains two unrelated
  review records and zero published records.
- No automated tests were added by explicit Phase 13 requirement.

### Exact next phase

**Phase 14 (awaiting its prompt): continue only with the explicitly requested next capability. Do
not infer or begin contribution/outcome writes, dashboard behavior, or another roadmap feature from
Phase 13.**

## Post-Phase 13 — Render API deployment baseline

### Goal and research

Prepare the existing authenticated Fastify API for a reproducible Render deployment so the published
installer and MCP bridge can use a stable HTTPS backend. Current official Render web service,
monorepo, Blueprint, Node-version, environment-variable, outbound-IP, and free-instance
documentation was reviewed on 2026-08-23.

### Architecture and files

- Added `render.yaml` for one Singapore-region `knownpath-api` native Node web service. It builds
  from the pnpm monorepo root, runs only `@knownpath/api`, checks `/health/ready`, consumes a
  dashboard-supplied Atlas URI, and generates independent auth/API-key secrets.
- Added standard hosting-platform `PORT` support with precedence over the local `API_PORT` fallback.
- Added `docs/DEPLOYMENT.md` with Atlas credential rotation/network allowlisting, Blueprint setup,
  health checks, closed-registration admin provisioning, and installer doctor instructions.
- Updated `.env.example`, the README, architecture decision log, and the approved deployment design.
- Deployed no worker, dashboard, MongoDB service, queue, or later-phase product capability.

### Verification and manual requirements

- `corepack enable && pnpm install --frozen-lockfile && pnpm turbo run build --filter=@knownpath/api`
  completed with **7/7** dependency-aware build tasks.
- `pnpm typecheck` completed **29/29** tasks, `pnpm lint` completed **17/17** tasks, `pnpm build`
  completed **17/17** tasks, and `pnpm format:check` passed.
- Runtime configuration inspection observed `PORT=10000` taking precedence while the absent-`PORT`
  path retained `API_PORT=3001`. Ruby's safe YAML parser loaded the Blueprint and found exactly one
  `knownpath-api` web service with `/health/ready` configured.
- A production-mode compiled API process bound to `127.0.0.1:10000` with transient, unlogged auth
  secrets and the configured Atlas database. `/health/live` returned `status: ok`, `/health/ready`
  returned `status: ready` with MongoDB/auth `ok`, and `/docs/` returned 404 because production
  Swagger UI was disabled. SIGINT produced the expected graceful-shutdown log.
- Render deployed `knownpath-api` at `https://knownpath-api.onrender.com`. Live HTTPS checks
  returned 200 for liveness, Atlas/auth readiness, and the OpenAPI 3.1 document (19 paths).
- Created the first production administrator through the masked `pnpm auth:user:create` CLI. The
  live session flow issued one admin-owned `knowledge:read` key; its full plaintext and the
  generated administrator password were stored only in the macOS login Keychain and were not logged
  or added to agent configuration.
- Installed current MCP entries for detected Codex CLI, Claude Code, and OpenCode clients with
  backups and non-secret ownership state. The published `npx knownpath doctor` reported success: all
  three entries, backend readiness, and API-key authorization passed. Cursor and Gemini CLI remain
  uninstalled on this machine.
- The official MCP client invoked `knownpath_status` over the production Streamable HTTP endpoint.
  It reported the backend ready, Atlas search, an active admin owner, published reads, and explicit
  audited review reads. A subsequent explicit review-mode `knownpath_search` returned the two real
  Expo review records with separate rankings and no semantic requirement. The macOS login session
  received the two required environment values without writing either credential into agent or shell
  configuration; they must be re-supplied after logout or restart.
- Corrected the repository-only `pnpm knownpath` wrapper after live verification showed its trailing
  argument separator reached the CLI as a literal positional argument. The published `npx knownpath`
  command was unaffected.
- The free service is for bounded verification and has documented idle spin-down/cold starts; an
  always-on plan is required before treating the MCP backend as reliably available.

## Phase 14 — Privacy-safe agent knowledge contributions

### Phase goal

Add the network's first write path: an authenticated agent can submit a minimal generalized lesson
only after observable success and explicit consent. Preserve privacy, provenance, visibility,
sanitization, audit, and low initial trust while routing safe submissions through the existing
candidate/assessment/canonical-review architecture instead of publishing asserted truth.

### Research performed and official references consulted

Current guidance was checked on 2026-08-23 before implementation:

- [Secretlint](https://github.com/secretlint/secretlint) programmatic scanning and the maintained
  recommended preset; registry metadata confirmed 13.0.4, MIT licensing, and Node 22+ support.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  for data minimization and credential/PII exclusions.
- [OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
  and
  [OWASP LLM04 Data and Model Poisoning](https://genai.owasp.org/llmrisk/llm04-data-and-model-poisoning/)
  for treating submissions as untrusted data, quarantine, and provenance controls.
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework) and
  [OpenTelemetry sensitive-data guidance](https://opentelemetry.io/docs/security/handling-sensitive-data/)
  for purpose limitation, minimal retention, and telemetry filtering.
- [MCP security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)
  for scoped authorization and non-forwarding of credentials.

### Architecture and technology decisions

- Added versioned strict contribution contracts supporting `public` and owner-`private`; `team` is
  deliberately parsed then rejected until team ownership/authorization exists. Account mode is `ask`
  by default or `disabled`; every submission requires consent policy version 1 and a UUID
  idempotency key. Public consent covers possible later publication; private consent covers backend
  storage only.
- Added `@knownpath/contributions`. It normalizes text, strips control/bidi characters, runs
  Secretlint's recommended rules, redacts email/home-path/credential-URL/sensitive-query values,
  rescans, rejects dangerous residue or source dumps, and quarantines prompt-injection-like text.
  Only sanitized structured fields plus an HMAC digest of the original request are retained.
- Added provider capabilities `public_only|approved_private` and a visibility gate before provider
  use. No generalizer/provider is configured in Phase 14. Private records therefore remain in the
  backend/Atlas and never enter Gemini extraction, public embeddings, or another external provider.
- Each safe contribution creates an immutable `agent_contribution` source snapshot, pending
  candidate, immutable assessment, similarity profile, and conservative pair-review discovery.
  Scoring algorithm/policy version 2 identifies self-report evidence and caps the final score at 34.
  Contribution candidates cannot enter canonical records without a future explicit accepted plus
  moderation-approved state.
- Added `POST /api/v1/contributions`, owner-only inspection, session-only contribution settings,
  `knownpath_contribute`, centralized `knowledge:contribute` authorization, route policy, and audit
  events. The stdio bridge remains a thin HTTP client and gains no database/provider secret.
- Updated the canonical skill to 1.1.0 and installer/MCP distributable version to 0.2.0. The skill
  offers a contribution only after observed success and fresh explicit consent, never silently.

The approved design is
[`docs/superpowers/specs/2026-08-23-knownpath-phase-14-privacy-safe-contributions-design.md`](docs/superpowers/specs/2026-08-23-knownpath-phase-14-privacy-safe-contributions-design.md).
Operational/privacy behavior is documented in [`docs/CONTRIBUTIONS.md`](docs/CONTRIBUTIONS.md).

### Collections, schemas, indexes, and files

- Evolved users with `contributionMode`, sources with `agent_contribution`, candidates with exactly
  one extraction/contribution provenance kind, contribution schema v2, audit events, and the
  versioned self-report evidence signal.
- Added contribution repository operations and four v2 indexes:
  `uq_agent_contributions_owner_submission_v2`,
  `ix_agent_contributions_owner_visibility_status_created_at_v2`,
  `ix_agent_contributions_processing_stage_updated_at_v2`, and
  `ix_agent_contributions_candidate_v2`. The validator accepts historical v1 and new v2 records.
- Added the contributions package, Fastify routes, MCP gateway/tool contracts, developer inspection
  command, skill changes, and documentation updates across API, MCP, architecture, scoring, data
  model, decisions, README, and this progress record.

### Commands and behavior successfully verified

- `pnpm install` reconciled all 20 workspaces and passed supply-chain policy.
- `pnpm typecheck` completed **31/31** tasks, `pnpm lint` completed **18/18** tasks, `pnpm build`
  completed **18/18** tasks, and `pnpm format:check` passed. No tests were added or run.
- Against a dedicated Atlas database, `pnpm db:init` created all collections/indexes; the immediate
  repeat reported every collection `created: false` with the same named indexes, proving
  idempotency.
- A real authenticated HTTP flow submitted a private synthetic lesson containing a fake GitHub-like
  token, email, and `/Users/...` path. Inspection exposed none of those values, stored private
  visibility throughout, completed source/candidate/assessment/profile processing, created no
  extraction attempt or embedding, and produced self-report score **29** under the **34** cap.
- The same request reused one contribution/candidate rather than duplicating it. A team submission
  returned `team_contributions_not_supported`. A harmless prompt-injection sentence returned 202
  quarantine and created no candidate.
- The official MCP SDK client discovered and invoked `knownpath_contribute` over Streamable HTTP. A
  public consented synthetic lesson completed, and a second bounded run confirmed its
  `contribution.submitted` audit event with `transport: mcp`; the plaintext API key was absent.
  Verification observed 3 contributions, 2 candidates, 2 immutable assessments, and 6 audit events
  before the dedicated database was dropped. All temporary users, keys, contributions, and derived
  records were removed with that database.

### Environment and manual setup still required

- The Render API has been redeployed and the new HTTP/MCP contracts are live. Existing
  `knowledge:read` keys still cannot contribute; issue a deliberately scoped key with
  `knowledge:contribute` only for users who enable this feature.
- Update installed skills/clients to `knownpath@0.2.1` where Phase 14 contribution behavior is
  wanted. No user-owned agent configuration was changed automatically during the release.
- No private-safe model/provider is approved or configured. That is intentional: deterministic
  processing works locally, while optional private generalization remains blocked until an operator
  explicitly configures an `approved_private` implementation.

### Known limitations intentionally left for later phases

- No team contributions, background queue, admin moderation dashboard, user deletion/retention
  automation, outcome reporting, corroboration aggregation, or automatic publication exists.
- Prompt-injection detection is conservative quarantine, not semantic proof of malicious intent.
  Secret scanning is defense in depth; users and agents must still minimize before submission.
- Contribution-derived candidates remain pending and cannot be canonicalized. Public submission
  consent does not itself approve publication.
- No hidden chain-of-thought field, raw code/file upload, transcript capture, or unpaid/private AI
  shortcut was added. No tests were added by explicit phase requirement.

### Exact next phase

**Phase 15 (awaiting its prompt): continue only with the explicitly requested next capability. Do
not infer or begin outcome reporting, moderation UI, team ownership, or another roadmap feature from
Phase 14.**

## Post-Phase 14 — Deployment and npm release

- Pushed the Phase 14 design and implementation to GitHub and observed the Render production API
  healthy with 22 OpenAPI paths, including contribution submission and owner inspection.
- npm's first 0.2.0 publish preserved pnpm `catalog:` dependency specifiers and therefore failed a
  clean consumer install. It is not considered usable. The binary path was normalized, and 0.2.1 is
  the corrective release built/published through pnpm's manifest transformation.
- Verified the public registry reports `0.2.1` as `latest` with concrete runtime dependency
  versions. A clean temporary npm installation ran `knownpath --version` as `0.2.1` and contained
  skill version 1.1.0 with the five current MCP tool names. The production readiness endpoint
  reported MongoDB and auth healthy, and production OpenAPI exposed 22 paths including contribution
  submission, inspection, and account contribution settings.

## Phase 15 — Verified outcomes and freshness ranking

### Phase goal

Close the feedback loop with authenticated, privacy-minimized reports about solutions agents really
attempted. Aggregate those reports conservatively, preserve immutable assessment history, identify
version/freshness degradation, and incorporate transparent outcome evidence into retrieval without
letting small samples, duplicate reports, or one safety allegation manipulate ranking.

### Research performed and official references consulted

Current references were checked on 2026-08-23 before implementation:

- [NIST proportion confidence intervals](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/propconf.htm)
  and [NIST Technical Note 2119](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2119.pdf)
  for Wilson intervals and honest small-sample uncertainty.
- [SumUp](https://www.usenix.org/legacy/event/nsdi09/tech/full_papers/tran/tran.pdf) and the
  [Bazaar paper](https://www.usenix.org/legacy/event/nsdi11/tech/nsdi11_proceedings.pdf) for
  Sybil-resistant aggregation and limiting correlated identities.
- [OWASP API4:2023](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
  for layered quotas and resource-consumption controls.
- [Elastic decay functions](https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/decay)
  and [Semantic Versioning](https://semver.org/) for time-decay and version-aware applicability.

### Architecture and technology decisions

- Added strict outcome states: `solved`, `partially_helped`, `attempted_failed`,
  `incompatible_environment`, `stale_or_outdated`, `misleading_or_unsafe`, and `not_used`.
  `not_used` is recorded but receives zero reliability weight; a view/search is never inferred to be
  success.
- Added `@knownpath/outcomes` as the transport-independent submission, throttling, aggregation,
  safety, and recomputation boundary. `@knownpath/privacy` supplies reusable Secretlint-backed note
  sanitization. HTTP and MCP share the same service and centralized authorization.
- Outcome policy version 1 allows one effective report per account, KnownPath, environment version,
  and 30-day window; enforces durable per-key/per-account limits; applies temporal decay after a
  30-day grace period with a 180-day half-life; and caps each account's aggregate influence.
- Outcome confidence uses Wilson 95% lower bounds for any-help and full-solve rates, plus Kish
  effective sample size. It remains explicitly insufficient below five effective samples and never
  presents a tiny perfect sample as certainty.
- Every calculation is a separate immutable `known_path_outcome_assessments` record with algorithm,
  policy, inputs, counts, intervals, version/environment buckets, trends, score, reason codes, and
  explanations. KnownPaths hold only a monotonic `latestOutcomeAssessmentId` pointer.
- One eligible `misleading_or_unsafe` report immediately appends an immutable safety event and
  queues review. It does not change ranking, confidence, lifecycle, moderation, or visibility by
  itself. Ranking penalties require independent corroboration or measurable outcome degradation.
- Retrieval ranking policy version 2 reserves 15/100 points for conservative observed outcomes and
  keeps exact, lexical, semantic, metadata, version, source-trust, and freshness components visible.
  Aggregate outcome details are hidden until at least three independent reporters exist.

The approved design is
[`docs/superpowers/specs/2026-08-23-knownpath-phase-15-verified-outcomes-design.md`](docs/superpowers/specs/2026-08-23-knownpath-phase-15-verified-outcomes-design.md).
Operational behavior and formulas are documented in [`docs/OUTCOMES.md`](docs/OUTCOMES.md).

### Collections, schemas, indexes, and files

- Evolved schema-version-2 `agent_outcomes`; added immutable `known_path_outcome_assessments` and
  `known_path_safety_events`; added KnownPath latest-assessment and separate safety-review pointers;
  and added privacy-thresholded outcome projections to safe search/detail contracts.
- Added idempotency, execution-window, per-key/per-user throttling, assessment history/policy/trend,
  safety-event, and KnownPath pointer/review indexes. Initialization removes the obsolete broad
  legacy outcome deduplication index and replaces it with a partial legacy-only index so old records
  remain protected without blocking v2 inserts.
- Added `POST /api/v1/outcomes`, MCP tool `knownpath_report_outcome`, `knowledge:outcome` scope,
  outcome audit events, `pnpm outcomes recompute|inspect|history`, search projection/ranking v2, and
  skill version 1.2.0 behavior that reports only after the task result is known.
- Updated API, MCP, skill, scoring, retrieval, architecture, data-model, installer, README, and
  decision documentation. No new environment variable was required.

### Commands and behavior successfully verified

- `pnpm install` reconciled all 22 workspaces and passed the repository supply-chain policy.
- With Node 24.18.0, the final repository gates completed: `pnpm typecheck` **35/35** tasks,
  `pnpm lint` **20/20** tasks, `pnpm build` **20/20** tasks, and `pnpm format:check`. The canonical
  skill frontmatter parsed as `knownpath` version 1.2.0, and its six referenced MCP tool names match
  the implemented server registrations. The optional `skills-ref` binary was not installed in this
  environment; no successful run of that unavailable tool is claimed.
- Against a dedicated Atlas database, database initialization created 26 collections; immediate
  repeated initialization retained 26 and created zero new collections. The database was dropped
  after verification.
- Copied only the two existing real review KnownPaths and their real source/candidate/scoring
  provenance into that isolated database. A real authenticated Fastify flow returned 200 for a valid
  outcome, reused an identical idempotency request, and returned 401 for invalid and revoked keys.
  OpenAPI contained the outcome route.
- One success produced rank 18 with 3 outcome points. Five independent successes produced rank 24, 9
  outcome points, effective sample size 5, and moderate confidence 57 rather than false 100%
  certainty.
- Ten older successes followed by five recent failures produced a declining trend with recent and
  baseline effective sample sizes of 10, a Wilson lower-bound drop of about 0.486, rank 12, and the
  explicit `recent_outcome_degradation` penalty.
- One safety report queued review, produced exactly one immutable safety event, and applied no
  ranking penalty. The isolated run held 21 outcomes and 21 immutable assessments before cleanup.
- Repeated projection after a new assessment changed ranking deterministically without changing the
  embedding. The run also exposed and fixed v2 strict-schema serialization, date-idempotency,
  legacy-index, and stale-projection reuse defects before completion.

### Environment and manual setup still required

- Production API keys intended to report outcomes must be deliberately issued with both
  `knowledge:read` and `knowledge:outcome`; existing keys do not gain the scope automatically.
- Phase 15 is deployed and `knownpath@0.3.0` is published. Existing installations do not update
  themselves silently; run the installer update flow to receive skill 1.2.0 and the outcome tool.
- The HTTP/service path was exercised against Atlas. An authenticated official external MCP client
  invocation of the new write tool remains a manual check for an operator-issued key with
  `knowledge:read` and `knowledge:outcome`; its shared schemas and gateway passed repository
  typecheck/build verification.

### Known limitations intentionally left for later phases

- No team ownership, moderation dashboard, distributed rate limiter, account reputation system, or
  automated safety adjudication exists. Local durable limits are intentionally conservative.
- A safety allegation queues review but is neither automatically substantiated nor an automatic
  delisting instruction. Restricting published visibility requires an explicit future safety policy
  or verified moderation action.
- Environment/version aggregation uses supplied normalized metadata and does not collect repository
  code, raw prompts, hidden chain-of-thought, or private transcripts. Notes are optional and
  bounded.
- No tests were added by explicit phase requirement. No Phase 16 feature was started.

### Exact next phase

**Phase 16 (awaiting its prompt): continue only with the capability explicitly requested by the next
phase prompt.**

## Post-Phase 15 — Deployment and npm release

- Pushed Phase 15 commit `6205462` to GitHub `main`; Render's commit-triggered deployment completed
  at `https://knownpath-api.onrender.com`.
- Live HTTPS verification returned `ok` liveness and `ready` status with MongoDB/auth `ok`. The
  production OpenAPI document exposed 23 paths and included `POST /api/v1/outcomes`.
- Built and inspected the pnpm-transformed `knownpath@0.3.0` tarball before publication. Its runtime
  dependencies contained concrete registry versions rather than workspace/catalog specifiers.
- Published public npm release `knownpath@0.3.0` with the `latest` tag. A clean temporary npm
  install ran `knownpath --version` as `0.3.0` and contained skill version 1.2.0 plus
  `knownpath_report_outcome`.
- The short-lived clipboard publishing credential was used only in memory, never printed or written
  to project files, and the clipboard was cleared after successful publication.

## Phase 16 — Operational background pipelines

### Phase goal

Turn manually invoked ingestion, extraction, scoring, canonicalization, projection, contribution,
outcome, and maintenance operations into reliable continuously runnable pipelines with durable
intent, safe retries, workload isolation, schedules, quarantine, and observable worker state.

### Research performed and official references consulted

Current references were checked on 2026-08-24 before implementation:

- [BullMQ connections](https://docs.bullmq.io/guide/connections),
  [retrying/failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs),
  [Job Schedulers](https://docs.bullmq.io/guide/job-schedulers),
  [rate limiting](https://docs.bullmq.io/guide/rate-limiting),
  [graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown), and
  [production guidance](https://docs.bullmq.io/guide/going-to-production) for connection behavior,
  exponential backoff/jitter, scheduler replacement semantics, global limits, stalled recovery,
  `noeviction`, and shutdown.
- [Valkey installation](https://valkey.io/topics/installation/) and the official Valkey release
  channel for the current 9.1.1 local/container path and Redis-protocol compatibility.
- Current npm registry metadata and licenses for exact BullMQ 6.2.0 and ioredis 6.0.0 compatibility.
  Agenda 6.2.6 and Temporal 1.22.0 were evaluated and rejected for the reasons in the decision log.

### Architecture and technology decisions

- Added BullMQ 6.2.0 over Valkey 9.1.1. MongoDB remains the only persistent product database; Valkey
  stores queues, schedules, retries, provider limits, locks, stalled coordination, and ephemeral job
  diagnostics only.
- Added `@knownpath/jobs` as the only BullMQ-facing package and `@knownpath/pipelines` as the
  queue-neutral domain-service composition layer. Payloads contain IDs and bounded controls, never
  source bodies or credentials.
- Added six workload queues: `control`, `github`, `sources`, `ai`, `knowledge`, and `feedback`.
  Source-specific scheduler policies come from `refreshIntervalMinutes` in the shared source
  registry; schedules remain disabled until explicitly enabled/applied.
- MongoDB stores a run and idempotent step before dispatch. Changed-source fan-out uses snapshots
  captured during that sync only. Downstream services retain their existing content hashes,
  immutable assessment keys, canonical memberships, projections, contribution IDs, and outcome
  inputs, so retries are safe.
- Default retries use five attempts, exponential delay from two seconds, and 50% jitter. GitHub
  starts at five seconds; Gemini starts at ten seconds with four attempts. Permanent/exhausted jobs
  are quarantined durably. BullMQ lock renewal/stalled recovery uses `maxStalledCount=2`; shutdown
  is bounded and graceful.
- API knowledge/auth reads remain available when Valkey is disabled or unavailable. Readiness
  distinguishes `ok`, `disabled`, and `unavailable`; admin-session-only operations expose safe queue
  counts/runs/heartbeats. Contribution/outcome product data is written before deferred dispatch.

The approved design is
[`docs/superpowers/specs/2026-08-24-knownpath-phase-16-operational-pipelines-design.md`](docs/superpowers/specs/2026-08-24-knownpath-phase-16-operational-pipelines-design.md).
Runtime behavior is documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

### Collections, indexes, packages, and files

- Added `pipeline_runs`, `pipeline_steps`, and TTL-backed `worker_heartbeats`, bringing database
  initialization to 29 collections and 129 named indexes. Unique step idempotency/BullMQ IDs plus
  run/status, target/job, quarantine, heartbeat/state, and expiry indexes support recovery and
  operations without using MongoDB as a custom queue.
- Added `packages/jobs`, `packages/pipelines`, `apps/worker/src/operational.ts`, Valkey Compose
  infrastructure, centralized queue configuration, per-source refresh policies, root job commands,
  and `GET /api/v1/admin/jobs`.
- Updated contribution submission for durable deferred processing when queues are configured,
  outcome follow-up aggregation/projection, source-manifest ancestor resolution, source-change
  fan-out, architecture/data-model/decision/README documentation, `.env.example`, and lockfile.

### Commands and behavior successfully verified

- `pnpm install` reconciled 24 workspaces and passed repository supply-chain policy. The optional
  `msgpackr-extract` native script is explicitly denied because KnownPath does not require it.
- With Node 24.18.0, `pnpm typecheck` completed **39/39** tasks, `pnpm lint` completed **22/22**
  tasks, `pnpm build` completed **22/22** tasks, and `pnpm format:check` passed. No tests were added
  or run.
- Because Docker Desktop was not running, verification used Homebrew Valkey **9.1.1** on a dedicated
  loopback port with AOF and `noeviction`. BullMQ connected successfully; `probe` returned `ok`; a
  scheduler round trip applied/listed/removed 12 schedules (nine source-specific and three
  maintenance), and cleanup reduced 74 temporary keys to zero before shutdown.
- Against isolated Atlas database `knownpath_phase16_verify_20260824`, the first `db:init` created
  29 collections/129 indexes and the immediate repeat created zero collections with the same 129
  indexes.
- A successful development job completed once; identical enqueue returned the same run/step with
  `deduplicated: true`. A permanent failure quarantined after one attempt with `permanent_failure`;
  a transient failure retried three times with exponential jitter and quarantined as
  `retry_limit_exhausted`.
- A 60-second active job's worker was deliberately killed. With a 10-second lock, the replacement
  worker recovered the stalled job, updated its start time, completed it, and advanced the run to
  completed. A direct SIGINT then persisted a `stopped` heartbeat with zero active jobs.
- A real bounded Expo documentation flow created a source snapshot. A targeted real public upgrade
  guide then traversed
  `source.extract -> candidate.score -> candidate.canonicalize -> knownpath.project`, completing
  four durable steps and producing one candidate, immutable assessment, similarity profile, review
  KnownPath/revision, and search document. An unchanged page rerun created no extraction fan-out.
- The API booted against Atlas/Valkey; readiness reported MongoDB/auth/queues `ok`, OpenAPI exposed
  the cookie-session-protected admin jobs route, and an unauthenticated request was denied. After
  Valkey shutdown, liveness stayed `ok`, readiness reported queues `unavailable`, and the added
  queue error handlers prevented retry-log bombardment.
- With Valkey stopped, `pnpm jobs status` exited non-zero in five seconds with the actionable safe
  message `Valkey queue infrastructure is unavailable`; it did not hang or expose the connection
  URI.
- The isolated Atlas database contained 29 collections and eight pipeline runs before it was
  explicitly dropped. Temporary Valkey keys were flushed on the dedicated instance; the server was
  stopped. No verification product data remains.

### Environment and manual setup still required

- Production needs a separately provisioned Valkey/Redis-protocol service with persistence and
  `noeviction`, plus `QUEUE_REDIS_URL` and reviewed concurrency/rate/retention values. The current
  Render Blueprint intentionally still deploys only the API; add a worker service and managed queue
  infrastructure deliberately rather than silently creating paid resources.
- Set `QUEUE_SCHEDULES_ENABLED=true` and run `pnpm jobs schedules apply` only after production
  source cadence and provider quotas are approved. Workers also need the existing MongoDB, GitHub,
  and Gemini configuration appropriate to the jobs they consume.
- Docker Compose syntax passed validation, but the containerized Valkey path was not booted because
  Docker Desktop was unavailable. The exact remaining check is `pnpm dev:infra`, followed by
  `docker compose ps` and `pnpm jobs status` with a configured MongoDB URI.

### Known limitations intentionally left for later phases

- No production worker/Valkey deployment, dashboard job console, team queue ownership, distributed
  API limiter, automatic moderation, or provider-specific adaptive quota controller was added.
- Maintenance reconciliation currently redispatches durable `pending_dispatch` steps. Business
  entities remain authoritative; a future operations phase may add broader periodic drift audits and
  archival after measured volume.
- BullMQ diagnostics use bounded retention while MongoDB run/step history has no automatic purge. A
  retention/archive policy is intentionally deferred until real operational volume exists.
- Private/team records remain hard-blocked from public/unpaid Gemini and embedding paths. Queueing
  never changes provider approval or visibility policy. No tests were added by explicit phase rule.

### Exact next phase

**Phase 17 (awaiting its prompt): continue only with the capability explicitly requested by the next
phase prompt. Do not infer or begin dashboard, team, moderation, or another roadmap feature from
Phase 16.**

## Post-Phase 16 — Zero-cost scheduled worker deployment

### Goal

Replace the unprovisioned paid-worker requirement with a zero-cost early deployment path while
preserving Phase 16's BullMQ contracts, MongoDB durability, privacy restrictions, and ability to
move to an always-on worker later.

### Research and decisions

- Current official Render documentation confirmed that free Key Value is memory-only across restarts
  and that Background Workers are not available as a free service type. The paid persistent Render
  topology was therefore not provisioned.
- Current [Upstash BullMQ guidance](https://upstash.com/docs/redis/integrations/bullmq),
  [durability behavior](https://upstash.com/docs/redis/features/durability), and
  [free limits](https://upstash.com/docs/redis/overall/billing) support a bounded free
  Redis-compatible queue path with eviction disabled.
- Current
  [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
  confirms standard hosted runners are free for public repositories. Scheduled workflows may be
  delayed and are disabled after 60 days without repository activity, so this is documented as an
  early zero-cost deployment rather than an always-on production SLA.
- Added a bounded `jobs drain` mode instead of changing continuous `jobs start`. Future delayed jobs
  do not prevent an idle exit; active/waiting/prioritized work and chained jobs do. Runtime, idle,
  and polling bounds are strictly environment-validated.
- The production workflow runs only trusted `main`, uses read-only repository permissions, pins
  official actions to immutable commits, permits one run at a time, and reads credentials only from
  GitHub Actions secrets. Scheduled runs remain skipped until the explicit repository variable
  `KNOWNPATH_SCHEDULED_WORKER_ENABLED=true` is set after a successful manual run.
- Schedule application is a disabled-by-default manual workflow option. Isolated verification showed
  that first-time BullMQ schedule application immediately starts configured sources, so automatic
  application was rejected to protect free GitHub/Gemini quotas.

### Files and configuration

- Added `.github/workflows/process-queues.yml` for manual and thirty-minute bounded queue draining.
- Added drain settings to centralized queue configuration and `.env.example`.
- Added the external secret `QUEUE_REDIS_URL` and production queue prefix to `render.yaml`; no queue
  URI or credential is committed.
- Updated the operations/deployment/README/decision documentation and added the approved design at
  `docs/superpowers/specs/2026-08-24-knownpath-free-scheduled-worker-design.md`.

### Verification observed

- With Node 24.18.0, `pnpm typecheck` completed **39/39**, `pnpm lint` completed **22/22**,
  `pnpm build` completed **22/22**, and `pnpm format:check` passed. No tests were added or run.
- Official `actionlint` 1.7.12 was checksum-verified and accepted
  `.github/workflows/process-queues.yml`; Ruby YAML parsing also accepted the workflow and
  `render.yaml`.
- An isolated MongoDB 8.3.4 and Valkey 9.1.1 stack completed a real queued `maintenance.reconcile`
  step in one attempt. `jobs drain` reported `status: idle`, zero runnable jobs, and a final worker
  heartbeat of `stopped` with zero active jobs.
- An invalid `QUEUE_DRAIN_IDLE_MS=999` exited 1 with the actionable configuration error rather than
  starting a worker. A forced ten-second runtime budget with active source work entered the existing
  bounded graceful-shutdown path.
- Temporary verification MongoDB/Valkey data, queue keys, downloaded validator binary, and logs were
  deleted after both disposable services stopped. No Atlas or Render product data was used.

### Hosted activation verified

- The free Upstash TLS queue URL is configured in Render and GitHub Actions, and the required Atlas,
  auth, API-key pepper, and Gemini credentials are configured as GitHub Actions secrets. Their
  values were not committed or printed.
- Render readiness at `https://knownpath-api.onrender.com/health/ready` reported MongoDB, auth, and
  queues all `ok` after deployment.
- Manual GitHub Actions run
  [`32707179920`](https://github.com/nasyx-rakeeb/knownpath/actions/runs/32707179920) completed
  successfully in 65 seconds. It validated the required secrets, installed the locked dependencies,
  built the worker, started all six queue workers, and drained to zero runnable jobs. Schedule
  application was intentionally skipped for this first run.
- Repository variable `KNOWNPATH_SCHEDULED_WORKER_ENABLED=true` now enables the bounded worker at
  the configured thirty-minute cadence. Source-refresh schedules remain deliberately unapplied:
  enabling them immediately begins ingestion and consumes GitHub/Gemini quota, so that requires a
  separate explicit operational decision.

## Phase 17 — User dashboard and onboarding

### Phase goal

Deliver the real developer-facing web product for closed-registration sign-in, agent credential and
installer onboarding, transparent public knowledge retrieval, owned contribution/outcome activity,
and explicit account/privacy controls without introducing the Phase 18 administration console.

### Research performed and official references consulted

Current references were checked on 2026-08-24 and 2026-08-25 before implementation:

- Next.js 16.3.2 official [authentication](https://nextjs.org/docs/app/guides/authentication),
  [data security](https://nextjs.org/docs/app/guides/data-security),
  [backend-for-frontend](https://nextjs.org/docs/app/guides/backend-for-frontend),
  [Route Handler](https://nextjs.org/docs/app/getting-started/route-handlers-and-middleware),
  [data fetching](https://nextjs.org/docs/app/getting-started/fetching-data), and
  [environment variable](https://nextjs.org/docs/app/guides/environment-variables) guidance.
- Better Auth official [Next.js integration](https://www.better-auth.com/docs/integrations/next),
  [React client](https://www.better-auth.com/docs/integrations/react), and
  [session management](https://www.better-auth.com/docs/concepts/session-management) documentation.
- W3C [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and
  [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/), plus Radix official
  [accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) and
  [Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) guidance.
- Current npm registry metadata confirmed maintained MIT-licensed
  `@radix-ui/react-dialog`/`@radix-ui/react-alert-dialog` 1.1.23 compatibility with the existing
  React 19/Next.js stack. The frontend stack was retained and the all-primitives umbrella was
  deliberately avoided.

### Architecture and technology decisions

- Replaced the Phase 1 status shell with a server-first Next.js App Router dashboard. Fastify
  remains the only business/authorization boundary; the web app never connects to MongoDB and
  receives no Gemini, queue, database, API-key pepper, or Better Auth secret.
- Added an allowlisted same-origin `/api/knownpath/*` bridge configured only by `KNOWNPATH_API_URL`.
  It supports bounded GET/POST/PATCH product routes, forwards no Authorization header, uses the
  trusted API origin for the internal auth request, preserves secure session cookies, caps bodies at
  64 KiB, and has no localhost fallback.
- Added versioned runtime-validated owner dashboard DTOs, opaque signed cursors, repository-level
  aggregation/list methods, and safe session management by non-secret session ID. Secret Better Auth
  tokens never enter browser responses.
- Normal dashboard retrieval is fixed to published public KnownPaths. Review/private/team knowledge
  cannot be requested from the ordinary user UI. API-key plaintext exists only in the creation or
  rotation response and transient component memory with a one-time-save acknowledgement.
- Extended the established cream/deep-green identity into a restrained, responsive evidence-first
  system. Semantic badges distinguish trust, freshness, lifecycle, processing, privacy, and safety;
  Radix dialogs provide focus/escape behavior, focus rings are explicit, and reduced-motion is
  respected.

The approved design is
[`docs/superpowers/specs/2026-08-24-knownpath-phase-17-user-dashboard-design.md`](docs/superpowers/specs/2026-08-24-knownpath-phase-17-user-dashboard-design.md).
Runtime/security behavior is documented in [`docs/DASHBOARD.md`](docs/DASHBOARD.md).

### Files, routes, and boundaries created

- Added `packages/domain/src/dashboard.ts`, `packages/auth/src/dashboard.ts`, and
  `apps/api/src/dashboard-routes.ts` for safe summary, activity, contribution, outcome, profile, and
  active-session APIs. Added matching repository methods and the audited `user.profile_updated`
  event.
- Added public `/` and `/sign-in`; authenticated `/app`, `/app/explore`, `/app/known-paths/[id]`,
  `/app/api-keys`, `/app/install`, `/app/contributions`, `/app/outcomes`, and `/app/settings`; plus
  loading, error, not-found, responsive navigation, and one-time credential dialog components.
- Added the narrow Next.js bridge, server-only environment/API clients, runtime client contracts,
  shared formatting/components, the two required Radix 1.1.23 primitives, dashboard documentation,
  and relevant README, architecture, API, environment, and decision updates.
- No admin routes/components, public signup, OAuth, password reset, email verification, fake charts,
  raw source views, or tests were added.

### Commands and behavior successfully verified

- `pnpm install` reconciled all 24 workspaces under the locked pnpm 11.22.0 policy.
- With Node 24.18.0, `pnpm typecheck` completed **39/39** tasks, `pnpm lint` completed **22/22**
  tasks, `pnpm build` completed **22/22** tasks, and `pnpm format:check` passed. The Next.js
  production build compiled every intended static/dynamic route. No tests were added or run.
- The local API booted against Atlas with queue operation deliberately disabled; readiness reported
  MongoDB/auth `ok`, and OpenAPI contained 31 paths including seven dashboard/session paths. The web
  production server booted on port 3000 using only `KNOWNPATH_API_URL`.
- Through the real same-origin bridge, unauthenticated `/app` redirected, an invalid sign-in
  returned 401, and the safe CLI-created temporary account signed in successfully. Overview,
  explore, API-key, install, contribution, outcome, and settings pages each returned 200.
- The account summary contract returned version 1. Session output contained zero token-named fields.
  A temporary scoped key was created, authenticated successfully against `/api/v1/account/me`,
  appeared in a list with zero plaintext/hash/digest fields, was revoked, and then failed with 401.
- Contribution mode persisted through `ask -> disabled -> ask`; display name persisted through an
  update/restore; current-session revocation returned true and the same cookie then failed with 401.
  A 65 KiB bridge request returned 413.
- A real Atlas-backed public search returned access mode `published`, semantic mode `used`, and zero
  results, accurately reflecting the current database's zero published canonical records. No review
  record was exposed or republished to make the UI appear populated.
- Fastify logs were inspected during all flows and contained method, safe URL, request ID, status,
  and latency only. They exposed no password, cookie, Authorization header, or API-key plaintext.
  Desktop landing and 390px sign-in captures were visually inspected; a mobile intrinsic-width risk
  was corrected with an explicit bounded panel width.
- The exact temporary verification identity was removed afterward: two sessions, one auth account,
  one revoked API key, one search event, eleven audit events, and one user were deleted; no
  contribution, outcome, source, candidate, assessment, or KnownPath record was changed.

### Environment and manual setup still required

- A hosted dashboard deployment is not part of the current Render API Blueprint. Its runtime must
  set `KNOWNPATH_API_URL` to the trusted HTTPS API origin. No browser-visible secret is required.
- The product database still has no published public KnownPath. After moderation legitimately
  publishes a record in a later phase, manually search and open that real detail/provenance page in
  the deployed dashboard. Phase 17 correctly returns no normal-user result today rather than
  weakening review authorization or fabricating data.
- Existing users are still provisioned only with `pnpm auth:user:create`; user-facing signup,
  verification, reset, and OAuth remain intentionally closed.

### Known limitations intentionally left for later phases

- No administration/moderation, ingestion/job operations, source review, platform analytics, or
  user-management console is present. Phase 18 owns that surface.
- Activity is truthful aggregate/list data rather than a full analytics warehouse. Search query text
  is intentionally not retained, and individual outcome reporters remain private.
- The light warm-green/cream identity is primary. A secondary dark theme and screenshots in project
  documentation are deferred; the implementation does not require either for operation.
- No tests were added by explicit phase rule.

### Exact next phase

**Phase 18 (awaiting its prompt): build only the explicitly requested platform administration and
moderation capability. Do not begin Phase 18 or another roadmap feature from Phase 17.**

## Phase 18 — Admin and moderation console

### Phase goal

Add the internal operations surface needed to inspect and responsibly operate real KnownPath data,
workers, moderation, canonicalization, users, safety signals, and audit history. Administration must
reuse the production domain/API boundaries, enforce authorization on the server, preserve history,
and keep private or secret material out of ordinary admin responses.

### Research performed and official references consulted

Current official guidance was checked on 2026-08-26 before implementation:

- Better Auth [admin plugin](https://better-auth.com/docs/plugins/admin) and
  [session management/freshness](https://better-auth.com/docs/concepts/session-management) for
  persisted administrator authorization and the existing 30-minute freshness window.
- Next.js 16 [authentication](https://nextjs.org/docs/app/guides/authentication),
  [data security](https://nextjs.org/docs/app/guides/data-security), and
  [Server Actions](https://nextjs.org/docs/app/guides/server-actions) for server-side checks at
  every mutation boundary and narrow DTOs.
- OWASP
  [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
  and [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  for deny-by-default capabilities, per-request authorization, sensitive-action audit, and secret
  exclusion.
- BullMQ [queue](https://docs.bullmq.io/guide/queues),
  [pause](https://docs.bullmq.io/guide/workers/pausing-queues), and
  [retry](https://docs.bullmq.io/guide/retrying-failing-jobs) behavior for supported operational
  controls without custom queue state.
- W3C WAI-ARIA [dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
  [alert dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/), and
  [table](https://www.w3.org/WAI/ARIA/apg/patterns/table/) patterns for focus-safe confirmations and
  readable dense operational data.

### Architecture and technology decisions

- Added a transport-independent administration service in the existing Fastify application rather
  than route-to-repository calls, a generic database console, or a separate shadow deployment.
  Strict version-1 Zod contracts define safe list/detail/overview and mutation boundaries.
- Added named admin capabilities and centralized `requireFreshAdmin` plus exact action/target
  confirmation. Read-only routes accept a valid admin session; merge/split/reassign, moderation,
  source controls, queue controls, job retry, user suspension/restore, and private-content reveal
  require a session no older than 30 minutes, a reason, and `CONFIRM <action> <target>` on the API.
- Added signed opaque cursor pagination, status filters, escaped safe search, DTO allowlists, capped
  escaped source text, safe health/provider projection, and API-key metadata that cannot contain
  plaintext or hashes.
- Kept private contribution content hidden by default. A distinct capability, fresh session, reason,
  and target confirmation can reveal only the persisted sanitized V2 payload. Every allowed or
  denied attempt is independently audited and responses are `no-store`.
- Canonical operations now preview/recompute before execution and attribute immutable Phase 8 events
  to the administrator. Retry creates a new operator-triggered durable run and preserves the
  quarantined original. Moderation and user controls use reversible expected-state transitions.
- Extended the Phase 17 warm cream/deep-green identity into a denser, restrained operations console
  rather than replacing it with a generic dark tool. Admin routing remains server-guarded and the
  Next.js bridge explicitly allowlists only the new admin endpoints.

The approved design is
[`docs/superpowers/specs/2026-08-26-knownpath-phase-18-admin-operations-design.md`](docs/superpowers/specs/2026-08-26-knownpath-phase-18-admin-operations-design.md),
and operating/security behavior is in [`docs/ADMIN_OPERATIONS.md`](docs/ADMIN_OPERATIONS.md).

### Files, APIs, and surfaces created

- Added `packages/domain/src/admin.ts`, expanded admin audit vocabulary, session freshness on the
  auth principal, centralized capability/confirmation helpers, administrator attribution in
  canonicalization, repository admin pagination/search/mutations, and BullMQ queue pause/resume plus
  operator initiator metadata.
- Added focused `apps/api/src/admin-service.ts`, `admin-details.ts`, and `admin-routes.ts`
  boundaries, with 12 OpenAPI administration paths for overview, resource list/detail, private
  reveal, moderation, queues, retry, sources, canonical preview/execute, and users. Error handling
  now maps administration and malformed-JSON failures to stable safe envelopes.
- Added `/admin`, `/admin/controls`, resource list/detail routes, administration shell, controlled
  mutation/canonical/private reveal components, and `styles/admin.css`. Untrusted source material is
  rendered as escaped text, never injected HTML.
- Updated the API bridge/contracts, architecture, data model, decisions, operations, README, and the
  dedicated admin runbook. No tests or Phase 19 code were added.

### Commands and behavior successfully verified

- With Node 24.18.0, final `pnpm typecheck` completed **39/39**, `pnpm lint` completed **22/22**,
  `pnpm build` completed **22/22**, `pnpm format:check` passed, and `git diff --check` passed. The
  Next.js production build included all four intended dynamic admin route patterns. No tests were
  added or run.
- `pnpm db:init` completed against Atlas idempotently, reconciled collection validators, and exposed
  the already-defined indexes. This corrected a stale Atlas contribution validator encountered by
  the real private-contribution verification; the same bounded submission then returned 202.
- An isolated API/web/Valkey verification stack reported MongoDB/auth/queues ready. A real temporary
  admin accessed overview and resource details while a real ordinary account received 403 from the
  admin API and 404 from the server-guarded `/admin` UI. Admin overview reflected the actual Atlas
  source, extraction, candidate, KnownPath, user, audit, worker, queue, provider, and search state.
- Sources, source items, extractions, candidates, KnownPaths, users, and audit lists/detail returned
  real safe projections. A normalized source body/provenance was inspectable as escaped text. A
  response scan found no API-key hash/plaintext, credentials, raw authorization/cookies, provider
  interaction payload, embedding vector, MongoDB URI, or Valkey URI.
- A wrong queue confirmation failed 403. After aging the admin session to 31 minutes in the
  disposable account, read-only overview remained 200 while the sensitive queue mutation failed with
  `fresh_admin_session_required`; a new sign-in restored sensitive access. The isolated control
  queue paused and resumed with observed BullMQ state.
- A safe intentional `development.fail` job became `quarantined`. Admin retry returned 200 and
  created a new waiting step/run while the original remained quarantined. A disposable candidate
  completed quarantine and restore. A canonical merge preview/execute followed by split archived the
  disposable KnownPath, deactivated its membership, preserved nine canonical events, and every event
  identified the temporary administrator rather than `system`.
- A real private contribution detail reported content available but exposed neither sanitized nor
  submitted payload. Two freshly confirmed reveals returned only the sanitized structured fields;
  two separate successful reveal audit events retained the stated reason. A user suspension caused
  that account's existing session to fail 401 and restore returned the user to active.
- The rendered admin overview/control room returned 200 for the admin and contained the freshness
  and exact-confirmation guidance. OpenAPI returned 12 administration paths including private reveal
  and canonical execute. API/web logs contained no verification password, API-key plaintext,
  Authorization/cookie field, MongoDB URI, or Valkey URI.
- All disposable services were stopped. Exact cleanup removed two users, three sessions, two auth
  accounts, one API key, one private contribution, one candidate/assessment/profile, one KnownPath,
  one membership/revision, nine canonical events, two runs, three steps, and 23 scoped audit events;
  follow-up counts for the temporary users/candidate/KnownPath/contribution/runs were all zero.

### Environment and manual setup still required

- The hosted Next.js dashboard still needs a deployment with `KNOWNPATH_API_URL` set to the trusted
  HTTPS API. The Render API and scheduled free worker topology are unchanged by this phase.
- Production operators still require accounts provisioned through `pnpm auth:user:create`; public
  signup remains closed. Future specialized moderator/operations roles may use the capability
  boundary but only the existing `admin` role is persisted today.
- Source rate-limit/error health is limited to safely persisted run timestamps/failures and current
  provider configuration. Rich historical operations analytics requires measured production data,
  not fabricated charts.

### Known limitations intentionally left for later phases

- There is no hard deletion, bulk destructive reprocessing, unsanitized private-content access,
  automatic moderation, or independent team moderation. Team ownership remains unsupported.
- Generic list search is bounded escaped MongoDB matching for operator use; Atlas search/vector
  retrieval remains solely the knowledge retrieval boundary.
- Admin capability names are ready for narrower roles, but role assignment/workspace ownership and
  advanced policy administration are deliberately deferred. No tests were added by explicit rule.

### Exact next phase

**Phase 19 (awaiting its prompt): continue only with the capability explicitly requested by the next
phase prompt. Do not infer or begin Phase 19 from Phase 18.**

## Phase 19 — Private and team KnownPath knowledge

### Phase goal

Add personal-private and workspace-scoped shared memory without duplicating the public knowledge
architecture or weakening its privacy boundary. All API, MCP, retrieval, contribution, outcome,
dashboard, and installer paths must derive scope server-side, enforce live membership, and prevent
tenant content or aggregate signals from leaking into public results.

### Research performed and official references consulted

Current official guidance was checked on 2026-08-27 before implementation:

- MongoDB [multi-tenant architecture](https://www.mongodb.com/docs/atlas/build-multi-tenant-arch/)
  and
  [Vector Search multi-tenancy](https://www.mongodb.com/docs/atlas/atlas-vector-search/multi-tenant-architecture/)
  for shared-collection tenant identifiers, mandatory per-query filters, and vector prefiltering.
- Better Auth [organization](https://better-auth.com/docs/plugins/organization) and
  [API key](https://better-auth.com/docs/plugins/api-key) plugin documentation for current
  workspace/member/invitation and scoped-key patterns. KnownPath retained its existing closed
  registration and key model so authorization remains shared by API, MCP, installer, and dashboard.
- The MCP
  [authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
  for server-side bearer authorization and protected-resource boundaries.
- OWASP
  [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
  [API object-level authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/),
  and
  [multi-tenant security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
  for deny-by-default object access, live tenant checks, non-leaking not-found behavior, and audit.

### Architecture and technology decisions

- Added one strict visibility union: `public`, personal `private + ownerUserId`, or
  `team + workspaceId`. Public/private/team records reuse the existing source, candidate,
  assessment, canonical, search, contribution, and outcome structures.
- Added active workspaces and owner/admin/member memberships. Authorization combines the requested
  scope, API-key binding, workspace state, and a live membership lookup on every request; removing a
  member revokes their workspace keys. Direct-ID reads and repository queries receive the same
  server-derived tenant predicates as search.
- Added existing-user-only invitations by normalized email. Invitation creation rejects unknown
  users and duplicate active invitations; membership is created only after the exact invitee accepts
  in the dashboard. Creation, acceptance, rejection, revocation, and expiry are durable and audited.
  Registration remains closed and no email-delivery service was added.
- Combined workspace/public retrieval executes independent branches. Public records remain
  published-only; tenant records may retain review/deprecated lifecycle visibility for authorized
  members. Private/team query text and content never reach public/unpaid Gemini, semantic retrieval
  is blocked for tenant branches, and no vector value is stored for a blocked projection.
- Outcome assessments are scoped independently so personal/workspace observations cannot update a
  public KnownPath's aggregate pointer or ranking. Canonical fingerprint discovery, pair matching,
  merge, and rebuild require identical visibility ownership and cannot cross tenant boundaries.
- Public sharing is an explicit consented workflow that re-runs sanitization and creates a distinct
  low-trust public contribution plus immutable share request. It never flips the private/team source
  record to public. Team processing remains deterministic until a private-approved provider is
  configured.
- Installer profiles store only a non-secret label and optional expected workspace ID. Agent config
  still contains only `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` environment references; doctor can
  compare the selected profile with the authenticated MCP status without changing that model.

The approved design is
[`docs/superpowers/specs/2026-08-26-knownpath-phase-19-private-team-knowledge-design.md`](docs/superpowers/specs/2026-08-26-knownpath-phase-19-private-team-knowledge-design.md),
and user/security behavior is documented in [`docs/WORKSPACES.md`](docs/WORKSPACES.md).

### Collections, schemas, indexes, APIs, and surfaces created

- Added `workspaces`, `workspace_memberships`, `workspace_invitations`, and
  `knowledge_share_requests`, plus strict versioned domain/API contracts and repository services.
  Added workspace slug/owner/status, active membership, invitation invitee/expiry/status, share
  source/workspace/status, API-key workspace/status, tenant visibility, and scoped outcome indexes.
- Added `@knownpath/workspaces`, centralized scoped authorization, workspace-bound API-key issuance
  and verification, tenant-aware search/provenance/outcome/contribution/canonicalization services,
  and source/search repository predicates.
- Added authenticated workspace, membership, invitation, workspace-key, scoped knowledge,
  contribution, outcome, and public-share API flows. MCP search/get/alternatives accept the same
  scopes and status reports the active workspace binding; the stdio bridge remains an HTTP-only
  client with no database or provider access.
- Added `/app/workspaces` for workspace creation, pending invitation acceptance/rejection, member
  and invitation management, contribution defaults, and one-time workspace-key reveal. Explore and
  detail pages carry explicit scope, and private/team detail pages offer the consented public-share
  flow.
- Updated the canonical Agent Skill to version 1.3.0 with tenant-safe search/contribution guidance,
  and extended installer `install`/`update`/`doctor` with `--profile` and optional `--workspace-id`
  metadata.
- Updated architecture, API, MCP, retrieval, contribution, outcome, dashboard, installer, data
  model, decisions, README, and the dedicated workspace operations documentation. No tests were
  added.

### Commands and behavior successfully verified

- With Node 24.18.0, final `pnpm typecheck` completed **41/41** tasks, `pnpm lint` completed
  **23/23** tasks, `pnpm build` completed **23/23** tasks, and `pnpm format:check` passed. The
  production Next.js build included `/app/workspaces`. No tests were added or run.
- `pnpm db:init` ran twice against the configured Atlas database. The first pass created/reconciled
  all four workspace/share collections and indexes; the second pass was idempotent. Direct index
  inspection confirmed the unique workspace slug, partial unique active membership, partial unique
  pending invitation, invitation expiry/status, share-request source/workspace, API-key workspace,
  and tenant retrieval indexes.
- A bounded real Atlas-backed verification created two temporary users and two workspaces through
  the production auth/API services. User A invited existing User B by email, a duplicate active
  invitation returned 409, and explicit acceptance created a member role. Workspace keys were issued
  through the real one-time-reveal path.
- Two isolated team review-state KnownPaths were created only as temporary tenant verification data.
  The authorized API search found its own record; cross-workspace search and direct-ID access hid
  the other record with 404 semantics; public result count was unchanged. Team search reported
  semantic state `blocked`, proving the public-only embedding path was not called.
- The official MCP Streamable HTTP client found only the key's own workspace record. The production
  Next.js dashboard build listed only the signed-in user's workspace and rendered the cross-tenant
  detail as a safe not-found response without record title/error content.
- A consented synthetic public-share request returned `submitted`, created a separate public
  contribution, and left the source KnownPath's scope `team`. Four observed workspace audit events
  covered the exercised lifecycle. Cleanup removed 39 exact temporary records and follow-up counts
  for temporary users/workspaces/KnownPaths were all zero.
- The installer CLI built successfully. A project-scoped Codex
  `install --dry-run --profile alpha-team --workspace-id <uuid> --json` reported only the MCP entry,
  canonical skill, and non-secret state changes; it wrote nothing and persisted no key value.

### Environment and manual setup still required

- Production use requires an existing KnownPath account, an active workspace membership, and a
  workspace-bound API key supplied through `KNOWNPATH_API_KEY`; registration remains
  CLI-administered and closed. Invitations appear in the existing user's dashboard and are not
  emailed.
- Private/team semantic retrieval remains intentionally unavailable because no provider/account has
  been explicitly approved for private data. Exact normalized-error and lexical retrieval remain
  available. Adding an approved private provider later uses the existing capability boundary.
- The hosted dashboard still requires deployment with `KNOWNPATH_API_URL` set to the trusted HTTPS
  API. Existing Render API, Atlas, Upstash, and scheduled-worker requirements are unchanged.

### Known limitations intentionally left for later phases

- No external email invitations, public registration, billing, SSO/SCIM, workspace deletion,
  ownership transfer, organization-wide policy engine, or private-provider configuration exists.
- Workspace roles are deliberately minimal. Platform administrators do not gain broad tenant content
  access; the Phase 18 freshly authenticated, reasoned, audited sanitized-contribution reveal
  remains the narrow exception.
- Tenant vector retrieval is blocked until a private-approved provider and index rollout exist. No
  private/team signal changes public ranking, and no private/team record is silently promoted.
- No tests were added by explicit phase rule.

### Exact next phase

**Phase 20 (awaiting its prompt): continue only with the capability explicitly requested by the next
phase prompt. Do not infer or begin Phase 20 from Phase 19.**

## Phase 20 — Security hardening and provider-neutral observability

### Phase goal

Harden KnownPath's public API, MCP, tenant, ingestion, AI, contribution/outcome, administration,
installer, and deployment boundaries for real open-source operation. Add distributed production
abuse controls, SSRF-safe ingestion, privacy-bounded OpenTelemetry signals, dependency protections,
and actionable incident/credential-rotation guidance without adding a paid monitoring dependency.

### Research performed and official references consulted

Current official guidance was checked on 2026-08-28 before implementation:

- OWASP [API Security Top 10](https://owasp.org/API-Security/),
  [MCP Security](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html),
  [RAG Security](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html),
  [LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html),
  [SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html),
  [Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html),
  [Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), and npm
  security guidance for the reviewed threat and supply-chain boundaries.
- Current MCP 2026-07-28
  [security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)
  for confused-deputy, token handling, session, local-server, and input-validation controls.
- Fastify and `@fastify/rate-limit` current documentation for bounded server timeouts, per-route
  policies, Redis-backed distributed counters, and fail-closed store behavior.
- Node.js DNS and Undici documentation for resolving all A/AAAA results, supplying a validated
  connection lookup, bounding requests, and manually revalidating redirects.
- OpenTelemetry JavaScript
  [instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/),
  [exporters](https://opentelemetry.io/docs/languages/js/exporters/), OTLP, and
  [sensitive-data handling](https://opentelemetry.io/docs/security/handling-sensitive-data/) for
  explicit trace/metric instrumentation and an operator-owned collector path.
- GitHub official [Dependabot](https://docs.github.com/en/code-security/dependabot),
  [dependency review](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review),
  and
  [CodeQL](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)
  documentation for free repository security automation. `agent-reach check-update` confirmed the
  research helper was current at v1.5.0.

### Security, architecture, and technology decisions

- Production request limiting is Valkey-backed through `@fastify/rate-limit`; startup requires
  `API_RATE_LIMIT_STORE=valkey`, a configured reachable `QUEUE_REDIS_URL`, and never falls back to
  process memory. In-memory limiting requires an explicit development setting. Bearer subjects are
  HMAC digests, not credentials.
- Added understandable cost classes for sign-in, key mutation, search/read, contributions, outcomes,
  MCP mutations, provider-backed semantic work, and admin reads/sensitive actions. The existing
  BullMQ limiters remain the external GitHub/docs/Gemini workload boundary.
- Centralized Fastify payload/connection/request/keep-alive/parameter limits, strict origin checks
  for cookie mutations, exact CORS, production security headers, safe error envelopes, request-ID
  correlation, and redacted Pino serializers. Logged request URLs exclude query strings.
- Official-source requests now require an exact HTTPS origin, standard port, and canonical path
  prefix; reject literal private IPs; resolve and validate every DNS answer; pin the validated
  address into Undici; and revalidate every redirect. SSRF denials do not retry.
- Added `@knownpath/observability` with explicit manual HTTP, MCP, search/DB, queue, ingestion,
  provider, contribution, outcome, security, and dependency instruments. Optional console/OTLP
  export has a fixed low-cardinality vocabulary. Automatic resource/framework instrumentation is
  disabled so telemetry cannot capture queries, content, URLs, IDs, host IDs, process arguments,
  user paths, or credentials.
- Kept Pino as the structured log pipeline and correlated it with request/trace/span IDs. Arbitrary
  exception messages and stacks are excluded from production error logging. MCP output neutralizes
  instruction-like markup and invisible control/bidirectional characters before returning untrusted
  evidence.
- Installer writes now require absolute NUL-free paths, reject symlink path components and symlinked
  skill contents, require expected regular file/directory types, use exclusive no-follow temporary
  files with restrictive modes, and retain the existing backup/owned-only semantics.
- Added SHA-pinned CodeQL, dependency-review, and audit workflows plus Dependabot and the root
  `security:audit` command. MongoDB remains product state; Valkey remains ephemeral security/queue
  infrastructure; OpenTelemetry export remains optional.

The approved design is
[`docs/superpowers/specs/2026-08-28-knownpath-phase-20-security-observability-design.md`](docs/superpowers/specs/2026-08-28-knownpath-phase-20-security-observability-design.md).
The full threat model, observability contract, incident response, and rotation procedures are in
[`docs/SECURITY_ARCHITECTURE.md`](docs/SECURITY_ARCHITECTURE.md),
[`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md), and
[`docs/SECURITY_OPERATIONS.md`](docs/SECURITY_OPERATIONS.md).

### Files/packages and boundaries created

- Added `packages/observability` and integrated its bounded manual signals into the API, MCP,
  retrieval, jobs, ingestion, Gemini/GitHub clients, contributions, and outcomes.
- Added centralized security configuration/redaction constants, a reusable Valkey abuse gate,
  distributed Fastify rate limiting, provider-heavy search gates, critical/degraded readiness, and
  explicit OpenTelemetry environment configuration.
- Hardened official-source registry validation/fetching, MCP result projection and tool limits,
  admin route policies, API logging/errors/headers/origins/timeouts, and installer filesystem
  mutation helpers.
- Added `.github/dependabot.yml`, CodeQL, dependency-review, and dependency-audit workflows;
  `SECURITY.md`; `docs/SECURITY_ARCHITECTURE.md`; `docs/SECURITY_OPERATIONS.md`; and
  `docs/OBSERVABILITY.md`. Updated environment, deployment, API, MCP, ingestion, installer,
  operations, architecture, decisions, and README guidance.
- During real official-client verification, fixed the MCP outcome input boundary to use an ISO
  timestamp input schema rather than exposing an internal `Date` union that current JSON Schema
  cannot represent. No tests were added.

### Commands and behavior successfully verified

- Dependency installation completed with pnpm. Final `pnpm typecheck` completed **43/43**,
  `pnpm lint` completed **24/24**, `pnpm build` completed **24/24**, `pnpm format:check` passed,
  `git diff --check` passed, and `pnpm security:audit` reported `No known vulnerabilities found`.
- Production configuration with `API_RATE_LIMIT_STORE=memory` failed clearly before startup.
  Production Valkey mode without `QUEUE_REDIS_URL` also failed clearly before startup. Explicit
  local-memory mode booted against the configured Atlas database, returned live `200`, and returned
  readiness `200` with `status=degraded`, MongoDB/auth `ok`, rate limiter `development_memory`, and
  queues `disabled`.
- With a two-request local policy, the third request returned the stable `429 rate_limit_exceeded`
  envelope. A query containing a fake secret was logged only as `/health/live`; the fake value was
  absent. SIGINT produced the graceful shutdown event.
- A direct literal-loopback official-source request passed the configured origin/path allowlist but
  was denied as `KNOWNPATH_SSRF_DENIED`, confirming the network-address boundary is independent of
  registry allowlisting.
- A temporary, expiring, admin-owned `knowledge:read` key was created through the real service,
  exercised with the official MCP Streamable HTTP client, and revoked in cleanup. A real
  `knownpath_search` returned one compact content block under the modern protocol and produced five
  HTTP spans plus one `knownpath.mcp.search` and one nested `knownpath.db.knowledge_search` span.
- The captured log/console telemetry contained neither the temporary key, fake query secret, search
  text, MongoDB URI, Authorization field, host ID, process arguments/path, nor operating-system
  user. Installer `atomicWrite` denied a configuration path containing a symlink. Temporary API
  services stopped and the verification key was revoked.

### Environment and manual setup still required

- Deploy this Phase 20 commit before treating the new production controls as active. The current
  Render readiness URL returned no bytes before a 60-second probe timeout on 2026-08-28, so hosted
  Valkey rate limiting/readiness was not claimed as verified in this phase.
- Render must retain `API_RATE_LIMIT_STORE=valkey`, the existing TLS `QUEUE_REDIS_URL`, production
  HTTPS auth/CORS settings, and distinct auth/key secrets. Confirm `/health/ready` reports the
  critical rate limiter `ok` after deployment. The worker/scheduled action continues using the same
  Valkey endpoint for ephemeral BullMQ state.
- OTLP export is optional and was verified with the console exporter only. Operators who enable
  `OTEL_EXPORTER=otlp` must supply their own collector endpoint, transport security, retention, and
  access policy, then verify trace/metric receipt without loosening the telemetry privacy contract.
- Enable GitHub security features supported by the repository plan so dependency review, CodeQL,
  Dependabot, and private vulnerability reporting can run. Rotate credentials using the documented
  runbook; no credential values are committed.

### Known limitations intentionally left for later phases

- There is no WAF, automatic account-risk fingerprinting, SIEM, paid monitoring dependency, keychain
  installer integration, or automatic incident remediation. Abuse controls intentionally use
  explicit account/key/IP and durable domain signals rather than invasive opaque tracking.
- OpenTelemetry JavaScript logs remain developmental, so Pino is intentionally retained. Collector
  availability is not a product-readiness dependency and telemetry can be dropped during an exporter
  outage; product/audit state remains in MongoDB.
- Private/team data remains blocked from public Gemini/embedding providers. No private provider,
  tenant vector retrieval, or cross-scope aggregation was introduced. No tests were added by
  explicit phase rule.

### Exact next phase

**Phase 21 (awaiting its prompt): continue only with the capability explicitly requested by the next
phase prompt. Do not infer or begin Phase 21 from Phase 20.**

## Phase 21 — Open-source deployment and release preparation

### Phase goal

Make KnownPath reproducibly installable, packageable, deployable, and understandable outside the
original development machine. Prepare—not automatically perform—npm, MCP Registry, container,
GitHub, and operator release paths while preserving the existing Apache-2.0 license, privacy
boundaries, MongoDB product truth, and explicit phase stop.

### Research performed and official references consulted

Current official guidance was checked on 2026-08-29 before implementation:

- Node/npm documentation for package metadata, `files`/bin behavior, `npm pack`,
  [publishing](https://docs.npmjs.com/cli/v11/commands/npm-publish),
  [trusted publishing/provenance](https://docs.npmjs.com/trusted-publishers), and GitHub's
  [Node package publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages).
- MCP Registry's current `2025-12-11` `server.json` schema,
  [publishing/ownership](https://modelcontextprotocol.io/registry/publishing), npm `mcpName`
  metadata, and official MCP Publisher v1.8.1.
- The open [Agent Skills specification](https://agentskills.io/specification), official `skills-ref`
  validator, and current distribution/discovery guidance already researched for Codex, Claude Code,
  Cursor, Gemini CLI, and OpenCode.
- pnpm's [Docker](https://pnpm.io/docker) and deploy guidance, Docker's
  [build best practices](https://docs.docker.com/build/building/best-practices/), Node's official
  container images, and Compose health/dependency behavior.
- GitHub Actions' public-repository
  [billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), workflow
  security, CodeQL/dependency-review integration, and immutable action pinning.
- [Semantic Versioning 2.0.0](https://semver.org/), current Changesets 3.0.1, Keep a Changelog,
  Contributor Covenant 2.1, GitHub community/security file conventions, and Apache-2.0 metadata.

### Architecture, packaging, and release decisions

- Only `knownpath` is publishable on npm. Internal `@knownpath/*` workspaces remain private. The
  seven-file CLI archive includes its executable, sourcemap, README, Apache-2.0 license, and
  canonical skill. A package validator packs, inspects, installs, and executes the archive in an
  isolated consumer without publishing.
- Added `io.github.nasyx-rakeeb/knownpath` npm ownership metadata and root `server.json`. The
  manifest points at `npx -y knownpath mcp` and declares required API URL/key environment variables.
  MCP Registry publication remains an explicit post-npm maintainer action.
- Adopted Changesets for public SemVer intent and version/changelog generation. The pending minor
  Changeset proposes `knownpath@0.4.0`; source/package version remains 0.3.0 until the deliberate
  version-and-publish workflow.
- Added one multi-target Node 24 Dockerfile for non-root API, worker, and standalone Next.js web
  images. pnpm's documented legacy deploy mode is explicit because injected workspace packages
  currently break the established TypeScript declaration/project build graph. Compose adds an
  optional full platform profile while MongoDB and Valkey keep their existing roles.
- CI performs locked install, format/type/lint/build/audit, packed CLI, official skill/MCP metadata,
  and all three container validations. It never publishes and includes no test job.
- Documentation is provider-neutral. Render/Atlas/Upstash/GitHub Actions remains one current
  low-cost example, not a mandatory hosting architecture.

The approved design is
[`docs/superpowers/specs/2026-08-29-knownpath-phase-21-open-source-release-design.md`](docs/superpowers/specs/2026-08-29-knownpath-phase-21-open-source-release-design.md).

### Files, packages, and documentation created or updated

- Added root `Dockerfile`, `.dockerignore`, expanded `compose.yaml`, deployment file lists for
  API/worker, and Next.js standalone output.
- Added Changesets configuration/pending release note, package/release scripts, packed CLI
  validation, npm MCP ownership metadata, and root `server.json`.
- Added `.github/workflows/ci.yml` with SHA-pinned official actions and independent container
  targets; existing Dependabot, CodeQL, dependency-review, audit, and queue workflows remain.
- Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `docs/AGENT_INSTALLATION.md`,
  `docs/INGESTION.md`, `docs/PRIVACY.md`, and `docs/RELEASE.md`. Reworked README and deployment
  guidance; updated architecture, decisions, MCP, Agent Skill, operations, security policy, and the
  complete grouped environment example.
- The environment example covers all 101 schema keys and contains no credential defaults. No tests
  were added.

### Commands and behavior successfully verified

- `pnpm install --frozen-lockfile` completed for all 26 projects. Final `pnpm format:check` passed;
  `pnpm typecheck` completed **43/43** tasks; `pnpm lint` completed **24/24**; `pnpm build`
  completed **24/24**; and `pnpm security:audit` reported `No known vulnerabilities found`.
- `pnpm package:validate` built and inspected exactly seven files, rejected unresolved
  workspace/catalog specifications and local sourcemap paths, installed the tarball into an isolated
  npm consumer, and exercised version/help/status plus a project-scoped Codex install dry-run. No
  fake API key appeared in output.
- `pnpm release:status` reported only the pending `knownpath` minor bump to 0.4.0.
  `docker compose config --quiet`, Actionlint 1.7.11, official `skills-ref` at pinned commit
  `69ef37e...`, and official MCP Publisher 1.8.1 validation all passed.
- Clean container install/build produced API, worker, and web targets; all runtime users were
  `node`. API and web images include health checks. With synthetic process-local secrets against
  local MongoDB/Valkey, API liveness returned `ok`, readiness returned `ready` with MongoDB, auth,
  and queues `ok`, and explicit `development_memory` rate limiting. The bounded worker emitted
  `worker.ready` and `worker.drain.complete`; the standalone web image returned HTTP 200.
- The checkout's existing ignored `.env` was intentionally preserved. Its missing auth/rate-limit
  values caused the first Compose application boot to fail clearly, as required; verification then
  used generated process-local values rather than writing credentials. A schema/example comparison
  found 101 configuration keys, 101 example keys, and no missing keys.
- `git diff --check` passed. A workspace scan found no committed package archives, key files, or
  recognized Gemini/npm/MongoDB/Valkey credential patterns.

### Environment and manual setup still required

- A real deployment still requires operator-managed MongoDB, Valkey, unique auth/key-pepper secrets,
  HTTPS URLs/origins, first-admin creation, GitHub/Gemini credentials where used, optional Atlas
  search indexes, and optional OTLP collector. Fill an ignored `.env` or platform secret store
  before using the full Compose profile.
- The prepared 0.4.0 Changeset has not been applied or published. A maintainer must review the
  generated version/changelog diff, authenticate via npm trusted publishing or an approved
  interactive method, publish npm, verify the exact artifact, then separately publish MCP Registry
  metadata, tag/release GitHub, build/push images, and deploy. None occurred in Phase 21.
- GitHub repository settings must enable the supported security features, private vulnerability
  reporting, branch protection/review policy, and any trusted-publisher release environment.
- Initial production data remains an operator-controlled bounded seed and review/publication flow;
  no fabricated knowledge was added.

### Known limitations intentionally left for later phases

- No unit, integration, or E2E tests were introduced by explicit phase rule. CI validates compile,
  format, lint, package, supply-chain, metadata, and container contracts only.
- No automatic external release, container registry, package registry, hosted environment,
  production URL, billing, public registration, or license change was added.
- pnpm injected workspace deployment is deferred until the TypeScript declaration/project graph can
  use it without breaking builds; the documented maintained legacy deploy path is explicit.
- Free/low-cost hosted examples have cold-start, quota, and schedule-latency limits and are not an
  always-on SLA.

### Exact next phase

**Phase 22 (awaiting its prompt): continue only with the capability explicitly requested by the next
phase prompt. Do not infer or begin Phase 22 from Phase 21.**

## Phase 22 — Complete platform audit and polish

### Phase goal and full system status

Audit the implementation rather than trusting prior phase claims, repair concrete defects without a
rewrite, and manually exercise the complete public and tenant-scoped learning loops. KnownPath now
has coherent TypeScript boundaries for ingestion, extraction, verification, canonicalization,
retrieval, API/MCP delivery, contributions, outcomes, operations, user/admin web surfaces, tenant
authorization, observability, packaging, and deployment. MongoDB remains the durable product store;
Valkey remains ephemeral queue, coordination, and distributed rate-limit infrastructure. Automated
unit, integration, and E2E tests remain explicitly deferred by the build sequence.

The final architecture is: allowlisted public sources are normalized into immutable source items;
public records may be processed by configured Gemini extraction/embedding providers; deterministic
verification creates immutable assessments; reversible canonicalization produces KnownPaths; hybrid
retrieval combines exact, lexical, semantic, environment, version, trust, freshness, and outcome
signals; the API is the authorization/business-logic boundary for web and MCP clients; contributions
and outcomes return through privacy, abuse, scoring, and review pipelines. Private/team content
stays tenant-scoped and is blocked from the unpaid/public Gemini path.

### Fresh official research and compatibility review

Current official material was checked on 2026-08-30 through 2026-08-31 before final verification:

- The current [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25),
  [transport rules](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), and
  official TypeScript SDK v2 server/client packages confirmed the existing Streamable HTTP and stdio
  bridge architecture, Origin/auth handling, cancellation, and compact tool contracts.
- The open [Agent Skills specification](https://agentskills.io/specification) and official
  `skills-ref` validator confirmed the canonical skill metadata and progressive instruction layout.
- Current official client documentation was checked for
  [Codex MCP](https://developers.openai.com/codex/mcp),
  [Codex Skills](https://developers.openai.com/codex/skills),
  [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp),
  [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills),
  [Cursor MCP](https://cursor.com/docs/mcp), [Cursor Skills](https://cursor.com/docs/skills),
  [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/), and
  [Gemini CLI Skills](https://geminicli.com/docs/cli/skills/). The canonical skill remains portable;
  adapters own client-specific paths and config formats.
- Google’s official Gemini model, structured-output, SDK, rate-limit, and embeddings documentation
  confirmed configurable `@google/genai`, the current `gemini-3.5-flash-lite` extraction selection,
  `gemini-embedding-2`, 768 configured dimensions, strict structured validation, and model/version
  metadata. Provider policy—not content—continues to decide whether data may leave KnownPath.
- GitHub’s current REST version `2026-03-10`, GraphQL Discussions schema, pagination, conditional
  requests, rate-limit, retry, and API best-practice guidance confirmed the collector contracts. The
  canonical Expo/React Native repositories were checked live.
- MongoDB’s current Search/Vector Search index definition, filter, lifecycle, and queryability
  documentation confirmed Atlas definition reconciliation and tenant-filter fields. BullMQ 6.2.0
  retry/backoff, stalled-job recovery, and graceful worker behavior remain compatible with Valkey’s
  Redis protocol.

### Audit gaps found and fixed

- Corrected the obsolete React Native documentation repository and license links from
  `reactjs/react-native-website` to the current official `react/react-native-website` location in
  source configuration and documentation.
- Atlas index initialization previously treated a matching name as sufficient. It now compares the
  live definition, updates drifted Search/Vector Search indexes, reports created/reused/updated
  separately, and waits for both `READY` and `queryable`. Live definitions now include `ownerUserId`
  and `workspaceId` tenant filters.
- External timestamps could fail after an HTTP adapter transformed them to `Date` and a service
  validated them again. The shared boundary schema is now idempotent while still advertising a
  strict JSON date-time string; real MCP outcome submission and deduplication then succeeded.
- Uninstalling the final managed agent attempted directory removal on the regular installer-state
  file. A symlink-safe owned-file removal primitive now removes only that file; real
  uninstall/reinstall completed without changing unrelated config.
- Added the web app’s missing direct `server-only` declaration and removed genuinely unused direct
  dependencies from internal package manifests. Bundled CLI runtime dependencies remain explicit by
  design. The only reported deprecated transitive dependency is `node-domexception@1.0.0`; no direct
  deprecated package or security advisory was found.
- Reconciled README, architecture, data model, API, MCP, retrieval, ingestion, installer, decisions,
  Agent Skill, and historical source-design references with implemented behavior. Added a patch
  Changeset for the published CLI uninstall correction and documented all unreleased fixes.

### End-to-end and manual verification performed

- A frozen pnpm install completed across all 26 projects. Final combined gates completed **72/72**
  typecheck/lint/build tasks; formatting passed; package validation packed seven files, installed
  the tarball in an isolated consumer, and executed the CLI; `pnpm audit --audit-level high`
  reported no known vulnerabilities. All five GitHub workflow YAML files parsed successfully.
- MongoDB initialization created all 33 collections/index sets in a clean local database; a second
  run reused all 33, and the repository round trip cleaned its temporary record. The isolated local
  and Atlas smoke databases were dropped after verification.
- A bounded unauthenticated `expo/expo` Issues sync created two real items on the first run and
  reported both unchanged on the second. A targeted Expo documentation page likewise changed from
  created to unchanged. Persisted items retained comments/text, objective provenance, update times,
  hashes, authorship associations, and available reactions; no token appeared in output.
- After the initial commit, the authenticated GitHub CLI keyring session supplied `GITHUB_TOKEN`
  directly to a bounded GraphQL run without writing or printing it. One real
  `react-native-community/discussions-and-proposals` discussion plus four comments were created; the
  identical second run reported all five unchanged. Inspection confirmed canonical URLs, immutable
  node identities, content hashes, observed timestamps, collaborator association, category/state,
  upvotes, and reaction summaries in MongoDB.
- Live Gemini processed bounded public Expo records. Invalid reusable/evidence claims were
  quarantined, an unchanged successful extraction avoided another provider call, and a real useful
  candidate was deterministically rescored to a new immutable high-confidence assessment. The
  private/team unpaid-provider block remained enforced.
- Atlas re-projection reused current `gemini-embedding-2` vectors without provider calls. Exact
  error search returned the compatible review KnownPath above looser matches with separate exact,
  lexical, semantic, version, platform, trust, freshness, and outcome explanations. Atlas Search and
  Vector Search were both `READY` and queryable; local fallback search worked without vector
  services.
- Against an isolated real API database, liveness/readiness, OpenAPI 3.1 (53 paths), stable invalid
  input errors, missing IDs, invalid/revoked auth, admin-only review access, and audit events were
  inspected. Ordinary clients could not search or fetch review records. Browser responses exposed no
  keys, embeddings, raw source dumps, private removed fields, or admin-only data.
- The official MCP SDK inspector observed exactly six tools: `knownpath_search`, `knownpath_get`,
  `knownpath_alternatives`, `knownpath_status`, `knownpath_contribute`, and
  `knownpath_report_outcome`. Streamable HTTP and the environment-only stdio bridge both searched
  successfully; malformed auth/input remained concise and secret-free.
- A consented synthetic public contribution passed MCP/API sanitization into source, candidate,
  immutable assessment, moderation, review canonicalization, and searchable projection. Fake token,
  email, and home-path content was detected/sanitized and absent from responses. Self-report alone
  produced low trust and never auto-published knowledge.
- One real MCP outcome produced one immutable record; retrying the same execution reused it instead
  of incrementing counts. The Wilson-derived aggregate stayed `very_low` confidence for the single
  sample. Safety review state remained separate from ranking state.
- Two isolated workspaces were exercised. Workspace 1 could retrieve its team review KnownPath;
  Workspace 2 received authorization denial for both search and direct detail. Public results were
  unchanged. Public sharing created a separate sanitized public contribution rather than flipping
  the proprietary record.
- User and admin web routes loaded through the real API. An ordinary session received 404 for the
  admin surface while a real admin could inspect operational/audit pages. Twelve invalid sign-ins
  produced ten `401` responses followed by two `429` responses. Visual browser/mobile and assistive
  technology inspection remains a genuine external manual check because no interactive browser was
  available in this environment.
- SafeSourceHttpClient denied an allowlisted literal loopback URL through its SSRF policy. Pino logs
  omitted a fake Authorization secret. Console OpenTelemetry showed correlated HTTP -> MongoDB and
  MCP -> tool spans with only bounded route/backend/scope attributes—no query, credential, user ID,
  workspace ID, content, or filesystem path.
- Local MongoDB 8 and Valkey 9.1.1 became healthy. BullMQ completed a bounded job, quarantined a
  permanent failure after one attempt, quarantined a transient failure after three attempts, and
  stopped the worker gracefully. The local services were stopped after cleanup.
- Production API, worker, and web container targets built successfully and ran as non-root `node`;
  API/web health checks were present. The official Agent Skills validator reported
  `Valid skill: skills/knownpath`.
- Installer dry-run, install, repeated install, status, doctor, uninstall, and reinstall were
  exercised for locally installed Codex, Claude Code, and OpenCode. The second install made zero
  changes; pre/post config hashes matched; only environment-variable names—not values—were stored.
  Cursor and Gemini CLI adapters were verified against current official documentation but those
  clients were not installed locally.
- The deployed API at `https://knownpath-api.onrender.com` cold-started and then returned liveness
  `ok` and readiness `ready` with MongoDB, auth, distributed rate limiter, and queues all `ok`.

### Current supported surface and seed architecture

- Installer/client adapters: OpenAI Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode. Local
  real lifecycle verification covered Codex, Claude, and OpenCode; Cursor/Gemini remain doc-derived
  until installed on a suitable machine.
- Initial GitHub registries: `expo/expo`, `react/react-native`,
  `react-native-community/discussions-and-proposals`, `reactwg/react-native-new-architecture`, and
  `react-native-community/upgrade-support`. Curated official registries cover Expo
  documentation/changelog and React Native documentation/releases, with full indexes available for
  targeted retrieval.
- Gemini extraction and embedding are provider/config abstractions with public-only free-path
  enforcement, prompt/model/schema/content-hash versioning, strict structured output, quarantine,
  and reproducible reprocessing. Search stays useful locally without Atlas vector retrieval.
- Public, personal-private, and workspace/team visibility is enforced in repositories, services,
  API, MCP, embeddings, outcomes, and dashboard access. Admin private-content reveal remains
  sanitized, reason-gated, freshly authenticated, role checked, and audited.

### External/manual checks and release/deployment status

- No Phase 22 package publish, MCP Registry publish, GitHub release, or explicit hosted redeploy was
  performed; external release actions require explicit maintainer intent. The Phase 22 audit commit
  was pushed to `origin/main`; hosted rollout of that commit was not separately reverified.
- Authenticated GraphQL Discussions ingestion and idempotent replay were verified with the GitHub
  CLI keyring token. Large authenticated backfills remain deliberately unrun; they should use
  bounded windows and operational rate monitoring.
- Cursor and Gemini CLI were unavailable locally. Dashboard visual/mobile/accessibility inspection,
  an external OTLP collector, and a private-data-approved AI provider remain external checks.
- Existing real canonical records remain review-state; the audit did not fabricate or publish
  knowledge to make verification easier. Promotion still requires real moderation/evidence.
- CI, Docker, npm tarball, Changesets, MCP metadata, Apache-2.0 licensing, environment example, and
  operator documentation are release-ready. The pending Changeset proposes `knownpath@0.4.2` after
  deliberate review and publication.

### Security and privacy status

Server-side auth, fresh-admin confirmation, audit trails, tenant filters, distributed production
rate limits, payload/time limits, source allowlists, DNS/IP/redirect SSRF checks, prompt-injection
boundaries, structured AI validation, secret/PII sanitization, outcome deduplication/abuse controls,
safe installer writes, critical/degraded readiness, and low-cardinality OpenTelemetry correlation
were all inspected. No recognized Gemini, npm, GitHub, MongoDB, or Valkey credentials were found in
tracked files; ignored local `.env` remained untracked. Synthetic credentials and smoke databases
were removed after verification.

### Explicitly deferred work

Automated unit, integration, and E2E tests are intentionally deferred to a separate future project,
as required by every phase in this sequence. Remaining work is operational release/deployment and
external-client verification, not a new KnownPath feature phase.

### Final phase boundary

Phase 22 completes this build sequence. Do not start another feature phase implicitly.
