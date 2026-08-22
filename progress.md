# KnownPath Progress

KnownPath is an open-source shared knowledge network intended to let AI coding agents reuse verified
technical problem/solution experiences instead of independently rediscovering them. Delivery is
phased; this file records what is actually complete and what remains intentionally absent.

## Phase 1 — Architecture and monorepo foundation

### Phase goal

Establish a current, maintainable, TypeScript-first architecture and development baseline without
implementing KnownPath product features.

### Research performed

Official documentation and release metadata were checked on 2026-08-22 before implementation:

- [Node.js release status and production guidance](https://nodejs.org/en/about/previous-releases/)
- [pnpm workspace documentation](https://pnpm.io/workspaces) and current registry metadata
- [Turborepo TypeScript guidance](https://turborepo.com/docs/guides/tools/typescript)
- [TypeScript 7 announcement and transition constraints](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Fastify TypeScript and ESM guidance](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Next.js App Router installation and runtime requirements](https://nextjs.org/docs/app/getting-started/installation)
- [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MongoDB Node.js driver connection and TypeScript guidance](https://www.mongodb.com/docs/drivers/node/current/connect/)
- [Agent Skills open format specification](https://agentskills.io/specification)

Exact package releases and declared engine/peer compatibility were verified through the public npm
registry rather than selected from memory.

### Architecture and technology decisions

- pnpm 11 workspace with `apps/*`, `packages/*`, a central catalog, and Turborepo 2.
- Node.js 24 Active LTS, strict ESM, and reusable TypeScript configurations.
- TypeScript 6.0.3 until TypeScript 7 exposes the APIs required by current lint/framework tooling.
- ESLint 10 flat config, `typescript-eslint`, Next.js rules, and Prettier 3.
- Fastify 5 API, Next.js 16/React 19 web shell, official MCP SDK v2 boundary.
- MongoDB as the only database, using the official driver and a MongoDB-only Compose setup.
- Zod-based centralized environment parsing with no committed secret values.
- Inward dependency direction: applications and infrastructure depend on domain contracts, never the
  reverse.

The detailed rationale and rejected alternatives are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

### Files, applications, and packages created

- Root workspace, task, lint, formatting, environment, Node, pnpm, Git ignore, and Compose
  configuration.
- Applications: `@knownpath/api`, `@knownpath/worker`, `@knownpath/mcp-server`, `@knownpath/web`,
  and `@knownpath/cli`.
- Packages: `@knownpath/domain`, `@knownpath/config`, `@knownpath/database`, `@knownpath/ai`,
  `@knownpath/search`, `@knownpath/agent-adapters`, and `@knownpath/typescript-config`.
- Root README, architecture guide, decision log, and approved Phase 1 design specification.

### Commands successfully verified

- `pnpm install --frozen-lockfile`
- `pnpm typecheck` — 12 workspace typecheck tasks passed
- `pnpm lint` — 11 workspace lint tasks passed
- `pnpm format:check`
- `pnpm build` — 11 build tasks passed; Next.js compiled and prerendered `/`
- `pnpm dev` — all 11 persistent development tasks started together with explicit workspace
  concurrency; the API and web endpoints responded before controlled shutdown
- `pnpm dev:infra` — MongoDB container became healthy
- `docker compose exec -T mongodb mongosh --quiet --eval "JSON.stringify(db.adminCommand('ping'))"`
  returned `{"ok":1}`
- `pnpm --filter @knownpath/api start` and `curl http://127.0.0.1:3001/health` returned
  `{"service":"knownpath-api","status":"ok"}`
- `pnpm --filter @knownpath/web start` served the Phase 1 status shell at `http://127.0.0.1:3000`
- `pnpm --filter @knownpath/worker start` remained active until graceful shutdown
- `pnpm --filter @knownpath/mcp-server start` completed a real stdio initialization handshake for
  protocol `2025-11-25` and returned the expected empty capability set
- The built `@knownpath/config` and `@knownpath/database` packages connected through the official
  driver and received `{"ok":1}` from a database ping
- `pnpm --filter @knownpath/cli start` exited without side effects and reported the Phase 1 boundary

No tests were created or run, as required for this phase.

### Environment and manual setup still required

- Install or select Node.js 24 LTS, then enable Corepack.
- Run `pnpm install`.
- Copy `.env.example` to `.env`; change values for non-local deployments.
- Start Docker Desktop or another Docker Engine before `pnpm dev:infra`.
- Production MongoDB authentication, network topology, deployment configuration, and secrets must be
  designed before any production deployment.

### Known limitations intentionally left for later phases

- No knowledge experience domain model, MongoDB collections, indexes, or repositories.
- No ingestion, source normalization, queue, scheduler, or processing logic.
- No Gemini or other extraction provider, prompts, scoring, or deterministic verification.
- No semantic/hybrid search, embeddings, ranking, or retrieval endpoints.
- No KnownPath MCP tools, resources, or prompts.
- No dashboard features or API data fetching.
- No Agent Skill artifact, automatic installer, or per-agent adapter implementation.
- No contribution, usefulness reporting, trust, authentication, authorization, or deployment logic.
- No auxiliary database, Redis, Valkey, or dedicated vector store.
- No automated tests, by explicit Phase 1 requirement.

### Exact next phase

**Phase 2: define the canonical knowledge experience domain model and MongoDB persistence layer,
including validated contracts, collection/index design, and repository boundaries.** Do not begin
ingestion, extraction, search, MCP tools, Agent Skill installation, or contribution workflows until
their later phases.
