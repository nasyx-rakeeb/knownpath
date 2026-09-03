# Self-hosting and deployment

This guide is for operators who choose to run KnownPath. It is not required for developers using the
hosted network through `npx knownpath install`; those users only need a provisioned API URL and key.
See [Agent installation](AGENT_INSTALLATION.md).

KnownPath is provider-neutral and can run on a container platform, virtual machines, or Kubernetes.
Provider examples are illustrative, not required architecture.

## Production topology

| Component                 | Image target           | Responsibility                                                         |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| Fastify API + remote MCP  | `api`                  | Stateless HTTP, auth, retrieval, mutations, critical dependency checks |
| Next.js dashboard         | `web`                  | Stateless server-rendered user/admin interface                         |
| BullMQ worker             | `worker`               | Continuous or bounded pipelines and schedules                          |
| MongoDB                   | Managed or self-hosted | Only durable product database and audit source of truth                |
| Valkey-compatible service | Managed or self-hosted | Queues, schedules, leases, locks, coordination, distributed limits     |
| OpenTelemetry Collector   | Optional               | Operator-controlled OTLP routing; never product state                  |

The root [Dockerfile](../Dockerfile) builds non-root Node 24 images for all three application
targets. [compose.yaml](../compose.yaml) is a reproducible development topology, not a production
high-availability design.

## Prerequisites

- Node.js 24 LTS and pnpm 11 when operating from source;
- MongoDB with TLS, authentication, backups, and appropriate network controls;
- Valkey/Redis-protocol service with `noeviction` for BullMQ;
- a canonical HTTPS API URL, dashboard URL, and trusted browser origins;
- independent session and API-key hashing secrets;
- optional GitHub token for higher public API limits and Discussions;
- optional Gemini key for public extraction/embeddings; and
- optional MongoDB Atlas Search/Vector Search when `SEARCH_BACKEND=atlas`.

Use [`.env.example`](../.env.example) as the complete configuration contract. Inject real values
through the host's secret manager; do not bake them into images or commit `.env`.

Production must set `API_RATE_LIMIT_STORE=valkey`, a reachable `QUEUE_REDIS_URL`, HTTPS auth URLs,
exact CORS/trusted origins, and distinct `BETTER_AUTH_SECRET` and `API_KEY_PEPPER`. Provider secrets
belong only on processes that use them. Public/unpaid Gemini must remain blocked for private/team
content.

## Build images

```sh
docker build --target api -t knownpath-api:local .
docker build --target worker -t knownpath-worker:local .
docker build --target web -t knownpath-web:local .
```

Pin deployments to an immutable tag or digest. Deploy API and worker from the same KnownPath release
so domain and job payload versions agree.

## Initialize and provision

From a trusted operator environment configured for the production database:

```sh
pnpm install --frozen-lockfile
pnpm db:init
SEARCH_BACKEND=atlas pnpm run search indexes status  # only for Atlas search
pnpm auth:user:create
```

`db:init` is idempotent and should run before traffic on a schema/index release. Registration is
closed; create the initial administrator through the interactive CLI and never store its credential
in an image or CI definition.

## Run

- Run the API and web targets as long-lived HTTP services behind TLS.
- Run `node dist/index.js jobs start` in the worker image for continuous consumption, or
  `node dist/index.js jobs drain` for bounded scheduled compute.
- Do not expose MongoDB or Valkey directly to the public internet.
- Keep scheduled source refresh disabled until sources, quotas, and expected workload are reviewed.

Verify the deployment:

```sh
curl --fail --show-error https://knownpath.example/health/live
curl --fail --show-error https://knownpath.example/health/ready
```

Readiness fails for critical MongoDB or production rate-limiter failure and reports optional queue
or telemetry degradation separately. Then verify an authenticated search, remote and stdio MCP,
dashboard session/API-key lifecycle, a worker heartbeat, and one bounded idempotent pipeline job.

## Local production-shaped stack

```sh
cp .env.example .env
# set local secrets and required URLs
docker compose --profile platform up --build
```

Compose publishes API and web only on loopback, creates MongoDB/Valkey volumes, and waits on health
conditions. Stop without deleting named data:

```sh
docker compose down
```

## Low-cost deployment example

The repository includes [render.yaml](../render.yaml) for a Render API deployment and
[`.github/workflows/process-queues.yml`](../.github/workflows/process-queues.yml) for bounded worker
drains against a Valkey-compatible TLS service such as Upstash. MongoDB Atlas can provide the
database and optional search indexes.

This topology is not an always-on SLA. Free services can sleep, provider quotas are bounded, and
GitHub scheduled workflows can be delayed or disabled after repository inactivity. Configure the
same MongoDB and Valkey endpoints for API/workers, run the worker workflow manually first, and only
then enable its scheduled mode. Deploy the web app separately with the canonical API origin.

## Scaling and failure recovery

- Scale API instances only with the shared Valkey limiter.
- Scale workers without bypassing per-provider concurrency and rate limits.
- Back up MongoDB and practice restoration. Valkey loss must not lose product records; reconcile
  durable `pending_dispatch` intent after recovery.
- Preserve immutable assessments, canonical history, consent, outcomes, and audit events.
- Send telemetry through an operator-controlled collector and keep content out of labels.
- Follow [Operations](OPERATIONS.md) for retry/quarantine and
  [Security operations](SECURITY_OPERATIONS.md) for credential rotation.

See [Release](RELEASE.md) for preflight and rollback, [Ingestion](INGESTION.md) for initial seeding,
and [Retrieval](RETRIEVAL.md) for local versus Atlas search behavior.
