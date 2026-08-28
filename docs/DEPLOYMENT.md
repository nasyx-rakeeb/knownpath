# Deploy the KnownPath API on Render

KnownPath deploys the Fastify API as one Render web service and continues to use MongoDB Atlas as
its only persistent product database. The web dashboard, MongoDB, and local stdio MCP bridge are not
part of this service. The current zero-cost worker runs separately through GitHub Actions.

The root [`render.yaml`](../render.yaml) is the API deployment source of truth. It builds from the
monorepo root, runs only `@knownpath/api`, uses Render's `PORT`, checks `/health/ready`, and accepts
an externally managed queue URL without committing it.

## Before creating the service

1. Rotate any Atlas or Gemini credential that has been pasted into chat, logs, or another untrusted
   location. Do not reuse an exposed value.
2. Create a least-privilege Atlas database user for the deployed API and retain the new URI in a
   password manager. Never commit it.
3. Confirm the Atlas database already has the Phase 2 collections/indexes and Phase 9 Atlas Search
   indexes. From a trusted operator environment, use:

   ```sh
   pnpm db:init
   SEARCH_BACKEND=atlas pnpm run search indexes status
   ```

4. Push the deployment commit to the GitHub repository's `main` branch.

## Create the Render Blueprint

In the Render Dashboard, select **New > Blueprint**, connect
`https://github.com/nasyx-rakeeb/knownpath`, and select the root `render.yaml`. The Blueprint
creates only `knownpath-api` in Render's Singapore region.

When Render prompts for `MONGODB_URI`, provide the rotated Atlas URI. When it prompts for
`QUEUE_REDIS_URL`, provide the Upstash TLS Redis URL created below. The Blueprint generates
independent values for `BETTER_AUTH_SECRET` and `API_KEY_PEPPER`; their values are never stored in
Git. Render supplies the assigned HTTPS origin to `BETTER_AUTH_URL` and `AUTH_TRUSTED_ORIGINS`
through its documented `RENDER_EXTERNAL_URL` variable.

After the service exists, open **Connect > Outbound** on the service and add all displayed outbound
CIDR ranges to the Atlas project's network access list. Render can use any address in those shared
regional ranges. A dedicated outbound address can replace them later if operational requirements
justify it.

Do not add `GITHUB_TOKEN`, Gemini credentials, `KNOWNPATH_API_KEY`, or worker-only configuration to
the web service. A rotated `GEMINI_API_KEY` may be added deliberately later if production query
embedding is required; without it, retrieval remains useful through Atlas lexical and deterministic
matching.

## Configure the free queue and scheduled worker

1. Create one free database in the [Upstash Console](https://console.upstash.com/redis). Choose the
   closest available region to the API/database, keep eviction disabled, open **Connect**, and copy
   the TLS Redis connection string beginning with `rediss://`. Do not use the REST URL or print the
   connection string in a terminal transcript.
2. In Render, open `knownpath-api` > **Environment**, set `QUEUE_REDIS_URL` to that TLS string, and
   save/redeploy. Keep `QUEUE_PREFIX=knownpath-production` as defined by the Blueprint.
3. In GitHub, open the KnownPath repository > **Settings** > **Secrets and variables** >
   **Actions**. Create these repository secrets:

   | GitHub secret                       | Required value                                      |
   | ----------------------------------- | --------------------------------------------------- |
   | `KNOWNPATH_QUEUE_REDIS_URL`         | The same Upstash `rediss://` connection string      |
   | `KNOWNPATH_MONGODB_URI`             | The deployed Atlas URI                              |
   | `KNOWNPATH_BETTER_AUTH_SECRET`      | The exact current Render `BETTER_AUTH_SECRET` value |
   | `KNOWNPATH_API_KEY_PEPPER`          | The exact current Render `API_KEY_PEPPER` value     |
   | `KNOWNPATH_GEMINI_API_KEY`          | The approved public-data Gemini key                 |
   | `KNOWNPATH_GITHUB_TOKEN` (optional) | Token for higher limits and Discussions ingestion   |

   Do not generate a different API-key pepper for the worker: it must match the API. Rotating the
   deployed pepper invalidates existing KnownPath API keys.

4. Open **Actions** > **Process production queues** > **Run workflow** on `main`. The workflow
   validates required secrets without printing them, installs the locked workspace, and runs
   `jobs drain`. Leave **Apply schedules** off for the first infrastructure check.
5. Inspect the action summary/log for `worker.ready` and `worker.drain.complete`. Then add the
   repository **Actions variable** `KNOWNPATH_SCHEDULED_WORKER_ENABLED=true` to enable scheduled
   runs. Scheduled events remain safely skipped until this non-secret variable is set.
6. After reviewing the source cadence and free GitHub/Gemini quotas, manually run the workflow once
   with **Apply schedules** enabled. This is the only path that creates/updates BullMQ schedules;
   normal scheduled workflow runs only drain work that is already due or queued.
7. Check:

   ```sh
   curl --fail --show-error https://knownpath-api.onrender.com/health/ready
   ```

   Readiness should report queues as `ok`. A missing/malformed secret fails the workflow clearly;
   API reads continue with the documented queue-degraded behavior if Upstash is unavailable.

The workflow normally starts within each thirty-minute window, not immediately after every enqueue.
GitHub may delay scheduled runs and disables public-repository schedules after 60 days without
repository activity. Manual dispatch remains the recovery path. Upstash free-tier storage and
command limits must be monitored; KnownPath does not enable automatic paid upgrades.

## Verify the deployment

Replace the example origin with the URL shown by Render:

```sh
curl --fail --show-error https://knownpath-api.onrender.com/health/live
curl --fail --show-error https://knownpath-api.onrender.com/health/ready
```

Both requests must return an `ok`/`ready` state. Readiness fails when Atlas cannot be reached, which
usually means the URI or Atlas network access list is incorrect.

Registration remains closed. Create the first administrator only through the existing masked CLI
from a trusted environment configured with the same Atlas database and deployed auth settings:

```sh
pnpm auth:user:create
```

Use the existing authenticated API flow to issue a key with `knowledge:read`, then supply the origin
and key only to the shell that launches coding agents:

```sh
export KNOWNPATH_API_URL='https://knownpath-api.onrender.com'
read -rsp 'KnownPath API key: ' KNOWNPATH_API_KEY && export KNOWNPATH_API_KEY && printf '\n'
npx knownpath doctor --agent all
```

The full key is shown once at issuance and must not be pasted into Render logs, agent configuration,
or Git. The installer stores only environment-variable references.

## Free-instance limitation

The Blueprint initially uses Render's free plan for bounded deployment verification. Render states
that free web services are not for production, spin down after 15 minutes without inbound traffic,
and can take about a minute to wake. Upgrade the same service to an always-on instance before
depending on KnownPath for low-latency agent workflows.

## Operational boundaries

- Automatic deploys follow commits to `main`.
- Production Swagger UI is disabled; OpenAPI JSON remains available at `/api/v1/openapi.json`.
- Browser CORS is disabled until the dashboard has a real origin.
- Proxy trust is explicitly disabled. Do not change it to an unrestricted boolean; record specific
  trusted proxy addresses or ranges if client-IP-aware production limiting is introduced.
- Production request limits and MCP mutation gates use the configured Valkey service. Startup and
  readiness fail closed if this security dependency is unavailable; there is no memory fallback.
- Render service logs redact authorization headers, cookies, tokens, secrets, and plaintext API-key
  responses through the existing Fastify logging configuration.
- OpenTelemetry export is optional and disabled in the Blueprint. Configure an operator-controlled
  OTLP collector deliberately; never place sensitive data in resource attributes or metric labels.

## Official references

- [Render web services and port binding](https://render.com/docs/web-services)
- [Render monorepo support](https://render.com/docs/monorepo-support)
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render default environment variables](https://render.com/docs/environment-variables)
- [Render outbound IP ranges](https://render.com/docs/outbound-ip-addresses)
- [Render free instance limitations](https://render.com/docs/free)
- [Upstash BullMQ integration](https://upstash.com/docs/redis/integrations/bullmq)
- [Upstash free limits and billing](https://upstash.com/docs/redis/overall/billing)
- [GitHub Actions public-repository billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
