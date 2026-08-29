# KnownPath Phase 21 open-source release design

## Goal

Make the existing KnownPath platform reproducibly installable, packageable, deployable, and
understandable outside the original development machine. Phase 21 prepares artifacts and release
automation but does not publish packages, register the MCP server, create a GitHub release, deploy
new services, or begin Phase 22.

## Current baseline

- Apache-2.0 is already selected in the committed root `LICENSE` and package manifests.
- `knownpath@0.3.0` is the only public npm package. It bundles the multi-agent installer, the thin
  stdio-to-HTTP MCP bridge, and the canonical Agent Skill.
- All `@knownpath/*` workspace packages are private implementation boundaries.
- Fastify API, Next.js web, BullMQ worker, MongoDB, and Valkey runtime responsibilities are already
  separate.
- Render, Atlas, Upstash, and GitHub Actions currently provide one working deployment example, but
  the repository lacks provider-neutral production images and a complete release workflow.

## Packaging and versioning

Only `knownpath` remains publishable in Phase 21. Publishing every internal workspace package would
create an unsupported compatibility surface and would require coordinated public dependency
versioning that the product does not need. Private packages will still receive consistent license,
repository, engine, export, and build metadata where appropriate for contributor tooling.

The CLI package will include:

- a valid `knownpath` executable and ESM bundle;
- the canonical skill and its references;
- package-local README and Apache-2.0 license text;
- repository, homepage, bugs, engine, files, and public-access metadata;
- MCP Registry ownership metadata matching a repository-level `server.json`;
- no workspace or catalog dependency specifiers in the packed manifest;
- no source maps containing local absolute paths, credentials, or unpublished workspace imports.

The existing `knownpath mcp` command remains the distributed stdio server. A second npm package is
not introduced because it would duplicate the same bridge and confuse installation. `server.json`
will describe the npm package, required environment variables, stdio transport, and remote service
without publishing to the MCP Registry.

Changesets will provide maintained semantic-versioning and changelog tooling. Phase 21 will add one
pending minor changeset for `knownpath`; the checked-in package version stays at the last published
version until an owner deliberately runs the version command. Release commands will separate version
preparation, package validation, and external publication. No workflow will publish merely because
code reaches `main`.

## Container and local runtime design

Production multi-stage images will exist for:

- `knownpath-api`: Fastify HTTP and Streamable HTTP MCP;
- `knownpath-worker`: continuous or explicitly selected bounded queue processing;
- `knownpath-web`: Next.js dashboard.

Build stages use the pinned Node/pnpm toolchain and frozen lockfile. Runtime stages contain only the
deployed application, production dependencies, and required static/build assets. They run as a
non-root user, use explicit signals and startup commands, and avoid copying `.env`, Git metadata,
source credentials, caches, or unrelated applications. API and web images receive health checks;
worker health is represented by its MongoDB heartbeat and process lifecycle rather than a fake HTTP
server.

Compose keeps MongoDB and Valkey as the default infrastructure path. Application services are added
behind an explicit profile so `pnpm dev:infra` does not unexpectedly build or start the entire
platform. A complete local stack can start API, worker, and web after the operator supplies a
populated ignored `.env` and builds the images.

## CI and supply-chain design

A SHA-pinned GitHub Actions CI workflow will run for pushes and pull requests using read-only
permissions. It will perform:

1. frozen pnpm installation;
2. format validation;
3. strict typecheck;
4. lint;
5. full build;
6. high-severity dependency audit;
7. CLI pack and artifact inspection;
8. Agent Skill and MCP metadata validation;
9. production container builds.

No unit, integration, or end-to-end job will be added. Existing CodeQL, dependency review,
Dependabot, dependency audit, and production queue workflows remain separate. Publication remains a
manual owner action documented in the release runbook; future trusted publishing can be added only
after the npm package is explicitly linked to an approved GitHub workflow.

## Documentation design

The root README becomes the contributor entry point with a concise architecture flow, a genuinely
fresh quickstart, local and hosted topology choices, current implementation status, and links rather
than duplicated operational detail.

Phase 21 will create or complete:

- `CONTRIBUTING.md` for environment setup, changes, validation, and pull requests;
- `CODE_OF_CONDUCT.md` using the Contributor Covenant with attribution;
- `SECURITY.md` with supported-version and private-reporting expectations;
- `CHANGELOG.md` plus Changesets as the release-note source;
- `docs/DEPLOYMENT.md` as a provider-neutral guide with Render as one example;
- `docs/RELEASE.md` with version, pack, image, migration, seed, secret, admin, MCP, installer,
  observability, publish, tag, and rollback checklists;
- `docs/INGESTION.md` for the empty-database Expo/React Native seed path;
- `docs/AGENT_INSTALLATION.md` as the end-user installation entry point;
- refreshed `docs/OPERATIONS.md`, `docs/MCP.md`, and `docs/PRIVACY.md` boundaries.

The complete `.env.example` will be grouped by runtime, database, queue, API/auth, telemetry,
GitHub/source ingestion, Gemini/embeddings/search, web, and MCP client. It will contain safe local
values only where the value is non-secret and intentionally local; credentials remain blank.

## Seed bootstrap flow

The documented initial seed procedure will be explicit and bounded:

1. start MongoDB and Valkey;
2. initialize collections, validators, and indexes;
3. create the first administrator through the masked CLI;
4. discover and sync curated Expo/React Native GitHub and official sources;
5. extract only eligible public records with Gemini;
6. deterministically score candidates;
7. discover/review canonical clusters and apply only safe merges;
8. project and embed public canonical records;
9. create Atlas search indexes when using Atlas, or retain local lexical fallback;
10. review and deliberately publish eligible records through the administration flow;
11. verify HTTP and MCP retrieval before applying schedules.

Every stage starts with dry-run or small limits and preserves the public-only provider boundary.

## Failure behavior and release safety

- Missing secrets, malformed URLs, unavailable MongoDB, or unavailable production Valkey fail with
  the existing explicit configuration/readiness behavior.
- Images never contain runtime credentials; deployment systems inject environment variables.
- Package validation rejects unexpected files, workspace dependency specifiers, missing skill/MCP
  metadata, and a non-executable binary.
- Release documentation requires registry identity, clean Git state, exact version consistency,
  migrations/index initialization, seed review, and post-publication installation verification.
- Rollback never rewrites npm artifacts. Operators restore a prior application image/deployment and
  deprecate or supersede a bad package version according to npm policy.

## Verification

Without adding tests, Phase 21 will observe and record:

- clean frozen-lockfile installation;
- typecheck, lint, format validation, build, dependency audit, and diff checks;
- all production image builds and documented local-stack boot as far as available infrastructure
  permits;
- package dry-run/pack contents and an isolated install of the tarball;
- packed CLI help, version, status, and dry-run installation behavior;
- Agent Skill and MCP metadata consistency;
- workflow YAML validation with available tooling;
- README quickstart execution from a clean-ish environment;
- absence of credentials and accidental generated artifacts.

Phase 21 ends after documentation/progress updates and the requested implementation commit. It does
not publish, register, release, deploy, or begin Phase 22.
