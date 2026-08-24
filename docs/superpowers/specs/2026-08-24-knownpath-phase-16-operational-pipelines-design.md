# KnownPath Phase 16 operational pipelines design

Status: approved for specification on 2026-08-24. Implementation begins only after explicit review
of this written specification.

## Goal and scope

Phase 16 turns the existing one-shot ingestion, extraction, scoring, canonicalization, projection,
contribution, and outcome commands into continuously operable background pipelines. It adds durable
dispatch intent, retries, schedules, concurrency controls, worker health, quarantine, and operator
surfaces without changing the Phase 15 trust/privacy model or beginning Phase 17.

The phase does not add a dashboard, team ownership, public registration, new knowledge-authority
rules, a second product database, or automated tests.

## Current-state findings

- `@knownpath/worker` is a large command dispatcher. It composes mature service boundaries but has
  no long-running queue consumer, scheduler, heartbeat, or stale-job recovery.
- Source ingestion, extraction, assessments, canonical records, search projections, contributions,
  and outcome assessments already use deterministic keys and immutable or resumable MongoDB state.
  These remain the final idempotency gates.
- Contribution submission currently stores and processes the complete contribution synchronously.
  Its existing response schema already supports `stored` processing and HTTP 202, so asynchronous
  processing can remain contract-compatible.
- Outcome submission currently persists the outcome and calculates an assessment synchronously.
  Phase 16 preserves that response contract while adding queued recomputation, projection refresh,
  and scheduled reconciliation.
- MongoDB Atlas is the deployed product database. The API currently runs without a queue service or
  deployed background worker.

## Research and selected infrastructure

Research was performed on 2026-08-24 using current official documentation and registry metadata.

- BullMQ 6.2.0 is MIT licensed, maintained, TypeScript-native, and supports native retry attempts,
  exponential backoff with jitter, global worker rate limits, job schedulers, stalled-job recovery,
  graceful worker shutdown, and flow primitives.
- BullMQ's production guidance requires a Redis-protocol service configured with persistence and
  `maxmemory-policy noeviction`. BullMQ 6 supports current Redis clients through adapters.
- Valkey 9.1.1 is the current stable Valkey release and has an official `valkey/valkey:9.1.1-alpine`
  image. It provides the required free/open-source Redis protocol for local development.
- Agenda 6.2.6 can use MongoDB and provides scheduling/locking, but does not provide an equivalent
  first-class retry/backoff/flow surface for this workload. Selecting it would require KnownPath to
  build reliability orchestration that BullMQ already owns.
- Self-hosted Temporal provides stronger workflow replay semantics but introduces a substantially
  larger server/control-plane deployment than Phase 16 needs.

Official references:

- <https://docs.bullmq.io/guide/retrying-failing-jobs>
- <https://docs.bullmq.io/guide/jobs/stalled>
- <https://docs.bullmq.io/guide/workers/graceful-shutdown>
- <https://docs.bullmq.io/guide/job-schedulers/>
- <https://docs.bullmq.io/guide/rate-limiting>
- <https://docs.bullmq.io/guide/going-to-production>
- <https://docs.bullmq.io/guide/redis-tm-compatibility/>
- <https://valkey.io/download/>
- <https://hub.docker.com/r/valkey/valkey/>
- <https://agenda.github.io/agenda/>
- <https://docs.temporal.io/self-hosted-guide>

## Core technology decision

Use BullMQ 6.2.0 over Valkey's Redis-compatible protocol. Use `ioredis` through BullMQ's supported
adapter boundary. MongoDB remains the only persistent product datastore and the source of truth for
every source, candidate, assessment, canonical record, contribution, outcome, and pipeline intent.

Valkey is auxiliary infrastructure only. It stores queue membership, delayed/scheduled work, retry
timers, rate-limit keys, worker locks, and bounded operational job results. Queue payloads contain
IDs and version metadata, never full source text, contribution text, secrets, or canonical content.
Important state can always be reconstructed from MongoDB.

## Package and application boundaries

### `@knownpath/jobs`

This new package is the sole BullMQ-facing boundary. It owns:

- versioned job-name and payload schemas;
- `JobClient`, `JobStatusReader`, and worker-registration interfaces;
- deterministic job-ID generation;
- queue topology and retry/retention policies;
- the centralized Valkey connection factory;
- BullMQ producer, scheduler, status, and worker adapters;
- normalized queue errors and safe operational projections.

No domain/service package imports BullMQ or ioredis.

### `@knownpath/pipelines`

This new package composes the existing ingestion, extraction, verification, canonicalization,
search, contribution, and outcome services into small job handlers. It owns chaining decisions and
pipeline-run updates, not queue leasing or business persistence.

### Applications

- `@knownpath/worker` becomes the long-running consumer/scheduler entry point and retains existing
  one-shot commands for safe manual development.
- `@knownpath/api` receives an optional fail-fast producer/status client. Search/auth/read behavior
  never depends on Valkey. Contribution submission stores MongoDB state before attempting enqueue.
- The web and MCP layers gain no direct queue or Valkey access.

## Queue topology

All queues share one configurable prefix and one centralized connection configuration.

| Queue       | Responsibility                                            | Default concurrency | Default limiter              |
| ----------- | --------------------------------------------------------- | ------------------: | ---------------------------- |
| `control`   | schedules, source discovery, pending/stale reconciliation |                   1 | none                         |
| `github`    | one bounded GitHub source sync/backfill per job           |                   1 | configurable global budget   |
| `sources`   | one official documentation/release source refresh per job |                   2 | configurable request budget  |
| `ai`        | public Gemini extraction and embeddings                   |                   1 | configurable provider budget |
| `knowledge` | scoring, canonicalization, rebuild, projection            |                   2 | none                         |
| `feedback`  | contribution processing and outcome aggregation           |                   2 | none                         |

Provider/source concurrency and limiter values are environment-configurable. The defaults are
deliberately conservative. Gemini extraction and embedding share one queue so an unpaid account's
combined request stream cannot bypass its configured concurrency. Existing provider-level budgets
and privacy gates remain in force inside handlers.

## Versioned job contracts

Job names are stable capability identifiers. Every payload is a strict version-1 schema containing
`schemaVersion`, `pipelineRunId`, `pipelineStepId`, `trigger`, and the minimum target IDs/options.

- `control.sources.discover`
- `source.github.sync`
- `source.official.sync`
- `source.extract`
- `candidate.score`
- `candidate.canonicalize`
- `knownpath.project`
- `knownpath.reembed`
- `knowledge.freshness.rescore`
- `contribution.process`
- `outcomes.aggregate`
- `maintenance.reconcile`
- `maintenance.retry-stale`

Backfill versus incremental behavior is a bounded field on the source-sync payload rather than a
separate unbounded job type. Targeted prompt, score-policy, normalizer, projection, ranking, or
embedding-version reprocessing is represented by explicit version fields and a bounded `force` flag
where the existing service already supports it.

Queue job IDs are SHA-256 digests of job name, schema version, target identity, source/content or
revision identity, and relevant processing versions. They contain no colon or sensitive text. BullMQ
job-ID deduplication prevents concurrent duplicate work while retained; MongoDB service keys remain
authoritative after BullMQ retention expires.

## Durable MongoDB operational model

Add three collections:

### `pipeline_runs`

One document per operator, scheduler, API, or chained pipeline trigger. It records pipeline kind,
trigger, bounded scope, state, counters, timestamps, initiating actor when applicable, and safe
failure summary. It never embeds unbounded steps or source content.

States: `queued`, `running`, `partially_completed`, `completed`, `failed`, `quarantined`, and
`cancelled`.

### `pipeline_steps`

One immutable-identity/current-state document per logical queued step. It records the typed target
reference, idempotency key, BullMQ queue/job identifiers, attempt counts, state transitions,
processing versions, timestamps, safe error code/message, and quarantine reason.

States: `pending_dispatch`, `waiting`, `active`, `retrying`, `completed`, `failed`, `quarantined`,
and `cancelled`.

BullMQ owns execution locks and retry timing. These MongoDB records are audit/reconciliation
projections and must never become a home-grown lease system.

### `worker_heartbeats`

One current record per worker process contains instance ID, process version, queues, start time,
last heartbeat, state, active-job count, and graceful-shutdown timestamps. A TTL index removes
expired historical heartbeat records after seven days. Heartbeats are operational health data, not
job locks.

Important indexes include unique step idempotency, run/status/update time, queue/status/update time,
target lookup, quarantine lookup, and unique worker instance identity.

## Dispatch and dual-write safety

MongoDB intent is written before Valkey enqueue whenever an API or pipeline transition creates
business-significant work.

1. Create or resolve the durable pipeline run and step by deterministic key.
2. Attempt to add the BullMQ job with the deterministic job ID.
3. Mark the step waiting after confirmed enqueue.
4. If enqueue fails, leave `pending_dispatch`; never roll back already accepted product data.
5. `maintenance.reconcile` finds pending/stale MongoDB work and safely re-enqueues it.

The reconciler does not acquire leases or decide whether a handler is already running. BullMQ job
IDs and active job state prevent concurrent duplication; service-level MongoDB idempotency makes a
repeated execution harmless.

## Pipeline chaining

Pipelines use dynamic chaining after each durable service result, not one monolithic BullMQ Flow.
This prevents one poison child from blocking all unrelated targets.

1. A source discovery/scheduler job enqueues one bounded sync per enabled registry source.
2. A source sync runs existing incremental logic, then queries changed/pending immutable source
   items for that registry and enqueues one extraction job per item.
3. Extraction validates and processes one source item. A produced candidate enqueues one scoring
   job. Irrelevant/no-solution results complete without downstream work.
4. Scoring processes one candidate and enqueues canonicalization only for an eligible persisted
   assessment.
5. Canonicalization profiles the candidate, evaluates plausible deterministic blocks, performs only
   already-authorized conservative automatic merges, and leaves ambiguous pairs in review. New or
   changed review-state KnownPaths enqueue projection.
6. Projection creates the deterministic local search document and, only for public records with an
   available approved public provider, generates/reuses the configured embedding.
7. Changed outcome assessments enqueue projection refresh so ranking aggregates become current.

Every handler may enqueue zero or more children. A `chainDepth` bound and explicit allowed-edge map
prevent loops. A child idempotency key includes its relevant persisted version, so an unchanged
parent cannot produce chargeable duplicate provider work.

## Contributions and outcomes

Contribution submission is split into storage and processing:

- validate consent, sanitize, and persist the contribution in MongoDB first;
- quarantined contributions remain quarantined and are not queued;
- safe contributions return HTTP 202/MCP success with `processingStage: stored`;
- enqueue `contribution.process` after persistence;
- if Valkey is unavailable, return the same safely stored pending result and record deferred
  dispatch for reconciliation;
- the job invokes the existing resumable processing stages and chains candidate work;
- private contributions keep every existing public-provider prohibition.

Outcome submission preserves its current response contract and immediate conservative assessment. It
also enqueues an idempotent `outcomes.aggregate` step for recomputation/projection refresh.
Scheduled aggregation and stale reconciliation ensure outcomes submitted during queue outages are
eventually reflected without accepting a duplicate as additional evidence.

## Retries, poison data, and quarantine

Default transient retry policy is five total attempts with BullMQ exponential backoff, a two-second
seed delay, and 50% jitter. Overrides remain bounded:

- GitHub: five attempts, five-second seed;
- Gemini: four attempts, ten-second seed;
- official HTTP sources: five attempts, two-second seed;
- deterministic local processing: three attempts, one-second seed.

Known rate-limit responses can invoke the worker's global rate-limit delay. Validation failures,
privacy/provider-visibility violations, missing permanent targets, and unsupported payload versions
throw BullMQ `UnrecoverableError` and skip pointless retries.

On exhausted or unrecoverable failure, the job remains in BullMQ's failed set for bounded operator
inspection and the pipeline step becomes `quarantined` with a safe code and message. Source text,
tokens, headers, stack dumps, and private notes are not copied into errors. Other target jobs
continue. Operators can retry the same logical step only through the typed retry command, which
preserves audit history and never changes the idempotency target silently.

Completed jobs are retained for 24 hours with a count cap. Failed jobs are retained for 30 days with
a larger count cap. MongoDB pipeline audit records are retained for 90 days; quarantined runs are
retained for one year unless a later formal retention policy supersedes this decision.

## Scheduling and reprocessing

BullMQ Job Schedulers are upserted with stable IDs; repeated synchronization cannot duplicate them.
Per-source refresh policy lives in the data-driven source registry configuration and supports
`enabled`, UTC cron expression, bounded lookback/backfill options, and adapter-specific limits.

Initial policy is conservative:

- GitHub incremental sources: every two hours;
- curated official documentation/release sources: every six hours;
- pending-dispatch reconciliation: every five minutes;
- stale-job/retry reconciliation: every fifteen minutes;
- freshness/score/outcome maintenance: daily in UTC.

Schedules are disabled by default in contributor environments and enabled explicitly with
`QUEUE_SCHEDULES_ENABLED=true`. `jobs schedules sync` shows the exact upserts. Targeted operator
commands can enqueue one source/item/candidate/KnownPath or bounded version migration without
changing schedule configuration.

## Worker lifecycle and recovery

The long-running worker:

- requires valid MongoDB and Valkey configuration before reporting ready;
- registers handlers before accepting work;
- writes a MongoDB heartbeat immediately and at a configured interval;
- records active counts and queue membership;
- listens for BullMQ error, failed, stalled, completed, and progress events using safe structured
  logs;
- handles SIGINT and SIGTERM once, stops schedule dispatch, closes workers so active jobs can
  finish, closes producers/events, marks its heartbeat stopped, then closes MongoDB;
- enforces an application shutdown deadline; forced interruption relies on BullMQ lock expiry and
  stalled-job recovery;
- uses BullMQ `maxStalledCount: 2` and a configurable lock duration suitable for bounded handlers.

Handlers must use bounded provider timeouts and abort signals so graceful shutdown is finite.
CPU-heavy normalization remains bounded; future genuinely CPU-heavy work can use sandboxed
processors without changing contracts.

## API and operator surfaces

Admin-session-only endpoints:

- `GET /api/v1/admin/jobs` returns cursor-paginated safe pipeline summaries;
- `GET /api/v1/admin/jobs/:id` returns a run and bounded step summaries;
- `GET /api/v1/admin/workers` returns heartbeat freshness and queue availability.

These endpoints expose no source bodies, queue connection data, secrets, raw provider errors,
private contribution notes, or BullMQ internal command payloads. Mutation remains in authenticated
operator CLI commands during Phase 16.

Developer commands:

- `pnpm jobs work`
- `pnpm jobs enqueue ...`
- `pnpm jobs status`
- `pnpm jobs inspect --id ...`
- `pnpm jobs pause|resume --queue ...`
- `pnpm jobs retry --step ...`
- `pnpm jobs quarantine ...`
- `pnpm jobs schedules sync|status`

Machine-readable JSON is the default for inspection/status; human help documents target and safety
bounds.

## Valkey-unavailable behavior

Valkey failure must not make MongoDB product data disappear or make unrelated reads fail.

- API startup and knowledge/auth/readiness continue when queue configuration is absent or Valkey is
  temporarily unreachable.
- Readiness reports `queue: ok|degraded|disabled` while overall readiness continues to depend on the
  existing MongoDB/auth core.
- Contribution submission persists a pending record before enqueue and returns 202 with an explicit
  deferred processing state when dispatch is unavailable.
- Outcome submission retains its synchronous durable response; queued follow-up may be deferred.
- Admin queue operations return HTTP 503 with stable `queue_unavailable` and a request ID.
- A worker cannot be ready without Valkey and exits startup clearly if required queue configuration
  is missing or malformed.
- Producers fail quickly during connection loss. Workers keep reconnecting according to BullMQ's
  supported connection behavior.
- When Valkey returns, scheduler synchronization and MongoDB reconciliation reconstruct outstanding
  queue work.

No handler treats BullMQ completion data as the only proof of business completion. It always checks
MongoDB state.

## Configuration

Central typed configuration includes:

- `QUEUE_REDIS_URL` with no production default;
- `QUEUE_PREFIX`;
- `QUEUE_SCHEDULES_ENABLED`;
- producer connect/command timeouts;
- worker heartbeat, stale threshold, shutdown deadline, lock duration, and stalled count;
- per-queue concurrency;
- GitHub, official-source, and Gemini limiter maxima/durations;
- completed/failed job retention caps;
- reconciliation and maintenance schedules.

URLs and credentials are redacted from logs and admin responses. Worker and API processes receive
only their required environment values.

## Local development infrastructure

`compose.yaml` adds `valkey/valkey:9.1.1-alpine`, bound to `127.0.0.1:6379`, with a
`valkey-cli ping` health check, named data volume, AOF enabled, and `maxmemory-policy noeviction`.
`pnpm dev:infra` starts MongoDB and Valkey; the corresponding down command remains explicit and
non-destructive to named volumes.

Valkey persistence improves queue recovery but does not promote Valkey into product storage. A lost
development Valkey volume can be rebuilt from MongoDB via schedules/reconciliation.

## Verification plan

No automated tests are added. Verification must observe:

1. dependency install, typecheck, lint, build, and formatting validation;
2. healthy local MongoDB and Valkey;
3. idempotent database/index initialization and idempotent scheduler upsert;
4. a bounded real Expo or React Native source sync through the queue;
5. per-item extraction/scoring/canonical/projection transitions and resulting MongoDB records;
6. an unchanged repeat reusing persisted outputs and avoiding duplicate provider charges;
7. one deliberate safe transient failure retry followed by success;
8. one deliberate permanent validation failure entering quarantine without blocking a sibling;
9. worker interruption/restart with stalled recovery or, if the bounded handler finishes too fast,
   an explicit development hold job that contains no product data;
10. configured external-provider concurrency/rate limits through inspection output;
11. API behavior with Valkey available and unavailable;
12. no secret, source dump, private note, queue credential, or generated artifact in tracked files
    or logs.

If a real Gemini/GitHub credential is unavailable, the corresponding live provider verification is
recorded honestly and deterministic/local pipeline stages are still exercised. No fake provider is
added to production code.

## Documentation and decision records

Implementation updates:

- `docs/ARCHITECTURE.md` for runtime/dependency flow;
- `docs/DATA_MODEL.md` for operational collections/indexes/retention;
- `docs/DECISIONS.md` for BullMQ/Valkey, durable-intent, and dynamic-chaining decisions;
- a new `docs/OPERATIONS.md` runbook;
- `.env.example`, `compose.yaml`, root/worker commands, and README;
- `progress.md` Phase 16 with exact observed verification and manual production requirements.

## Explicitly deferred

- Phase 17 and any inferred dashboard/product feature;
- team contribution processing;
- distributed tracing/metrics backend;
- BullMQ Pro features;
- a custom MongoDB lease/retry engine;
- automatic moderation or publication changes;
- paid queue hosting or an automatic production infrastructure purchase;
- automated tests, by explicit phase requirement.
