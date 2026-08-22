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
