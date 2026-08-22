# KnownPath Phase 2 Data Model and Persistence Design

Status: Approved on 2026-08-22

## Purpose

Phase 2 defines the durable domain vocabulary and MongoDB persistence boundary that later ingestion,
extraction, retrieval, MCP, contribution, and dashboard phases will share. It does not implement
those later capabilities.

The design extends the Phase 1 monorepo without changing its application boundaries or replacing its
selected MongoDB driver and Zod validation stack.

## Design principles

- Model around expected read and write paths rather than relational normalization.
- Embed bounded structures that are read with their owner; reference entities with independent
  lifecycle, growth, or indexing needs.
- Keep raw MongoDB collection access private to `@knownpath/database`.
- Treat Zod schemas as the authoritative runtime boundary and inferred TypeScript types as the
  internal contract.
- Give persisted and API-facing objects an explicit `schemaVersion` beginning at `1`.
- Keep source snapshots immutable and operational state separately mutable.
- Use conservative, versioned deterministic normalization. Do not imply semantic equivalence that
  Phase 2 cannot prove.
- Store no raw API-key secret and commit no credential defaults.
- Add only ordinary MongoDB indexes in this phase. Vector and retrieval-specific indexes belong to a
  later phase.

## Package responsibilities

### `@knownpath/domain`

Owns framework-independent domain values, runtime schemas, inferred TypeScript types, entity
identifier helpers, canonicalization helpers, lifecycle enums, and schema versions. It must not
import MongoDB types.

Domain files will be grouped by concern rather than placed in one large module:

- common identifiers, timestamps, audit metadata, visibility, moderation, and schema-version values
- source and provenance models
- ingestion models
- candidate and canonical knowledge models
- user and API-key models
- contribution and outcome models
- canonicalization and fingerprint helpers

### `@knownpath/database`

Owns MongoDB connection lifecycle, collection names, persisted document schemas, mapping between
domain/API inputs and stored documents, repository implementations, collection validators, index
declarations, and initialization/verification commands.

It may depend on `@knownpath/config` and `@knownpath/domain`. No application package may reach
around repositories to use raw collections.

### Applications

The API and worker may later compose repositories and services, but Phase 2 will not add feature
routes or processing loops. The web, MCP, installer, provider, retrieval, and Agent Skill scaffolds
remain unchanged.

## Identifier and time conventions

- Entity identifiers are UUID v4 strings stored directly as MongoDB `_id` values.
- TypeScript brands distinguish identifiers such as `UserId`, `SourceRegistryId`, and `KnownPathId`
  without changing their stored representation.
- UUID creation uses the platform `crypto.randomUUID()` implementation; no identifier dependency is
  added.
- Persisted timestamps are BSON `Date` values in UTC.
- API-facing timestamp schemas accept and emit ISO 8601 UTC strings.
- Audit metadata contains `createdAt`, `updatedAt`, and optional actor identifiers where an actor is
  meaningful.
- Repository updates set `updatedAt`; callers do not silently replace immutable creation timestamps.

UUIDs are deliberately not used as chronological keys. Queries that require ordering use explicit
indexed timestamps.

## Collections

### `users`

Independent user identity and account state.

Important fields:

- `_id`, `schemaVersion`
- original and normalized email
- display name
- lifecycle status: `active`, `suspended`, or `deleted`
- audit metadata

Authentication-provider identities are not designed in Phase 2. The user record remains
provider-neutral.

### `api_keys`

API credentials have an independent security lifecycle and may outnumber users, so they are not
embedded in users.

Important fields:

- `_id`, `schemaVersion`, `userId`
- human-readable name and non-secret display prefix
- versioned cryptographic key hash
- scopes
- status: `active`, `revoked`, or `expired`
- optional `expiresAt`, `lastUsedAt`, `revokedAt`
- audit metadata

The raw credential is never persisted.

### `source_registries`

Configuration and identity for independently managed public or authorized sources.

Important fields:

- `_id`, `schemaVersion`
- source kind, initially capable of representing GitHub repositories and documentation sites
- original descriptor and deterministic `identityKey`
- canonical URL and optional ecosystem hints
- enabled/disabled state
- visibility scope and ownership metadata
- cursor/configuration envelope for future source-specific ingestion
- last attempted/successful ingestion timestamps
- audit metadata

No GitHub client or ingestion behavior is implemented in this phase.

### `source_items`

Immutable observed source snapshots with provenance. A new material snapshot creates a new document
instead of overwriting source content.

Important fields:

- `_id`, `schemaVersion`, `sourceRegistryId`
- source-native item identity and type
- canonical URL and provenance metadata
- content digest, media type, observed revision, and immutable payload metadata
- `deduplicationKey`
- observed, published, and captured timestamps where known
- visibility scope
- audit creation metadata

Operational processing state is not embedded here. Large raw blobs or binary assets are outside this
phase; the model can retain content text or an external content reference without requiring another
database.

### `ingestion_runs`

Mutable operational history for ingestion and processing attempts.

Important fields:

- `_id`, `schemaVersion`, `sourceRegistryId`
- trigger type and versioned `deduplicationKey`
- lifecycle status: `queued`, `running`, `succeeded`, `failed`, or `cancelled`
- processing stage and attempt counters
- optional lease/next-attempt timestamps
- bounded counters and sanitized failure summary
- started, completed, and audit timestamps

Individual source snapshots reference their registry rather than accumulating inside the run
document.

### `candidate_experiences`

An extracted but not-yet-canonical reusable problem/solution experience. Phase 2 defines its durable
shape but does not implement extraction.

Important fields:

- `_id`, `schemaVersion`
- lifecycle status: `pending`, `accepted`, `rejected`, `superseded`, or `failed`
- versioned `deduplicationKey`
- problem summary, normalized symptoms, and normalized error signatures
- reusable solution summary and ordered steps
- ecosystem, packages, platforms, versions, and environment metadata
- bounded evidence references to source items
- extraction provenance envelope without coupling to one AI provider
- confidence components and score version
- visibility, moderation, freshness, and audit metadata

### `known_paths`

Canonical knowledge records optimized for later retrieval and agent consumption.

Important fields:

- `_id`, `schemaVersion`
- versioned `canonicalKey`
- canonical lifecycle status: `draft`, `published`, `deprecated`, `superseded`, or `archived`
- title, problem summary, symptoms, error signatures, solution summary, and ordered reusable steps
- ecosystem, packages, platforms, versions, and environment metadata
- bounded evidence references
- confidence/trust score components, aggregate score, and score version
- provider-neutral embedding/search metadata, but no vector value or vector index
- verification and freshness timestamps
- visibility, moderation, and audit metadata
- optional `supersededByKnownPathId`

Evidence references remain embedded because they are bounded and commonly read with a KnownPath. The
referenced source item remains independently queryable and immutable.

### `agent_contributions`

Independent submissions from agents or users that may affect an existing KnownPath or propose a new
lesson.

Important fields:

- `_id`, `schemaVersion`
- contributor identity envelope and optional target KnownPath
- contribution kind and versioned `deduplicationKey`
- generalized content/evidence proposal
- processing/moderation status
- visibility and audit metadata

Contribution ingestion and promotion are deferred.

### `agent_outcomes`

Independent reports describing whether retrieved knowledge helped in a real task.

Important fields:

- `_id`, `schemaVersion`, `knownPathId`
- reporter identity envelope
- outcome: `helpful`, `not_helpful`, `partially_helpful`, or `unknown`
- optional failure category and bounded notes
- retrieval/use context with privacy-safe metadata
- versioned `deduplicationKey`
- visibility and audit metadata

Outcome aggregation and trust-score recalculation are deferred.

## Embedded shared structures

### Visibility

Visibility is `public`, `private`, or `team` with optional `ownerUserId` and `teamId`. Runtime
refinements enforce the required ownership discriminator. `teamId` is opaque in Phase 2; team
membership and authorization are future authentication concerns.

### Ecosystem and environment metadata

The model supports:

- normalized ecosystem slug
- package coordinates with original name, normalized name, optional version/range, and role
- normalized platform values and optional platform versions
- runtime, operating system, architecture, framework, and toolchain facts
- an extension record for bounded, validated string metadata

These structures are embedded in candidates and KnownPaths for locality. Indexes target scalar
projections such as primary ecosystem, package normalized names, platforms, and version strings
without combining multiple array paths in one compound multikey index.

### Symptoms and error signatures

Symptoms retain normalized text and optional structured categories. Error signatures contain the
original bounded signature, normalized material, a normalization version, and a SHA-256 fingerprint.
Phase 2 normalization handles deterministic textual variation only; it does not remove arbitrary
paths, identifiers, or numbers in an attempt at semantic matching.

### Solution steps

Solutions contain a concise summary and an ordered bounded array of steps. Steps may include a
title, instruction, optional code/language metadata, and verification guidance. They contain
reusable technical guidance rather than execution state.

### Evidence references

Evidence references point to a source item and optionally identify a bounded excerpt location, URL,
content digest, and support relationship. They do not duplicate entire source documents.

### Confidence and trust

The score envelope contains named numeric components, aggregate score, `scoreVersion`, calculation
timestamp, and optional verification signals. Phase 2 validates and stores scores but does not
define or execute a ranking algorithm.

### Search metadata

Search metadata records lexical/indexing state and optional embedding state with a provider-neutral
model identifier, dimensions, content digest, generation timestamp, and status. It stores no
embedding vector in Phase 2 and does not introduce a vector index.

### Moderation and retention

Soft moderation state is embedded where public or contributed content may require review. Lifecycle
states and timestamps support soft deletion, rejection, deprecation, and archival. No TTL deletion
policy is enabled in Phase 2 because retention requirements are not yet established.

## Canonicalization rules

Canonicalization helpers return values rather than mutating input and expose a version alongside any
persisted derived key.

- Text: Unicode NFKC, normalized line endings, trim, and bounded whitespace normalization where
  appropriate.
- Ecosystems/platforms: normalized lowercase slugs with conservative separator handling.
- Packages: ecosystem-aware normalization; npm names are lowercase, while ecosystems with
  case-sensitive coordinates retain meaningful case.
- Versions: trim and normalize obvious surrounding whitespace only. A leading `v` is not removed
  globally because version semantics differ by ecosystem.
- URLs: use WHATWG URL parsing; lowercase scheme/hostname, remove fragments and default ports,
  normalize path form, preserve meaningful query data, and retain the original URL separately.
- Timestamps: validate finite dates and normalize API values to UTC ISO strings.
- Derived keys: serialize an ordered versioned tuple and hash it with SHA-256.

Canonicalization is intentionally narrower than semantic deduplication.

## Repository boundary

Each independently managed collection has a named repository interface and MongoDB implementation.
Public interfaces expose domain-oriented operations such as:

- create validated records
- find by stable ID
- find by unique identity/deduplication key
- update allowed lifecycle or operational fields using optimistic conditions where appropriate
- list bounded result pages for explicit indexed access patterns

A shared private repository base may remove mechanical duplication, but collection handles and
arbitrary filters are not exported. Reads are parsed through persisted schemas so database drift
fails at the boundary instead of leaking invalid objects into applications.

Hard deletion is not a normal domain operation. A bounded cleanup operation will exist only for the
development verification routine so its temporary marker record can be removed through the
repository layer.

## Connection lifecycle and configuration

- One `MongoClient` is created and reused per application process.
- Connection is explicit and performs a ping before the database context is considered ready.
- Shutdown closes the client gracefully.
- Configuration extends the existing central environment parser with an application name and bounded
  pool/server-selection settings only where operationally useful.
- Defaults may exist for non-secret local tuning. `MONGODB_URI` remains required and has no
  committed secret default.
- Apps receive a database context/repository registry through composition rather than importing
  global mutable collections.

## Database initialization

The initialization command is safe to repeat:

1. Connect and ping.
2. Discover existing collections.
3. Create missing collections with a minimal MongoDB `$jsonSchema` envelope validator.
4. Reapply current validators to existing collections using `collMod`, `validationLevel: strict`,
   and `validationAction: error`.
5. Create all declared named indexes using the official driver.
6. Report collections and index names without inserting application data.
7. Close the command-owned client.

Zod remains more expressive and authoritative. MongoDB validators are deliberately limited to
critical stored-envelope invariants to avoid maintaining two competing full schemas.

## Index plan

Index names are explicit and stable. Compound ordering follows expected equality filters, sort, then
range fields.

| Collection              | Index keys                                                                       | Constraint/purpose                        |
| ----------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `users`                 | `normalizedEmail`                                                                | Unique account lookup                     |
| `users`                 | `status`, `audit.updatedAt`                                                      | Account lifecycle administration          |
| `api_keys`              | `keyHash`                                                                        | Unique credential authentication lookup   |
| `api_keys`              | `userId`, `status`, `audit.createdAt`                                            | Active keys for a user                    |
| `source_registries`     | `identityKey`                                                                    | Unique source identity                    |
| `source_registries`     | `enabled`, `kind`, `audit.updatedAt`                                             | Source scheduling/administration          |
| `source_registries`     | `visibility.scope`, `visibility.ownerUserId`                                     | Ownership visibility lookup               |
| `source_registries`     | `visibility.scope`, `visibility.teamId`                                          | Team visibility lookup                    |
| `source_items`          | `deduplicationKey`                                                               | Unique immutable snapshot deduplication   |
| `source_items`          | `sourceRegistryId`, `capturedAt`                                                 | Source snapshot history                   |
| `source_items`          | `sourceRegistryId`, `sourceItemIdentity`, `capturedAt`                           | Native item revision history              |
| `ingestion_runs`        | `deduplicationKey`                                                               | Unique run request deduplication          |
| `ingestion_runs`        | `status`, `nextAttemptAt`, `audit.createdAt`                                     | Runnable-work polling                     |
| `ingestion_runs`        | `sourceRegistryId`, `audit.createdAt`                                            | Source run history                        |
| `candidate_experiences` | `deduplicationKey`                                                               | Unique extraction candidate deduplication |
| `candidate_experiences` | `status`, `audit.createdAt`                                                      | Review/processing queue                   |
| `candidate_experiences` | `metadata.primaryEcosystem`, `metadata.primaryPackageName`                       | Package-oriented candidate lookup         |
| `candidate_experiences` | `errorFingerprints`                                                              | Error-signature lookup                    |
| `known_paths`           | `canonicalKey`                                                                   | Unique canonical record identity          |
| `known_paths`           | `status`, `visibility.scope`, `confidence.aggregate`, `freshness.lastVerifiedAt` | Canonical publication/review listing      |
| `known_paths`           | `visibility.scope`, `visibility.ownerUserId`, `status`, `audit.updatedAt`        | Owner-scoped canonical listing            |
| `known_paths`           | `visibility.scope`, `visibility.teamId`, `status`, `audit.updatedAt`             | Team-scoped canonical listing             |
| `known_paths`           | `metadata.primaryEcosystem`, `metadata.primaryPackageName`, `status`             | Package-oriented canonical lookup         |
| `known_paths`           | `metadata.platforms`                                                             | Platform filtering                        |
| `known_paths`           | `metadata.versionStrings`                                                        | Version filtering                         |
| `known_paths`           | `errorFingerprints`                                                              | Error-signature lookup                    |
| `known_paths`           | `freshness.lastVerifiedAt`, `status`                                             | Stale-record review                       |
| `agent_contributions`   | `deduplicationKey`                                                               | Unique submission deduplication           |
| `agent_contributions`   | `status`, `audit.createdAt`                                                      | Moderation/processing queue               |
| `agent_contributions`   | `knownPathId`, `audit.createdAt`                                                 | Contributions for a KnownPath             |
| `agent_outcomes`        | `deduplicationKey`                                                               | Unique outcome deduplication              |
| `agent_outcomes`        | `knownPathId`, `audit.createdAt`                                                 | Outcome history for a KnownPath           |
| `agent_outcomes`        | `outcome`, `audit.createdAt`                                                     | Outcome analysis queue                    |

Indexes that depend on optional fields use partial filters where doing so reduces index size or
enforces conditional uniqueness. Exact index definitions will be checked against the MongoDB
driver's current accepted types during implementation. No index combines both `metadata.platforms`
and `metadata.versionStrings`, avoiding a parallel-array compound multikey index.

## Manual verification design

Without adding tests, Phase 2 verification will:

1. Run format validation, lint, typecheck, and build.
2. Start the configured local MongoDB container and confirm readiness.
3. Run initialization twice and observe successful completion both times.
4. Inspect collection validators and index names directly through MongoDB.
5. Use a repository to insert a uniquely marked temporary source registry, read it, perform an
   allowed update, read the result, and delete the temporary record through the verification-only
   cleanup path.
6. Confirm the marker no longer exists.
7. Inspect status/diff for generated files, credentials, and unrelated changes.

## Documentation changes

Implementation will add or update:

- `docs/DATA_MODEL.md` with the durable collection/index/lifecycle reference
- `docs/DECISIONS.md` with Phase 2 decisions and rejected alternatives
- `docs/ARCHITECTURE.md` only where needed to reflect the realized persistence boundary
- `.env.example` for complete MongoDB configuration
- root README commands where database initialization needs documentation
- `progress.md` with research, implementation inventory, literal verified commands, manual
  requirements, limitations, and the exact next phase

## Explicitly deferred

- GitHub or documentation ingestion
- background processing behavior and job leasing at production scale
- AI extraction providers or prompts
- semantic candidate deduplication
- confidence/trust calculation algorithms
- lexical, hybrid, semantic, or vector retrieval
- embedding generation and vector indexes
- MCP tools/server behavior
- Agent Skill contents and installation
- authentication providers, team membership, and authorization enforcement
- contribution promotion and feedback aggregation
- dashboards
- automated tests

Phase 2 ends after the domain and MongoDB persistence foundation is implemented, live-verified,
documented, and committed.
