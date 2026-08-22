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

## 2026-08-22 — Resequence authentication as Phase 3

**Decision:** Treat the current approved phase instruction as authoritative and implement the secure
authentication/API-key foundation in Phase 3. The source ingestion work named as Phase 2's exact
next phase becomes Phase 4.

**Why:** `progress.md` truthfully preserves what Phase 2 expected at completion, while the later
explicit user instruction intentionally changes sequencing. Appending this decision avoids silently
rewriting historical phase records.

## 2026-08-22 — Use Better Auth with one closed-registration user identity

**Decision:** Use Better Auth 1.7 with its official MongoDB adapter for scrypt password credentials
and database-backed HttpOnly cookie sessions. Better Auth and KnownPath share the existing `users`
collection. Email/password signup is disabled; public signup, email verification, reset, OAuth,
email changes, deletion, and HTTP administrative user management are not exposed. Users and admins
are provisioned only through the masked repository CLI.

**Why:** Better Auth is maintained, open source, framework-neutral, supports Fastify and MongoDB,
uses memory-hard scrypt hashing, performs origin/CSRF checks, and supplies revocable sessions. A
single identity avoids synchronization and authorization drift. Better Auth's Mongo adapter treats
its `"uuid"` mode as BSON UUID storage, so KnownPath supplies a UUID-generating function to preserve
Phase 2's stable string-ID contract.

**Rejected:** Separate auth/domain users duplicate identity and failure states. A custom password or
session framework creates an unnecessary security-critical surface. JWT browser sessions weaken
simple revocation. A paid hosted identity provider conflicts with the open-source/self-hosted goal.

**References:** [Better Auth installation](https://www.better-auth.com/docs/installation),
[MongoDB adapter](https://better-auth.com/docs/adapters/mongo),
[session management](https://better-auth.com/docs/concepts/session-management),
[security](https://better-auth.com/docs/reference/security),
[Fastify integration](https://better-auth.com/docs/integrations/fastify)

## 2026-08-22 — Keep agent API keys in the KnownPath domain

**Decision:** Retain the Phase 2 `api_keys` aggregate rather than adopt Better Auth's separate
API-key plugin model. Keys contain a public prefix plus 32 random secret bytes. Only an HMAC-SHA-256
digest protected by a required, independently managed pepper is persisted. Key management is
session-only; bearer use is constrained by owner status and a closed scope enum.

**Why:** Agent/MCP capabilities, rotation, audit history, and future contribution semantics are
KnownPath domain concerns. High-entropy random credentials need deterministic keyed verification,
not a slow human-password KDF. A non-secret prefix supports indexed identification without exposing
the secret. Hash versioning permits later migration.

**Rejected:** Plaintext/encrypted key storage increases breach impact. A bare SHA-256 digest lacks
defense if database contents are stolen. Letting API keys mint or rotate keys expands the impact of
a leaked agent credential. The Better Auth plugin would create a second key source of truth.

**References:** [Node.js crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html),
[OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html),
[Better Auth API-key reference](https://better-auth.com/docs/plugins/api-key/reference)

## 2026-08-22 — Make HTTP security explicit and keep rate limiting process-local

**Decision:** Generate an OpenAPI 3.1 contract from Zod route schemas with Fastify's maintained
plugins. Use server-generated request IDs, one error envelope, credential-redacted Pino logging,
explicit CORS origins, explicit proxy addresses, environment-aware secure cookies/HSTS, and
`@fastify/rate-limit` 11.2 or newer. Phase 3 uses its in-memory per-process store behind reusable
policy contracts and adds no auxiliary service.

**Why:** These controls make the API inspectable and safe by default while the project still runs as
a single local process. The selected rate-limit release contains the official IPv6 normalization
security fix. A separate distributed store is unjustified until deployment topology requires one.

**Rejected:** Wildcard credentialed CORS, blindly trusting all forwarded headers, request-body
logging, and caller-controlled request IDs create avoidable security ambiguity. Redis/Valkey would
violate the phase's infrastructure restraint.

**References:** [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/),
[Fastify server options](https://fastify.dev/docs/latest/Reference/Server/),
[Fastify Swagger](https://github.com/fastify/fastify-swagger),
[Fastify rate limit](https://github.com/fastify/fastify-rate-limit),
[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

## 2026-08-22 — Use official GitHub APIs through Octokit with a hybrid REST/GraphQL collector

**Decision:** Use Octokit 5 against GitHub REST API version `2026-03-10` for repository metadata,
issues, comments, labels, and reactions. Use authenticated GitHub GraphQL for Discussions and
closing-pull-request enrichment. Public REST collection may run without a token; Discussions are an
explicit skipped capability in that mode.

**Why:** GitHub REST exposes cache validators and public unauthenticated access, while Discussions
and their answer/thread graph are officially supported through GraphQL. Octokit is the maintained
GitHub SDK and provides request, retry, throttling, and pagination infrastructure. The collector
still validates every used response shape with Zod before normalization.

**Rejected:** Scraping GitHub HTML violates the provenance/API boundary and is brittle. REST-only
cannot capture Discussions. GraphQL-only gives up useful REST conditional requests and a supported
lower-friction unauthenticated path. A custom HTTP/retry stack would duplicate maintained SDK work.

**References:**
[GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions),
[REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
[REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api),
[Discussions GraphQL guide](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions),
[Octokit](https://github.com/octokit/octokit.js)

## 2026-08-22 — Persist immutable GitHub objects with overlapping incremental cursors

**Decision:** Persist each issue, discussion, comment, and reply as an independent immutable source
snapshot. Keep root/parent identities and versioned provider metadata. Deduplicate exact observed
versions through canonical SHA-256 keys, and advance per-type updated-time cursors only after a
failure-free run. Incremental reads overlap the last cursor by a configurable window; issue-list
ETags avoid unchanged transfers when the request bounds match.

**Why:** Independent comments avoid unbounded embedded arrays and let later extraction cite exact
evidence. Immutable snapshots preserve edits and objective provenance. Overlap catches late edits
and timestamp-boundary races; deterministic deduplication makes it safe. A failed object must not
move the source cursor past work that needs retrying.

**Rejected:** Overwriting one mutable document loses edit history. Embedding whole threads creates
large, frequently rewritten documents. Cursor-only collection without overlap risks boundary misses.
Semantic deduplication and inferred fixes belong to later processing phases.

## 2026-08-22 — Resequence authoritative source ingestion as Phase 5

**Decision:** Treat the explicit Phase 5 instruction as authoritative and ingest first-party Expo
and React Native documentation/release material before AI extraction. The AI-extraction phase named
at Phase 4 completion moves to the exact next phase.

**Why:** Official guidance can strengthen or contradict community evidence and should exist before
the extractor and scoring design are fixed. `progress.md` preserves Phase 4's historical expectation
and appends this deliberate sequencing change rather than rewriting history.

## 2026-08-22 — Prefer official structured catalogs with configurable curated synchronization

**Decision:** Generalize one versioned source registry across `github_repository`,
`documentation_site`, and `release_feed` adapters. Discover complete official `llms.txt` catalogs,
fetch official Markdown representations, enrich with sitemaps, and consume official RSS/Atom feeds.
Normal synchronization is a data-configured high-signal subset; any indexed page and bounded
full-catalog mode remain explicit commands. Expo changelog entries use only feed-supplied summaries;
the adapter does not scrape article HTML.

**Why:** Official indexes and representations are more stable, attributable, and focused than a
generic crawler. Separating discovery from curated fetching preserves future full-catalog ability
without continuously processing hundreds of low-signal reference pages. Feed-only Expo changelog
handling respects the difference between open documentation source and broader site content terms.

**Rejected:** Generic HTML crawling adds navigation chrome, brittle selectors, and avoidable reuse
risk. Repository cloning exposes MDX/build implementation details as the primary ingestion contract.
Hardcoded adapter paths would make curation changes architectural changes.

**References:** [Expo LLM index](https://docs.expo.dev/llms.txt),
[Expo sitemap](https://docs.expo.dev/sitemap.xml),
[Expo changelog RSS](https://expo.dev/changelog/rss.xml),
[React Native LLM index](https://reactnative.dev/llms.txt),
[React Native RSS](https://reactnative.dev/blog/rss.xml),
[React Native documentation license](https://github.com/reactjs/react-native-website/blob/main/LICENSE-docs)

## 2026-08-22 — Separate immutable source revisions from mutable fetch state

**Decision:** Continue storing every changed normalized source revision in immutable `source_items`
and add one mutable `source_item_states` row per registry/native identity. State owns the latest
snapshot pointer, lifecycle, normalized digest, ETag, Last-Modified, observed revision, and
fetch/change timestamps. `304` and equal-digest observations update state without another snapshot.

**Why:** Last-fetched and validator values must change even when source content does not, while
KnownPath must not rewrite historical evidence. A small queryable projection also supports targeted
refresh and authoritative deletion comparison without scanning all snapshot revisions.

**Rejected:** Mutating snapshots loses provenance. Creating a snapshot for every successful fetch
causes unnecessary downstream reprocessing. Storing validators only in one registry cursor does not
scale to independently changing pages.

## 2026-08-22 — Normalize untrusted Markdown, XML, and feed HTML without rendering it

**Decision:** Use current maintained MIT packages at the verified versions: `fast-xml-parser` 5.11
for bounded XML/feed parsing, Marked 18 for Markdown tokenization without serving rendered HTML,
`html-to-text` 10 for feed-supplied HTML-to-plain-text conversion, and stable zero-dependency
`robots-parser` 3 for robots policy evaluation. Network requests remain in a KnownPath allowlisted,
bounded, conditional HTTP client.

**Why:** Mature parsers avoid fragile custom XML/Markdown grammars. Parsing produces bounded
provider-neutral text/blocks and never executes source scripts or MDX components. The network
boundary, not parser defaults, owns origin, redirect, media-type, size, timeout, and retry policy.

**Rejected:** Regex-only XML/HTML parsing is incorrect and unsafe. Rendering Markdown/HTML into a
user interface is outside ingestion scope. A generic crawling framework would be disproportionate
and broaden the allowed source surface.

**References:** [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser),
[Marked lexer documentation](https://marked.js.org/using_pro#lexer),
[html-to-text](https://github.com/html-to-text/node-html-to-text),
[robots-parser](https://github.com/samclarke/robots-parser)

## 2026-08-22 — Use Gemini Interactions with stable 3.5 Flash-Lite by default

**Decision:** Implement the real Phase 6 provider with Google's official `@google/genai` 2.18 SDK
and Interactions API. Default to configurable stable `gemini-3.5-flash-lite`, `store: false`, no
tools, minimal thinking, no thinking summaries, and strict JSON-schema output. Pin the SDK below its
announced Node-22-requiring 3.0 change until that release is deliberately reviewed.

**Why:** Google recommends Interactions for new applications. The stable Flash-Lite model supports a
large context window, structured output, Batch API compatibility, and free-tier development suited
to high-volume extraction. Explicit storage/thinking/tool settings minimize retained data,
unnecessary tokens, and prompt-injection surface. The model remains environment-configurable.

**Rejected:** The legacy `@google/generative-ai` package is not actively maintained. Hardcoding a
preview or remembered model name would make availability drift an application change. Async Batch
API adds a separate file/job lifecycle and is deferred until measured volume justifies it.

**References:** [Google Gen AI SDK](https://googleapis.github.io/js-genai/),
[Interactions API](https://ai.google.dev/gemini-api/docs/interactions),
[Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite),
[structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[Batch API](https://ai.google.dev/gemini-api/docs/batch-api)

## 2026-08-22 — Make unpaid Gemini public-only before provider construction

**Decision:** Model provider capability as `public_only` or future `approved_private`. Phase 6
configuration accepts only `AI_DATA_HANDLING=public_only`. The extraction service rejects any
private/team registry, requested source, or selected context item before constructing the provider
or issuing a request. The whole attempt is blocked with `ai_private_data_not_approved`; force,
fallback, and silent downgrade cannot bypass it.

**Why:** Google's unpaid-service terms permit submitted content to be used for service improvement
and human review. Visibility enforcement therefore belongs in provider-neutral orchestration, not
inside one SDK adapter. A future paid Gemini account, other provider, or self-hosted implementation
can be approved explicitly without rewriting ingestion or candidate construction.

**Rejected:** Redacting or partially sending private threads can still leak context and create
misleading candidates. Treating a missing policy as public is unsafe. Automatically falling back to
free Gemini violates the user's hard privacy boundary.

**References:** [Gemini API terms](https://ai.google.dev/gemini-api/terms),
[pricing and free tier](https://ai.google.dev/gemini-api/docs/pricing),
[API-key guidance](https://ai.google.dev/gemini-api/docs/api-key)

## 2026-08-22 — Separate extraction attempts from candidate knowledge

**Decision:** Add an independent `extraction_attempts` collection and remove final confidence/
freshness fields from candidate experiences. Attempt idempotency covers source/context hashes,
provider/model/capability, prompts, schema, and generation settings. Invalid output is quarantined;
irrelevant/insufficient/conflicting classifications remain attempt outcomes; only grounded reusable
output creates a candidate.

**Why:** Operational attempts have a different lifecycle and retention need from candidate
knowledge. Persisting prompt/model/usage/latency/status provenance makes charged work reproducible
without storing raw invalid responses. Keeping numeric trust and freshness exclusively on KnownPaths
prevents Gemini from becoming the deterministic scorer reserved for Phase 7.

**Rejected:** Storing every model call as a candidate conflates non-solutions and malformed output
with knowledge. A single source-hash key would miss prompt/model/schema changes. Embedding attempt
history inside candidates loses failed and blocked processing records.

**References:** [MongoDB schema design](https://www.mongodb.com/docs/manual/data-modeling/),
[unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/),
[Gemini token usage](https://ai.google.dev/gemini-api/docs/tokens)
