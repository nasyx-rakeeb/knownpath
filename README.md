# KnownPath

KnownPath is an open-source shared knowledge network for AI coding agents. Its long-term purpose is
to stop agents from repeatedly rediscovering the same technical solutions by making verified,
reusable engineering experiences available through agent-native interfaces.

> [!IMPORTANT] KnownPath is under active phased development. Phase 2 provides the versioned domain
> model and MongoDB repository/index foundation. Ingestion, AI extraction, search, MCP tools,
> dashboards, Agent Skill installation, and contribution workflows are not implemented yet.

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

The committed environment example contains development-only local values and no credentials.

## Start the current development environment

Start MongoDB:

```sh
pnpm dev:infra
```

Create/reconcile the Phase 2 collections, validators, and indexes:

```sh
pnpm db:init
```

Optional persistence inspection and repository round-trip validation:

```sh
pnpm db:inspect
pnpm db:verify
```

Start all application and package development processes:

```sh
pnpm dev
```

The current web shell is served at <http://127.0.0.1:3000>. The API health endpoint is available at
<http://127.0.0.1:3001/health>.

Stop MongoDB without deleting its named development volume:

```sh
pnpm dev:infra:down
```

## Repository commands

| Command               | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `pnpm install`        | Install the pinned workspace dependencies                                  |
| `pnpm dev`            | Run workspace development tasks                                            |
| `pnpm build`          | Build every compilable application and package                             |
| `pnpm typecheck`      | Run strict TypeScript validation across the workspace                      |
| `pnpm lint`           | Run the ESLint flat configuration across the workspace                     |
| `pnpm format`         | Format supported files with Prettier                                       |
| `pnpm format:check`   | Validate formatting without changing files                                 |
| `pnpm dev:infra`      | Start the required local MongoDB container                                 |
| `pnpm dev:infra:down` | Stop the local container while preserving its data volume                  |
| `pnpm db:init`        | Idempotently create/reconcile MongoDB collections, validators, and indexes |
| `pnpm db:inspect`     | Print current collection validators and indexes                            |
| `pnpm db:verify`      | Run and clean up a repository-layer persistence round trip                 |

## Structure

```text
apps/
  api/             Fastify HTTP process
  cli/             Future installer command boundary
  mcp-server/      MCP protocol process without KnownPath tools
  web/             Next.js application shell
  worker/          Future background processing runtime
packages/
  agent-adapters/  Future per-agent integration boundary
  ai/              Future provider-neutral extraction boundary
  config/          Typed environment parsing
  database/        MongoDB lifecycle, repositories, validators, and indexes
  domain/          Versioned domain schemas and canonicalization helpers
  search/          Future retrieval boundary
  typescript-config/ Shared strict compiler configurations
```

See [the architecture guide](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md),
[decision log](docs/DECISIONS.md), and [phase progress](progress.md) for the current boundaries and
delivery status.

## License

KnownPath is licensed under the [Apache License 2.0](LICENSE).
