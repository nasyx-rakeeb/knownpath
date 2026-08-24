# Background pipeline operations

Phase 16 uses BullMQ 6.2.0 over the Valkey-compatible Redis protocol. MongoDB remains the only
persistent product database. Valkey holds queue entries, schedules, retry timing, global provider
rate limits, locks, stalled-job coordination, and retained job diagnostics; it is never the only
copy of a source, candidate, contribution, outcome, KnownPath, or pipeline intent.

## Runtime topology

- `@knownpath/jobs` is the only BullMQ-facing package. It owns connections, queue names, retry and
  retention policy, scheduling, dispatch, worker lifecycle, and MongoDB status projection.
- `@knownpath/pipelines` maps typed job payloads to domain services and creates bounded downstream
  jobs. Payloads contain IDs and processing options, not source bodies or credentials.
- `@knownpath/worker jobs start` runs consumers for `control`, `github`, `sources`, `ai`,
  `knowledge`, and `feedback`.
- `pipeline_runs`, `pipeline_steps`, and `worker_heartbeats` provide durable inspection and audit
  state. A step is inserted as `pending_dispatch` before BullMQ receives it.

The normal chain is changed source -> extraction -> deterministic assessment -> conservative
canonicalization/rebuild -> search projection. Contributions enter at contribution processing;
outcomes enter at aggregation and projection. Each target becomes its own job so one poison record
does not stop unrelated work.

## Local setup

Copy `.env.example` to `.env`, configure MongoDB, and start Valkey:

```sh
pnpm dev:infra
pnpm db:init
pnpm jobs start
```

The Compose Valkey service is loopback-only, uses AOF plus periodic snapshots, and explicitly uses
`noeviction`, which BullMQ requires for reliable queue keys. The worker refuses to start without
`QUEUE_REDIS_URL`. Set `QUEUE_SCHEDULES_ENABLED=true` before applying schedules:

```sh
pnpm jobs schedules apply
pnpm jobs schedules status
```

Every enabled entry in `config/sources/registry.json` has `refreshIntervalMinutes`. Applying
schedules creates one source-specific scheduler so failures and rate limits remain isolated.
Maintenance reconciliation runs every five minutes, stale inspection every fifteen minutes, and
freshness rescoring daily. Schedules are disabled by default and may be removed idempotently.

## Enqueue and inspect

```sh
pnpm jobs enqueue source.github.sync \
  --target-kind source_registry --target-id expo-core \
  --options-json '{"limit":5}'
pnpm jobs status
pnpm jobs pause ai
pnpm jobs resume ai
pnpm jobs retry-failed ai
```

The API exposes `GET /api/v1/admin/jobs` only to an authenticated administrator session. It returns
safe queue counts, durable runs, and recent worker heartbeats; it never returns job source bodies,
provider secrets, or credentials.

## Retry, quarantine, and recovery

Default work receives five attempts with exponential backoff from two seconds and 50% jitter. GitHub
begins at five seconds; Gemini extraction/embedding begins at ten seconds with four attempts; local
development failures use three attempts from one second. Permanent errors become BullMQ
`UnrecoverableError` failures. Exhausted work is marked `quarantined` in MongoDB with a bounded safe
error and remains available for operator inspection; retries never overwrite product entities.

BullMQ's lock renewal and stalled checker recover interrupted jobs, with `maxStalledCount=2`.
Handlers are idempotent through existing source hashes, extraction keys, immutable assessments,
canonical memberships, projections, contribution IDs, and outcome assessment inputs. A bounded
graceful shutdown stops intake, waits for active jobs, then forces close only after
`QUEUE_WORKER_SHUTDOWN_MS`.

## Failure behavior

- If Valkey is absent from API configuration, normal auth and knowledge reads work and readiness
  reports queues as `disabled`. Contributions retain their existing synchronous path.
- If Valkey is configured but unavailable, normal API reads continue and readiness reports queues as
  `unavailable`. Queue administration returns `queue_unavailable` with HTTP 503.
- Contribution and outcome data is written to MongoDB before dispatch. A dispatch timeout leaves a
  durable `pending_dispatch` step; reconciliation resubmits it when Valkey returns.
- Workers fail startup clearly when Valkey is missing or unreachable. No business state is inferred
  from missing BullMQ jobs.

## References

- [BullMQ connections](https://docs.bullmq.io/guide/connections)
- [BullMQ retries and jitter](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ job schedulers](https://docs.bullmq.io/guide/job-schedulers)
- [BullMQ rate limiting](https://docs.bullmq.io/guide/rate-limiting)
- [BullMQ graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown)
- [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production)
- [Valkey installation](https://valkey.io/topics/installation/)
