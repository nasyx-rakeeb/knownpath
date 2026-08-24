# KnownPath Data Model

## Scope

This document is the Phase 16 reference for KnownPath's durable domain contracts and MongoDB
persistence model. It describes structures that exist now, even when the later workflow that will
populate them is intentionally absent.

The runtime schemas live in `@knownpath/domain`. MongoDB connection management, validators,
repositories, indexes, and initialization live in `@knownpath/database`.

## Conventions

- KnownPath-owned entities use branded UUID v4 string IDs and `schemaVersion: 1`. Better Auth core
  session/account/verification records use UUID string IDs but retain the framework's own schema.
- Persisted timestamps are BSON `Date` values. Runtime schemas also accept ISO 8601 timestamps at
  external boundaries and normalize them to `Date`.
- Domain aggregates normally use `audit.createdAt` and `audit.updatedAt`. Better Auth-compatible
  users use root `createdAt`/`updatedAt`; append-only audit events use `occurredAt`.
- Zod is the authoritative complete runtime validator. MongoDB uses strict/error envelope validators
  for critical identifiers, versions, timestamps, lifecycle values, and ownership fields.
- Deterministic keys contain `{ value, version }`, where `value` is a SHA-256 digest of a versioned,
  ordered canonical tuple.
- Visibility is `public`, `private`, or `team`. Private records require `ownerUserId`; team records
  require an opaque `teamId`.
- Lifecycle/moderation state is soft. Phase 2 defines no automatic deletion or TTL indexes.

## Collections and relationships

| Collection                       | Lifecycle and relationship                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `users`                          | Independent account identity referenced by API keys and optional audit/ownership fields.          |
| `api_keys`                       | Independent credential lifecycle; references one user and stores a hash, never the raw key.       |
| `auth_sessions`                  | Better Auth server-side sessions; independently revocable and expiring.                           |
| `auth_accounts`                  | Better Auth provider credentials; Phase 3 stores only scrypt password accounts.                   |
| `auth_verifications`             | Better Auth verification primitives reserved for deliberately enabled future flows.               |
| `audit_events`                   | Append-only sensitive-action history without credential material.                                 |
| `source_registries`              | Independently managed source identity/configuration and ingestion cursor.                         |
| `source_items`                   | Immutable captured snapshot; references one source registry.                                      |
| `source_item_states`             | Mutable latest/fetch projection; one per registry and source-native identity.                     |
| `ingestion_runs`                 | Mutable operational attempt history; references one source registry.                              |
| `extraction_attempts`            | Independent AI lifecycle keyed by source/context/prompt/provider versions.                        |
| `candidate_experiences`          | Extracted, reviewable problem/solution candidate with embedded bounded evidence references.       |
| `candidate_assessments`          | Immutable verification/score history; references one candidate and exact source inputs.           |
| `candidate_similarity_profiles`  | Immutable normalized identifiers, shingles, fingerprints, and blocking keys.                      |
| `candidate_embeddings`           | Immutable provider/model/versioned vectors for public blocked candidates; no vector index.        |
| `candidate_pair_assessments`     | Immutable deterministic/semantic comparison and merge/review/separate decision.                   |
| `canonical_memberships`          | Current supporting/conflicting/rejected candidate relationships to stable KnownPaths.             |
| `canonicalization_events`        | Append-only requested/completed merge, split, reassign, and rebuild audit history.                |
| `known_path_revisions`           | Immutable complete canonical snapshots keyed by membership/assessment/builder inputs.             |
| `known_paths`                    | Stable current canonical projection with solution variants, evidence, trust, and latest revision. |
| `known_path_search_documents`    | Rebuildable versioned retrieval projection with one active row per KnownPath/model tuple.         |
| `knowledge_search_events`        | Bounded search/selection usage metadata; explicitly not a technical outcome.                      |
| `agent_contributions`            | Independent proposed lesson/correction; may reference a KnownPath and source items.               |
| `agent_outcomes`                 | Immutable private observed-result reports referencing one KnownPath revision.                     |
| `known_path_outcome_assessments` | Immutable deterministic reliability/trend history for one KnownPath revision.                     |
| `known_path_safety_events`       | Immutable safety-review state transitions, separate from ranking and lifecycle.                   |
| `pipeline_runs`                  | Durable operator/API/scheduler pipeline intent, aggregate state, and safe counters.               |
| `pipeline_steps`                 | Durable idempotent job intent and lifecycle; BullMQ delivery is an ephemeral projection.          |
| `worker_heartbeats`              | Short-lived worker availability projection with a MongoDB TTL index.                              |

Source registries, immutable source snapshots, processing runs, candidates, canonical records,
contributions, and outcomes are separate because they grow and change independently. Bounded problem
metadata, solution steps, evidence references, visibility, and moderation are embedded for read
locality. Score components, freshness, and search state exist only on canonical KnownPaths.

### Identity, sessions, and API keys

`users` is the single identity source for both KnownPath authorization and Better Auth. It retains a
UUID string `_id`, normalized email, display name, email-verification placeholder, `user`/`admin`
role, active/suspended/deleted status, optional soft-ban fields, and root timestamps. A custom
Better Auth ID function preserves UUIDs as strings; its MongoDB adapter's built-in `"uuid"` mode
would store BSON UUID values and is intentionally not used.

Password material lives only in `auth_accounts` and is hashed by Better Auth with scrypt. Session
tokens live only in `auth_sessions` and HttpOnly cookies. `auth_verifications` exists because it is
a core framework lifecycle with independent expiration, although Phase 3 exposes no email
verification or password-reset flow.

API keys store `prefix`, keyed SHA-256 digest, digest version, fixed scopes, lifecycle status,
optional expiration/revocation, and throttled last-use time. A plaintext key has the form
`kp_<public-id>_<random-secret>` and is returned only on issuance or rotation. The key digest is an
HMAC using a server-held pepper, not a password hash: the credential already contains 256 bits of
random secret entropy and needs deterministic verification.

Audit events record type/time, actor, target, outcome, optional request ID/network address, and
bounded string metadata. Passwords, cookies, session tokens, plaintext keys, digests, and
Authorization headers are forbidden audit metadata.

## Important embedded structures

### Source provenance

A source item retains its registry ID, source-native identity, canonical URL, optional observed
revision and author, observed/published/captured timestamps, content digest, media type, byte
length, and either bounded text or an external content reference. Captured content is immutable.

Phase 4 stores GitHub `issue`, `issue_comment`, `discussion`, and `discussion_comment` snapshots.
Comments and replies carry both root and parent source-native identities so a future extractor can
reconstruct threads without embedding unbounded comment arrays. `providerMetadata` is a versioned,
provider-namespaced JSON boundary containing objective GitHub metadata such as immutable database
and node IDs, repository identity, author association, labels, state, reactions, answer state,
closing pull-request references, and edit timestamps. Source body text is untrusted Markdown and is
never interpreted as instructions by the collector.

GitHub source registries store independent issue/discussion updated-time cursors plus REST ETag
metadata. Ingestion counters always include `discovered`, `created`, `updated`, `unchanged`,
`failed`, and `rateLimited`; bounded provider counters such as `issues`, `discussions`,
`conditionalNotModified`, and `capabilitySkipped` may be added.

Phase 5 adds `documentation_page`, `release_note`, and catalog snapshots. Official documents embed
deterministic `sourceQuality`, `documentMetadata`, and bounded `structuredBlocks`. Source quality
records first-party/maintainer/community/general-public authority, its objective classification
basis, and publisher. Document metadata records type, ecosystem, framework, detectable versions,
optional index section, attribution URL, and license. Supported block kinds are heading, paragraph,
code, list, table, blockquote, and admonition. Raw website HTML and navigation chrome are not
stored.

`source_item_states` is intentionally mutable and does not replace provenance snapshots. Its unique
registry/native-identity row points to the latest snapshot and stores lifecycle, canonical URL,
normalized snapshot digest, ETag, Last-Modified, observed revision, `lastFetchedAt`,
`lastChangedAt`, and `lastObservedAt`. Conditional `304` responses and equal normalized hashes
advance fetch state without inserting another immutable source item. Documentation absence can
become `deleted` only after a complete authoritative index comparison; rolling-feed absence never
implies deletion.

### Ecosystem, package, platform, and environment

Candidate and KnownPath documents embed normalized projections for their primary ecosystem and
package plus bounded arrays of package coordinates, platforms, version strings, runtime facts,
operating systems, architectures, frameworks, toolchain facts, and string extensions. Original
package values remain available beside their normalized names.

### Problem and solution

Symptoms contain original summaries and normalized text. Error signatures retain bounded original
and normalized material plus a versioned fingerprint. Solutions contain a summary and ordered,
bounded steps with optional code, language, and verification guidance.

Phase 6 candidates can additionally retain an evidence-grounded root cause, failed/partial attempted
approaches, caveats, conflicting references, and unverified author/maintainer/official-support label
candidates. These are model interpretations with validated provenance, not verified facts or final
scoring inputs.

### Evidence

Evidence is a bounded array of references to immutable source items. A reference describes whether
the item supports the problem, supports the solution, verifies an outcome, conflicts, or supplies
context. It may include a locator, bounded excerpt, URL, and content digest; it does not duplicate
the source document.

### Candidate assessments, canonicalization, confidence, freshness, and search state

Each Phase 7 `candidate_assessments` document is immutable and records candidate/source digests,
algorithm/policy/verifier versions, evaluation time, verified evidence signals, independent
source-evidence/freshness/version-fit/outcome components, an integer 0–100 seed score, grade, caps,
reason codes, and explanations. Candidates store only `latestAssessmentId` as a mutable fast-path
pointer; rescoring never overwrites history. `ineligible` records preserve integrity failures at
score 0. Agent outcome confidence is explicitly `unobserved` in Phase 7; its future observed shape
requires successes/failures/sample size and Wilson interval metadata.

Phase 8 maps immutable candidate assessments into canonical trust without inventing another score.
Each solution variant and KnownPath stores its representative assessment ID, every contributing
assessment ID, score/grade/version, and deterministic projection time. Multiple valid solutions
remain separate variants with their own steps, caveats, applicability, evidence, and membership.

Similarity profiles and embeddings are immutable and idempotent over their complete versioned
inputs. Pair assessments store deterministic agreement/incompatibility metrics separately from the
optional semantic cosine value. Semantic similarity cannot produce an automatic merge without all
deterministic gates.

Current membership rows are independently mutable because candidates may be split or reassigned.
Append-only canonicalization events and immutable KnownPath revisions preserve the complete audit
trail. `known_paths.latestRevisionId` is a fast projection pointer, not historical truth.

Freshness records last verification, next review, and stale-after timestamps. Search metadata is
provider-neutral and records lexical/embedding processing status. Candidate vectors remain ordinary
pair-comparison documents. Phase 9 search projections additionally store bounded normalized text,
error codes/classes/fingerprints, applicability, trust pointers, visibility/lifecycle, and one
provider/model/version/dimension-specific vector. Superseded projections are retired rather than
overwritten; the projection can be rebuilt from a KnownPath revision and assessments.

## Lifecycle values

| Entity               | Values                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| User                 | `active`, `suspended`, `deleted`                                                                                                      |
| API key              | `active`, `revoked`, `expired`                                                                                                        |
| Ingestion run        | `queued`, `running`, `succeeded`, `failed`, `cancelled`                                                                               |
| Extraction attempt   | `queued`, `running`, `succeeded`, `irrelevant`, `insufficient_evidence`, `conflicting_evidence`, `quarantined`, `blocked`, `failed`   |
| Candidate experience | `pending`, `accepted`, `rejected`, `superseded`, `failed`                                                                             |
| Candidate assessment | `completed`, `ineligible`                                                                                                             |
| Pair assessment      | `auto_merge`, `review`, `separate`                                                                                                    |
| Canonical membership | `supporting`, `conflicting`, `rejected` plus active/inactive projection                                                               |
| KnownPath            | `draft`, `review`, `published`, `deprecated`, `superseded`, `archived`                                                                |
| Contribution         | `pending`, `accepted`, `rejected`, `superseded`                                                                                       |
| Moderation           | `unreviewed`, `approved`, `flagged`, `rejected`                                                                                       |
| Agent outcome v2     | `solved`, `partially_helped`, `attempted_failed`, `incompatible_environment`, `stale_or_outdated`, `misleading_or_unsafe`, `not_used` |
| Safety review        | `clear`, `review_queued`, `under_review`, `resolved`, `restricted`                                                                    |
| Source item state    | `active`, `deprecated`, `deleted`                                                                                                     |

Source registries use an `enabled` flag because disabling a configured source is distinct from a
processing lifecycle transition. Source items are immutable and therefore have no processing status.

## Extraction attempts

`extraction_attempts` is the durable operational ledger for Phase 6. It records target and selected
source IDs/hashes, context version/digest, strategy, provider/model/data capability, prompt
identifiers/versions/digests, output-schema version, generation-config digest, estimated input
tokens, status/timestamps, retry count, latency, provider interaction ID, reported token usage,
optional candidate ID, response digest, and bounded validation/failure metadata.

The unique idempotency key covers every input or configuration dimension that can alter model
behavior. Terminal matches are reused without another provider call. Attempts have an independent
lifecycle because they can be reprocessed, inspected, quarantined, or retained when no candidate
exists. Blocked privacy attempts contain no source body/provider response, and raw invalid output is
not retained.

## Index inventory

All names are explicit and initialization is idempotent. `_id_` is MongoDB's automatic primary index
and is omitted below.

### `users`

- `uq_users_email`: Better Auth's unique canonical email lookup.
- `uq_users_normalized_email`: unique normalized-email lookup.
- `ix_users_status_updated_at_v2`: lifecycle administration ordered by root update timestamp.

### `api_keys`

- `uq_api_keys_prefix`: unique public key-identifier lookup before digest comparison.
- `uq_api_keys_key_hash`: unique authentication lookup by key digest.
- `ix_api_keys_user_status_created_at`: a user's keys by status and creation time.

### `auth_sessions`

- `uq_auth_sessions_token`: unique session-token lookup.
- `ix_auth_sessions_user_expires_at`: active-session listing for one user.
- `ix_auth_sessions_expires_at`: expiration maintenance lookup; not a TTL index.

### `auth_accounts`

- `auth_accounts_issuer_accountId_uidx`: Better Auth's required unique provider identity.
- `ix_auth_accounts_user_provider`: credential/provider lookup for one user.

### `auth_verifications`

- `ix_auth_verifications_identifier`: verification lookup.
- `ix_auth_verifications_expires_at`: expiration maintenance lookup; not a TTL index.

### `audit_events`

- `ix_audit_actor_time`: actor history in reverse chronology.
- `ix_audit_target_time`: target history in reverse chronology.
- `ix_audit_event_type_time`: action-category history.
- `ix_audit_request_id`: partial correlation lookup when a request ID exists.

Phase 10 adds `knowledge.review_searched` and `knowledge.review_read`. Their API-key actor and
request/target metadata make explicit review access inspectable without storing credentials or raw
query/source text.

### `source_registries`

- `uq_source_registries_identity_key`: unique deterministic source identity.
- `ix_source_registries_enabled_kind_updated_at`: scheduling and administration.
- `ix_source_registries_visibility_owner`: partial private-owner lookup.
- `ix_source_registries_visibility_team`: partial team lookup.

### `source_items`

- `uq_source_items_deduplication_key`: unique immutable-snapshot deduplication.
- `ix_source_items_registry_captured_at`: snapshot history for a registry.
- `ix_source_items_registry_identity_captured_at`: native item revision history.
- `ix_source_items_registry_type_observed_at`: incremental inspection by registry, object type, and
  provider observation time.
- `ix_source_items_authority_ecosystem_document_type_captured_at`: authoritative evidence filtering
  by ecosystem/document type and recency; partial to document snapshots.
- `ix_source_items_framework_versions_captured_at`: framework/version document history; partial to
  document snapshots.

### `source_item_states`

- `uq_source_item_states_registry_identity`: one mutable synchronization state per native identity.
- `ix_source_item_states_registry_lifecycle_fetched_at`: refresh and authoritative deletion scans.
- `ix_source_item_states_registry_document_type_versions`: targeted document/version operations.

### `ingestion_runs`

- `uq_ingestion_runs_deduplication_key`: unique run-request deduplication.
- `ix_ingestion_runs_status_next_attempt_created_at`: runnable work polling.
- `ix_ingestion_runs_registry_created_at`: run history for a source.

### `candidate_experiences`

- `uq_candidate_experiences_deduplication_key`: unique candidate deduplication.
- `ix_candidate_experiences_status_created_at`: processing/review queue.
- `ix_candidate_experiences_ecosystem_package`: ecosystem/package lookup.
- `ix_candidate_experiences_error_fingerprints`: normalized error lookup.

### `candidate_assessments`

- `uq_candidate_assessments_idempotency_key`: prevents duplicate assessments for identical
  candidate/source material, algorithm/policy/verifier versions, policy digest, and evaluation time.
- `ix_candidate_assessments_candidate_evaluated_at`: immutable candidate history in reverse
  evaluation order.
- `ix_candidate_assessments_algorithm_policy_evaluated_at`: audit and comparison by scoring logic.
- `ix_candidate_assessments_status_score`: review ineligible/completed records by seed score.
- `ix_candidate_assessments_source_item_evaluated_at`: find assessments affected by a source item.

### `candidate_similarity_profiles`

- `uq_candidate_similarity_profiles_idempotency_key`: one immutable result for identical candidate
  content and normalizer/profile versions.
- `ix_candidate_similarity_profiles_candidate_normalizer_generated_at`: profile history by candidate
  and normalizer.
- `ix_candidate_similarity_profiles_blocking_normalizer`: multikey lookup for plausible pairs
  sharing a versioned deterministic blocking key.
- `ix_candidate_similarity_profiles_error_ecosystem`: exact normalized error/ecosystem lookup.

### `candidate_embeddings`

- `uq_candidate_embeddings_idempotency_key`: one immutable vector for identical public input and
  provider/model/version/dimension configuration.
- `ix_candidate_embeddings_candidate_profile_model_generated_at`: vector history and regeneration
  lookup.
- `ix_candidate_embeddings_input_model`: reuse/audit lookup by input digest and model.

These are ordinary MongoDB indexes. Phase 8 creates no vector index.

### `candidate_pair_assessments`

- `uq_candidate_pair_assessments_idempotency_key`: immutable comparison reuse for identical pair,
  profiles, policy, and optional embeddings.
- `ix_candidate_pair_assessments_pair_policy_evaluated_at`: pair history across policy versions.
- `ix_candidate_pair_assessments_decision_semantic_evaluated_at`: review/merge queue with semantic
  availability.
- `ix_candidate_pair_assessments_candidates`: multikey candidate impact lookup.

### `canonical_memberships`

- `ix_canonical_memberships_relationship`: relationship history for a candidate and KnownPath.
- `uq_canonical_memberships_active_supporting_candidate`: at most one active supporting KnownPath
  per candidate.
- `ix_canonical_memberships_known_path_active_disposition_solution`: current canonical rebuild input
  ordered by relationship and solution key.
- `ix_canonical_memberships_candidate_active_disposition`: candidate assignment lookup.
- `ix_canonical_memberships_operation`: all membership changes made by an operation.

### `canonicalization_events`

- `uq_canonicalization_events_idempotency_key`: idempotent append-only event creation.
- `uq_canonicalization_events_operation_sequence`: deterministic ordered operation journal.
- `ix_canonicalization_events_known_path_time`: KnownPath history.
- `ix_canonicalization_events_candidate_time`: candidate history.
- `ix_canonicalization_events_type_time`: operational/audit filtering.

### `known_path_revisions`

- `uq_known_path_revisions_idempotency_key`: immutable snapshot reuse for identical canonical
  inputs.
- `uq_known_path_revisions_number`: monotonic revision identity within a KnownPath.
- `ix_known_path_revisions_known_path_created_at`: chronological revision history.
- `ix_known_path_revisions_candidates`: candidate impact lookup.
- `ix_known_path_revisions_assessments`: assessment impact lookup.

### `extraction_attempts`

- `uq_extraction_attempts_idempotency_key`: prevents duplicate charged work for identical inputs and
  extraction configuration.
- `ix_extraction_attempts_status_created_at`: processing, quarantine, and operational inspection.
- `ix_extraction_attempts_target_created_at`: chronological history for one source target.
- `ix_extraction_attempts_registry_status_created_at`: source-scoped operational triage.

### `known_paths`

- `uq_known_paths_canonical_key`: unique canonical identity.
- `ix_known_paths_status_visibility_confidence_freshness`: publication/review listing.
- `ix_known_paths_visibility_owner_status_updated_at`: partial private-owner listing.
- `ix_known_paths_visibility_team_status_updated_at`: partial team listing.
- `ix_known_paths_ecosystem_package_status`: canonical package lookup.
- `ix_known_paths_platforms`: platform filtering.
- `ix_known_paths_version_strings`: version filtering.
- `ix_known_paths_error_fingerprints`: normalized error lookup.
- `ix_known_paths_freshness_status`: stale-record review.
- `ix_known_paths_latest_revision`: current-projection pointer lookup.

### `known_path_search_documents`

- `uq_known_path_search_documents_idempotency`: reuses an identical canonical revision/content,
  projection/input version, provider/model/version/dimensions, and embedding mode.
- `uq_known_path_search_documents_active_model`: partial unique constraint allowing only one active
  projection per KnownPath/model/version/dimension tuple.
- `ix_known_path_search_documents_scope_status_trust`: visibility/lifecycle filtering and trust
  ordering.
- `ix_known_path_search_documents_ecosystem_packages`: deterministic ecosystem/package blocking.
- `ix_known_path_search_documents_platforms`: deterministic platform blocking.
- `ix_known_path_search_documents_error_fingerprints`: exact normalized-error lookup.
- `ix_known_path_search_documents_error_codes`: exact technical identifier lookup.
- `tx_known_path_search_documents_v1`: weighted local text fallback over title, problem, normalized
  errors, solutions, and bounded searchable text.

Atlas deployments separately manage `knownpath_lexical_v1` (`type: search`) and
`knownpath_vector_v1` (`type: vectorSearch`) through `listSearchIndexes`/`createSearchIndexes`.
These are not ordinary `createIndexes` entries and are unavailable on the default local standalone
MongoDB path. Their exact definitions are documented in [`docs/RETRIEVAL.md`](RETRIEVAL.md).

### `knowledge_search_events`

- `ix_search_events_user_created`: account usage history in reverse chronological order.
- `ix_search_events_api_key_created`: API-key usage history when a key principal exists.
- `uq_search_events_request_id`: one search execution event per HTTP request ID.
- `ix_search_events_selection`: selected KnownPath/time navigation when a selection exists.
- `ix_search_events_access_created`: operational inspection by published/review access mode.

Each event stores principal IDs, effective access mode, request ID, HMAC-SHA-256 query digest and
digest version, bounded filter counts, returned KnownPath IDs/ranks/scores, and at most one selected
result. It never stores a plaintext API key, raw query, embedding, raw source, or success/failure
outcome. Selection updates only the bounded usage record and does not create an `agent_outcome`.

### `agent_contributions`

- `uq_agent_contributions_deduplication_key`: unique submission deduplication.
- `uq_agent_contributions_owner_submission_v2`: one schema-v2 client submission ID per owner.
- `ix_agent_contributions_status_created_at`: processing/moderation queue.
- `ix_agent_contributions_owner_visibility_status_created_at_v2`: owner inspection and privacy-safe
  status history.
- `ix_agent_contributions_processing_stage_updated_at_v2`: resumable processing work.
- `ix_agent_contributions_candidate_v2`: navigation to the derived candidate.
- `ix_agent_contributions_known_path_created_at`: partial chronological target history.

Schema-v2 records retain a sanitized structured lesson, HMAC digest of the original request,
sanitized content digest, consent policy/intent/time, sanitizer findings, contributor/API-key IDs,
visibility, moderation, and processing pointers. The unsanitized body is never stored. Each accepted
payload creates an immutable `agent_contribution` source item and a pending candidate with explicit
contribution provenance. Assessments remain immutable and the candidate's `latestAssessmentId`
points to the newest score. Self-reported contributions are capped below high trust and cannot enter
canonical records without future explicit moderation approval.

### `agent_outcomes`

- `uq_agent_outcomes_deduplication_key_legacy`: schema-v1 outcome deduplication only.
- `ix_agent_outcomes_known_path_created_at`: outcome history for a KnownPath.
- `ix_agent_outcomes_outcome_created_at`: analysis by result and time.
- `uq_agent_outcomes_owner_client_v2`: idempotent client outcome per account.
- `uq_agent_outcomes_owner_execution_target_v2`: one report per account/execution/KnownPath.
- `ix_agent_outcomes_api_key_received_v2`: durable per-key throttling.
- `ix_agent_outcomes_user_received_v2`: durable per-account throttling and history.

Schema-v2 records capture the exact KnownPath revision, private reporter/account/key provenance,
client idempotency/execution IDs, normalized environment and version bucket, observed state,
sanitized optional note, influence eligibility, anomaly reasons, and request digest. `not_used` is
retained with zero evidence weight. A 30-day account/KnownPath/version influence cap prevents repeat
submissions from dominating while preserving the immutable audit record.

### `known_path_outcome_assessments`

- `uq_outcome_assessments_idempotency`: exact algorithm/policy/input reuse.
- `ix_outcome_assessments_known_path_calculated`: immutable history newest first.
- `ix_outcome_assessments_policy_calculated`: algorithm/policy migration and recomputation.
- `ix_outcome_assessments_confidence_trend`: operational reliability/revalidation inspection.

Every assessment stores all input outcome IDs, algorithm and policy versions/digest, calculated
time, complete counts, recency weights/effective sample size, Wilson intervals, confidence,
success/failure timestamps, version distribution, trend, penalties, reason codes, and explanations.
`known_paths.latestOutcomeAssessmentId` and `latestOutcomeAssessedAt` are mutable fast pointers;
history is never overwritten.

### `known_path_safety_events`

- `uq_safety_events_idempotency`: one immutable transition per triggering action.
- `ix_safety_events_known_path_occurred`: safety history for one record.
- `ix_safety_events_type_occurred`: moderation queue/operations by event type.

`known_paths.safetyReview` projects the latest separate safety state. A single unverified safety
report queues review without directly changing confidence, lifecycle, moderation, visibility, or
ranking. Corroboration/moderation policy is documented in [`OUTCOMES.md`](OUTCOMES.md).

KnownPath indexes `latestOutcomeAssessmentId` for assessment navigation and
`safetyReview.status/latestEventAt` for review queues. Search projections embed only safe aggregate
outcome fields; they never contain reporter IDs or notes.

Array indexes remain separate: no compound index combines two array fields, avoiding MongoDB's
parallel-array multikey restriction. Phase 9 adds one ordinary weighted text index. The only TTL
index expires ephemeral worker heartbeats; no product entity uses TTL. Vector Search is an explicit
Atlas-only lifecycle.

### `pipeline_runs`, `pipeline_steps`, and `worker_heartbeats`

Pipeline runs record kind, trigger, requested target, aggregate counters, safe last error, and
timestamps. Steps record the run, typed job/queue, target, versioned idempotency key, payload
digest, bounded ID/options payload, BullMQ job ID, processing versions, attempts, state, and
quarantine reason. Payloads may contain identifiers and processing controls only; source text and
credentials remain in their owning collections/configuration.

- `pipeline_runs`: status/update, kind/created, and target/created indexes support operations views.
- `pipeline_steps`: unique idempotency and BullMQ-job indexes prevent duplicate dispatch; run/state,
  target/job, pending/stale, and quarantine indexes support reconciliation and inspection.
- `worker_heartbeats`: state/time supports liveness views; `expiresAt` uses `expireAfterSeconds: 0`
  because heartbeats are ephemeral coordination, not business evidence.

Run and step records are retained for audit until an explicit volume-based archival policy is
adopted. BullMQ retention is shorter and configurable because Valkey is not the source of truth.

## Initialization and inspection

With `.env` configured and MongoDB running:

```sh
pnpm db:init
pnpm db:inspect
pnpm db:verify
```

`db:init` creates missing collections, reapplies current validators with `collMod`, and requests all
named indexes. A same-spec repeated initialization is safe. Phase 3 includes one explicit,
name-bounded migration from the pre-integration auth-account index name to Better Auth's required
generated name; other index-name/specification conflicts still fail visibly.

`db:verify` uses `SourceRegistryRepository` for a uniquely marked insert/read/update/read/delete
round trip and confirms cleanup. It does not seed production knowledge.

## Retention intent

- Source snapshots, successful ingestion history, canonical knowledge, contributions, and outcomes
  are retained until a future policy says otherwise.
- Source items are immutable; corrections create a new snapshot.
- Source-item state is mutable operational metadata. It can be rebuilt from retained snapshots and
  fresh source discovery, while its validators and fetch timestamps prevent unnecessary work.
- GitHub cursors and ETags are mutable scheduling state, not provenance. Snapshots and successful
  run history are retained; a future policy must explicitly define archival.
- Official catalogs and normalized documents are retained internally with canonical attribution and
  license metadata. Future user-facing knowledge must generalize the material and link to sources,
  not mirror complete copyrighted pages. Physical purge automation remains deferred.
- API keys are revoked/expired rather than silently deleted.
- Sanitized contribution/audit history is retained for accountability; rejected pre-persistence
  bodies are not retained. Automated contribution deletion is deferred to a user-data lifecycle
  phase.
- Users and knowledge use lifecycle/moderation states for soft removal.
- Authentication sessions and verification records expire logically; no TTL deletion policy is
  imposed before operational retention requirements exist.
- Audit events are retained until a future compliance/privacy policy defines archival or deletion.
- Pipeline runs/steps have no TTL. A later measured-volume policy may archive them; worker
  heartbeats alone expire automatically.
- Extraction attempts, candidates, and immutable candidate assessments are retained for
  reproducibility, audit, and score-version comparison until measured volume and privacy
  requirements justify an explicit archive/purge policy.
- Similarity profiles, public embeddings, pair assessments, canonical events, and KnownPath
  revisions are retained to reproduce deduplication decisions. Memberships may become inactive but
  remain as assignment history; canonical projections are not historical truth.
- Search documents are derived projections. Retired versions may be archived or purged by a future
  explicit operational policy because revision, assessment, content-hash, and model metadata make
  them reproducible; Phase 9 adds no automatic deletion.

## Deferred model behavior

The schemas do not imply that HTTP/MCP search exposure, contribution promotion, public registration,
recovery, OAuth, team membership, or dashboards are implemented. Team IDs remain opaque until the
team/workspace model exists. Candidate embeddings still support only blocked pair comparison;
KnownPath search projections are the separate Phase 9 retrieval corpus.
