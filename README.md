# KnownPath

KnownPath is an open-source shared knowledge network for AI coding agents. It turns public technical
sources and privacy-minimized agent experience into reusable, evidence-grounded KnownPaths, then
serves them through HTTP, MCP, a portable Agent Skill, and a developer dashboard.

> [!IMPORTANT] KnownPath is under active phased development. Phase 21 prepares the implemented
> platform for repeatable open-source installation and deployment. Registration remains closed;
> operators create accounts through a masked CLI. Retrieved knowledge is evidence, not an
> instruction override.

## How it fits together

```text
GitHub + official docs                         agent contributions + outcomes
          |                                                |
          v                                                v
 source records -> extraction -> evidence scoring -> canonical KnownPaths
                           |                    |               |
                           +---- MongoDB (product truth) -------+
                                                |
                                   hybrid retrieval + ranking
                                                |
                           HTTP API -> MCP / web / installer CLI

 Valkey: queues, scheduling, locks, rate limits, and ephemeral coordination only
```

The monorepo keeps domain, persistence, retrieval, authentication, provider, and orchestration logic
outside HTTP and UI layers. See [Architecture](docs/ARCHITECTURE.md),
[Data model](docs/DATA_MODEL.md), and [Security architecture](docs/SECURITY_ARCHITECTURE.md).

## Prerequisites

- Node.js 24 LTS (see `.nvmrc` and root `engines`)
- Corepack with pnpm 11.22.0
- Docker Engine/Desktop with Compose for local MongoDB and Valkey
- Optional: GitHub token for higher ingestion limits and Discussions
- Optional: Gemini API key for **public-only** extraction and embeddings

## Local quickstart

```sh
git clone https://github.com/nasyx-rakeeb/knownpath.git
cd knownpath
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:infra:all
pnpm db:init
pnpm auth:user:create
pnpm dev
```

Before `db:init`, generate separate values for `BETTER_AUTH_SECRET` and `API_KEY_PEPPER` with
`openssl rand -base64 32` and place them only in ignored `.env`. The web app is at
<http://127.0.0.1:3000>; API liveness/readiness are at <http://127.0.0.1:3001/health/live> and
<http://127.0.0.1:3001/health/ready>. OpenAPI JSON is at `/api/v1/openapi.json` and development
Swagger UI is at `/docs/`.

To build and boot the production-shaped container stack instead:

```sh
docker compose --profile platform up --build
```

The complete environment contract is grouped in [`.env.example`](.env.example). Production must use
external MongoDB and Valkey services, HTTPS origins, strong unique secrets, and the distributed
Valkey rate limiter. Follow [Deployment](docs/DEPLOYMENT.md), not this development shortcut.

## Agent installation

The published `knownpath` CLI installs the canonical skill and a thin stdio MCP bridge. It stores
only environment-variable references—never their values:

```sh
export KNOWNPATH_API_URL='https://your-knownpath-origin.example'
read -rsp 'KnownPath API key: ' KNOWNPATH_API_KEY && export KNOWNPATH_API_KEY && printf '\n'
npx knownpath install --dry-run
npx knownpath install
npx knownpath doctor
```

Supported adapters are Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode. See
[Agent installation](docs/AGENT_INSTALLATION.md), [MCP](docs/MCP.md), and
[Agent Skill](docs/AGENT_SKILL.md).

## Seed an empty database

KnownPath does not ship fabricated knowledge. The documented seed flow uses bounded Expo/React
Native GitHub and official-document ingestion, Gemini extraction, deterministic scoring,
canonicalization, embeddings, and operator review. Start with [Ingestion](docs/INGESTION.md).
Private/workspace data is never sent through the unpaid/public Gemini path.

## Common repository commands

| Command                               | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                            | Run workspace development tasks                       |
| `pnpm dev:infra:all`                  | Start local MongoDB and Valkey                        |
| `pnpm dev:stack`                      | Build and run the production-shaped Compose profile   |
| `pnpm db:init`                        | Reconcile MongoDB validators and indexes idempotently |
| `pnpm auth:user:create`               | Provision a user/admin; public registration is closed |
| `pnpm jobs start` / `pnpm jobs drain` | Run continuous or bounded workers                     |
| `pnpm typecheck`                      | Check strict TypeScript across workspaces             |
| `pnpm lint`                           | Run ESLint flat-config checks                         |
| `pnpm format:check`                   | Check Prettier formatting                             |
| `pnpm build`                          | Build all applications and packages                   |
| `pnpm security:audit`                 | Fail on high-severity production dependency findings  |
| `pnpm package:validate`               | Pack and exercise the installable CLI in isolation    |
| `pnpm release:status`                 | Show pending Changesets without publishing            |

Operational commands and failure behavior are in [Operations](docs/OPERATIONS.md). Source-specific
commands are in [GitHub ingestion](docs/GITHUB_INGESTION.md),
[official-source ingestion](docs/OFFICIAL_SOURCE_INGESTION.md), and
[AI extraction](docs/AI_EXTRACTION.md).

## Open-source project

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Privacy](docs/PRIVACY.md)
- [Release process](docs/RELEASE.md)
- [Changelog](CHANGELOG.md)

KnownPath is licensed under the [Apache License 2.0](LICENSE). No external release or registry
publication is performed automatically from a contributor checkout.
