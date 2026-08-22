# KnownPath Phase 9 Hybrid Retrieval Design

**Status:** Approved design direction; implementation pending

**Date:** 2026-08-22

**Scope:** Retrieval projections, lexical/vector candidate generation, deterministic reranking,
version compatibility, developer commands, and the real review-state verification dataset

## 1. Goal and boundary

Phase 9 lets an agent describe an Expo or React Native technical problem and receive the most
relevant, trustworthy, fresh, and version-compatible canonical KnownPaths. Retrieval must expose why
each record ranked where it did. Vector similarity is one optional input, never the final answer.

Phase 9 does not add an MCP knowledge tool, public retrieval HTTP API, dashboard, Agent Skill,
installer, contribution workflow, or agent-outcome aggregation. It does not publish or otherwise
raise the moderation state of canonical records.

At the start of Phase 9 the local database contains two real, scored candidates but zero canonical
KnownPaths. This contradicts the prompt's introductory assumption, but the verification section
explicitly allows creating a small real dataset when absent. The two candidates will be promoted
independently into two `review` KnownPaths. They will not be merged. Each promotion uses the
existing canonicalization service so candidate membership, source evidence, assessment IDs, events,
and immutable revisions remain intact. No additional canonical data will be fabricated.

## 2. Researched constraints

Current official documentation was checked on 2026-08-22.

### MongoDB Search and Vector Search

- A MongoDB Vector Search index uses `type: "vectorSearch"` and a `fields` definition containing a
  `vector` field with `path`, `numDimensions`, and `similarity`, plus scalar `filter` fields.
- `$vectorSearch` must be the first stage in its pipeline. Query vectors must use the same model and
  dimensions as indexed document vectors. MongoDB recommends starting ANN `numCandidates` at least
  20 times the result limit and tuning it against measured recall.
- MongoDB Search and Vector Search indexes are asynchronously built and eventually consistent.
  `listSearchIndexes()` is the authoritative readiness check after creation.
- Atlas Free clusters support Search/Vector Search for development but allow at most three combined
  search/vector indexes, store 0.5 GB total, and provide no dedicated Search Nodes. A Free cluster
  may require creating a vector index through the Atlas UI if programmatic creation returns command
  not found.
- `$rankFusion` is available on MongoDB 8.0+ with version-specific caveats; `$scoreFusion` requires
  8.3+. KnownPath will not make either server-side preview/version-dependent fusion stage part of
  its ranking contract. Application-side staged fusion remains versioned and portable.
- The repository's ordinary local MongoDB deployment has no `mongot` Search process. It can use one
  standard MongoDB text index plus existing ordinary metadata/error indexes. Search-index creation
  must be an explicit Atlas operation, not a hidden part of ordinary `db:init`.

### Gemini embeddings

- Stable `gemini-embedding-2` supports 128–3072 dimensions, with 768, 1536, and 3072 recommended.
  The repository keeps its existing configurable 768-dimensional default.
- The model accepts up to 8192 input tokens. KnownPath inputs remain much smaller and deterministic.
- For asymmetric text retrieval, Google documents query input as
  `task: search result | query: {content}` and document input as `title: {title} | text: {content}`.
  The existing semantic-similarity format must not be reused for retrieval.
- The unpaid tier is available but submitted inputs may be used to improve Google's products.
  Existing `public_only` capability enforcement remains mandatory for documents and queries.

### Version ranges

- npm's maintained `semver` library exposes strict version/range validation, satisfaction, and range
  intersection. It will be used only when both stored and requested versions are valid SemVer.
- Expo SDK labels and other ecosystem versions that are not valid SemVer remain normalized opaque
  tokens. Unknown or unparsable compatibility is reported as `unknown`, never coerced into a match.

## 3. Approaches considered

### Selected: versioned materialized search documents

Create one independently versioned search projection collection containing bounded searchable text,
normalized exact-match metadata, ranking projections, and an optional configured embedding. Both
Atlas indexes target this collection; local MongoDB targets the same documents through a standard
text index and ordinary predicates. A new content/model/index version creates a new projection and
retires the prior active projection after successful creation.

This duplicates a bounded projection of canonical fields, but keeps retrieval reads cohesive, allows
text/vector results to refer to the same document IDs, preserves re-embedding history, and does not
mutate canonical truth.

### Rejected: separate text records and embedding records

This reduces projection duplication but requires cross-collection joins and prevents native
same-collection hybrid operations. It also makes active model/version filtering and Atlas index
management harder to inspect.

### Rejected: vectors embedded in `known_paths`

This is initially simple but makes model migrations repeatedly mutate canonical domain records,
mixes provider-specific state with knowledge truth, and either loses vector history or causes
unbounded document growth.

## 4. Domain and persistence model

### `known_path_search_documents`

Each document is a versioned retrieval projection, not a new source of knowledge truth.

Required identity and lifecycle fields:

- branded search-document ID and `schemaVersion`;
- `knownPathId` and exact `knownPathRevisionId`;
- `active` plus `activatedAt` and optional `retiredAt`;
- versioned idempotency key over KnownPath revision, builder, text schema, embedding configuration,
  and content hash;
- `projectionVersion`, `textSchemaVersion`, and `rankingSchemaVersion`;
- `contentHash`, `generatedAt`, and audit timestamps.

Searchable projection fields:

- title, problem summary, symptoms, normalized errors, error codes/classes/fingerprints;
- solution summaries, ordered steps, and caveats across all solution variants;
- ecosystem, packages, platforms, runtimes, package managers, toolchains, frameworks, and normalized
  version constraints;
- visibility scope/owner/team, lifecycle status, moderation state, conflict counts, and deprecation
  facts;
- trust score/grade/assessment IDs, freshness state/timestamps, and outcome-confidence state.

Embedding fields:

- status `ready`, `unavailable`, or `blocked`;
- provider identifier and data capability;
- model identifier, declared model version, dimensions, input-format version, input/content hash,
  generated timestamp, latency, and optional bounded usage metadata;
- vector values only when status is `ready`.

The database has a partial unique index enforcing one active search document per KnownPath and
configured retrieval model identity. Other ordinary indexes cover active visibility/status,
ecosystem/package, platform, exact error fingerprints/codes, KnownPath revision, content hash/model,
and re-embedding queues. One weighted standard text index covers title, errors, problem, symptoms,
solutions, packages, and environment tokens for local retrieval.

Historical inactive documents are retained for model migration audit. Search always filters active
documents and an exact configured model/version/dimension set.

## 5. Atlas index definitions

Two explicit definitions target `known_path_search_documents`, staying within the current Free
cluster maximum of three combined Search/Vector Search indexes:

1. `knownpath_lexical_v1`, type `search`, with static mappings for bounded text fields and scalar
   filter fields. Dynamic mapping is disabled.
2. `knownpath_vector_v1`, type `vectorSearch`, with the configured 768-dimensional
   `embedding.values` path using cosine similarity and filter paths for active state, model
   identity, visibility, lifecycle status, ecosystem, packages, and platforms.

The vector definition is generated from validated configuration, so dimensions cannot drift from the
embedding provider unnoticed. Index names and definition versions are explicit configuration.

`pnpm search indexes create` is allowed only when `SEARCH_BACKEND=atlas`. It uses the official Node
driver `createSearchIndexes`/`createSearchIndex` API, then polls `listSearchIndexes()` with a
bounded timeout and reports `READY`, pending, unsupported, or failed. It does not delete or silently
replace an index. A definition mismatch is an actionable error requiring an explicit migration
decision.

Because some Free clusters require UI creation, the command can print the exact validated JSON
definitions without credentials. The guide documents that manual fallback and the three-index cap.
Ordinary `pnpm db:init` creates only the collection, validator, ordinary indexes, and local text
index, so local development never fails for lack of Atlas Search.

## 6. Embedding provider changes

The Phase 8 provider-neutral interface is extended from only `semantic_similarity` to three explicit
tasks:

- `semantic_similarity` for canonicalization;
- `retrieval_document` for KnownPath search projections;
- `retrieval_query` for search requests.

The Gemini adapter deterministically formats `retrieval_document` and `retrieval_query` inputs using
Google's current asymmetric guidance. Model, model version, dimensions, retry policy, timeout, call
budget, and request spacing remain configuration values.

Public-only enforcement occurs before constructing/calling Gemini:

- a public KnownPath may use unpaid Gemini only if all supporting candidates and their referenced
  sources are public;
- private/team KnownPaths are blocked from the unpaid provider;
- a query classified private/team is not sent to unpaid Gemini;
- no fallback provider or force flag can silently downgrade the data policy.

When semantic retrieval is optional, a blocked/unavailable provider produces an explicit capability
notice and local lexical/deterministic retrieval continues. When the caller explicitly requires
semantic retrieval, the same condition is a clear actionable error.

## 7. Projection and re-embedding lifecycle

`SearchProjectionService` reads stable KnownPaths and their latest immutable revisions only through
repositories. It deterministically assembles bounded document text and metadata. It skips archived,
superseded, or missing-revision records and reports why.

Commands:

- `pnpm search project --known-path <id>`;
- `pnpm search project --pending --limit <n>`;
- `pnpm search reembed --known-path <id>`;
- `pnpm search reembed --all --limit <n>`;
- `pnpm search inspect --known-path <id>`;
- `pnpm search indexes print|create|status`.

Idempotency includes the exact canonical revision, bounded document input hash, embedding provider,
model/version/dimensions, and input-format version. An unchanged command reuses the active document
without another Gemini call. Changed content or embedding configuration creates a new document; only
after it validates successfully is the former projection retired. A failed new embedding does not
discard the last usable projection.

## 8. Query contract and normalization

The versioned runtime-validated internal request supports:

- natural-language problem/task text;
- zero or more exact/partial error strings;
- ecosystem and package names;
- versions or ranges associated with ecosystem/package identifiers;
- platforms, build environments, runtimes, package managers, and toolchain values;
- bounded source-code-independent context;
- visibility access constraints and query-data classification;
- result limit, minimum quality, allowed lifecycle states, and semantic mode `disabled`, `optional`,
  or `required`.

CLI syntax uses repeatable metadata flags and an explicit `--include-review` switch. Product-facing
defaults allow only published records; Phase 9 verification passes `--include-review`. Query text,
error strings, and context are untrusted data and never become model instructions beyond the fixed
retrieval wrapper.

The existing technical normalizer supplies normalized error text/codes/classes. Package, ecosystem,
platform, URL, and timestamp normalization reuse domain helpers. No source code is uploaded or
stored as part of a retrieval request.

## 9. Staged candidate generation

Candidate generation is deliberately observable:

1. **Exact/deterministic stage:** ordinary MongoDB predicates over active scope/status plus error
   fingerprints/codes, ecosystem, packages, and platforms. Exact error identities receive a channel
   score even when lexical tokenization is weak.
2. **Lexical stage:** Atlas `$search` when explicitly configured and ready; otherwise MongoDB
   `$text` over the weighted local index. Raw backend scores are retained only as channel inputs and
   normalized within the result set.
3. **Semantic stage:** only when an allowed provider creates the configured retrieval-query vector
   and Atlas vector search is ready. `$vectorSearch` uses active/model/visibility/status prefilters,
   the configured limit, and a bounded `numCandidates` starting at 20× the requested vector limit.
4. **Union/fetch stage:** deduplicate by `knownPathId`, record every channel that found the
   document, and batch-load complete search projections. No N+1 database reads.
5. **Deterministic rerank:** compute components and penalties from the request and persisted facts.

Backend capability detection is explicit in every result envelope: `local_text`, `atlas_lexical`,
and `atlas_vector` are reported as used, unavailable, disabled, or blocked with reason codes.

## 10. Version compatibility

Version fit is an independent component with an inspectable state:

- `exact`: the normalized requested version equals an explicit applicable version;
- `compatible`: a valid SemVer version satisfies a valid stored range, two valid ranges intersect,
  or an explicit ecosystem SDK token matches;
- `unknown`: either side is absent, ambiguous, or unparsable;
- `incompatible`: valid explicit constraints are disjoint or explicit ecosystem SDK tokens differ.

An exact/compatible result receives positive points. Unknown is neutral and explained; it is never
called compatible. Incompatible receives a strong penalty and final-score cap, allowing an exact
error hit to remain visible for diagnosis without outranking a compatible solution. Prerelease
matching follows `node-semver` defaults unless a range explicitly includes prereleases.

## 11. Ranking policy

`knownpath-retrieval-ranking` version 1 uses integer components and a 0–100 final rank. The complete
policy object and digest are returned with results.

Positive components (maximum before penalties):

- exact error/error-code/class relevance: 0–25;
- lexical relevance: 0–15;
- semantic relevance: 0–15;
- ecosystem/package/platform/environment fit: 0–15;
- version fit: 0–10;
- deterministic trust projection: 0–12;
- freshness/last verification: 0–5;
- observed agent outcomes: 0–3, but zero and explicitly `unobserved` in Phase 9.

Penalties and caps:

- explicit version incompatibility: penalty and a cap below the default quality threshold;
- authoritative conflict or active conflicting membership: bounded penalty;
- stale applicability: bounded penalty separate from trust;
- deprecated/superseded/archived lifecycle: excluded by default; if deliberately included, heavily
  penalized and explained;
- low applicability or missing evidence: penalty derived from persisted facts only.

The exact numeric values are stored in a runtime-validated versioned policy source file rather than
environment variables. Environment configuration may set limits and thresholds, not silently alter
the scoring formula. Ties resolve deterministically by final score, exact match, version fit, trust,
freshness, then KnownPath ID.

Every result includes component points, normalized channel inputs, penalties, caps, reason codes,
short explanations, backend capabilities, matched fields, and the canonical trust/assessment IDs.
The final rank is a retrieval score, not a probability of correctness.

## 12. Repository and package boundaries

- `@knownpath/domain`: search document, query, result, component, capability, and lifecycle schemas.
- `@knownpath/database`: collection, validator, ordinary/text indexes, projection repository, and
  Atlas search-index management boundary. Raw collections remain private.
- `@knownpath/search`: provider, projection builder, exact/lexical/vector adapters, version-fit,
  policy, reranker, orchestration, CLI parsing, and inspection.
- `@knownpath/config`: validated backend/index/provider/limit/threshold settings.
- `@knownpath/worker`: dependency composition and developer command execution.

Canonicalization does not depend on retrieval. Search depends inward on domain/database and may
reuse the existing normalizer/provider interface without importing worker or HTTP concerns.

## 13. Error handling and safety

- Invalid external query/configuration fails through Zod with bounded messages.
- Missing Gemini credentials, quota, and transient failures are classified without leaking the key
  or query text into logs.
- Atlas unsupported/index-not-ready errors are distinguished from malformed definitions and
  authentication failures. Optional semantic search falls back with an explicit notice; required
  semantic search fails.
- Visibility predicates are applied in candidate-generation queries and rechecked before returning
  records. Public-only Phase 9 CLI verification cannot access private/team projections.
- Result limits, candidate-pool sizes, input lengths, provider calls, and polling duration are
  bounded.
- No query text, embedding vector, API key, or MongoDB credential is logged.

## 14. Verification plan

No automated tests are added.

1. Run install, strict typecheck, lint, formatting validation, and full build under pinned Node 24.
2. Run ordinary database initialization twice and inspect collection, validator, ordinary/text
   indexes, and idempotence.
3. Promote each of the two existing real scored candidates separately with the canonicalization
   service. Confirm both KnownPaths remain `review`, each has exactly one supporting membership,
   source evidence, assessment history, and immutable revision.
4. Build retrieval projections and real public Gemini retrieval-document embeddings. Repeat and
   confirm no provider call or duplicate projection for unchanged inputs.
5. Run exact-error and natural-language CLI searches locally with `--include-review`; inspect
   deterministic, lexical, version, trust, freshness, outcome, penalty, and capability breakdowns.
6. Run a query whose semantic wording resembles one record but whose explicit version metadata is
   incompatible; confirm the compatible/exact record outranks or caps the incompatible record.
7. Confirm local operation reports Atlas lexical/vector as unavailable while returning useful exact
   and `$text` results.
8. If no Atlas connection is configured, print and validate both official index definitions and
   record live Atlas query/index creation as a manual limitation. Do not claim it ran.
9. Confirm a private/team query or KnownPath cannot reach unpaid Gemini.
10. Inspect for accidental credentials/generated artifacts, append Phase 9 to `progress.md`, review
    the staged diff, and commit only Phase 9 work.

## 15. Documentation updates

- Add `docs/RETRIEVAL.md` with setup, modes, index definitions, commands, ranking breakdown,
  visibility rules, local fallback, Atlas Free limits, and re-embedding operations.
- Update architecture, data model/index inventory, decisions, README, `.env.example`, package
  READMEs, and `progress.md`.
- `progress.md` must explicitly record that Phase 9 began with zero canonical KnownPaths and that
  the two review-state verification records were independently created from the existing real scored
  candidates without merging, fabrication, verification, or publication.

## 16. Deferred work

- Public/authenticated retrieval HTTP routes and MCP tools.
- Agent Skill/installer and per-agent adapters.
- Dashboard review/search controls.
- Outcome aggregation/calibration and contribution-driven trust changes.
- Private/team semantic processing until an explicitly approved provider is configured.
- Search analytics, learned-to-rank tuning, pagination, distributed caching, and dedicated Search
  Nodes.

## References

- [MongoDB Vector Search index fields](https://www.mongodb.com/docs/vector-search/index/vector-search-type/)
- [`$vectorSearch` aggregation stage](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/)
- [MongoDB hybrid search](https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/)
- [MongoDB Search index management](https://www.mongodb.com/docs/search/index/manage-indexes/)
- [MongoDB Search compatibility and Free cluster limits](https://www.mongodb.com/docs/search/deployment/feature-compatibility/)
- [Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [MongoDB Vector Search deployment options](https://www.mongodb.com/docs/vector-search/deployment/deployment-options/)
- [MongoDB text indexes for self-managed deployments](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/)
- [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [Gemini Embedding 2](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2)
- [Gemini pricing and free-tier data handling](https://ai.google.dev/gemini-api/docs/pricing)
- [npm node-semver](https://github.com/npm/node-semver)
