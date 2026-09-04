# Operations

This guide is for operators running KnownPath workers and source pipelines. Ordinary hosted users do
not need to operate MongoDB, Valkey, workers, or provider integrations.

## Worker architecture

KnownPath uses BullMQ 6.2.0 over the Valkey-compatible Redis protocol. MongoDB remains the only
durable product database; Valkey holds queues, schedules, retry timing, rate limits, leases, stalled
job coordination, and bounded job diagnostics.

```text
durable intent in MongoDB
          │
          ▼
  BullMQ job in Valkey
          │
          ▼
typed pipeline handler
          │
          ├── update durable product state
          └── enqueue bounded next step
```

`@knownpath/jobs` owns BullMQ connections, queue names, retry/retention policy, scheduling, and
worker lifecycle. `@knownpath/pipelines` maps versioned payloads to domain services. Payloads
contain record IDs and options, not source bodies or credentials.

Workers consume six queues: `control`, `github`, `sources`, `ai`, `knowledge`, and `feedback`.
Durable `pipeline_runs`, `pipeline_steps`, and `worker_heartbeats` records support inspection and
reconciliation. A step is stored as `pending_dispatch` before it is sent to BullMQ.

## Pipelines

Changed public sources proceed through extraction, deterministic assessment, conservative
canonicalization/rebuild, and search projection. Contribution processing begins at the contribution
step; outcome processing begins at aggregation and projection. Each target is a separate job so a
poison record cannot block an entire run.

Handlers are idempotent through source content hashes, extraction keys, immutable assessments,
canonical memberships, projection hashes, contribution IDs, and outcome inputs. Retrying a job must
not create a second business record.

## Local operation

Start Valkey, initialize MongoDB, and run continuous workers:

```sh
pnpm dev:infra
pnpm db:init
pnpm jobs start
```

Use `pnpm dev:infra:all` to start local MongoDB and Valkey together. The Compose Valkey service is
loopback-only, persists AOF/snapshots for development diagnostics, and uses `noeviction`, as BullMQ
requires.

For bounded scheduled compute, use:

```sh
pnpm jobs drain
```

The drain command exits after runnable queues remain idle for `QUEUE_DRAIN_IDLE_MS`. Future
schedules and delayed retries do not prevent exit; `QUEUE_DRAIN_MAX_RUNTIME_MS` returns a nonzero
status if runnable work exceeds the budget. Scheduled ephemeral workers may pass
`--allow-incomplete` to exit successfully after that bounded window and leave durable queued work
for the next invocation.

## Schedules

Schedules are disabled until explicitly enabled:

```dotenv
QUEUE_SCHEDULES_ENABLED=true
```

Then apply and inspect them idempotently:

```sh
pnpm jobs schedules apply
pnpm jobs schedules status
pnpm jobs schedules remove
```

Each enabled source registry entry receives an independent refresh schedule. Maintenance
reconciliation runs every five minutes, stale inspection every fifteen minutes, and freshness
rescoring daily.

## Enqueue and inspect

```sh
pnpm jobs enqueue source.github.sync \
  --target-kind source_registry --target-id expo-core \
  --options-json '{"limit":5}'
pnpm jobs status
pnpm jobs pause ai
pnpm jobs resume ai
pnpm jobs retry-failed ai
pnpm jobs recover-extractions --limit 5
```

The admin API and dashboard expose safe queue counts, durable runs, heartbeats, pause/resume, and
preserved-history retry controls. Sensitive queue actions require fresh admin authentication,
confirmation, a reason, and an audit event. See [Admin operations](ADMIN_OPERATIONS.md).

## Retry and quarantine

Default jobs receive five attempts with exponential backoff from two seconds and 50% jitter. GitHub
work starts at five seconds. Gemini extraction and embedding start at ten seconds with four
attempts. BullMQ lock renewal and stalled-job checks recover interrupted work, with
`maxStalledCount=2`.

Permanent failures use BullMQ's unrecoverable failure path. Exhausted work is marked `quarantined`
in MongoDB with a bounded safe error; retries do not overwrite product entities. Graceful shutdown
stops intake, waits for active jobs, and forces closure only after `QUEUE_WORKER_SHUTDOWN_MS`.
`recover-extractions` explicitly requeues the latest retryable extraction failure for each source
item. For GitHub Actions, set `recovery_limit` to a small value first when validating a changed
provider key or model configuration. Each selected source gets a fresh extraction attempt; its
recovery key makes repeated invocations idempotent for the same failed attempt.

Gemini extraction uses the stable `generateContent` structured-output API. This keeps the
free-development `gemini-2.5-flash-lite` path independent of Interactions API model availability;
the selected model and generation configuration remain part of extraction provenance. The scheduled
worker validates that its API key exposes the configured model with `generateContent` support before
installing dependencies or touching queue state.

## Valkey outages

- Workers refuse to start when `QUEUE_REDIS_URL` is missing or unreachable.
- Production API startup and readiness require Valkey for distributed rate limiting; there is no
  in-memory production fallback.
- If the limiter is healthy but the queue path is unavailable, readiness reports `degraded` and
  queue administration returns `queue_unavailable` (`503`).
- Contributions and outcomes are written to MongoDB before dispatch. A timed-out dispatch leaves a
  durable `pending_dispatch` step for reconciliation.
- Missing BullMQ jobs are never interpreted as missing business data.

## Provider limits and source maintenance

Queue concurrency and rate limits are configured independently for GitHub, official sources, and
Gemini. Increase them only after reviewing the external provider's current quotas and the source's
refresh policy. Use bounded backfills and targeted reprocessing for prompt, score, or embedding
version changes.

Before enabling a source, review its ownership, allowed origins/paths, robots policy, attribution,
and expected update cadence. Monitor last sync, lag, discovered/changed/failed counts, and
rate-limit state.

## Retention and cleanup

Completed and failed BullMQ entries use configured time/count retention and are operational
diagnostics only. Do not use queue cleanup as a product-data deletion mechanism. Preserve durable
source provenance, immutable assessments, canonical history, consent, outcomes, and audit records
according to the deployment's retention policy.

See [Deployment](DEPLOYMENT.md), [Observability](OBSERVABILITY.md), and
[Security operations](SECURITY_OPERATIONS.md).

## References

- [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production)
- [BullMQ retries](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ job schedulers](https://docs.bullmq.io/guide/job-schedulers)
- [BullMQ graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown)
- [Valkey installation](https://valkey.io/topics/installation/)
