# KnownPath free scheduled worker deployment design

## Goal

Run KnownPath's Phase 16 pipelines without a paid always-on worker while preserving the existing
BullMQ boundary, MongoDB durability, idempotency, and provider privacy rules.

## Selected approach

Use an Upstash free Redis-compatible database as the BullMQ queue and a GitHub Actions workflow as
bounded compute. The Render API writes jobs to Upstash. A workflow runs every thirty minutes and on
manual dispatch, starts all six queue consumers, waits until the queues have remained idle for a
bounded interval, then shuts down cleanly. Product data and durable pipeline intent remain in
MongoDB Atlas; the queue is never the only copy of important business state.

This is a development/early-project deployment, not an always-on production SLA. Work can be delayed
by the schedule, GitHub may delay scheduled workflows, and public-repository schedules are disabled
after sixty days without repository activity.

## Alternatives considered

1. **Selected: Upstash plus scheduled GitHub Actions.** Zero monthly hosting cost, persistent queue,
   official BullMQ compatibility, and no always-on idle polling. The trade-off is delayed
   processing.
2. **Render free Key Value plus a laptop worker.** Simpler, but Render can restart the free queue
   and erase pending queue state, and processing depends on a developer machine being online.
3. **Render persistent Key Value plus Background Worker.** Best operational behavior and immediate
   processing, but adds recurring infrastructure cost and is premature for current usage.

## Components and data flow

1. The Render API receives a contribution, outcome, or operator action and first writes durable
   state to MongoDB.
2. The API uses `QUEUE_REDIS_URL` to enqueue a small ID-only BullMQ payload in Upstash.
3. GitHub Actions checks out the trusted default branch, installs locked dependencies, builds the
   worker, and invokes a bounded drain command.
4. The drain command starts the same `OperationalWorkerRuntime` used by the continuous worker. It
   exits only after every queue is idle for the configured settling period, or fails when the
   maximum runtime is reached while work remains.
5. Existing handlers write results and transitions to MongoDB. Retries remain safe through existing
   idempotency keys and durable pipeline steps.

## Worker command

Add `jobs drain` rather than changing `jobs start` semantics. Supported limits are environment-based
for deployment safety:

- `QUEUE_DRAIN_IDLE_MS`: continuous all-queues-idle period required before exit.
- `QUEUE_DRAIN_MAX_RUNTIME_MS`: hard upper bound for one scheduled invocation.
- `QUEUE_DRAIN_POLL_MS`: queue-state polling interval.

All values receive strict bounded runtime validation and safe defaults. A timeout with outstanding
work exits non-zero so GitHub records a failed run instead of claiming success. Signal handling uses
the existing graceful shutdown path.

## GitHub Actions security

The workflow runs only from `schedule` and `workflow_dispatch` on the default branch. It does not
run with secrets for pull requests or arbitrary fork code. Permissions are read-only, concurrency
allows only one production worker run, logs never print environment values, and credentials are read
from GitHub Actions secrets:

- `KNOWNPATH_MONGODB_URI`
- `KNOWNPATH_QUEUE_REDIS_URL`
- `KNOWNPATH_BETTER_AUTH_SECRET`
- `KNOWNPATH_API_KEY_PEPPER`
- `KNOWNPATH_GEMINI_API_KEY` when provider-backed jobs are enabled
- `KNOWNPATH_GITHUB_TOKEN` when authenticated source ingestion is enabled

Scheduled events are skipped until the non-secret repository Actions variable
`KNOWNPATH_SCHEDULED_WORKER_ENABLED=true` is set after a successful manual verification run.

Non-secret configuration remains explicit in the workflow. Third-party actions are pinned to commit
SHAs to reduce supply-chain drift.

## Render and Upstash configuration

The Blueprint keeps the queue external and adds `QUEUE_REDIS_URL` as `sync: false`; no URL or
credential is committed. The same Upstash TLS URL is stored separately in Render and GitHub Secrets.
Eviction remains disabled. The API degrades predictably when the queue is unavailable, as already
implemented in Phase 16.

## Scheduling

GitHub Actions runs at non-round minutes every thirty minutes to reduce peak scheduler delay and
free-tier queue commands. It also supports manual dispatch. Applying the idempotent BullMQ schedules
is a manual-dispatch option, disabled by default, so initial infrastructure verification cannot
trigger all sources against free provider quotas. Normal invocations drain available jobs. BullMQ
recurring jobs therefore become eligible on the next bounded worker run rather than requiring an
always-on process.

## Verification

No tests are added. Verification consists of typecheck, lint, formatting validation, build, local
bounded-drain behavior against a disposable Valkey instance, workflow syntax inspection, a manual
GitHub Actions run using repository secrets, and confirmation that Render readiness sees the
external queue. Live Upstash/GitHub/Render verification remains explicitly pending until the user
creates the free Upstash database and configures the secret values.

## Rollback

Remove or disable the scheduled workflow and remove `QUEUE_REDIS_URL` from Render. The API returns
to its documented queue-disabled behavior. No product records are deleted. A future always-on worker
can reuse the same queue contracts and `jobs start` command without refactoring pipeline logic.
