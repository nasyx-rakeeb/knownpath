# Contributing to KnownPath

Thank you for helping coding agents reuse reliable technical experience. By participating, you agree
to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and Apache-2.0 license.

## Before opening a change

- Search existing issues and keep one focused concern per pull request.
- Discuss architecture-level changes before implementing them.
- Never include real credentials, private repository content, personal data, production database
  dumps, or hidden chain-of-thought in issues, fixtures, logs, or commits.
- Treat ingested and contributed text as untrusted.
- Do not weaken public/private/workspace boundaries or send private data to public AI providers.

## Development

Use Node.js 24 and the locked pnpm version:

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:infra:all
pnpm db:init
pnpm dev
```

Generate local auth secrets as explained in `.env.example`. Registration is closed; create a
development account with `pnpm auth:user:create`. Keep generated `.env`, database contents, package
archives, and build output out of Git.

## Repository shape

- `apps/*`: deployable API, web, worker, MCP bridge, and installer CLI
- `packages/*`: reusable domain, persistence, auth, retrieval, provider, and orchestration logic
- `skills/knownpath`: canonical portable Agent Skill
- `config/sources`: data-driven public source registry
- `docs`: architecture, security, operations, and subsystem guides

Dependency direction and boundaries are documented in [Architecture](docs/ARCHITECTURE.md).

## Required checks

No unit, integration, or E2E suite exists yet. Every change must pass the applicable non-test
checks:

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm build
pnpm security:audit
```

Changes affecting the published CLI must also pass `pnpm package:validate`. Changes affecting
containers should build the relevant Docker target. Do not claim a command passed unless you
observed its completion.

## Packages and releases

If a user-visible change affects the public `knownpath` npm package, add a Changeset:

```sh
pnpm changeset
```

Choose the smallest correct SemVer increment and describe behavior, not implementation trivia.
Contributors do not publish packages, MCP registry entries, GitHub releases, or deployment changes.
Maintainers follow [Release](docs/RELEASE.md).

## Pull requests

Include:

- what changed and why;
- security/privacy/tenant impact;
- migration or operator action, if any;
- exact verification commands and observed result;
- documentation updates for changed contracts.

Avoid giant files, circular dependencies, unrelated refactors, committed generated artifacts, and
new infrastructure without a documented requirement and decision.

Security vulnerabilities belong in a private report, not a public issue. See
[SECURITY.md](SECURITY.md).
