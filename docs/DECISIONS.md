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

The versioned response contract normalizes an empty optional string to an absent value, but still
requires non-empty problem and solution fields for `reusable` output. Exact excerpt grounding checks
both the persisted normalized text and persisted structured blocks because either representation may
be supplied to the model; paraphrased evidence remains quarantined.

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

## 2026-08-22 — Append immutable candidate assessments and retain a latest pointer

**Decision:** Store every verification/scoring result in a separate append-only
`candidate_assessments` document. Keep `latestAssessmentId` on the candidate for fast access. The
idempotency key covers candidate/source digests, exact scoring policy digest, algorithm/policy/
verifier versions, and evaluation time. Rescoring never updates an existing assessment.

**Why:** Immutable assessments make scoring changes auditable, reproducible, comparable, and safe to
recalculate. The pointer gives common reads one hop without collapsing independently growing history
into the candidate. Unique idempotency prevents accidental duplicate records while `--force` remains
an explicit audited choice.

**Rejected:** Overwriting score fields destroys evidence of policy changes and debugging inputs.
Embedding an unbounded assessment array in the candidate creates document growth and write
contention. Computing every latest score at read time is unnecessarily expensive.

**References:**
[MongoDB immutable data pattern](https://www.mongodb.com/docs/manual/core/schema-validation/specify-json-schema/),
[MongoDB unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/)

## 2026-08-22 — Treat seed confidence as explainable ranking, not probability

**Decision:** Implement `knownpath-seed-evidence` version 1 as deterministic integer 0–100 scoring
with separately stored source-evidence, freshness, version-fit, and future outcome components.
Objective official/GitHub metadata supplies strong signals. Closure timing and reactions are weak,
capped signals. Conflicts, unsupported model labels, weak confirmation, staleness, and missing
provenance are explicit penalties or caps. Outcome confidence remains unobserved until real reports
exist and its future schema records Wilson bounds.

**Why:** The available seed signals are heterogeneous ranking evidence, not independent probability
measurements. Component storage and reason codes prevent fake precision and let future agent
outcomes be statistically conservative at small sample sizes. Versioned policy JSON permits
deterministic rescore experiments without environment-driven hidden behavior.

**Rejected:** Letting Gemini choose confidence makes the result non-reproducible. Treating reactions
as truth rewards popularity. A single opaque floating-point score obscures conflicts and freshness.
Naive success proportions become overconfident with tiny outcome samples.

**References:**
[GitHub author association enum](https://docs.github.com/en/graphql/reference/enums#commentauthorassociation),
[GitHub reactions](https://docs.github.com/en/rest/reactions/reactions),
[NIST binomial confidence intervals](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/binotest.htm),
[Semantic Versioning](https://semver.org/), [OpenSSF Scorecard](https://scorecard.dev/)

## 2026-08-22 — Use deterministic blocking before bounded semantic comparison

**Decision:** Build immutable versioned similarity profiles from normalized errors, identifiers,
packages, platforms, versions, problem text, and solution text. Query shared indexed blocking keys
before comparing pairs. Automatic merges require strong deterministic agreement and no hard
incompatibility; semantic similarity can strengthen or prioritize only an already plausible pair.
Ambiguous pairs remain separate with a `review` decision.

**Why:** Blocking avoids an all-pairs workload, while layered identifiers, shingles, and lexical
agreement provide reproducible evidence. Technical errors contain meaningful codes and exception
classes that must survive normalization. Semantic representations help with paraphrases but are not
safe identity proofs and cannot establish that two solutions are materially equivalent.

**Rejected:** Exact hashes alone miss paraphrases. Embedding every pair is expensive and obscures
why a match exists. Semantic-only clustering or LLM-only adjudication can merge distinct failures
that use similar language.

**References:**
[Fellegi-Sunter record linkage](https://www.cs.cornell.edu/~shmat/courses/cs6434/fellegi-sunter.pdf),
[Broder resemblance and containment](https://www.cs.princeton.edu/courses/archive/spring13/cos598C/broder97resemblance.pdf),
[Sentence-BERT](https://arxiv.org/abs/1908.10084),
[Sentry issue grouping](https://docs.sentry.io/concepts/data-management/event-grouping/)

## 2026-08-22 — Store public Gemini embeddings behind a capability boundary

**Decision:** Add a provider-neutral embedding interface and a real configurable Gemini
implementation using `gemini-embedding-2`. Persist immutable vectors with provider, model,
model-version, dimensions, input digest, visibility capability, and generation time. Before provider
construction or network access, verify that both candidates and every referenced source are public.
The unpaid provider remains `public_only`; private/team input fails with an actionable error.

**Why:** Provider metadata makes vectors safely regenerable when models or dimensions change. The
privacy gate prevents silent free-tier disclosure and lets a future explicitly approved paid,
self-hosted, or alternative provider plug into the same orchestration. Ordinary document storage is
sufficient for bounded pair comparison in this phase.

**Rejected:** Storing only vectors loses reproducibility. A fallback from private/team processing to
the public free path violates the data boundary. Creating a MongoDB vector index now would implement
Phase 9 retrieval prematurely.

**References:** [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings),
[Gemini model reference](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2),
[Gemini pricing and data use](https://ai.google.dev/gemini-api/docs/pricing)

## 2026-08-22 — Preserve canonical history beside a stable current projection

**Decision:** Keep candidates intact and relate them through current supporting, conflicting, or
rejected memberships. Store pair assessments, canonicalization events, and complete KnownPath
revisions immutably. `known_paths` retains a stable ID and `latestRevisionId` current projection.
Merge, split, reassign, and rebuild use idempotent operation/event keys and support multiple
solution variants. Canonical trust projects existing immutable candidate assessments instead of
recomputing a new opaque score.

**Why:** Canonical identity must remain stable as evidence improves, while every merge decision and
prior projection remains debuggable and reversible. An append-only resumable operation journal works
on the standalone local MongoDB topology and can later be wrapped in transactions where a replica
set is operationally justified.

**Rejected:** Deleting merged candidates destroys provenance. Overwriting canonical summaries loses
history. Requiring local replica-set transactions in this phase adds operational complexity and does
not replace idempotent recovery. Forcing all alternatives into one solution erases legitimate
environment-specific fixes.

**References:**
[MongoDB document versioning pattern](https://www.mongodb.com/blog/post/building-with-patterns-the-document-versioning-pattern),
[MongoDB unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/),
[MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/)

## 2026-08-22 — Materialize versioned search projections and fuse channels in application code

**Decision:** Build `known_path_search_documents` as a rebuildable projection of stable KnownPath
revisions. Run deterministic error/metadata retrieval first, then lexical retrieval, then optional
MongoDB Vector Search. Apply a versioned, digest-addressed ranking policy in application code that
separately exposes relevance, version fit, deterministic trust, freshness, outcomes, conflicts, and
lifecycle penalties. Default local MongoDB uses ordinary exact and weighted-text indexes; Atlas is
an explicit optional backend with separately managed Search and Vector Search indexes.

**Why:** Query-time joins across canonical history would make ranking expensive and difficult to
reproduce. A projection keeps provider/model/content metadata beside the vector and can be safely
regenerated. Application-side fusion works on the supported local MongoDB baseline and avoids
coupling the policy to rapidly evolving `$rankFusion`/`$scoreFusion` server-version requirements.
Exact technical identifiers and explicit version incompatibility must retain control over a merely
semantic match. Atlas Free remains a genuine development option, while local contributors still get
useful retrieval without `mongot` or a paid service.

**Rejected:** A dedicated vector database would violate MongoDB's primary-store boundary.
Cosine-only ranking hides trust and applicability. Semantic-only retrieval can elevate incompatible
fixes. Requiring Atlas for every contributor removes the free local path. Query-time canonical joins
and unversioned mutable vectors make model changes hard to audit.

**References:**
[MongoDB Vector Search index syntax](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-type/),
[MongoDB `$vectorSearch`](https://www.mongodb.com/docs/manual/reference/operator/aggregation/vectorsearch/),
[MongoDB hybrid search](https://www.mongodb.com/docs/atlas/atlas-vector-search/hybrid-search/),
[Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/),
[Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings),
[Gemini embedding model](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2)

## 2026-08-22 — Keep unpaid retrieval embeddings public-only

**Decision:** Apply the existing `public_only` provider capability to both search-document and query
embeddings. Before provider construction, verify the KnownPath, all supporting candidates, and all
referenced sources are public. Reject private/team query text with
`embedding_provider_visibility_forbidden`; never downgrade it to the unpaid provider.

**Why:** Retrieval queries can contain private incident details even when no private KnownPath is
returned. Applying the gate symmetrically prevents an accidental outbound disclosure and preserves
the same provider interface for a future explicitly approved private-data account or self-hosted
implementation.

**Rejected:** Falling back to free Gemini on quota/configuration failure violates the data policy.
Silently disabling only document embeddings while still embedding private query text leaves the more
immediate disclosure path open.

**References:** [Gemini pricing and data use](https://ai.google.dev/gemini-api/docs/pricing)

## 2026-08-22 — Expose safe knowledge views through a transport-independent access service

**Decision:** Keep Fastify handlers thin and add versioned request/response contracts plus a shared
knowledge-access service over retrieval and repositories. HTTP responses are explicit allowlists and
never serialize persisted KnownPath, source-item, assessment, candidate, or search-document objects.
Use `/api/v1`, the existing error envelope, strict body limits, named per-route rate policies, and
OpenAPI generated from the same Zod route schemas.

**Why:** Upcoming MCP, web, and CLI clients need the same lifecycle authorization, safe provenance,
and explanation mapping without duplicating it in each transport. Response allowlists make
accidental embedding/source/internal-field leakage fail serialization instead of becoming a client
contract.

**Rejected:** Returning persistence schemas couples clients to MongoDB and leaks internal fields.
Putting projection/ranking/database calls in route handlers prevents MCP reuse. A separate admin
route tree duplicates contracts and drifts from normal retrieval behavior.

**References:**
[Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/),
[`@fastify/swagger`](https://github.com/fastify/fastify-swagger),
[`@fastify/rate-limit`](https://github.com/fastify/fastify-rate-limit)

## 2026-08-22 — Require explicit admin API-key authorization for review knowledge

**Decision:** Normal sessions and API keys receive only public `published` KnownPaths. Review access
requires explicit request intent plus an active admin-owned API key with `knowledge:read`; even
admin sessions remain published-only. Hide inaccessible review IDs behind `knowledge_not_found` and
append review search/read audit events with user, key, request, target, and timestamp metadata.

**Why:** The real Phase 9 corpus contains two review records and zero published records. Durable
moderation access permits honest verification without falsely publishing them or adding a
development bypass. Explicit intent prevents administrator role from silently widening every
request.

**Rejected:** Publishing verification records misstates their lifecycle. A local-only bypass must be
removed later and risks production exposure. Ordinary user keys and sessions cannot safely inspect
unapproved knowledge.

## 2026-08-22 — Keep search selection usage separate from agent outcomes

**Decision:** Store bounded search executions in `knowledge_search_events` with a keyed/versioned
query digest, structured counts, returned IDs/ranks/scores, and an optional selected result. Verify
that selection belongs to the same principal and returned set. Do not interpret selection as success
or write `agent_outcomes`.

**Why:** Search and selection telemetry helps debug ranking and future usage while preserving the
semantic distinction between choosing an answer and proving it solved a problem. HMAC digests
support correlation without persisting unrestricted query text.

**Rejected:** Logging raw queries can retain private incident material. Counting clicks as
successful outcomes would contaminate future trust scoring. Reusing security audit events mixes
operational usage with immutable sensitive-action history.

## 2026-08-22 — Use one shared MCP contract with Streamable HTTP and a thin stdio bridge

**Decision:** Build MCP with the official TypeScript SDK v2 and the current `2026-07-28` protocol
era. Host the production stateless Streamable HTTP endpoint at `/mcp` inside the existing Fastify
API. Keep `apps/mcp-server` as a lightweight stdio client of the Phase 10 HTTP API, configured only
by `KNOWNPATH_API_URL`, `KNOWNPATH_API_KEY`, and bounded transport limits. Create both transports
from the same `@knownpath/mcp` tool contracts/server factory.

**Why:** The backend is already the authority for API-key authentication, lifecycle authorization,
review auditing, retrieval/ranking, usage, and persistence. A thin bridge makes agent installation
simple, avoids distributing database/provider secrets, and prevents transport-specific policy drift.
Streamable HTTP is the current remote transport; stdio retains broad local-client compatibility. SDK
negotiation keeps the current era and documented 2025 fallback coherent.

**Rejected:** Direct MongoDB/search access from stdio duplicates business logic and broadens secret
distribution. Separate tool implementations can drift. Legacy HTTP+SSE is superseded. Implementing
OAuth superficially would misrepresent the current API-key product model; OAuth remains a deliberate
future deployment/authentication decision.

**References:**
[MCP specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28),
[MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/),
[MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports),
[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

## 2026-08-22 — Keep the MCP surface compact and progressively disclosed

**Decision:** Advertise only `knownpath_search`, `knownpath_get`, `knownpath_alternatives`, and
`knownpath_status`. Bound all input arrays/text and output counts/text; return
match/trust/freshness, safe provenance links, stable error codes, and explicit truncation state.
Search returns concise summaries; `get` reveals deeper steps/evidence only after selection. Reserve
contribution/outcome names in documentation but do not register fake write tools.

**Why:** Agents need predictable schemas and high-signal context, not transport-shaped REST calls or
large source dumps. Progressive disclosure reduces context cost while preserving explainability.
Passing `searchId` to `get` records selection through the Phase 10 usage boundary without confusing
it with success.

**Rejected:** Many overlapping tools increase tool-selection ambiguity. Returning raw records leaks
internal/provider fields and wastes context. Placeholder writes imply behavior the system cannot yet
honor safely.

## 2026-08-23 — Ship one portable Agent Skill artifact with precise automatic activation

**Decision:** Store the canonical `knownpath` skill at `skills/knownpath` using only open Agent
Skills frontmatter and portable Markdown instructions. Allow automatic and manual activation, with
positive triggers for non-trivial debugging, migrations, dependency/build/version/environment
problems, and unfamiliar errors, plus explicit exclusions for trivial edits and unrelated work. Keep
detailed Expo/React Native examples in one optional reference. Document client-specific manual links
separately and defer automatic installation/adapters to Phase 13.

**Why:** A single artifact avoids behavior drift across Codex, Claude Code, Cursor, Gemini CLI, and
other conforming clients. Precise metadata lets agents consult shared experience before expensive
rediscovery without turning every code edit into a search. Progressive disclosure keeps activation
context small. Separating placement from behavior preserves portability while current clients use
different discovery paths.

**Rejected:** A single large `SKILL.md` would load all examples on every activation. Client-specific
copies or frontmatter would drift and weaken portability. Executable scripts are unnecessary because
the capability already exists through MCP. Fake contribution/outcome instructions would advertise
unimplemented writes.

**References:** [Agent Skills specification](https://agentskills.io/specification),
[OpenAI Codex skills](https://developers.openai.com/codex/skills/),
[Claude Code skills](https://code.claude.com/docs/en/skills),
[Cursor Agent Skills](https://cursor.com/docs/skills),
[Gemini CLI Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/),
[GitHub Copilot Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)

## 2026-08-23 — Install a thin bridge through owned, reversible per-agent adapters

**Decision:** Publish the Phase 13 CLI as the future `knownpath` npm package and make
`npx -y knownpath mcp` the default stdio entry in Codex CLI, Claude Code, Cursor, Gemini CLI, and
OpenCode. Each client config contains only its documented reference form for `KNOWNPATH_API_URL` and
`KNOWNPATH_API_KEY`; both must exist at install/update and agent launch, and there is no URL
fallback. Keep client detection/configuration and non-secret ownership state in
`@knownpath/agent-adapters`, while the CLI owns prompts/output and packages the one canonical skill.
Bundle private workspace implementation into the npm artifact while leaving maintained public
libraries as normal versioned runtime dependencies, so the released executable does not depend on
unpublished `@knownpath/*` packages.

Prefer official MCP mutation commands for Claude Code and Gemini CLI when installed. Use a bounded
managed TOML block for Codex and structural JSONC edits for documented JSON clients. Back up an
existing config before mutation, preserve unrelated content, refuse unmanaged conflicts or changed
owned content, and remove only installer-owned artifacts. Matching pre-existing entries remain
unmanaged. Support both global and project scope and one JSON output mode. Include OpenCode because
its current official MCP and open Agent Skills mechanisms are stable; defer clients without a stable
combined installation surface.

**Why:** The backend remains the sole authority for credentials, policy, retrieval, and future
writes. One lightweight bridge keeps agent installations provider/database agnostic. Environment
references avoid plaintext credentials in client files while preserving an unchanged configuration
model for future keychain-backed environment injection. Explicit ownership, content digests,
backups, and atomic edits make repeated installation and reversal safe across shared user files.

**Rejected:** Literal key values in config, a committed/default URL, direct MongoDB/provider access,
or per-agent bridge logic would weaken the central security boundary. Wholesale config rewrites and
blind adoption of an existing `knownpath` entry risk destroying user work. Keychain integration is
premature in this phase. GitHub Copilot, Cline, and Windsurf adapters remain deferred rather than
depending on preview, extension-specific, or insufficiently stable mechanisms.

**References:** [OpenAI Codex MCP](https://developers.openai.com/codex/mcp/),
[Claude Code MCP](https://code.claude.com/docs/en/mcp),
[Cursor MCP](https://cursor.com/docs/context/mcp),
[Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/),
[OpenCode MCP](https://opencode.ai/docs/mcp-servers/),
[Agent Skills specification](https://agentskills.io/specification)

## 2026-08-23 — Deploy the API as one Render-native monorepo service

**Decision:** Deploy only `@knownpath/api` as a native Node Render web service built from the pnpm
monorepo root. Keep MongoDB Atlas as the database, use Render's runtime `PORT` with explicit
`0.0.0.0` binding, and define commands, health checks, non-secret settings, generated auth secrets,
and the Atlas URI placeholder in a root Blueprint. Use the Singapore region and free instance for
initial verification; upgrade the same service before relying on it for always-on MCP traffic.

**Why:** The API is already the authority for authentication, authorization, retrieval, auditing,
and MCP HTTP transport. Deploying it establishes the stable HTTPS origin required by the installer
without duplicating worker or persistence responsibilities. A repository Blueprint is reproducible
and reviewable, while a monorepo-root build preserves access to private workspace packages.

**Rejected:** A dashboard-only configuration would hide operational settings from contributors. A
Docker image adds maintenance without a current isolation need. Deploying MongoDB, the worker, or
the dashboard now broadens scope and duplicates Atlas or incomplete application surfaces. A
hardcoded API URL would violate the installer's explicit environment-reference model.

**References:** [Render web services](https://render.com/docs/web-services),
[monorepo support](https://render.com/docs/monorepo-support),
[Blueprint specification](https://render.com/docs/blueprint-spec),
[default environment variables](https://render.com/docs/environment-variables),
[outbound IP ranges](https://render.com/docs/outbound-ip-addresses),
[free instance limitations](https://render.com/docs/free)

## 2026-08-23 — Accept minimized contributions through a consented, low-trust pipeline

**Decision:** Accept only versioned structured public or owner-private lessons through an API key
with `knowledge:contribute`. Require explicit per-submission consent, default accounts to `ask`, and
reject team visibility. Sanitize before persistence with Secretlint plus bounded PII/path/URL
redaction, retain only the sanitized structure and an HMAC of the original request, quarantine
prompt-injection-like text, and reject high-risk residue or source dumps. Project accepted input to
an immutable source snapshot, pending candidate, immutable deterministic assessment, and similarity
review—not directly to canonical knowledge. Cap self-reported confidence at 34.

The optional generalizer interface declares either `public_only` or `approved_private`, and the
visibility gate runs before provider construction/call. Phase 14 configures no generalizer. Thus
private contributions remain inside the backend and MongoDB, with no unpaid Gemini, public
embedding, external-provider fallback, or silent public conversion.

**Why:** A reusable lesson can create network value without collecting a repository or an agent's
private reasoning. Sanitization is defense in depth, not consent. Explicit provenance, audit events,
immutable score history, conservative trust, and reversible review preserve accountability against
self-report error and poisoning.

**Rejected:** Raw transcript/code upload, silent background sharing, client-only privacy checks,
LLM-assigned trust, immediate canonical publication, team scope without an ownership model, and
using unpaid/public AI for private records.

**References:** [Secretlint](https://github.com/secretlint/secretlint),
[OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html),
[OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html),
[OWASP Data and Model Poisoning](https://genai.owasp.org/llmrisk/llm04-data-and-model-poisoning/),
[NIST Privacy Framework](https://www.nist.gov/privacy-framework),
[OpenTelemetry sensitive data guidance](https://opentelemetry.io/docs/security/handling-sensitive-data/),
[MCP security practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)

## 2026-08-24 — Store immutable outcome assessments with conservative small-sample confidence

**Decision:** Store every schema-v2 outcome privately and immutably, then append a separate
versioned `known_path_outcome_assessments` record for every distinct algorithm/policy/input set.
Keep only `latestOutcomeAssessmentId` and calculation time on the KnownPath. Compute two 95% Wilson
lower bounds over independently capped attempted reports, with a 30-day grace period, 180-day
half-life, and Kish effective sample size. Combine any-help and full-solve lower bounds 65/35; never
use naive success/total or an LLM-assigned result.

**Why:** Historical assessments are necessary to debug algorithm changes, audit rank movement, and
reproduce prior decisions. Wilson lower bounds and effective sample size resist perfect-looking tiny
samples and decayed pseudo-count inflation. Source trust, freshness/version fit, and observed
outcomes remain separately explainable.

**Rejected:** Overwriting one aggregate destroys audit history. Naive ratios over-rank one success.
Treating every API key as independent lets one account multiply influence. A Beta-prior-only score
is reasonable, but Wilson intervals are simpler to inspect and match the current deterministic
integer ranking contract.

**References:**
[NIST proportion confidence intervals](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/propconf.htm),
[NIST Technical Note 2119](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2119.pdf),
[Elastic decay functions](https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/decay)

## 2026-08-24 — Separate immediate safety review from ranking and visibility

**Decision:** One eligible `misleading_or_unsafe` report immediately appends an immutable safety
event and queues the KnownPath for review. It does not directly change ranking, confidence,
lifecycle, moderation, or visibility. A ranking penalty requires two independent eligible safety
reporters within 90 days, verified moderation, or separately measured outcome degradation. Only an
explicit later safety-policy/moderation action may restrict published visibility.

**Why:** Fast review response reduces safety latency, while separation prevents one account from
gaming rank or delisting content. Account/version/window influence caps, durable rate limits, and
immutable provenance preserve accountability.

**Rejected:** Automatically penalizing or delisting on one unverified report is easily abused.
Ignoring a first report delays legitimate investigation. Reusing moderation or lifecycle state hides
why a record was queued and couples unrelated policies.

**References:**
[SumUp Sybil-resistant feedback](https://www.usenix.org/legacy/event/nsdi09/tech/full_papers/tran/tran.pdf),
[Bazaar Sybil-resilient aggregates](https://www.usenix.org/legacy/event/nsdi11/tech/nsdi11_proceedings.pdf),
[OWASP API4 resource controls](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)

## 2026-08-24 — Integrate outcomes through ranking policy version 2 and privacy-thresholded views

**Decision:** Give conservative outcome confidence up to 15/100 ranking points, while exact error,
lexical/semantic relevance, metadata/version fit, source trust, and freshness remain distinct. Apply
explicit penalties only for corroborated safety, statistically qualified recent degradation, or a
failure-heavy matching version bucket. Search projections are regenerated when the latest assessment
changes but reuse unchanged embeddings. API/MCP responses reveal detailed aggregate distributions
only after three independent accounts; reporter IDs, notes, raw outcomes, and assessment inputs
never leave the backend.

**Why:** Real-world results should grow more important than seed popularity without erasing
first-party evidence or version applicability. Reusing content-identical embeddings avoids provider
cost. A disclosure threshold provides useful verification while reducing individual-report leakage.

**Rejected:** Ranking solely by outcome confidence discards deterministic technical relevance.
Semantic-only ranking cannot protect exact/version compatibility. Re-embedding unchanged content on
every outcome wastes quota. Returning raw reports exposes private operational data.

**References:** [Semantic Versioning](https://semver.org/),
[NIST Technical Note 2119](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2119.pdf)

## 2026-08-24 — Use BullMQ with Valkey for ephemeral orchestration and MongoDB for durable intent

**Decision:** Adopt exact BullMQ 6.2.0 with ioredis 6.0.0 and Valkey 9.1.1. Keep MongoDB as the only
persistent product database. Add `@knownpath/jobs` as the sole queue-library boundary and
`@knownpath/pipelines` as the domain-service composition boundary. Persist every run and step in
MongoDB before dispatch; Valkey stores only delivery, schedules, retries, provider rate limits,
locks, stalled-job coordination, and bounded diagnostics.

Use six workload queues (`control`, `github`, `sources`, `ai`, `knowledge`, `feedback`),
source-specific Job Schedulers, exponential retry with 50% jitter, explicit permanent failures,
`maxStalledCount=2`, bounded graceful shutdown, and durable quarantine. Source refresh intervals
live in the data-driven source registry. API reads degrade independently of Valkey; workers require
it. Contribution/outcome product writes occur before their follow-up job is dispatched.

**Why:** BullMQ provides maintained scheduling, backoff, rate limiting, lock renewal, stalled-job
recovery, concurrency, and pause/retry controls that KnownPath should not recreate. Workload
isolation respects GitHub/Gemini limits and prevents one poison item from halting a batch. MongoDB
intent plus idempotent handlers makes retry and Valkey loss recoverable without creating a second
product source of truth.

**Rejected:** Agenda keeps MongoDB-only infrastructure but has weaker first-class retry/backoff and
provider-rate controls for this workload. Temporal adds a separate operational platform whose
complexity is not justified at the current scale. A custom MongoDB lease/retry scheduler would
duplicate difficult locking and recovery behavior. Storing product state only in Valkey would make
queue eviction/outage a data-loss event. A monolithic BullMQ Flow was rejected because changed-item
fan-out is discovered dynamically and durable service-level idempotency is clearer to audit.

**References:** [BullMQ connections](https://docs.bullmq.io/guide/connections),
[retrying and jitter](https://docs.bullmq.io/guide/retrying-failing-jobs),
[Job Schedulers](https://docs.bullmq.io/guide/job-schedulers),
[graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown),
[production guidance](https://docs.bullmq.io/guide/going-to-production),
[Valkey installation](https://valkey.io/topics/installation/)

## 2026-08-24 — Use scheduled GitHub Actions and Upstash for the zero-cost early worker deployment

**Decision:** Keep the Render API on its free web-service plan, use one free Upstash
Redis-compatible database for BullMQ queue state, and run the existing six consumers through a
bounded `jobs drain` command scheduled every fifteen minutes on GitHub Actions. Keep continuous
`jobs start` semantics unchanged. Treat this as an early deployment with delayed processing, not an
always-on production SLA.

**Why:** Upstash officially supports BullMQ, persists its free database, and defaults to rejecting
writes rather than evicting queue keys at capacity. Standard GitHub-hosted runners are free for this
public repository. Running only while draining avoids an idle BullMQ process consuming free queue
commands and avoids Render's paid Background Worker. MongoDB durable intent and idempotent handlers
remain authoritative if a run is delayed or interrupted.

**Rejected:** Render's free Key Value instance can restart without preserving queue state, and a
laptop worker is not reliably available. An always-on Render worker plus persistent Key Value gives
better latency but creates recurring cost before KnownPath has measured usage. Replacing BullMQ with
a provider-specific scheduler would undo Phase 16's queue boundary.

**References:** [Upstash BullMQ integration](https://upstash.com/docs/redis/integrations/bullmq),
[Upstash durability](https://upstash.com/docs/redis/features/durability),
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)

## 2026-08-25 — Keep the dashboard server-first behind an allowlisted same-origin bridge

**Decision:** Build the Phase 17 developer dashboard with the existing Next.js 16 App Router and
warm green/cream identity. Server Components read runtime-validated safe DTOs directly from Fastify.
Browser mutations use a narrow same-origin route bridge configured by `KNOWNPATH_API_URL`; the
bridge allowlists product routes, limits request bodies, never forwards Authorization, and preserves
secure session cookies. Fastify remains the sole authority for auth, ownership, visibility,
retrieval, privacy, rate policy, and audit events.

Add owner-scoped aggregate/list DTOs and non-secret session-ID management rather than exposing
Better Auth session tokens to browser application code. Keep review-state knowledge, operational
queues, ingestion, and moderation out of this ordinary-user surface.

**Why:** Server-first reads reduce client data exposure and bundle work. A same-origin bridge makes
secure HttpOnly sessions usable when the dashboard and API are separately deployed without copying
business logic into Next.js. Route allowlisting prevents the bridge from becoming an arbitrary
credentialed API proxy. Non-secret session IDs preserve useful account control without leaking the
tokens Better Auth uses for token-oriented session management.

**Rejected:** Direct MongoDB access from Next.js duplicates authorization and persistence
boundaries. A broad reverse proxy could accidentally expose admin routes. Storing API keys or
session tokens in local storage weakens credential isolation. Adding public signup, OAuth, or an
admin console would expand beyond Phase 17 and the closed-registration decision.

**References:** [Next.js authentication](https://nextjs.org/docs/app/guides/authentication),
[Next.js data security](https://nextjs.org/docs/app/guides/data-security),
[Next.js backend-for-frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend),
[Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)

## 2026-08-26 — Keep administration in the existing API with centralized step-up controls

**Decision:** Add a dedicated administration application service and versioned contracts inside the
existing Fastify boundary, consumed by a server-guarded `/admin` area in the existing Next.js app.
Every route requires a persisted active admin session and named capability. High-impact mutations
require the existing 30-minute fresh-session window, an exact action/target phrase, and a stated
reason enforced by one backend wrapper. Canonical operations additionally require a recomputed
preview digest. Every sensitive result is audited.

Use the existing repositories, immutable assessments, canonical history, pipeline records, BullMQ
queues, and audit collection rather than creating administration-owned copies. Prefer reversible
lifecycle transitions and preserved-history retries to hard deletion or in-place history rewrites.

**Why:** Authorization close to the business operation prevents UI bypasses and keeps future CLI or
moderation clients consistent. Capabilities permit narrower operator roles later without changing
contracts. Step-up freshness and target confirmation reduce the impact of stale sessions and broad
operator mistakes, while immutable domain/audit history makes actions explainable and reversible.

**Rejected:** Browser-only confirmation is not authorization. Direct repository calls in Fastify
handlers would scatter invariants. A separate admin deployment or generic database/queue dashboard
would add a shadow security surface and bypass KnownPath domain rules. Hard deletion would remove
evidence needed for correction and audit.

**References:** [Better Auth admin plugin](https://better-auth.com/docs/plugins/admin),
[session freshness](https://better-auth.com/docs/concepts/session-management),
[Next.js data security](https://nextjs.org/docs/app/guides/data-security),
[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[BullMQ pausing queues](https://docs.bullmq.io/guide/workers/pausing-queues)

## 2026-08-26 — Reveal only sanitized private contribution content under a separate capability

**Decision:** Keep private contribution content hidden from normal administration DTOs. A dedicated
`private_content:read` operation requires a fresh admin session, target-specific confirmation, and a
moderation/security reason, and audits every successful or denied attempt. It may return only the
persisted sanitized V2 structured payload with `no-store`; original digests, removed fields,
credentials, and redacted material remain unavailable.

**Why:** Moderators sometimes need the generalized private lesson to investigate abuse or safety,
but broad or silent visibility would weaken Phase 14's privacy boundary. Separate authorization and
per-access audit make necessity and repeated access reviewable without pretending the original
submission can be reconstructed.

**Rejected:** Showing private content on every contribution page overexposes user data. Showing the
original unsanitized submission is impossible by design and would violate data minimization.
Frontend-only hiding is bypassable. A single generic admin permission cannot later support least
privilege cleanly.

**References:**
[OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html),
[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

## 2026-08-27 — Use explicit shared-collection tenant scope and live workspace membership

**Decision:** Represent public, personal-private, and workspace knowledge with one strict visibility
union across existing domain objects. Add workspace/membership/invitation/share-request collections,
an owner/admin/member role model, immutable workspace key binding, and centralized authorization
that combines a requested scope with live database membership. Every repository search or ID read
receives a server-derived tenant predicate. Combined workspace/public search executes separate
branches and never lets private/team observations affect public aggregates.

Private/team query text, source content, and embeddings remain blocked from unpaid/public Gemini.
Semantic retrieval is disabled for tenant branches until an explicitly approved private provider is
configured. Public promotion creates a new sanitized, consented, low-trust contribution rather than
flipping a proprietary record's visibility.

**Why:** Shared structures prevent divergent public/private implementations, while mandatory scope
predicates and live membership prevent object-ID and stale-key bypasses. Separate outcome scopes and
share records eliminate aggregate/existence leaks and make promotion auditable and reversible.

**Rejected:** Collection-per-team creates operational/index sprawl at current scale. UI-only filters
and API-key claims become stale and are vulnerable to direct-ID access. A single mixed
workspace-plus-public database query is harder to explain and audit. Silently sending tenant data to
free embeddings or changing visibility in place violates the approved privacy boundary.

**References:**
[MongoDB multi-tenancy](https://www.mongodb.com/docs/atlas/build-multi-tenant-arch/),
[MongoDB Vector Search tenant filtering](https://www.mongodb.com/docs/atlas/atlas-vector-search/multi-tenant-architecture/),
[OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[OWASP BOLA](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/),
[MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
