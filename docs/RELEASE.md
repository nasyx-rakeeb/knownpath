# Release process

KnownPath follows Semantic Versioning and uses Changesets for public package version intent and
changelog generation. Only `knownpath` is published to npm; internal `@knownpath/*` workspaces are
private implementation packages. The canonical Agent Skill has its own frontmatter version, while
the installer and stdio MCP bridge share the npm package version.

Validation workflows never publish automatically. npm, MCP Registry, GitHub releases, container
images, and application deployments are explicit maintainer actions.

## Prepare a release

1. Add or review a `.changeset/*.md` entry for each public package change.
2. Confirm the intended SemVer impact with `pnpm release:status`.
3. Update the Agent Skill version only when its behavior or distributed files change.
4. Review user-facing changes, operator migrations, `CHANGELOG.md`, package metadata, and the exact
   generated diff.
5. Confirm Apache-2.0 metadata, the supported Node range, and repository URLs remain correct.

Generate version changes from a clean maintainer checkout:

```sh
pnpm release:status
pnpm release:version
pnpm install --lockfile-only
git diff
```

Commit and review the generated version, lockfile, changelog, `server.json`, and bundled skill
metadata together when they are intended to move in the same release.

## Validation checklist

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] `pnpm security:audit`
- [ ] `pnpm package:validate` and manual archive inspection
- [ ] Agent Skill validation
- [ ] `mcp-publisher validate` for `server.json`
- [ ] API, worker, and web images build and run as non-root
- [ ] `pnpm db:init` is idempotent against a backed-up target database
- [ ] Atlas search indexes are ready when `SEARCH_BACKEND=atlas`
- [ ] MongoDB, Valkey, auth, provider, and optional OTLP secrets are configured
- [ ] First administrator and closed-registration access are operational
- [ ] HTTP health, authenticated search, remote MCP, stdio bridge, installer dry-run, and doctor
      pass
- [ ] A bounded worker job completes idempotently and emits no sensitive logs/telemetry
- [ ] The rollback image/version and credential-rotation owner are identified

## npm package

Prefer npm trusted publishing with provenance from a protected GitHub Actions environment when it is
configured. Otherwise authenticate interactively from a trusted maintainer machine and run:

```sh
pnpm release:publish
```

Never place an npm token in the repository, shell history, logs, chat, or agent configuration. After
publishing, verify package metadata and install the exact version from an empty directory:

```sh
npm view knownpath
npx --yes knownpath@X.Y.Z --help
npx --yes knownpath@X.Y.Z install --dry-run --agent codex --scope project
```

The packed archive must contain only the intended executable distribution and bundled Agent Skill.
The CLI must not depend at runtime on unpublished `@knownpath/*` workspaces.

## MCP Registry and GitHub release

[`server.json`](../server.json) describes the npm-backed stdio server as
`io.github.nasyx-rakeeb/knownpath`. Publish npm first so registry ownership can be verified, then:

```sh
mcp-publisher validate
mcp-publisher publish
```

Create an annotated `vX.Y.Z` tag and GitHub release from reviewed changelog content only after npm
and MCP metadata agree. Do not attach credentials, local configuration, database exports, or
uninspected artifacts. Confirm that GitHub's “Latest” release points to the intended version.

## Containers and deployment

Tag API, web, and worker images with both the release version and source commit. Run database/index
initialization before switching traffic, then validate readiness, authenticated retrieval, MCP,
worker heartbeat, and telemetry. Keep API and worker on compatible domain/job-schema versions.

Rollback uses the previous immutable image. Do not roll back by deleting MongoDB audit, assessment,
canonical, contribution, or outcome history. If a release changes credentials or indexes, follow a
pre-reviewed reverse migration and the [security operations](SECURITY_OPERATIONS.md) runbook.

## Post-release checks

- Confirm `npm view knownpath` and a clean `npx` invocation report the released version.
- Confirm `server.json`, MCP Registry metadata, GitHub tag/release, and container tags agree.
- Verify hosted API liveness/readiness, one authenticated HTTP search, and one MCP search/get flow.
- Run `knownpath doctor` against the hosted service without exposing the key.
- Inspect queue backlog, provider errors, rate-limit state, and OpenTelemetry export.
- Watch authorization, tenant isolation, and sanitization signals before increasing rollout scope.

References: [npm publishing](https://docs.npmjs.com/cli/v11/commands/npm-publish),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers),
[Semantic Versioning](https://semver.org/), [Changesets](https://github.com/changesets/changesets),
and [MCP Registry publishing](https://modelcontextprotocol.io/registry/publishing).
