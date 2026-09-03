# Canonicalization and deduplication

Candidate experiences often describe the same technical problem. Canonicalization groups only
well-supported duplicates into stable KnownPaths while retaining every source, candidate,
assessment, decision, and historical revision.

Merges are conservative, auditable, and reversible.

## Pipeline

```text
assessed candidate
      ↓
immutable similarity profile
      ↓
deterministic blocking
      ↓
plausible pair comparison
      ├─ incompatible → separate
      ├─ strong deterministic match → auto-merge eligible
      └─ ambiguous → review
      ↓
optional public-only embedding similarity
      ↓
membership operation + immutable revision
```

KnownPath never compares every candidate with every other candidate. Cheap deterministic blocking
selects plausible pairs first.

## Technical normalization

The normalizer applies Unicode NFKC, stable casing/whitespace rules, and carefully bounded removal
of transient values:

- user and temporary paths;
- UUIDs;
- ISO timestamps;
- stack line/column suffixes;
- contextual request/build/trace/session IDs;
- recognized random build-directory segments.

It preserves meaningful error codes, exception classes, package and file names, task names, HTTP
statuses, versions, platforms, and ecosystems. Each transformation records a reason code; the
original candidate remains unchanged.

Similarity profiles store normalized error, problem, and solution fingerprints; token-shingle
digests; metadata; and blocking keys. A normalizer/input change creates a new immutable profile.

## Blocking and pair comparison

Blocking keys cover:

- exact error fingerprint and ecosystem;
- error code/exception with ecosystem and package;
- exact problem/solution fingerprint;
- package/platform with problem shingles;
- package/platform with solution shingles.

Pair assessments record which keys admitted the pair, error identity, ecosystem/package/platform
fit, version compatibility, root-cause conflicts, and separate problem/solution Jaccard similarity.

## Automatic merge gates

Policy `knownpath-canonicalization` version 1 requires:

- no hard incompatibility;
- compatible visibility and applicability;
- a strong deterministic identity signal;
- problem similarity at least 0.72;
- solution similarity at least 0.78.

An error-code/exception-only identity requires solution similarity at least 0.88. Different
ecosystems, explicit platforms, material major versions, packages, scopes, or stated root causes can
force `separate`.

Semantic similarity can strengthen a deterministic decision or prioritize review. It cannot create
an automatic merge by itself.

## Embeddings and privacy

Plausible public pairs may use the provider-neutral embedding interface backed by
`gemini-embedding-2` at 768 configured dimensions. An immutable embedding records provider,
model/version, dimensions, input digest/version, capability, visibility, generation time, latency,
and vector.

The provider is constructed only after every candidate/source is confirmed public. Private/team
records fail with `embedding_provider_visibility_forbidden`; there is no public-provider fallback.

No vector index is needed for pair comparison. Production retrieval indexes are described in
[Retrieval](RETRIEVAL.md).

## Pair decisions

Immutable `candidate_pair_assessments` use:

- `auto_merge` — all deterministic gates passed;
- `review` — plausible but ambiguous/incomplete;
- `separate` — deterministic incompatibility.

The record includes ordered candidates/profiles, blocking reasons, metrics, optional embedding IDs
and cosine similarity, policy version/digest, reason codes, explanations, and evaluation time.
Identical inputs reuse the same assessment.

## Canonical memberships

`canonical_memberships` maps a candidate to a KnownPath as:

- `supporting`;
- `conflicting`;
- `rejected`.

Supporting memberships reference a stable solution key. A candidate has only one active supporting
KnownPath, enforced by a partial unique index.

A KnownPath can hold multiple valid solution variants. Each retains its own steps, caveats,
applicability, supporting candidates, evidence, and trust projection.

## Revisions and reversibility

`known_paths` is the current materialized projection. `known_path_revisions` stores immutable
historical snapshots. Canonical trust projects eligible immutable candidate assessments; evidence is
unioned without losing distinct provenance.

`canonicalization_events` records requested and completed create, merge, split, reassign, and
rebuild operations. Operations are resumable:

1. append `operation_requested`;
2. make idempotent membership changes;
3. rebuild affected projections;
4. append `operation_completed`.

Splitting or reassigning deactivates the current membership. It never deletes the candidate,
assessment, event, or revision.

Canonicalization cannot merge across incompatible public/private/workspace ownership.

## Commands

```sh
pnpm canonicalize profile --candidate <candidate-id>
pnpm canonicalize profile --limit 25
pnpm canonicalize discover --limit 25
pnpm canonicalize discover --limit 25 --no-embeddings

pnpm canonicalize auto-merge --limit 25
pnpm canonicalize auto-merge --limit 25 --apply

pnpm canonicalize review --limit 25
pnpm canonicalize review --pair <pair-assessment-id>

pnpm canonicalize merge --candidate <candidate-id> --reason "reviewed duplicate"
pnpm canonicalize merge --candidate <candidate-id> --target <known-path-id> \
  --reason "reviewed alternative" --alternative-solution
pnpm canonicalize split --candidate <candidate-id> --reason "different root cause"
pnpm canonicalize reassign --candidate <candidate-id> --target <known-path-id> \
  --reason "belongs to existing canonical record"
pnpm canonicalize rebuild --known-path <known-path-id> --reason "stronger evidence arrived"
```

Automatic merge is dry-run by default. Manual mutations require explicit IDs and reasons. Supply
`--operation <uuid>` to resume a known operation idempotently.

## Retention

Profiles, embeddings, pair assessments, events, and revisions are retained for audit and safe
regeneration. Current memberships and projections may change; source items, candidates, assessments,
and historical canonical records remain intact.

## References

- [Fellegi–Sunter record linkage](https://www.cs.cornell.edu/~shmat/courses/cs6434/fellegi-sunter.pdf)
- [Broder document resemblance](https://www.cs.princeton.edu/courses/archive/spring13/cos598C/broder97resemblance.pdf)
- [MongoDB document versioning](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/data-versioning/document-versioning/)
- [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
