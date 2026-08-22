# KnownPath Phase 4 GitHub Ingestion Design

**Date:** 2026-08-22

**Status:** Approved for implementation

**Scope:** Phase 4 only

## Goal

Build KnownPath's first real seed-data collector for high-signal public Expo and React Native GitHub
material. The collector retrieves objective public source data through GitHub's official REST and
GraphQL APIs, normalizes it without interpreting solutions, and persists immutable, provenance-rich
source snapshots for a later extraction phase.

Phase 4 does not identify fixes, invoke an LLM, create candidate experiences, calculate trust
scores, index content for search, expose ingestion HTTP routes, or add MCP/dashboard behavior.

## Research basis

The design is based on official documentation and live API metadata checked on 2026-08-22:

- [GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions):
  `2026-03-10` is the current version and must be sent explicitly.
- [REST pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api),
  [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
  and
  [best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api):
  follow link pagination, prefer authenticated requests, serialize requests, honor rate-limit
  headers, and use conditional requests where appropriate.
- [Issues endpoints](https://docs.github.com/en/rest/issues/issues),
  [issue comments](https://docs.github.com/en/rest/issues/comments), and
  [reactions](https://docs.github.com/en/rest/reactions/reactions): public resources support
  unauthenticated reads, issue listings include pull requests unless filtered, and comments expose
  author association.
- [GitHub Discussions GraphQL guide](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)
  and current GraphQL schema: discussions are an authenticated GraphQL surface and expose answers,
  comments/replies, author association, edits, and reactions.
- [GitHub token guidance](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure):
  tokens are secrets, should be least-privileged and expiring, and must not appear in commands,
  source control, or logs.
- [Octokit](https://github.com/octokit/octokit.js), GitHub's official JavaScript SDK, currently
  5.0.5 with Node.js 20-or-newer support. It supplies typed REST methods, GraphQL, pagination,
  retry, and throttling behavior compatible with KnownPath's Node.js 24 baseline.
- [Expo documentation](https://docs.expo.dev/) identifies the Expo GitHub organization as the SDK
  and issue/contribution source.
- [React Native contributing guidance](https://reactnative.dev/contributing/overview) identifies the
  main framework issue repository, the Discussions and Proposals repository, and the New
  Architecture working group. Live GitHub repository metadata confirmed that the canonical main
  repository is now `react/react-native`; the former `facebook/react-native` location redirects.

Live API inspection also confirmed that `expo/expo` has Issues and Discussions enabled,
`react/react-native` has Issues but not Discussions, and the two selected React Native discussion
repositories have Discussions enabled.

## Selected approach

Use a hybrid GitHub adapter:

- REST collects repository identity, issues, issue comments, and individual reactions. This path
  works for public data without a token at GitHub's lower unauthenticated rate limit.
- Authenticated GraphQL collects Discussions, accepted answers, nested comments/replies, reaction
  actors, and reliable issue closing-pull-request references.
- When `GITHUB_TOKEN` is absent, issue ingestion remains available through public REST. Discussion
  collection and GraphQL-only enrichment are skipped with explicit capability warnings and run
  counters; they are never reported as successfully collected.

Rejected approaches:

- REST-only cannot collect the required Discussions data.
- GraphQL-only makes a token mandatory and prevents the documented public unauthenticated path.
- HTML scraping violates the source/API requirement and produces unstable provenance.
- One large snapshot per thread duplicates all comments whenever any part changes and risks the
  MongoDB document-size limit.

## Package and application boundaries

### `@knownpath/domain`

Extend generic source contracts without importing GitHub SDK types:

- source item kinds for issue comments and discussion comments;
- a versioned provider metadata envelope carrying bounded JSON-compatible source metadata;
- GitHub-neutral parent/root identity fields so a later extractor can reconstruct threads;
- ingestion counters with the required discovered, created, updated, unchanged, failed, and
  rate-limited dimensions.

GitHub API response validation does not belong in the domain package.

### `@knownpath/database`

Extend existing repositories only for required persistence operations:

- list/find enabled registries by stable source key or repository identity;
- idempotently upsert the committed source-registry definitions while preserving operational cursors
  and ingestion timestamps;
- find the latest snapshot for one source-native identity;
- insert a snapshot only when its deduplication key is absent;
- update registry cursor/attempt/success timestamps;
- create, start, complete, and fail ingestion runs with atomic counter updates where appropriate.

Raw MongoDB collections remain private. Source snapshots stay immutable.

### `@knownpath/github-ingestion`

Create a focused reusable package owning:

- source-registry manifest parsing;
- Octokit construction and safe logging adapters;
- REST/GraphQL transport capability detection;
- pagination, conditional request state, retry/rate-limit classification, and sequential request
  scheduling;
- strict runtime validation for GitHub response projections;
- normalization into provider-neutral source snapshot inputs;
- orchestration of discovery, persistence, cursors, and ingestion-run counters.

The package depends on config, domain, and database repositories. It does not depend on the worker
application or Fastify.

### `@knownpath/worker`

Replace the inert Phase 1 worker entry point with a bounded command dispatcher for GitHub ingestion.
The worker owns process lifecycle, CLI argument validation, structured console output, database
connection/closure, and exit status. It delegates collection behavior to
`@knownpath/github-ingestion`.

No continuously polling scheduler or queue service is introduced in Phase 4.

## Initial source registry

A committed, runtime-validated data file defines the initial public sources. Adding a repository or
changing supported types must not require collector code changes.

| Source key                      | Canonical repository                               | Enabled types       | Reason                                                                 |
| ------------------------------- | -------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `expo-core`                     | `expo/expo`                                        | issues, discussions | Canonical Expo SDK repository and active support/contribution surface. |
| `react-native-core`             | `react/react-native`                               | issues              | Canonical React Native framework issue tracker.                        |
| `react-native-discussions`      | `react-native-community/discussions-and-proposals` | discussions         | Officially referenced architecture/proposal discussion location.       |
| `react-native-new-architecture` | `reactwg/react-native-new-architecture`            | discussions         | Officially referenced New Architecture working-group discussions.      |
| `react-native-upgrade-support`  | `react-native-community/upgrade-support`           | issues              | Officially referenced community upgrade-support issue repository.      |

Each definition includes source key, display name, canonical URL, ecosystem hints, repository owner
and name, enabled source types, and a default incremental lookback window. Repository identity is
verified through the API before collection, including canonical `nameWithOwner`, immutable database
ID/node ID, visibility, and feature availability.

## Snapshot granularity and normalized payloads

Each independently addressable GitHub object becomes its own immutable `source_items` revision:

- issue;
- issue comment;
- discussion;
- discussion comment or reply.

The source-native identity is the GitHub node ID when available, qualified by provider/object kind.
The immutable GitHub database ID is also retained. Comment snapshots carry root thread and immediate
parent identities so future processing can reconstruct ordered conversations without embedding
unbounded comment arrays.

The content body is stored as untrusted plain Markdown text. Structured provider metadata retains:

- repository database ID, node ID, canonical owner/name, and URL;
- object database ID, node ID, number where applicable, canonical API/web URLs, and object kind;
- title, open/closed state, state reason, locked/minimized/deleted/answer status where exposed;
- author login, immutable ID/node ID, user type, and `authorAssociation` where exposed;
- labels with name, color, description, ID/node ID;
- creation, publication, edit, update, close, and answer-selection timestamps;
- parent/root identities and discussion category;
- reaction totals plus individual public reaction identities, types, actors, and timestamps where
  the relevant API exposes them;
- accepted answer identity and selector identity for discussions;
- closing pull-request IDs, numbers, URLs, state, merge status, and timestamps where GraphQL exposes
  them reliably.

No HTML-rendered body is stored. Text is never executed, rendered during ingestion, interpolated
into logs, or interpreted as instructions.

## Content identity and immutability

Normalized payloads use a deterministic canonical JSON serializer with recursively sorted object
keys and stable array ordering defined by GitHub identity or chronological order. The content digest
is SHA-256 over the exact persisted normalized representation.

The source-item deduplication key is versioned and derived from:

1. source registry ID;
2. qualified source-native identity;
3. content digest;
4. normalization version.

The first snapshot for a source-native identity counts as `created`. A different digest for an
existing identity creates a new immutable snapshot and counts as `updated`. An identical digest
counts as `unchanged` and writes no new source item.

GitHub `updatedAt` and edit timestamps are preserved as observed revisions but are not treated as
the sole content identity because reactions and related metadata may change independently.

## Incremental synchronization

Each registry cursor stores independent issue and discussion checkpoints, including:

- latest completely processed GitHub update timestamp;
- last successful collection time;
- conditional REST ETag/Last-Modified values where safe and useful;
- current cursor schema/version.

Normal incremental runs request objects updated since the checkpoint minus a configurable overlap
window. The overlap intentionally rechecks recent objects for delayed edits, comments, and
reactions; content hashes prevent duplicate snapshots.

The checkpoint advances only after the selected source type finishes successfully. A partial or
failed run does not skip unprocessed objects on the next attempt. REST `304 Not Modified` responses
count as unchanged discovery and do not create snapshots.

GitHub does not guarantee that every reaction change advances a thread update timestamp. Therefore,
the overlap window reduces but cannot eliminate that discovery gap. Documentation will recommend
periodic bounded backfill/refresh runs until webhook ingestion or a dedicated verification policy is
introduced in a later phase.

## Collection controls

The root command delegates to the worker and supports:

```text
pnpm ingest:github --source <source-key>
pnpm ingest:github --repository <owner/name>
pnpm ingest:github --all
```

Common options:

- `--types issues,discussions`
- `--since <ISO timestamp>` and `--until <ISO timestamp>`
- `--limit <top-level item count>`
- `--backfill`
- `--dry-run`

Exactly one selector (`--source`, `--repository`, or `--all`) is required. `--types` may only narrow
types enabled by registry configuration. `--until` provides deterministic bounded verification.

Normal runs use registry checkpoints and the configured recent lookback when no checkpoint exists.
Historical collection requires `--backfill` plus an explicit `--since`; it is never an accidental
default. `--limit` bounds top-level threads, while every selected thread's comments and reactions
are paginated completely. GitHub responses that exceed KnownPath's content/document safety limits
fail visibly rather than silently truncating provenance.

`--dry-run` performs source selection, repository capability verification, and bounded discovery but
does not mutate registries, cursors, runs, or snapshots. It prints only counts, identifiers, URLs,
timestamps, and rate-limit metadata—not untrusted bodies or credentials.

## Authentication and token safety

`GITHUB_TOKEN` is optional for public issue collection and required for Discussions and GraphQL-only
enrichment. The client accepts it only from validated process environment and passes it directly to
Octokit.

The token is never included in configuration objects intended for logging, error serialization, run
failures, persisted source metadata, CLI arguments, or child-process command text. Logging uses an
allowlist of safe fields. Request errors are reduced to status, GitHub request ID, route template,
retry classification, and safe message/code.

Documentation recommends an expiring least-privileged token. Public-only collection needs no write
permission. Long-lived hosted operation should later use a GitHub App, but Phase 4 does not add app
credentials or installation flows.

## Pagination, rate limits, and retries

- REST collection follows Octokit's link-header pagination at up to 100 records per page.
- GraphQL connections request at most 100 nodes and advance explicit end cursors until complete.
- Requests are serialized to reduce secondary-limit pressure.
- Octokit's retry plugin handles transient server failures with bounded exponential backoff.
- Rate-limit handlers honor `Retry-After`; primary exhaustion honors `X-RateLimit-Reset`.
- A rate-limit response increments `rateLimited`, records safe rate metadata, and either performs
  one bounded retry when the wait is within the configured maximum or ends the run as retryable.
- Permanent authentication, authorization, validation, disabled-feature, and not-found failures are
  not blindly retried.
- Every response updates safe in-memory rate-limit state from headers. Logs report limit, remaining,
  reset time, resource bucket, and GitHub request ID without headers containing credentials.

No parallel request fan-out, Redis, Valkey, or distributed queue is introduced.

## Ingestion-run lifecycle and counters

Each non-dry run creates one `ingestion_runs` record per source registry:

1. `queued` at command acceptance;
2. `running` before the first network request;
3. `succeeded` after snapshots, cursor, and success timestamp are durable;
4. `failed` with a sanitized retryable/permanent failure summary when collection cannot complete.

Counters always include:

- `discovered`
- `created`
- `updated`
- `unchanged`
- `failed`
- `rateLimited`

Additional safe counters may distinguish issues, discussions, comments, reactions, skipped pull
requests, conditional not-modified responses, and unauthenticated capability skips. Counter updates
are persisted at bounded checkpoints, not after every API object.

Run deduplication identifies the selected source, trigger, normalized time bounds, source types, and
an explicit invocation ID. Every accepted invocation therefore has one durable run record, while
intentional reruns remain possible and rely on source-snapshot deduplication for idempotency.

## Failure and consistency behavior

- Repository capability mismatches fail before snapshot writes.
- One malformed GitHub object increments `failed`, records a safe diagnostic, and continues until a
  configurable failure threshold; the raw invalid object is not persisted.
- Duplicate-key races on source snapshots are reread and classified as unchanged when the existing
  digest matches.
- Cursor advancement occurs after durable snapshot writes and never after a partial source-type
  failure.
- Registry attempt time is recorded for every non-dry run; success time only after completion.
- Process signals stop scheduling new API requests, finish the current persistence operation, mark
  the active run failed/cancelled as appropriate, and close MongoDB.

MongoDB transactions are not required for local standalone development. Ordering and idempotent keys
make interrupted runs safely resumable.

## Verification strategy

No automated tests are added. Verification will use:

- dependency installation, formatting validation, typecheck, lint, and build;
- idempotent database initialization and index inspection;
- a dry-run against a real configured public repository;
- a small time- and item-bounded authenticated Expo or React Native ingestion using a token obtained
  from the existing GitHub CLI credential only for the process environment;
- direct MongoDB inspection of registry, run, issue/discussion, comment, reaction, provenance,
  author-association, and timestamp projections;
- an identical second ingestion proving zero duplicate snapshots and `unchanged` classification;
- safe log inspection proving no token or Authorization value appears;
- cleanup of verification snapshots/runs/registry state if a dedicated verification database is
  used, or explicit documentation of retained public seed data if the normal development database is
  used.

If authenticated access is unavailable, verification will use the official unauthenticated REST path
and record that Discussions and GraphQL enrichment were not runtime-verified. No result will be
fabricated.

## Documentation deliverables

- `docs/GITHUB_INGESTION.md`: source registry, architecture, credentials, commands, incremental and
  backfill operation, rate-limit behavior, data completeness, and troubleshooting.
- `docs/ARCHITECTURE.md`: Phase 4 worker and provider flow.
- `docs/DATA_MODEL.md`: evolved source metadata, snapshots, run counters, cursor, and indexes.
- `docs/DECISIONS.md`: hybrid API, source granularity, and bounded backfill decisions.
- `.env.example` and root/package READMEs: token and command setup without credentials.
- `progress.md`: exact research, implementation, observed verification, remaining manual setup,
  limitations, and next phase.

## Explicitly deferred

- AI extraction, prompts, candidate experience creation, or fix inference.
- Trust/confidence scoring, moderation, or canonical KnownPath promotion.
- Semantic/hybrid search, embeddings, vector indexes, or retrieval APIs.
- Webhooks, schedules, distributed queues, or continuous polling.
- Private repository ingestion, GitHub App installation, or organization administration.
- HTML scraping or non-GitHub sources.
- MCP knowledge tools, Agent Skill distribution, installer behavior, contributions, outcomes, and
  dashboards.
- Automated tests, by explicit Phase 4 requirement.
