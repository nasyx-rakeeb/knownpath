# KnownPath Phase 8 Canonicalization and Deduplication Design

## Status

Approved on 2026-08-22. This document defines Phase 8 only. It does not authorize Phase 9 public
search/retrieval, MongoDB vector indexes, MCP knowledge tools, Agent Skill distribution,
contribution collection, or dashboard work.

## Goal

Convert overlapping scored candidate experiences into stable canonical KnownPath records without
destroying candidates, evidence, scoring history, or the ability to reverse a decision.

Phase 8 must:

- normalize exact and near-exact technical identifiers conservatively;
- reduce pair comparisons through deterministic blocking;
- use semantic embeddings only after deterministic plausibility gates;
- require strong deterministic evidence for every automatic merge;
- route ambiguity to review instead of using semantic similarity as a merge oracle;
- preserve supporting, conflicting, and rejected candidate relationships;
- support multiple valid solution variants for one generalized problem;
- retain stable KnownPath identity while regenerating its current projection;
- make merges, splits, reassignments, and rebuilds auditable and resumable; and
- hard-block private or team material from the unpaid/public Gemini path.

## Current repository facts

- `candidate_experiences` contains immutable extracted knowledge content plus mutable status and
  `latestAssessmentId` projections.
- `candidate_assessments` contains immutable Phase 7 score history. A candidate's latest pointer is
  only a fast projection and is not the source of historical truth.
- Candidate evidence references resolve to immutable `source_items` and retain source IDs, content
  digests, canonical URLs, locators, and bounded excerpts.
- `known_paths` already reserves stable UUID identifiers, canonical keys, generalized knowledge,
  confidence/freshness, visibility, moderation, and provider-neutral search metadata, but does not
  yet represent memberships, alternatives, revisions, or merge history.
- `@knownpath/search` is an intentionally empty Phase 1 boundary. It is the appropriate home for a
  provider-neutral embedding contract that Phase 9 retrieval can reuse.
- The local MongoDB Compose service is a standalone MongoDB 8.0 server. Multi-document transactions
  cannot be assumed in local development.
- The current Gemini extraction path is capability-labelled `public_only`. It already rejects
  private/team records before constructing the unpaid provider or making a network call.

## Research basis

Research was performed on 2026-08-22 using primary papers and current official documentation:

- Fellegi and Sunter formalize record linkage as match, non-match, and possible-link decisions and
  explain blocking as a practical way to avoid all-pairs comparison:
  <https://www.cs.cornell.edu/~shmat/courses/cs6434/fellegi-sunter.pdf>
- Broder defines document resemblance and containment using shingles and compact fingerprints,
  supporting cheap lexical near-duplicate comparison:
  <https://www.cs.princeton.edu/courses/archive/spring13/cos598C/broder97resemblance.pdf>
- Sentence-BERT demonstrates sentence embeddings suitable for efficient semantic similarity
  comparison rather than repeated pairwise cross-encoding: <https://arxiv.org/abs/1908.10084>
- DBSCAN establishes density-based clustering with explicit noise rather than forcing every point
  into a cluster. Phase 8 borrows the principle that unmatched/ambiguous records may remain noise;
  it does not directly adopt DBSCAN for the small blocked pair graph:
  <https://file.biolab.si/papers/1996-DBSCAN-KDD.pdf>
- Sentry documents issue grouping that prioritizes stack trace, then exception, then message, and
  layers semantic grouping over rule-based grouping. Its current guidance also emphasizes erring on
  the side of separation when ambiguity could combine different root causes:
  <https://www.sentry.help/en/articles/13964350-why-are-my-events-grouped-or-separated-incorrectly-in-sentry>
  and <https://sentry.io/changelog/enhanced-issue-grouping/>
- OpenTelemetry defines exception type, message, and stack trace as distinct stable attributes and
  recommends predictable low-cardinality error types:
  <https://opentelemetry.io/docs/specs/semconv/registry/attributes/exception/>
- MongoDB documents unique and partial unique indexes, single-document atomicity, the cost and
  deployment requirements of multi-document transactions, and the Document Versioning Pattern for
  separate current and historical records: <https://www.mongodb.com/docs/manual/core/index-unique/>,
  <https://www.mongodb.com/docs/manual/core/transactions/>, and
  <https://www.mongodb.com/docs/manual/data-modeling/design-patterns/data-versioning/document-versioning/>
- Google's current Gemini documentation identifies `gemini-embedding-2` as stable, with an 8,192
  token input limit and configurable 128-3072 dimensions. The embeddings guide recommends 768, 1536,
  or 3072 dimensions and documents automatic normalization for reduced dimensions:
  <https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2> and
  <https://ai.google.dev/gemini-api/docs/embeddings>
- Gemini's pricing documentation says free-tier inputs may be used to improve Google products, while
  paid-tier inputs are not. This makes the existing public-only capability boundary a hard privacy
  requirement: <https://ai.google.dev/gemini-api/docs/pricing>

## Alternatives considered

### Deterministic and lexical matching only

This would be cheap, reproducible, and private by construction, but it would miss paraphrased
problem/solution pairs with different wording. It is rejected because Phase 8 explicitly benefits
from a semantic layer and the current public corpus can safely use the approved public-only Gemini
path.

### Embedding-first clustering

Embedding every record and clustering solely by cosine distance is compact but unsafe. Similar
technical prose can describe different root causes, platforms, versions, or opposite advice. It is
rejected because an embedding score is not objective merge evidence.

### A vector database or MongoDB vector index now

This would prematurely introduce Phase 9 retrieval infrastructure and obscure the deliberately small
set of plausible comparisons. It is rejected. Phase 8 stores provider-neutral vectors in ordinary
MongoDB documents and computes cosine similarity in application code only after blocking.

### Chosen layered approach

Use immutable deterministic profiles, multi-pass blocking, deterministic pair assessment, optional
public-only embeddings, conservative policy decisions, explicit review, current relationship
projections, append-only events, and immutable KnownPath revisions.

## Package and dependency boundaries

Add `@knownpath/canonicalization` for Phase 8 orchestration and deterministic logic. It owns:

- error and identifier normalization;
- similarity-profile construction;
- blocking-key construction;
- deterministic and lexical pair comparison;
- merge policy evaluation;
- pair discovery and review decisions;
- canonical membership operations;
- solution-variant assignment; and
- KnownPath rebuilding.

Activate `@knownpath/search` only for the smallest reusable embedding boundary:

- `EmbeddingProvider` and request/response contracts;
- capability and visibility enforcement;
- deterministic embedding-input assembly/digests;
- cosine similarity; and
- the initial Gemini adapter.

`@knownpath/search` does not implement vector indexes, retrieval, ranking, or public search in this
phase. `@knownpath/database` remains the only MongoDB access layer. `apps/worker` composes services
and commands.

Dependency direction:

```text
apps/worker --> packages/canonicalization --> packages/domain
                         |             |
                         |             +--> packages/search
                         +----------------> packages/database

packages/search --> packages/domain
packages/search --> @google/genai
```

Neither `@knownpath/domain` nor `@knownpath/database` depends on canonicalization, search, Gemini,
HTTP, or UI code.

## Deterministic similarity profiles

Each candidate receives an immutable profile identified by candidate ID, candidate-material digest,
normalizer identifier/version, and profile-schema version.

The profile stores:

- normalized ecosystem, package coordinates, platforms, and explicit versions;
- extracted error codes and exception classes;
- normalized error signatures and strong error fingerprints;
- normalized problem, root-cause, solution, and step text;
- exact problem/solution composite fingerprints;
- sorted token shingles and their digests;
- multiple blocking keys with a documented type and strength;
- deterministic incompatibility markers; and
- creation timestamp and idempotency key.

Profiles are regenerated rather than overwritten when the normalizer, schema, or candidate input
changes. Old profiles remain available for audit and comparison.

## Conservative error normalization

Normalization begins with Unicode NFKC, stable casing where appropriate, line-ending conversion, and
whitespace normalization. Ordered recognizers then classify technical tokens before replacing noise
so meaningful identifiers cannot be accidentally erased.

Preserve:

- exception and error class names;
- named error codes such as Node `ERR_*`, TypeScript `TS####`, Gradle/task identifiers, native
  status names, and EAS/Expo codes;
- HTTP and native numeric status codes when syntactically identified as statuses;
- package and scoped-package names;
- meaningful filenames and command/task names;
- ecosystem, platform, architecture, runtime, framework, and toolchain identity; and
- version applicability at exact, major/minor, or explicitly ranged granularity.

Replace only confidently transient forms:

- POSIX user-home and recognized temporary/build-root prefixes;
- Windows drive-rooted user and temporary paths;
- UUIDs;
- long hexadecimal/random identifiers at recognized identifier positions;
- ISO timestamps and common log timestamp forms;
- stack-frame line and column suffixes; and
- recognized ephemeral build directory instances.

Do not replace short hexadecimal values, arbitrary numbers, filenames, status codes, package
versions, or path-like package names merely because a broad regular expression matches. Every
normalizer rule has a stable reason code included in the profile, and the original text remains on
the candidate.

## Blocking and pair discovery

All-pairs comparison is forbidden for ordinary processing. A candidate enters one or more blocking
passes, and the union of their pair results is deduplicated:

1. exact strong error fingerprint plus ecosystem;
2. error code or exception class plus ecosystem and compatible package;
3. exact problem/solution composite fingerprint;
4. package, platform, and high lexical problem overlap; and
5. ecosystem, platform, and high lexical solution overlap.

Blocking keys are deliberately plural so missing one identifier does not permanently hide a true
match. Each discovered pair stores the blocking reasons that admitted it.

Before semantic work, deterministic comparison calculates:

- exact and overlapping error/error-code/exception signals;
- ecosystem, package, platform, runtime, and version compatibility;
- root-cause compatibility when both candidates claim one;
- problem, symptom, solution, and step shingle Jaccard similarity;
- evidence/source independence; and
- explicit conflicts and hard incompatibilities.

Pairs with incompatible ecosystems, contradictory strong error identifiers, incompatible platform
requirements, disjoint explicit versions that materially change the fix, or conflicting root causes
are classified `separate` without embeddings.

## Embedding boundary and privacy

The provider contract exposes capability, provider identifier, model identifier/version, dimensions,
and `embed()` without leaking Gemini-specific response types into canonicalization.

The initial adapter uses the official `@google/genai` SDK and configurable defaults:

- provider: `gemini`;
- model: `gemini-embedding-2`;
- output dimensions: `768`;
- task intent: symmetric semantic similarity; and
- request timeout, retry, spacing, and bounded-call controls from environment configuration.

The embedding input is a deterministic, versioned serialization of bounded candidate fields:
problem, symptoms, normalized errors, ecosystem/packages/platforms/versions, supported root cause,
solution summary, ordered steps, and caveats. It contains no source-page chrome, hidden reasoning,
credentials, or arbitrary instructions.

Before provider construction or network access, orchestration verifies that the candidate and all
referenced sources are `public`. `private` and `team` data fail with an actionable
`embedding_provider_visibility_forbidden` error. There is no fallback, downgrade, partial redaction,
or alternate public/free provider path.

Each immutable embedding record stores:

- subject type and candidate/profile ID;
- input digest and embedding-input version;
- visibility;
- provider and capability;
- versioned model identifier;
- dimensions and task intent;
- vector values;
- generated timestamp;
- latency/usage metadata exposed by the API; and
- idempotency key.

Changing input, provider, model, dimensions, or embedding-input version creates a new record. A
repeat reuses the existing record. No vector index is created.

Only pairs admitted by deterministic blocking and still classified as plausible may request or use
embeddings. Both candidate embeddings use the same provider, model, dimensions, and input version.
Cosine similarity is otherwise invalid and the pair remains reviewable without a semantic score.

## Pair assessments and merge policy

Every evaluated pair receives a separate immutable `candidate_pair_assessments` record containing:

- ordered candidate IDs and profile IDs;
- pair idempotency key;
- policy identifier/version/digest;
- blocking reasons;
- deterministic agreements, incompatibilities, lexical metrics, and evidence-source facts;
- optional embedding IDs and cosine similarity;
- decision: `auto_merge`, `review`, or `separate`;
- reason codes and human-readable explanations; and
- evaluated timestamp.

The production policy is a strict runtime-validated source object with integer/versioned thresholds
and a persisted digest. Thresholds are not scattered environment values.

`auto_merge` requires all of the following:

- no hard incompatibility;
- compatible visibility scope;
- compatible ecosystem/package/platform/version applicability;
- at least one strong deterministic identity signal; and
- sufficient deterministic problem and solution agreement.

Strong deterministic identity means an exact normalized error fingerprint, exact meaningful error
code/exception plus strong lexical solution agreement, or an exact versioned problem/solution
composite fingerprint. Semantic similarity can add an explanation and review priority but cannot
satisfy any required automatic-merge predicate.

A plausible pair lacking the complete deterministic gate is `review`, even when cosine similarity is
high. A semantic mismatch may lower review priority or support `separate`, but automatic separation
still records the deterministic reasons.

Transitive closure is not blindly applied. If A safely matches B and B safely matches C, the service
must still validate C against the proposed canonical cluster's required identifiers and
incompatibilities before assignment.

## Canonical records, memberships, and solution variants

`known_paths` is the mutable current projection with a stable UUID and canonical key. Its Phase 8
shape includes:

- lifecycle state: `draft`, `review`, `published`, `deprecated`, `superseded`, or `archived`;
- generalized problem and applicability metadata;
- one or more stable solution variants;
- unioned evidence references without losing source relationships;
- current trust projection from persisted Phase 7 assessments;
- freshness projection;
- membership counts by disposition;
- `latestRevisionId`; and
- optional superseding KnownPath ID.

A solution variant has a stable key, summary, ordered steps, caveats, applicability, supporting
candidate IDs, conflicting candidate IDs, evidence, and the assessment IDs used for its trust
projection. The builder chooses the strongest eligible candidate assessment as the representative
trust result and exposes all contributing assessment IDs. Phase 8 does not manufacture a new
probability or silently increase confidence merely because candidates were grouped.

`canonical_memberships` stores current candidate relationships independently because candidates and
KnownPaths have separate lifecycle and membership may grow. A relationship records KnownPath ID,
candidate ID, disposition (`supporting`, `conflicting`, or `rejected`), optional solution key,
active state, assignment reason, pair-assessment/manual-review references, operation ID, actor, and
timestamps.

A partial unique index permits only one active supporting membership per candidate. Conflicting or
rejected relationships may exist against other KnownPaths for review/audit. Candidates are never
deleted or rewritten into canonical content.

## Immutable revisions and audit events

Every canonical rebuild writes a complete immutable `known_path_revisions` snapshot first. Its
idempotency key covers KnownPath ID, ordered active memberships, candidate material/profile IDs,
latest assessment IDs, builder version, and policy digest. The current KnownPath projection then
updates `latestRevisionId` and its materialized fields.

If the projection update fails, the revision remains valid and rerunning the idempotent rebuild
repairs the pointer. Historical revisions are never overwritten.

Every merge, split, reassignment, disposition change, and rebuild emits append-only
`canonicalization_events` with an operation ID, type, actor, reason, affected records, before/after
relationship facts, timestamps, and optional review note. Operations use deterministic idempotency
keys.

Because local MongoDB cannot guarantee a multi-document transaction, a mutation follows a resumable
workflow:

1. append an immutable operation-request event;
2. apply idempotent current membership changes;
3. rebuild affected KnownPath projections from current memberships; and
4. append an immutable completion event.

An interrupted operation has a visible request without completion and can be resumed by operation
ID. The system never claims cross-document atomicity it does not have. A future replica-set
deployment may add transactions inside this boundary without changing domain commands.

## Collections and indexes

### `candidate_similarity_profiles`

- unique idempotency key;
- candidate ID plus normalizer/profile version and creation time;
- multikey blocking keys plus normalizer version; and
- strong error fingerprints plus ecosystem.

### `candidate_embeddings`

- unique idempotency key;
- candidate/profile plus provider/model/dimensions and generation time; and
- input digest plus provider/model.

There is deliberately no vector index.

### `candidate_pair_assessments`

- unique idempotency key;
- unique ordered pair plus policy/profile versions;
- decision plus evaluation time;
- review decision plus semantic similarity; and
- candidate ID multikey lookup.

### `canonical_memberships`

- unique relationship identity;
- partial unique active supporting candidate membership;
- KnownPath plus active/disposition/solution key;
- candidate plus active/disposition; and
- operation ID.

### `canonicalization_events`

- unique event idempotency key;
- operation ID plus event sequence;
- KnownPath plus occurrence time;
- candidate ID plus occurrence time; and
- event type plus occurrence time.

### `known_path_revisions`

- unique rebuild idempotency key;
- KnownPath plus revision number;
- KnownPath plus creation time; and
- membership/profile/assessment input IDs for affected-record inspection.

Existing `known_paths` indexes evolve to include review lifecycle, latest revision, and canonical
identity while retaining Phase 2 ecosystem/package/platform/version/error/freshness access paths.
All collection validators are strict and initialization remains idempotent.

## Commands

The worker exposes bounded commands:

- `canonicalize profile --candidate <id>` and bounded pending/all profile generation;
- `canonicalize discover` with candidate, limit, dry-run, and include-reviewed controls;
- `canonicalize embed` for only deterministically plausible public candidates;
- `canonicalize auto-merge` with dry-run default and explicit apply;
- `canonicalize review` to print pair evidence, deterministic signals, semantic support, and
  provenance;
- `canonicalize merge` for an explicit candidate/KnownPath target and reason;
- `canonicalize split` and `canonicalize reassign` with operation IDs and reasons;
- `canonicalize rebuild` for one or all affected KnownPaths; and
- `canonicalize history` for pair decisions, relationships, events, and revisions.

Commands have explicit maximum candidate/pair/provider-call limits. Operational logs show IDs,
counts, model metadata, decisions, and rate-limit state but never API keys or source secrets.

## Canonical regeneration

The builder is deterministic and does not ask Gemini to rewrite canonical knowledge. It selects and
combines persisted candidate material using explicit rules:

- select the best assessed supporting candidate as the representative problem formulation;
- union compatible metadata and evidence in stable sorted order;
- group exactly/near-exact deterministic solutions into one variant;
- preserve materially different valid solutions as separate variants;
- attach conflicts and caveats to the affected variant;
- project the representative immutable Phase 7 assessment and all supporting assessment IDs; and
- create a new revision only when versioned inputs change.

Stronger evidence can change the current summary, steps, ordering, trust projection, or preferred
solution while stable KnownPath and solution-variant identities remain. Historical revisions make
that evolution inspectable and reversible.

## Failure handling

- Invalid profile, embedding, pair, membership, event, or revision documents fail runtime validation
  and are not persisted.
- Provider authentication, quota, timeout, and transient errors use explicit typed failures and
  bounded retry/backoff. They do not convert a pair into an automatic merge.
- Private/team embedding attempts fail before any provider call with remediation explaining that an
  explicitly approved private-data provider/account is required.
- Missing or incompatible profiles leave the pair pending/reviewable.
- Duplicate commands reuse idempotent records and repair projections.
- Incomplete operations are visible through history inspection and resumable by operation ID.

## Verification strategy

Phase 8 adds no tests. Verification must include:

1. install/typecheck/lint/format/build;
2. idempotent database initialization and direct collection/index inspection;
3. profile inspection showing meaningful identifiers preserved and transient noise normalized;
4. several real Expo/React Native candidates representing both overlap and distinct problems;
5. pair discovery proving deterministic blocking happens before embeddings;
6. live public Gemini embedding generation if the configured key/quota permits it;
7. repeated profile, embedding, pair, and rebuild commands proving idempotency;
8. an automatic merge whose stored assessment contains strong deterministic evidence;
9. an ambiguous semantically similar pair routed to review;
10. a clearly distinct pair remaining separate;
11. direct inspection that all original candidate/source/evidence references remain;
12. manual merge followed by split/reassignment on temporary development records;
13. history and revision inspection proving reversibility; and
14. a private/team development record rejected before provider construction or network access.

If the local corpus does not naturally contain enough overlapping extracted candidates, verification
may ingest/extract/score a small bounded real public sample or create clearly labelled temporary
development candidates derived from already persisted public source records. Temporary records must
be removed afterward and must never be described as production knowledge.

## Documentation and phase boundary

Implementation updates:

- `docs/CANONICALIZATION.md` with normalization, blocking, policy, review, merge/split, embedding,
  rebuild, audit, and operations guidance;
- `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md` for evolved boundaries and
  collections;
- `.env.example` for embedding provider/model/dimensions and bounded operations; and
- `progress.md` with research, implementation, observed verification, limitations, and the exact
  next phase.

Phase 8 ends after canonicalization is verified and committed. Vector indexing, hybrid/semantic
retrieval, ranking, public knowledge APIs, MCP knowledge access, Agent Skill distribution, outcome
collection, and dashboards remain later work.
