# KnownPath Phase 1 Foundation Design

## Status

Approved on 2026-08-22. This specification covers the engineering foundation only. It deliberately excludes product behavior assigned to later phases.

## Purpose

KnownPath is an open-source shared knowledge network for AI coding agents. It will eventually collect high-signal public technical knowledge, extract reusable problem/solution experiences, verify and score them, make them searchable, and distribute them through MCP and an Agent Skill.

Phase 1 establishes a maintainable TypeScript monorepo and explicit system boundaries without implementing ingestion, AI extraction, retrieval, MCP tools, dashboards, agent installation, or contribution workflows.

## Repository and Tooling

The repository will use a pnpm workspace with Turborepo task orchestration. Applications live under `apps/*`; reusable libraries and contracts live under `packages/*`. Workspace packages use the `@knownpath/*` namespace.

The supported runtime is the Node.js 24 LTS line. The repository will record the runtime in version and package metadata and pin the pnpm release through the root `packageManager` field.

All authored code is TypeScript and ESM. A reusable strict base configuration supplies safe compiler defaults. Runtime packages extend a Node-oriented configuration, and the web application extends a Next.js-oriented configuration.

TypeScript 6 is used during this foundation phase even though TypeScript 7 is stable. TypeScript 7 does not yet expose its new compiler API, while the current `typescript-eslint` release declares compatibility below TypeScript 6.1. Avoiding a dual-compiler arrangement keeps the baseline understandable. The decision must be revisited after ecosystem support converges.

ESLint uses the current flat configuration format with the recommended JavaScript and TypeScript rules. Prettier owns formatting. Turborepo runs build, typecheck, lint, and development tasks across packages while each package declares its own direct dependencies.

## Application Boundaries

### `apps/api`

Owns HTTP transport and process lifecycle. It uses Fastify and exposes only a foundational health endpoint in Phase 1. Future routes may call capability packages but must not contain reusable domain or persistence logic.

### `apps/worker`

Owns the lifecycle of future asynchronous ingestion and processing work. Phase 1 provides a compilable, bootable process scaffold with graceful shutdown but no queues, polling, ingestion, or extraction logic.

### `apps/mcp-server`

Owns MCP transport and protocol adaptation. Phase 1 confirms compatibility with the official MCP TypeScript SDK but registers no KnownPath tools, resources, or prompts.

### `apps/web`

Owns the future user and administration interface. It uses the Next.js App Router and renders only an honest project-status shell. It contains no dashboard behavior or data fetching.

### `apps/cli`

Owns the future automatic installer command and its user-facing process lifecycle. Phase 1 provides a compilable command boundary without modifying agent installations or user files.

## Package Boundaries

### `packages/domain`

Contains framework-independent domain primitives and public contracts. It cannot depend on HTTP frameworks, UI libraries, MongoDB, provider SDKs, or application packages.

### `packages/config`

Owns typed environment parsing and validation. Secrets and deployment-specific values are supplied only at runtime. The committed `.env.example` documents variables and uses non-secret local examples where safe.

### `packages/database`

Owns MongoDB client creation and lifecycle. It uses the official MongoDB Node.js driver. It contains no repositories or collections until later phases define stable persistence needs.

### `packages/ai`

Defines the provider-neutral boundary for future knowledge extraction. It contains contracts only and no Gemini or other provider implementation.

### `packages/search`

Defines provider-neutral retrieval contracts only. It contains no embeddings, indexing, ranking, or query implementation.

### `packages/agent-adapters`

Defines the conceptual boundary for future per-agent installation adapters. Phase 1 must not inspect or modify agent configuration.

### `packages/typescript-config`

Publishes shared TypeScript configurations for Node libraries, Node applications, and Next.js.

## Dependency Direction

Applications may depend on capability and infrastructure packages. Capability packages may depend on `domain`. Infrastructure packages may depend on `config` and `domain` when required. `domain` depends on no other internal package. Packages never depend on applications.

The intended direction is:

```text
apps -> capability packages -> domain
  \-> infrastructure packages -> config/domain

domain -> no internal dependencies
```

This direction keeps HTTP, MCP, CLI, worker, and UI concerns replaceable and prevents circular dependencies.

## Foundational Runtime Flow

In Phase 1, local development starts MongoDB through Docker Compose and starts the application processes through workspace scripts. The API validates configuration, creates its Fastify instance, and serves a health response. Other executable boundaries start only far enough to prove their configuration and lifecycle are coherent.

The completed platform's intended flow is documented architecturally but not implemented:

```text
public sources -> workers -> extraction boundary -> deterministic verification
              -> MongoDB -> search/retrieval -> API/MCP/Agent Skill
              -> contribution and outcome feedback -> future scoring updates
```

## Configuration and Security

Environment access is centralized in `@knownpath/config`. Known Phase 1 variables cover MongoDB connectivity, API host/port, web port, and log level. Required secrets have no committed defaults. Local MongoDB credentials may be documented as explicit development-only examples, but no live credentials or tokens are committed.

Generated output, dependencies, local environment files, coverage, framework caches, and editor/OS artifacts are ignored. The final audit searches tracked and untracked Phase 1 files for accidental credentials and verifies generated files are not staged.

## Error Handling and Lifecycle

Configuration errors fail fast with actionable validation messages. Executable Node applications use a small `main` entry point, report startup failures, set a non-zero exit code, and close owned resources on termination signals. The API separates server construction from process startup so later phases can compose it cleanly.

No domain-error hierarchy is introduced before real domain operations exist.

## Verification

Phase 1 intentionally adds no unit, integration, or end-to-end tests. Verification consists of:

- dependency installation with the pinned pnpm version;
- repository-wide type checking;
- ESLint validation;
- Prettier validation;
- production builds for all current workspaces;
- booting MongoDB and each executable scaffold far enough to prove coherent startup;
- calling the API health endpoint and loading the web shell;
- inspecting Git status, generated artifacts, and potential secrets.

Failures introduced by this phase must be fixed before the Phase 1 completion commit.

## Rejected Alternatives

### Lean scaffold with fewer executable boundaries

Creating only API, worker, web, domain, config, and database would reduce file count, but it would postpone architecture decisions for MCP and installation responsibilities and likely force workspace restructuring. Small explicit boundaries are preferable because the product roadmap already establishes these responsibilities.

### Nx

Nx provides strong generators and project-graph tooling, but its additional conventions and plugin surface are unnecessary for an empty foundation. pnpm plus Turborepo provides mature caching and task orchestration with less repository-specific machinery.

### A second database or queue

Redis, Valkey, and dedicated vector databases are not foundational Phase 1 requirements. MongoDB remains the only persistent database. Later phases may justify auxiliary infrastructure with concrete workload evidence.

### TypeScript 7 with a parallel TypeScript 6 compiler API package

The official transition path can run TypeScript 7 beside a TypeScript 6 compatibility package, but that introduces two compiler identities into a new repository. TypeScript 6 is the clearer baseline until linting and framework tooling support TypeScript 7 directly.

## Completion Boundary

Phase 1 is complete when the scaffold is installed, documented, verified, audited, and committed. The next phase is Phase 2: define the canonical knowledge experience domain model and MongoDB persistence layer. No Phase 2 schema or behavior belongs in this implementation.
