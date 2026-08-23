# KnownPath Render API deployment design

## Goal

Deploy the existing `@knownpath/api` application as one production-shaped Render web service while
keeping MongoDB Atlas as the only persistent database. The deployment establishes the HTTPS API URL
needed by the published installer and MCP bridge. It does not deploy the worker, web dashboard,
MongoDB, or any later-phase capability.

## Research basis

Current official Render documentation was checked on 2026-08-23 before design:

- [Web services](https://render.com/docs/web-services) for Git deployment, public binding, the
  platform `PORT`, managed TLS, environment variables, and health checks.
- [Monorepo support](https://render.com/docs/monorepo-support) for repository-root builds and scoped
  build commands.
- [Blueprint YAML reference](https://render.com/docs/blueprint-spec) for a root `render.yaml`,
  secret placeholders, generated secrets, and web-service configuration.
- [Node.js version selection](https://render.com/docs/node-version) for honoring the repository
  `.nvmrc`/engine range instead of relying on Render's changing default.
- [Free instances](https://render.com/docs/free) for spin-down, cold-start, filesystem, and
  production-suitability limitations.

The API currently reads `API_PORT` only, while Render supplies `PORT`. It already supports an
explicit bind host, handles `SIGTERM`, closes Fastify and MongoDB cleanly, and exposes
`/health/ready`.

## Considered approaches

1. **Native Node web service from a root Blueprint (selected).** Build the API and its workspace
   dependencies from the repository root, run only `@knownpath/api`, and keep deployment settings
   reviewable in Git. This has the least operational machinery and follows the current monorepo.
2. **Manual dashboard-only service.** This can deploy the same application, but important commands,
   health checks, and required configuration would drift outside version control.
3. **Docker image.** This would provide a fully controlled runtime, but adds image maintenance and
   build complexity without solving a current requirement.

## Runtime design

Add optional `PORT` parsing to the shared API configuration. `PORT` takes precedence when present;
otherwise `API_PORT` retains the existing local default of `3001`. The Blueprint binds
`API_HOST=0.0.0.0`, which is required for a Render web service. The repository's `.nvmrc` and root
engine range remain the Node version authority.

The service builds from the monorepo root so pnpm can resolve private workspace packages. The build
command installs the frozen lockfile and uses Turborepo's dependency-aware filter for
`@knownpath/api`. The start command runs the compiled API package only. Readiness is checked through
`/health/ready`; deploy success therefore requires a usable Atlas connection, not merely an open TCP
port.

Render's free web-service plan is acceptable for initial verification, but it spins down after idle
time and is not the production recommendation. A continuously available instance should be used
before presenting KnownPath as a reliable MCP backend.

## Configuration and secrets

The Blueprint commits only non-secret defaults and secret declarations:

- `NODE_ENV=production`
- `API_HOST=0.0.0.0`
- explicit logging, docs, CORS, proxy, and rate-limit behavior
- Atlas search backend/index names for the current production-shaped corpus
- `MONGODB_URI` as a dashboard-supplied secret
- independently generated `BETTER_AUTH_SECRET` and `API_KEY_PEPPER`

`BETTER_AUTH_URL` and trusted browser origins cannot safely be guessed before Render assigns the
service URL, so the deployment guide requires setting them to the final HTTPS origin. Browser CORS
remains disabled until a real dashboard origin exists. Proxy trust remains explicitly disabled for
the initial single-service deployment; this avoids trusting arbitrary forwarded headers. A future
proxy/rate-limit decision must identify specific trusted proxy ranges rather than enabling a broad
boolean.

Gemini and GitHub credentials are not required by this API process and are not configured on the web
service. The stdio MCP bridge continues to receive only `KNOWNPATH_API_URL` and a scoped
`KNOWNPATH_API_KEY` on each user's machine.

Any Atlas credential previously pasted into chat must be rotated before it is added to Render. No
secret value belongs in `render.yaml`, documentation, Git, or command output.

## Deployment and verification flow

1. Rotate the Atlas database credential and confirm Atlas network access permits the Render service.
2. Create the Render Blueprint from the GitHub repository and supply only the dashboard-requested
   secrets/settings.
3. Deploy the API and inspect the build/start logs for redaction and clean readiness.
4. Verify `/health/live` and `/health/ready` over HTTPS.
5. Provision the first administrator through the existing closed-registration CLI against the same
   Atlas database, issue a `knowledge:read` API key through the existing authenticated flow, and
   show the full key only once.
6. Export the deployed origin as `KNOWNPATH_API_URL` and the issued key as `KNOWNPATH_API_KEY`, then
   run `npx knownpath doctor` and the MCP search/status flow.

Local verification before the external deploy consists of formatting validation, typecheck, lint,
the dependency-scoped production build, Blueprint inspection, and a production-mode boot against a
reachable MongoDB configuration. No automated tests are added.

## Explicit deferrals

- No worker, cron, workflow, dashboard, or MongoDB service on Render.
- No new database, queue, persistent disk, or vector database.
- No hardcoded production hostname in the installer or MCP bridge.
- No public signup, anonymous knowledge access, contribution/outcome tools, or Phase 14 product
  work.
- No CI/CD redesign beyond Render's Git-backed deployment.
