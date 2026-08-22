# Canonicalization and Deduplication

## Scope

Phase 8 converts assessed candidate experiences into stable canonical KnownPaths. It does not expose
search, create a vector index, publish records automatically, or discard a source candidate.

The implementation is split between:

- `@knownpath/canonicalization`: normalization, profiles, blocking, pair assessment, merge policy,
  memberships, audit events, and canonical rebuilds;
- `@knownpath/search`: the reusable embedding-provider contract, Gemini adapter, visibility gate,
  and cosine similarity; and
- `@knownpath/database`: all MongoDB collections, indexes, validators, and repositories.

## Pipeline

```text
assessed candidate
  -> immutable deterministic profile
  -> indexed blocking keys
  -> plausible candidate pairs only
  -> deterministic and lexical comparison
     -> hard incompatibility: separate
     -> strong deterministic match: automatic-merge eligible
     -> incomplete/ambiguous evidence: review
  -> optional public-only Gemini embeddings for plausible pairs
  -> immutable pair assessment
  -> audited membership operation
  -> immutable KnownPath revision
  -> current KnownPath projection
```

The all-pairs Cartesian product is not an operational mode. Multiple blocking passes make missed
matches less likely without paying the cost of comparing unrelated candidates.

## Normalization and fingerprints

The version 1 technical normalizer performs Unicode NFKC, line-ending, casing, and whitespace
normalization. Ordered rules replace only confidently transient values:

- POSIX and Windows user/temp paths;
- UUIDs;
- ISO timestamps;
- stack-frame line/column suffixes;
- contextual request/build/trace/session identifiers; and
- recognized random build-directory segments.

It preserves meaningful error codes, exception classes, package names, filenames, task names, status
codes, versions, platforms, and ecosystems. Every applied replacement records a reason code, and the
original candidate text remains unchanged.

Profiles persist normalized error fingerprints, problem/solution fingerprints, token-shingle
digests, normalized metadata, and blocking keys. A normalizer/profile/input change creates a new
immutable profile.

## Blocking and deterministic comparison

Blocking passes cover:

- exact error fingerprint plus ecosystem;
- error code/exception plus ecosystem and package;
- exact problem/solution fingerprint;
- package/platform plus problem shingles; and
- package/platform plus solution shingles.

A blocked pair records exactly which keys admitted it. Deterministic comparison then records error
identity, ecosystem/package/platform/version compatibility, root-cause conflicts, and separate
problem/solution Jaccard similarities.

Automatic merge policy version 1 requires:

- no hard incompatibility;
- compatible visibility and applicability;
- a strong deterministic identity signal;
- problem similarity of at least `0.72`; and
- solution similarity of at least `0.78`.

An error-code/exception-only identity additionally requires solution similarity of at least `0.88`.
The complete runtime-validated policy and digest are stored on every pair assessment. These values
are intentionally conservative initial calibration values, not universal probabilities.

Different ecosystems, explicit platforms, material major-version applicability, packages, or stated
root causes can produce hard separation reasons. Ambiguity remains reviewable; transitive closure is
never accepted without validating the new candidate against the target cluster.

## Gemini embeddings and privacy

The default adapter uses Google's official `@google/genai` SDK with the stable `gemini-embedding-2`
identifier and 768 dimensions. Provider, versioned model identifier, dimensions, input
version/digest, capability, visibility, generation timestamp, latency, and vector are persisted in
immutable `candidate_embeddings` records.

Gemini receives only a bounded deterministic candidate representation after the pair has passed
blocking. No source-page chrome or credentials are included. The provider is not constructed until
the service has loaded every referenced source and verified that both candidate and sources are
public.

`private` and `team` data fail with `embedding_provider_visibility_forbidden`. There is no fallback,
redaction shortcut, silent downgrade, or free/public provider path for such material. A future paid
Gemini, alternative provider, or self-hosted model must explicitly advertise an approved private
capability.

Cosine similarity can strengthen a deterministic match or prioritize review. It cannot change a
deterministic `review` decision into `auto_merge`, and no vector index exists in Phase 8.

Configuration:

```dotenv
EMBEDDING_PROVIDER=gemini
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_EMBEDDING_MODEL_VERSION=gemini-embedding-2
GEMINI_EMBEDDING_DIMENSIONS=768
EMBEDDING_MAX_PROVIDER_CALLS=20
EMBEDDING_MIN_REQUEST_SPACING_MS=1000
```

The existing `GEMINI_API_KEY`, timeout, and retry variables are shared. Never commit the key.

## Pair decisions

`candidate_pair_assessments` is append-only. Each record contains ordered candidate/profile IDs,
blocking reasons, deterministic metrics, optional embedding IDs/cosine similarity, policy
identifier/version/digest, decision, reason codes, explanations, and evaluation time.

Decisions are:

- `auto_merge`: every deterministic production gate passed;
- `review`: plausible but incomplete or ambiguous; semantic similarity may order this queue; or
- `separate`: a deterministic incompatibility was found.

Repeating identical inputs reuses the same pair assessment and embeddings.

## Canonical memberships and solutions

`canonical_memberships` is the current candidate-to-KnownPath projection. A relationship is
`supporting`, `conflicting`, or `rejected`; supporting relationships reference a stable solution
key. A partial unique index permits only one active supporting KnownPath per candidate.

One KnownPath may contain several solution variants. Alternative solutions remain separate variants
with their own steps, caveats, applicability, candidates, evidence, and trust projection. The system
does not force a single winner.

Canonical trust does not invent a new probability. It projects the strongest eligible immutable
Phase 7 assessment and lists every contributing assessment ID. Candidate/source evidence is unioned
by source ID, relationship, content digest, locator, and excerpt so distinct provenance is not lost.

## Revisions, merges, and reversibility

`known_paths` keeps stable identity and the current materialized projection. `known_path_revisions`
stores immutable historical snapshots. The rebuild idempotency key covers memberships, candidates,
assessments, content, builder version, and policy-relevant material. Projection timestamps derive
from persisted assessment time, so identical rebuild inputs reuse the same revision.

`canonicalization_events` is append-only and records requested/completed operations plus creation,
merge, split, reassignment, and rebuild steps. The local MongoDB service is standalone, so the
workflow is deliberately resumable instead of pretending that cross-document transactions are
available:

1. append `operation_requested`;
2. make idempotent membership changes;
3. rebuild affected projections; and
4. append `operation_completed`.

An incomplete operation remains visible by operation ID and can be retried. Splitting or reassigning
a candidate deactivates its current relationship; it never deletes the candidate or historical
event/revision records.

## Commands

Create/reuse profiles and discover pairs:

```sh
pnpm canonicalize profile --candidate <candidate-id>
pnpm canonicalize profile --limit 25
pnpm canonicalize discover --limit 25
pnpm canonicalize discover --limit 25 --no-embeddings
```

Preview automatic merges by default, then apply only deterministic-eligible pairs explicitly:

```sh
pnpm canonicalize auto-merge --limit 25
pnpm canonicalize auto-merge --limit 25 --apply
```

Inspect review decisions:

```sh
pnpm canonicalize review --limit 25
pnpm canonicalize review --pair <pair-assessment-id>
```

Manual operations require explicit IDs and reasons:

```sh
pnpm canonicalize merge --candidate <candidate-id> --reason "reviewed duplicate"
pnpm canonicalize merge --candidate <candidate-id> --target <known-path-id> \
  --reason "reviewed alternative" --alternative-solution
pnpm canonicalize split --candidate <candidate-id> --reason "different root cause"
pnpm canonicalize reassign --candidate <candidate-id> --target <known-path-id> \
  --reason "belongs to existing canonical record"
pnpm canonicalize rebuild --known-path <known-path-id> --reason "stronger evidence arrived"
pnpm canonicalize history --operation <operation-id>
```

Use `--operation <uuid>` on manual mutation commands to resume a known operation idempotently.

## Retention and phase boundary

Profiles, embeddings, pair assessments, events, and revisions are retained for audit and safe
regeneration. Current memberships and KnownPath projections may change, but source items,
candidates, assessments, and historical canonical records are not destroyed by canonicalization.

Phase 9 may reuse the embedding provider and stored metadata, but it must deliberately design vector
indexes, retrieval, ranking, and public search contracts. None are present here.

## References

- [Fellegi-Sunter record linkage](https://www.cs.cornell.edu/~shmat/courses/cs6434/fellegi-sunter.pdf)
- [Broder document resemblance](https://www.cs.princeton.edu/courses/archive/spring13/cos598C/broder97resemblance.pdf)
- [Sentence-BERT](https://arxiv.org/abs/1908.10084)
- [OpenTelemetry exception attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/exception/)
- [MongoDB Document Versioning Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/data-versioning/document-versioning/)
- [MongoDB unique and partial indexes](https://www.mongodb.com/docs/manual/core/index-unique/)
- [Gemini Embedding 2](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2)
- [Gemini embeddings guide](https://ai.google.dev/gemini-api/docs/embeddings)
- [Gemini pricing and data handling](https://ai.google.dev/gemini-api/docs/pricing)
