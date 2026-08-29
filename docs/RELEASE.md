# Release process

KnownPath uses Semantic Versioning and Changesets. The public npm package is `knownpath`; internal
`@knownpath/*` workspaces remain private implementation packages. The canonical skill has its own
frontmatter version, while the CLI/MCP distribution version follows the npm package.

No contributor or CI validation workflow publishes externally. npm, GitHub release, container
registry, deployment, and MCP Registry publication are separate explicit maintainer actions.

## Prepare

1. Confirm the Apache-2.0 license, repository metadata, supported Node range, and release scope.
2. Add or review a `.changeset/*.md` file for every public package change.
3. Review `pnpm release:status`; a major-zero breaking change still requires deliberate SemVer
   judgment.
4. Update the skill version only when its behavioral artifact changes, and update skill docs.
5. Review `CHANGELOG.md`, migration/operator notes, and the exact generated version diff.

## Release checklist

- [ ] Clean install: `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`
- [ ] `pnpm security:audit` and repository security workflows are green
- [ ] Official Agent Skills validator passes
- [ ] `server.json` validates with the official MCP Publisher
- [ ] `pnpm package:validate` passes and the seven-file archive is inspected
- [ ] Production `api`, `worker`, and `web` images build and run as non-root
- [ ] MongoDB backup/restore posture is known; `pnpm db:init` is idempotent
- [ ] Atlas Search/vector indexes (if used) are ready
- [ ] MongoDB, Valkey, GitHub, Gemini, auth, API-key pepper, and OTLP secrets are configured
- [ ] First admin exists through `pnpm auth:user:create`; public registration remains closed
- [ ] Initial seed/reprocessing scope and provider quota are approved
- [ ] HTTP health, authenticated search, remote MCP, stdio bridge, installer dry-run, and doctor
      pass
- [ ] Logs/traces contain no credentials or private/high-cardinality content
- [ ] Rollback version/image and credential-rotation owner are identified

## Version and package

From a clean maintainer checkout:

```sh
pnpm release:status
pnpm release:version
pnpm install --lockfile-only
pnpm format:check
pnpm typecheck
pnpm lint
pnpm build
pnpm security:audit
pnpm package:validate
git diff
```

Commit the generated version/changelog changes and obtain review. Prefer npm trusted publishing with
provenance from a protected GitHub Actions environment. If a maintainer deliberately uses local
publication, authenticate interactively and run `pnpm release:publish`; never place an npm token in
the repository, shell history, logs, or chat. Confirm package ownership and install the exact
published version in an empty directory before tagging.

## MCP Registry and GitHub

`server.json` describes the npm-backed stdio MCP server as `io.github.nasyx-rakeeb/knownpath`. The
npm artifact must already contain the matching `mcpName` before registry publication can prove
ownership:

```sh
mcp-publisher validate
mcp-publisher publish
```

The second command is owner-only and is not run during ordinary CI. After npm/registry verification,
create an annotated `vX.Y.Z` tag and GitHub release from reviewed changelog content. Attach no
secrets, local configuration, database export, or uninspected build archive.

## Containers and deployment

Tag images immutably with the release version and source commit, then deploy API/web/worker using
[Deployment](DEPLOYMENT.md). Run database/index initialization before switching traffic. Validate
readiness, authenticated search, MCP, queue heartbeats, and telemetry after rollout. Roll back to
the prior immutable image if health or privacy/authorization checks fail; never roll back by
discarding MongoDB audit/history records.

Official references: [npm publishing](https://docs.npmjs.com/cli/v11/commands/npm-publish),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers),
[Semantic Versioning](https://semver.org/), [Changesets](https://github.com/changesets/changesets),
and [MCP Registry publishing](https://modelcontextprotocol.io/registry/publishing).
