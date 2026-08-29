# Deployment

KnownPath is provider-neutral. A deployment needs three application processes plus MongoDB and
Valkey; it does not require a paid identity, database abstraction, queue, or observability vendor.

## Production topology

| Component                  | Container target    | State/role                                                 |
| -------------------------- | ------------------- | ---------------------------------------------------------- |
| Fastify API + remote MCP   | `api`               | Stateless HTTP; critical MongoDB and rate-limiter checks   |
| Next.js dashboard          | `web`               | Stateless server-rendered UI that calls the API            |
| BullMQ consumers/scheduler | `worker`            | Continuous or bounded jobs; requires Valkey                |
| MongoDB                    | managed/self-hosted | Only persistent product database and audit source of truth |
| Valkey-compatible service  | managed/self-hosted | Ephemeral queues, schedules, locks, and rate limits        |
| OpenTelemetry Collector    | optional            | Operator-controlled OTLP routing; never product truth      |

The root [`Dockerfile`](../Dockerfile) builds `api`, `web`, or `worker` targets as non-root Node 24
processes. The local [`compose.yaml`](../compose.yaml) is a reproducible development topology, not a
production availability design.

## Build

```sh
docker build --target api -t knownpath-api:local .
docker build --target worker -t knownpath-worker:local .
docker build --target web -t knownpath-web:local .
```

Pin deployed images to an immutable version/digest. Keep API and worker on the same application
release so job payload and domain schema versions agree.

## Required configuration

Use the grouped [`.env.example`](../.env.example) as the contract, but inject real values through
the host's secret manager. At minimum:

- MongoDB URI/database and network/TLS access;
- Valkey TLS URL with eviction disabled;
- unique `BETTER_AUTH_SECRET` and `API_KEY_PEPPER`;
- canonical HTTPS `BETTER_AUTH_URL`, dashboard/API origins, trusted proxies, and CORS origins;
- `API_RATE_LIMIT_STORE=valkey` in production;
- public-data Gemini and GitHub credentials only on worker/provider processes that need them;
- dashboard `KNOWNPATH_API_URL`; no application process needs a user API key;
- optional OTLP endpoint without credentials embedded in telemetry attributes.

Never put `KNOWNPATH_API_KEY` in a server image or agent config. The stdio bridge reads it only from
the environment that launches the agent. Public/unpaid Gemini remains hard-blocked for
private/workspace content.

## Initialize and provision

From a trusted operator environment using production MongoDB configuration:

```sh
pnpm install --frozen-lockfile
pnpm db:init
SEARCH_BACKEND=atlas pnpm run search indexes status # only when Atlas search is selected
pnpm auth:user:create
```

`db:init` is idempotent and should run before traffic on each schema/index release. Registration
remains closed. Never bake the first-admin credential into an image, manifest, or CI variable.

## Run and verify

Start API and web as long-running HTTP services and the worker as either:

- `node dist/index.js jobs start` for continuous processing; or
- `node dist/index.js jobs drain` for bounded scheduled compute.

Expose API/web only behind TLS. Do not expose MongoDB or Valkey publicly. Verify:

```sh
curl --fail --show-error https://knownpath.example/health/live
curl --fail --show-error https://knownpath.example/health/ready
```

Readiness fails for critical MongoDB/distributed-rate-limiter failure and reports optional queue or
telemetry degradation separately. Then verify authenticated search, remote MCP, stdio MCP, dashboard
session/API-key lifecycle, worker heartbeat, and an idempotent bounded job.

## Local production-shaped stack

```sh
cp .env.example .env
# fill local secrets
docker compose --profile platform up --build
```

Compose publishes web/API only on loopback, creates local MongoDB/Valkey volumes, waits on health
conditions, and uses container-network origins internally. Stop without deleting named data:

```sh
docker compose down
```

## Current low-cost hosted example

The committed `render.yaml` deploys the API on Render; MongoDB Atlas supplies product persistence.
The existing `.github/workflows/process-queues.yml` can drain BullMQ through a Valkey-compatible
Upstash TLS URL on a schedule. This is an example, not a platform requirement or always-on SLA.
Render free services may sleep and GitHub schedules may be delayed/disabled after inactivity.

For that topology:

1. import `render.yaml` as a Blueprint and enter only prompted secrets;
2. permit the service's outbound network in Atlas;
3. set the same `QUEUE_REDIS_URL` on API and worker workflow;
4. store MongoDB, Valkey, auth/pepper, Gemini, and optional GitHub values as GitHub Actions secrets;
5. manually run the queue workflow before enabling its schedule variable;
6. deploy the web container/service separately with the canonical API origin.

Do not add automatic paid upgrades. Monitor free-tier storage, commands, provider quotas, schedule
latency, and cold starts before claiming production availability.

## Backups, scaling, and failures

- Back up MongoDB using provider-native consistent backups and practice restoration. Valkey loss
  must not lose product records; durable `pending_dispatch` intent is reconciled after recovery.
- Scale API horizontally only with the shared Valkey limiter. Scale workers with queue/provider
  concurrency limits intact.
- Preserve immutable assessment, canonical history, consent, outcome, and audit records.
- Rotate credentials in the order documented in [Security operations](SECURITY_OPERATIONS.md).
- Export telemetry through an operator-controlled collector as described in
  [Observability](OBSERVABILITY.md).
- Follow [Operations](OPERATIONS.md) for retries, quarantine, stalled recovery, and queue outage
  behavior.

Release preflight and rollback are in [Release](RELEASE.md); the empty-database data path is in
[Ingestion](INGESTION.md).
