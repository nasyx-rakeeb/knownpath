# KnownPath Data Model

## Scope

This document is the Phase 2 reference for KnownPath's durable domain contracts and MongoDB
persistence model. It describes structures that exist now, even when the later workflow that will
populate them is intentionally absent.

The runtime schemas live in `@knownpath/domain`. MongoDB connection management, validators,
repositories, indexes, and initialization live in `@knownpath/database`.

## Conventions

- Every entity uses a branded UUID v4 string as `_id` and carries `schemaVersion: 1`.
- Persisted timestamps are BSON `Date` values. Runtime schemas also accept ISO 8601 timestamps at
  external boundaries and normalize them to `Date`.
- `audit.createdAt` and `audit.updatedAt` are required on every entity.
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
| `source_registries`     | Independently managed source identity/configuration and ingestion cursor.                      |
| `source_items`          | Immutable captured snapshot; references one source registry.                                   |
| `ingestion_runs`        | Mutable operational attempt history; references one source registry.                           |
| `candidate_experiences` | Extracted, reviewable problem/solution candidate with embedded bounded evidence references.    |
| `known_paths`           | Canonical reusable knowledge record with embedded solution, evidence, score, and search state. |
| `agent_contributions`   | Independent proposed lesson/correction; may reference a KnownPath and source items.            |
| `agent_outcomes`        | Independent usefulness report referencing one KnownPath.                                       |

Source registries, immutable source snapshots, processing runs, candidates, canonical records,
contributions, and outcomes are separate because they grow and change independently. Bounded problem
metadata, solution steps, score components, evidence references, visibility, moderation, freshness,
and search state are embedded for read locality.

## Important embedded structures

### Source provenance

A source item retains its registry ID, source-native identity, canonical URL, optional observed
revision and author, observed/published/captured timestamps, content digest, media type, byte
length, and either bounded text or an external content reference. Captured content is immutable.

### Ecosystem, package, platform, and environment

Candidate and KnownPath documents embed normalized projections for their primary ecosystem and
package plus bounded arrays of package coordinates, platforms, version strings, runtime facts,
operating systems, architectures, frameworks, toolchain facts, and string extensions. Original
package values remain available beside their normalized names.

### Problem and solution

Symptoms contain original summaries and normalized text. Error signatures retain bounded original
and normalized material plus a versioned fingerprint. Solutions contain a summary and ordered,
bounded steps with optional code, language, and verification guidance.

### Evidence

Evidence is a bounded array of references to immutable source items. A reference describes whether
the item supports the problem, supports the solution, verifies an outcome, or supplies context. It
may include a locator, bounded excerpt, URL, and content digest; it does not duplicate the source
document.

### Confidence, freshness, and search state

Confidence contains an aggregate from 0 to 1, named components, `scoreVersion`, calculation time,
and bounded verification signals. Phase 2 stores these values but does not calculate them.

Freshness records last verification, next review, and stale-after timestamps. Search metadata is
provider-neutral and records lexical/embedding processing status, model identifier, dimensions,
content digest, and generation time. No vectors or vector indexes exist in Phase 2.

## Lifecycle values

| Entity               | Values                                                       |
| -------------------- | ------------------------------------------------------------ |
| User                 | `active`, `suspended`, `deleted`                             |
| API key              | `active`, `revoked`, `expired`                               |
| Ingestion run        | `queued`, `running`, `succeeded`, `failed`, `cancelled`      |
| Candidate experience | `pending`, `accepted`, `rejected`, `superseded`, `failed`    |
| KnownPath            | `draft`, `published`, `deprecated`, `superseded`, `archived` |
| Contribution         | `pending`, `accepted`, `rejected`, `superseded`              |
| Moderation           | `unreviewed`, `approved`, `flagged`, `rejected`              |
| Agent outcome        | `helpful`, `not_helpful`, `partially_helpful`, `unknown`     |

Source registries use an `enabled` flag because disabling a configured source is distinct from a
processing lifecycle transition. Source items are immutable and therefore have no processing status.

## Index inventory

All names are explicit and initialization is idempotent. `_id_` is MongoDB's automatic primary index
and is omitted below.

### `users`

- `uq_users_normalized_email`: unique normalized-email lookup.
- `ix_users_status_updated_at`: lifecycle administration ordered by latest update.

### `api_keys`

- `uq_api_keys_key_hash`: unique authentication lookup by key digest.
- `ix_api_keys_user_status_created_at`: a user's keys by status and creation time.

### `source_registries`

- `uq_source_registries_identity_key`: unique deterministic source identity.
- `ix_source_registries_enabled_kind_updated_at`: scheduling and administration.
- `ix_source_registries_visibility_owner`: partial private-owner lookup.
- `ix_source_registries_visibility_team`: partial team lookup.

### `source_items`

- `uq_source_items_deduplication_key`: unique immutable-snapshot deduplication.
- `ix_source_items_registry_captured_at`: snapshot history for a registry.
- `ix_source_items_registry_identity_captured_at`: native item revision history.

### `ingestion_runs`

- `uq_ingestion_runs_deduplication_key`: unique run-request deduplication.
- `ix_ingestion_runs_status_next_attempt_created_at`: runnable work polling.
- `ix_ingestion_runs_registry_created_at`: run history for a source.

### `candidate_experiences`

- `uq_candidate_experiences_deduplication_key`: unique candidate deduplication.
- `ix_candidate_experiences_status_created_at`: processing/review queue.
- `ix_candidate_experiences_ecosystem_package`: ecosystem/package lookup.
- `ix_candidate_experiences_error_fingerprints`: normalized error lookup.

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
created in Phase 2.

## Initialization and inspection

With `.env` configured and MongoDB running:

```sh
pnpm db:init
pnpm db:inspect
pnpm db:verify
```

`db:init` creates missing collections, reapplies current validators with `collMod`, and requests all
named indexes. A same-spec repeated initialization is safe. Index-name/specification conflicts are
allowed to fail visibly rather than silently mutating production indexes.

`db:verify` uses `SourceRegistryRepository` for a uniquely marked insert/read/update/read/delete
round trip and confirms cleanup. It does not seed production knowledge.

## Retention intent

- Source snapshots, successful ingestion history, canonical knowledge, contributions, and outcomes
  are retained until a future policy says otherwise.
- Source items are immutable; corrections create a new snapshot.
- API keys are revoked/expired rather than silently deleted.
- Users and knowledge use lifecycle/moderation states for soft removal.
- Failed operational runs may later receive a TTL/archive policy, but Phase 2 has insufficient usage
  evidence to choose one.

## Deferred model behavior

The schemas do not imply that ingestion, extraction, scoring, verification, search, MCP,
contribution promotion, authentication, authorization, or dashboards are implemented. Team IDs are
opaque until the authentication model exists. Semantic deduplication and vector storage/indexing
belong to later phases.
