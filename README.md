# KnownPath

KnownPath is an open-source shared knowledge network for AI coding agents. Its long-term purpose is
to stop agents from repeatedly rediscovering the same technical solutions by making verified,
reusable engineering experiences available through agent-native interfaces.

> [!IMPORTANT] KnownPath is under active phased development. Phase 13 adds the portable installer
> CLI and safe adapters for five coding agents. Contribution/outcome tools, dashboards, public
> signup, and public anonymous access are not implemented yet. The installer is published as
> [`knownpath`](https://www.npmjs.com/package/knownpath).

## Prerequisites

- Node.js 24 LTS (`.nvmrc` tracks the supported major; `package.json` enforces the tested range)
- Corepack, included with the supported Node.js distribution
- Docker Desktop or another Docker Engine with Compose support, for local MongoDB

## Install

```sh
corepack enable
pnpm install
cp .env.example .env
```

Generate independent `BETTER_AUTH_SECRET` and `API_KEY_PEPPER` values as described in
`.env.example`. The committed example contains no credential defaults.

## Start the current development environment

Start MongoDB:

```sh
pnpm dev:infra
```

Create or reconcile the current collections, validators, and indexes:

```sh
pnpm db:init
```

Optional persistence inspection and repository round-trip validation:

```sh
pnpm db:inspect
pnpm db:verify
```

Create the first local user or administrator through the masked CLI (registration is closed):

```sh
pnpm auth:user:create
```

Optionally set `GITHUB_TOKEN` in `.env` for the normal 5,000-request authenticated REST limit and
GitHub Discussions access. Then preview or run a bounded collection:

```sh
pnpm ingest:github --source expo-core --types issues --limit 5 --dry-run
pnpm ingest:github --source expo-core --types issues --limit 5
```

See [the GitHub ingestion guide](docs/GITHUB_INGESTION.md) before running a backfill.

Discover the current curated official-document set without writing source records, then synchronize
a bounded source or one indexed page:

```sh
pnpm ingest:sources discover --source expo-documentation --limit 20
pnpm ingest:sources sync --source expo-documentation --limit 5 --dry-run
pnpm ingest:sources sync --source expo-documentation \
  --page https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough --limit 1
```

See [the official source ingestion guide](docs/OFFICIAL_SOURCE_INGESTION.md) before changing
curation or requesting a bounded full-catalog run.

With a Gemini development key in the ignored `.env`, process or inspect a bounded public-source
candidate:

```sh
pnpm extract one --source-item <uuid>
pnpm extract pending --limit 5
pnpm extract inspect --attempt <uuid>
pnpm extract inspect --candidate <uuid>
```

The unpaid Gemini path hard-rejects private/team source records before any provider call. Read
[the AI extraction guide](docs/AI_EXTRACTION.md) before configuring the key or expanding a batch.

Score extracted candidates without calling an AI provider, then inspect the full breakdown/history:

```sh
pnpm score one --candidate <uuid>
pnpm score pending --limit 10
pnpm score inspect --assessment <uuid>
pnpm score history --candidate <uuid>
```

Scores are explainable ranking signals, not truth probabilities. Read
[the scoring guide](docs/SCORING.md) before changing the versioned policy.

Build immutable similarity profiles, discover blocked pairs, inspect reviews, and apply only
deterministically safe canonical merges:

```sh
pnpm canonicalize profile --limit 10
pnpm canonicalize discover --limit 10
pnpm canonicalize review --limit 20
pnpm canonicalize auto-merge --limit 10       # dry-run
pnpm canonicalize auto-merge --limit 10 --apply
pnpm canonicalize history --known-path <uuid>
```

Gemini embeddings are generated only after both candidates and all referenced sources are verified
public. They support plausible blocked comparisons but never decide an automatic merge. Read
[the canonicalization guide](docs/CANONICALIZATION.md) before applying merges or manual operations.

Build current canonical search projections and query them locally. Review-state records are excluded
unless explicitly requested:

```sh
pnpm run search project --pending --limit 10
pnpm run search query --text "EAS build cannot find an imported file" \
  --error "None of these files exist" --ecosystem expo --include-review
pnpm run search indexes print
```

Local MongoDB uses exact/error and weighted-text retrieval and clearly reports semantic retrieval as
unavailable. Atlas Search/Vector Search is optional configuration. The unpaid Gemini provider
hard-rejects private/team documents and query text. Read [the retrieval guide](docs/RETRIEVAL.md)
before enabling Atlas or changing ranking/model configuration.

Start all application and package development processes:

```sh
pnpm dev
```

The current web shell is served at <http://127.0.0.1:3000>. API liveness and readiness are available
at <http://127.0.0.1:3001/health/live> and <http://127.0.0.1:3001/health/ready>. OpenAPI JSON is at
<http://127.0.0.1:3001/api/v1/openapi.json>; development Swagger UI is at
<http://127.0.0.1:3001/docs/>.

Authenticated knowledge search, canonical detail, alternatives, review-access rules, and safe curl
examples are documented in [the Knowledge HTTP API guide](docs/API.md). Normal clients receive only
public published records; review access is explicit, admin-key-only, and audited.

After building, connect an MCP client directly to `http://127.0.0.1:3001/mcp`, or run the thin stdio
bridge with `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`:

```sh
pnpm mcp:stdio
pnpm mcp:inspect --transport stdio
```

Tool contracts, authentication, security behavior, and current Codex/Claude Code/Cursor/Gemini CLI
configurations are documented in [the MCP guide](docs/MCP.md).

The portable Agent Skill teaches supported coding agents when and how to consult those MCP tools
without blindly applying retrieved fixes. Manual development installation and the current behavior
contract are documented in [the Agent Skill guide](docs/AGENT_SKILL.md).

Configure the API origin and API key in the environment that launches each agent, then inspect or
apply the Phase 13 installer plan:

```sh
export KNOWNPATH_API_URL='https://your-knownpath-origin.example'
read -rsp 'KnownPath API key: ' KNOWNPATH_API_KEY && export KNOWNPATH_API_KEY && printf '\n'
pnpm knownpath install --dry-run --agent all
pnpm knownpath install --agent all
pnpm knownpath doctor --agent all
```

The CLI stores only references to those variable names and has no URL fallback. It supports Codex
CLI, Claude Code, Cursor, Gemini CLI, and OpenCode at global or project scope. Users can run
`npx knownpath install`; repository development can use `pnpm knownpath`. Exact changes, Windows
setup, backups, conflicts, updates, and uninstall behavior are documented in
[the installer guide](docs/INSTALLER.md).

## Deploy the API

The root `render.yaml` defines one Render web service for the Fastify API and keeps MongoDB Atlas as
the database. It intentionally does not deploy the worker, dashboard, or another datastore. Rotate
previously exposed credentials before setup, then follow
[the Render deployment guide](docs/DEPLOYMENT.md) for the Blueprint, Atlas network access, health
verification, and post-deploy API-key flow.

Stop MongoDB without deleting its named development volume:

```sh
pnpm dev:infra:down
```

## Repository commands

| Command                 | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `pnpm install`          | Install the pinned workspace dependencies                                  |
| `pnpm dev`              | Run workspace development tasks                                            |
| `pnpm build`            | Build every compilable application and package                             |
| `pnpm typecheck`        | Run strict TypeScript validation across the workspace                      |
| `pnpm lint`             | Run the ESLint flat configuration across the workspace                     |
| `pnpm format`           | Format supported files with Prettier                                       |
| `pnpm format:check`     | Validate formatting without changing files                                 |
| `pnpm dev:infra`        | Start the required local MongoDB container                                 |
| `pnpm dev:infra:down`   | Stop the local container while preserving its data volume                  |
| `pnpm db:init`          | Idempotently create/reconcile MongoDB collections, validators, and indexes |
| `pnpm db:inspect`       | Print current collection validators and indexes                            |
| `pnpm db:verify`        | Run and clean up a repository-layer persistence round trip                 |
| `pnpm auth:user:create` | Safely provision a user/admin with a masked password prompt                |
| `pnpm ingest:github`    | Collect a bounded configured GitHub source through official APIs           |
| `pnpm ingest:sources`   | Discover or sync configured official documentation and release feeds       |
| `pnpm extract`          | Extract or inspect bounded public-source candidate experiences             |
| `pnpm score`            | Verify evidence and create/inspect immutable candidate assessments         |
| `pnpm canonicalize`     | Profile, compare, review, merge, split, reassign, or rebuild candidates    |
| `pnpm run search`       | Project, embed, index, inspect, or query canonical KnownPaths              |
| `pnpm mcp:stdio`        | Run the thin local MCP-to-HTTP bridge over stdio                           |
| `pnpm mcp:inspect`      | List or invoke MCP tools with the official SDK client                      |
| `pnpm knownpath …`      | Run the multi-agent installer CLI from this checkout                       |

## Structure

```text
apps/
  api/             Fastify HTTP process
  cli/             Publishable installer CLI and stdio bridge entry point
  mcp-server/      Thin stdio MCP bridge to the authenticated HTTP API
  web/             Next.js application shell
  worker/          Source ingestion and future background processing runtime
packages/
  agent-adapters/  Safe detection/configuration adapters and ownership state
  ai/              Gemini provider, privacy gate, prompts, validation, and extraction lifecycle
  auth/            Sessions, API keys, principals, authorization, and audit
  config/          Typed environment parsing
  database/        MongoDB lifecycle, repositories, validators, and indexes
  domain/          Versioned domain schemas and canonicalization helpers
  canonicalization/ Deterministic blocking, optional embeddings, and canonical projections
  github-ingestion/ GitHub API collection and source normalization
  source-ingestion/ Official documentation/feed discovery and normalization
  verification/    Deterministic evidence verification and immutable seed scoring
  search/          Embeddings, search projections, hybrid retrieval, and explainable ranking
  mcp/             Shared MCP tool contracts, projections, server factory, and HTTP gateway
  typescript-config/ Shared strict compiler configurations
skills/
  knownpath/        Portable Agent Skill instructions and on-demand examples
```

See [the architecture guide](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md),
[retrieval guide](docs/RETRIEVAL.md), [Knowledge HTTP API guide](docs/API.md),
[MCP guide](docs/MCP.md), [Agent Skill guide](docs/AGENT_SKILL.md),
[installer guide](docs/INSTALLER.md), [deployment guide](docs/DEPLOYMENT.md),
[decision log](docs/DECISIONS.md), and [phase progress](progress.md) for the current boundaries and
delivery status.

## License

KnownPath is licensed under the [Apache License 2.0](LICENSE).
