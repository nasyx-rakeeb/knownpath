# Data model

KnownPath stores durable product state in MongoDB. `@knownpath/domain` supplies versioned Zod
runtime schemas; `@knownpath/database` owns connection lifecycle, collection validators, named
indexes, idempotent initialization, and repository implementations. Applications do not access raw
collections.

## Conventions

- KnownPath-owned IDs are branded UUID v4 strings. Persisted timestamps are BSON `Date` values;
  external ISO 8601 values are normalized at runtime boundaries.
- Most aggregates use `schemaVersion: 1` and `audit.createdAt`/`audit.updatedAt`.
- Deterministic idempotency and deduplication keys are SHA-256 digests of versioned, ordered
  canonical tuples.
- Visibility is a strict union: `public`, `private` with `ownerUserId`, or `team` with
  `workspaceId`.
- Historical facts are append-only where auditability matters. Current projections carry pointers to
  immutable records.
- Durable product collections have no TTL indexes. Ephemeral worker heartbeats and one-time device
  authorization grants expire automatically.

## Collection map

Database initialization manages 34 collections.

### Identity and authorization

| Collection           | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `users`              | Account identity, role and lifecycle                             |
| `api_keys`           | Scoped machine credential metadata and digest; never plaintext   |
| `auth_sessions`      | Better Auth server-side sessions                                 |
| `auth_accounts`      | Better Auth credentials/provider associations                    |
| `auth_verifications` | Framework verification primitives for deliberately enabled flows |
| `auth_device_codes`  | Short-lived, one-time CLI browser authorization grants           |
| `audit_events`       | Append-only sensitive-action history without credential data     |

`users` is the identity source for KnownPath and Better Auth. Password material lives only in
`auth_accounts` and is hashed by Better Auth. Session tokens live in `auth_sessions` and secure
cookies. An API key has the external form `kp_<public-id>_<random-secret>`; persistence contains its
public prefix, HMAC-SHA-256 digest, scopes, binding, status, expiry/revocation, and throttled
last-used timestamp.

API keys carry a `credentialKind` (`manual` or `cli_device`). CLI-device keys reuse the same
hashing, scope, binding, expiry, revocation, and last-use machinery as manual keys.
`auth_device_codes` stores only expiring protocol state and has unique device/user-code indexes plus
a TTL index; raw codes are not copied into audit events. CLI profile metadata and OS
credential-store contents are client-side, not MongoDB product collections.

### Sources and extraction

| Collection              | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `source_registries`     | Source identity, adapter configuration, scope and incremental cursors |
| `source_items`          | Immutable normalized source snapshots and provenance                  |
| `source_item_states`    | Mutable latest/hash/ETag/Last-Modified/lifecycle projection           |
| `ingestion_runs`        | Source synchronization attempts and counters                          |
| `extraction_attempts`   | Provider/model/prompt/schema-versioned extraction ledger              |
| `candidate_experiences` | Reviewable structured problem/solution interpretations                |
| `candidate_assessments` | Immutable deterministic evidence and score history                    |

Each GitHub issue, discussion, comment, reply, documentation page, release note, or agent
contribution becomes its own immutable snapshot. Thread parent/root identities preserve structure
without embedding unbounded comment arrays. Provider metadata contains objective IDs, repository,
author association, reactions, state, labels, accepted-answer or closing-PR data, and timestamps.
Document snapshots include source authority, type, ecosystem/framework/version metadata,
attribution, license, and normalized structured blocks; raw page HTML and navigation chrome are not
stored.

`source_item_states` points to the latest snapshot and retains content hash and conditional-fetch
metadata. Equal content or a `304` updates fetch state without inserting a new snapshot. Absence
means deletion only after a complete authoritative catalog comparison.

Extraction attempts include the exact source/context digests, strategy, provider/model/data
capability, prompt/schema/generation versions, budget and usage, status, latency, and bounded
failure metadata. Terminal idempotency matches are reused. Invalid raw model output and blocked
private data are not retained as source content.

Candidates embed bounded normalized environment, problem, symptoms/errors, evidence references,
solution steps, caveats, conflicts, and model-suggested labels. These remain interpretation until a
deterministic assessment verifies source references and metadata.

### Canonical knowledge and retrieval

| Collection                      | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `candidate_similarity_profiles` | Immutable fingerprints, shingles and blocking keys            |
| `candidate_embeddings`          | Immutable public-only vectors for plausible candidate pairs   |
| `candidate_pair_assessments`    | Explainable merge/review/separate decisions                   |
| `canonical_memberships`         | Current supporting/conflicting/rejected candidate assignments |
| `canonicalization_events`       | Append-only create/merge/split/reassign/rebuild journal       |
| `known_path_revisions`          | Immutable full canonical snapshots                            |
| `known_paths`                   | Stable current projection and latest revision pointers        |
| `known_path_search_documents`   | Rebuildable lexical/vector retrieval projection               |
| `knowledge_search_events`       | Bounded search/selection usage; never an outcome              |

A candidate assessment stores the exact source inputs and digests, algorithm/policy/verifier
versions, verified signals, separate source/freshness/version/outcome components, final 0–100
ranking score, grade, caps, reason codes, and explanations. `latestAssessmentId` is only a fast
pointer; rescoring appends history.

Canonical memberships can be made inactive during split/reassignment but are not deleted. Every
rebuild produces or reuses an immutable revision before advancing the `known_paths` projection.
KnownPaths retain multiple solution variants, all evidence and assessment references, conflicts,
applicability, freshness, moderation, visibility, and safety state.

Search documents materialize bounded normalized text, exact error identifiers, applicability,
trust/outcome summaries, scope, lifecycle, and optionally a
provider/model/version/dimension-specific vector. Retired projections can be rebuilt from canonical
revisions. Candidate embeddings are for pair comparison and are separate from search-document
vectors.

Search events store a keyed query digest, bounded filter counts, returned IDs/ranks/scores, and an
optional selected record. They do not store the raw query, embedding, source body, API key, or a
success/failure claim.

### Contributions and outcomes

| Collection                       | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `agent_contributions`            | Sanitized consented public/private/team lesson submissions |
| `agent_outcomes`                 | Immutable private observed-result reports                  |
| `known_path_outcome_assessments` | Immutable reliability/trend aggregations                   |
| `known_path_safety_events`       | Safety review transitions separate from ranking            |
| `knowledge_share_requests`       | Sanitized private/team-to-public share workflow            |

Contributions retain only the sanitized structured lesson, digest of the original request,
sanitization findings, consent, contributor/key provenance, visibility, moderation, and processing
pointers. Accepted submissions create an immutable contribution source item and low-trust candidate;
they do not publish a KnownPath directly.

Outcomes capture the exact KnownPath revision, private reporter/key provenance, idempotency and
execution IDs, normalized environment/version bucket, observed state, sanitized optional note,
influence eligibility, and anomaly reasons. Repeat-account influence is capped while reports remain
immutable for audit.

Outcome assessments record every input outcome ID, algorithm/policy versions and digest, weighted
counts, effective sample size, Wilson intervals, confidence, timestamps, version distribution,
trend, penalties, reason codes, and explanations. KnownPaths keep only latest pointers. A safety
event can queue review independently without changing confidence, publication, or visibility.

### Workspaces

| Collection              | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `workspaces`            | Tenant root, owner, state and default contribution scope    |
| `workspace_memberships` | Role/status history and authorization state                 |
| `workspace_invitations` | Existing-user invitations with expiry and audited lifecycle |

The active membership row determines workspace access. Invitations target an existing normalized
user email and create membership only after explicit acceptance. A partial unique constraint blocks
duplicate active membership and conflicting pending invitations. API keys can be personal or bound
to one workspace.

`knowledge_share_requests` never flips private/team data public. It stores a separately sanitized,
consented public payload and links to the resulting public contribution if accepted.

### Pipeline operations

| Collection          | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `pipeline_runs`     | Durable operator/API/scheduler intent and aggregate state |
| `pipeline_steps`    | Versioned idempotent job intent and lifecycle             |
| `worker_heartbeats` | Short-lived availability projection                       |

Steps contain IDs and bounded processing controls, never source bodies or credentials. Their unique
idempotency and BullMQ job indexes prevent duplicate dispatch. Pending/stale/quarantine indexes
support reconciliation. Heartbeats use the database's only TTL index; pipeline run/step history has
no automatic expiry.

## Important embedded structures

### Applicability

Candidates and KnownPaths embed normalized ecosystem, packages, frameworks, platforms, runtime,
operating system, architecture, toolchain, and explicit version strings/ranges. Original values are
retained beside normalized identifiers where useful.

### Problem, solution, and evidence

Symptoms retain concise original and normalized text. Error signatures preserve error codes/classes
and a versioned fingerprint that removes only recognized transient details. Solutions contain a
summary and bounded ordered steps with optional code language and verification guidance.

Evidence references an immutable source item as support, outcome verification, conflict, or context.
It includes a bounded excerpt/locator, canonical URL, and content digest rather than duplicating the
whole source.

### Freshness and moderation

Freshness records verification, next-review, and stale-after timestamps. Lifecycle and moderation
are soft states so records can be reviewed, deprecated, superseded, restored, or archived without
destroying provenance.

## Lifecycle values

| Entity               | Values                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| User                 | `active`, `suspended`, `deleted`                                                                                                      |
| API key              | `active`, `revoked`, `expired`                                                                                                        |
| Ingestion run        | `queued`, `running`, `succeeded`, `failed`, `cancelled`                                                                               |
| Extraction attempt   | `queued`, `running`, `succeeded`, `irrelevant`, `insufficient_evidence`, `conflicting_evidence`, `quarantined`, `blocked`, `failed`   |
| Candidate            | `pending`, `accepted`, `rejected`, `superseded`, `failed`                                                                             |
| Candidate assessment | `completed`, `ineligible`                                                                                                             |
| Pair decision        | `auto_merge`, `review`, `separate`                                                                                                    |
| Canonical membership | `supporting`, `conflicting`, `rejected` plus active/inactive                                                                          |
| KnownPath            | `draft`, `review`, `published`, `deprecated`, `superseded`, `archived`                                                                |
| Contribution         | `pending`, `accepted`, `rejected`, `superseded`                                                                                       |
| Moderation           | `unreviewed`, `approved`, `flagged`, `rejected`                                                                                       |
| Agent outcome        | `solved`, `partially_helped`, `attempted_failed`, `incompatible_environment`, `stale_or_outdated`, `misleading_or_unsafe`, `not_used` |
| Safety review        | `clear`, `review_queued`, `under_review`, `resolved`, `restricted`                                                                    |
| Source item state    | `active`, `deprecated`, `deleted`                                                                                                     |

## Indexing strategy

All ordinary indexes have explicit names and are reconciled idempotently. The main index families
are:

- unique normalized identity, credential prefix/digest, source-native identity, and idempotency
  keys;
- lifecycle/status plus update or creation time for work queues and administration;
- partial owner/workspace indexes for tenant-scoped reads;
- source registry/type/time and document authority/framework/version indexes;
- ecosystem, package, platform, version, error fingerprint, and error-code indexes;
- candidate blocking/profile and pair-decision indexes;
- canonical membership, revision, assessment, outcome, and safety-history indexes;
- pipeline pending/stale/quarantine and worker liveness indexes; and
- one local weighted text index over safe search projection fields.

No compound ordinary index combines multiple array fields, avoiding parallel-array multikey
restrictions. Candidate embeddings have ordinary metadata indexes only. Atlas deployments manage
`knownpath_lexical_v1` (`search`) and `knownpath_vector_v1` (`vectorSearch`) through MongoDB's
search index lifecycle; they are not ordinary `createIndexes` entries. Their filters include
lifecycle and scope fields before retrieval. See [Retrieval](RETRIEVAL.md).

## Validation and initialization

```sh
pnpm db:init
pnpm db:inspect
pnpm db:verify
```

`db:init` creates missing collections, reapplies critical validators with `collMod`, and reconciles
named indexes. Repeating it with the same definitions is safe. Zod remains the complete validator;
MongoDB validators enforce critical envelopes as defense in depth.

`db:verify` performs a uniquely marked repository-layer insert/read/update/read/delete round trip
and removes the temporary record. It does not seed product knowledge.

## Retention intent

Source snapshots, extraction attempts, immutable assessments, canonicalization events/revisions,
sanitized contributions, outcomes, safety events, and audits are retained for provenance and
reproducibility until an operator adopts an explicit archive/deletion policy. Mutable source states
and search projections are rebuildable. API keys use revoke/expire state. Authentication records
expire logically. BullMQ diagnostics have shorter configurable retention because Valkey is not the
source of truth.

Official source content is retained internally with attribution/license metadata. User-facing
KnownPaths generalize the lesson and link to provenance rather than republishing complete source
pages.
