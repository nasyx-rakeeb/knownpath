# KnownPath Data Model

## Scope

This document is the Phase 6 reference for KnownPath's durable domain contracts and MongoDB
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

| Collection              | Lifecycle and relationship                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `users`                 | Independent account identity referenced by API keys and optional audit/ownership fields.       |
| `api_keys`              | Independent credential lifecycle; references one user and stores a hash, never the raw key.    |
| `auth_sessions`         | Better Auth server-side sessions; independently revocable and expiring.                        |
| `auth_accounts`         | Better Auth provider credentials; Phase 3 stores only scrypt password accounts.                |
| `auth_verifications`    | Better Auth verification primitives reserved for deliberately enabled future flows.            |
| `audit_events`          | Append-only sensitive-action history without credential material.                              |
| `source_registries`     | Independently managed source identity/configuration and ingestion cursor.                      |
| `source_items`          | Immutable captured snapshot; references one source registry.                                   |
| `source_item_states`    | Mutable latest/fetch projection; one per registry and source-native identity.                  |
| `ingestion_runs`        | Mutable operational attempt history; references one source registry.                           |
| `extraction_attempts`   | Independent AI lifecycle keyed by source/context/prompt/provider versions.                     |
| `candidate_experiences` | Extracted, reviewable problem/solution candidate with embedded bounded evidence references.    |
| `known_paths`           | Canonical reusable knowledge record with embedded solution, evidence, score, and search state. |
| `agent_contributions`   | Independent proposed lesson/correction; may reference a KnownPath and source items.            |
| `agent_outcomes`        | Independent usefulness report referencing one KnownPath.                                       |

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

### Confidence, freshness, and search state

Confidence contains an aggregate from 0 to 1, named components, `scoreVersion`, calculation time,
and bounded verification signals. It belongs only to canonical KnownPaths. Phase 6 candidates do not
contain numeric confidence or freshness, preventing model interpretation from becoming a final trust
score before Phase 7.

Freshness records last verification, next review, and stale-after timestamps. Search metadata is
provider-neutral and records lexical/embedding processing status, model identifier, dimensions,
content digest, and generation time. No vectors or vector indexes exist in Phase 2.

## Lifecycle values

| Entity               | Values                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| User                 | `active`, `suspended`, `deleted`                                                                                                    |
| API key              | `active`, `revoked`, `expired`                                                                                                      |
| Ingestion run        | `queued`, `running`, `succeeded`, `failed`, `cancelled`                                                                             |
| Extraction attempt   | `queued`, `running`, `succeeded`, `irrelevant`, `insufficient_evidence`, `conflicting_evidence`, `quarantined`, `blocked`, `failed` |
| Candidate experience | `pending`, `accepted`, `rejected`, `superseded`, `failed`                                                                           |
| KnownPath            | `draft`, `published`, `deprecated`, `superseded`, `archived`                                                                        |
| Contribution         | `pending`, `accepted`, `rejected`, `superseded`                                                                                     |
| Moderation           | `unreviewed`, `approved`, `flagged`, `rejected`                                                                                     |
| Agent outcome        | `helpful`, `not_helpful`, `partially_helpful`, `unknown`                                                                            |
| Source item state    | `active`, `deprecated`, `deleted`                                                                                                   |

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

### `agent_contributions`

- `uq_agent_contributions_deduplication_key`: unique submission deduplication.
- `ix_agent_contributions_status_created_at`: processing/moderation queue.
- `ix_agent_contributions_known_path_created_at`: partial chronological target history.

### `agent_outcomes`

- `uq_agent_outcomes_deduplication_key`: unique outcome deduplication.
- `ix_agent_outcomes_known_path_created_at`: outcome history for a KnownPath.
- `ix_agent_outcomes_outcome_created_at`: analysis by result and time.

Array indexes remain separate: no compound index combines two array fields, avoiding MongoDB's
parallel-array multikey restriction. No text, TTL, wildcard, geospatial, or vector indexes are
created through Phase 6. Source ingestion/extraction adds no text or vector index.

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
- Users and knowledge use lifecycle/moderation states for soft removal.
- Authentication sessions and verification records expire logically; no TTL deletion policy is
  imposed before operational retention requirements exist.
- Audit events are retained until a future compliance/privacy policy defines archival or deletion.
- Failed operational runs may later receive a TTL/archive policy, but Phase 2 has insufficient usage
  evidence to choose one.
- Extraction attempts and candidates are retained for reproducibility and review until measured
  volume and privacy requirements justify an explicit archive/purge policy.

## Deferred model behavior

The schemas do not imply that scoring, canonical promotion, verification, search, MCP, contribution
promotion, public registration, recovery, OAuth, team membership, or dashboards are implemented.
Team IDs remain opaque until the team/workspace model exists. Semantic deduplication and vector
storage/indexing belong to later phases.
