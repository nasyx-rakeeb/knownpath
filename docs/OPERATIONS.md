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

For bounded compute, `pnpm jobs drain` starts the same six consumers and exits after every runnable
queue has remained idle for `QUEUE_DRAIN_IDLE_MS`. Future scheduled jobs and delayed retries do not
keep the process alive; they are eligible on the next invocation. `QUEUE_DRAIN_MAX_RUNTIME_MS`
causes a non-zero exit if runnable work remains beyond the execution budget. `jobs start` retains
its existing continuous-worker behavior.

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

The Phase 18 administration API exposes safe queue counts, durable runs, worker heartbeats,
fresh-session queue pause/resume, and preserved-history retry. It never returns job source bodies,
provider secrets, or credentials. See [`ADMIN_OPERATIONS.md`](ADMIN_OPERATIONS.md).

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

## Free hosted worker path

The early hosted deployment uses an Upstash free Redis-compatible database and
`.github/workflows/process-queues.yml` instead of a paid always-on Render worker. Upstash officially
supports BullMQ over its TLS Redis URL. The workflow runs at minutes 7 and 37 of every hour and can
also be started manually. It drains runnable work for at most ten minutes and then closes all
workers gracefully. Schedule installation is an explicit manual-dispatch option so connecting the
infrastructure cannot accidentally start every configured source against free provider quotas.

This path is intentionally not an always-on production SLA. GitHub can delay scheduled workflows,
and it disables schedules in public repositories after 60 days without repository activity. A
delayed retry may wait for the next invocation. Standard GitHub-hosted runners are currently free
for public repositories, and the selected Upstash tier has bounded command/storage quotas. Monitor
both providers before increasing source cadence. The hosted drain polls every five seconds and
requires fifteen seconds of runnable idleness, deliberately reducing idle queue commands.

The workflow has read-only repository permissions, runs only from `main`, does not execute for pull
requests, permits only one worker run at a time, and pins official actions to immutable revisions.
Its required credentials are repository Actions secrets; it never echoes them. Scheduled events are
skipped until `KNOWNPATH_SCHEDULED_WORKER_ENABLED=true` is configured as a repository Actions
variable after a successful manual run. See
[`DEPLOYMENT.md`](DEPLOYMENT.md#configure-the-free-queue-and-scheduled-worker) for exact setup.

## References

- [BullMQ connections](https://docs.bullmq.io/guide/connections)
- [BullMQ retries and jitter](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ job schedulers](https://docs.bullmq.io/guide/job-schedulers)
- [BullMQ rate limiting](https://docs.bullmq.io/guide/rate-limiting)
- [BullMQ graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown)
- [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production)
- [Valkey installation](https://valkey.io/topics/installation/)
- [Upstash BullMQ integration](https://upstash.com/docs/redis/integrations/bullmq)
- [Upstash Redis free limits](https://upstash.com/docs/redis/overall/billing)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
