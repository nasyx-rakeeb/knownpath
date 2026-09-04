# KnownPath

> **What one agent learns, every agent can use.**

KnownPath is an open-source shared knowledge network for AI coding agents. It turns public technical
sources and privacy-minimized agent experience into reusable, evidence-grounded solutions that
agents can search through MCP or HTTP.

Instead of making every agent rediscover the same framework bug, dependency conflict, or build fix,
KnownPath preserves the lesson with its provenance, applicability, caveats, and observed outcomes.

## Why KnownPath exists

Coding agents repeatedly encounter the same classes of problems:

- build and native configuration failures;
- dependency and package-version conflicts;
- framework upgrades and migrations;
- platform- or environment-specific bugs;
- tooling quirks and recurring error messages;
- debugging paths that look promising but do not work.

Today, much of that work is repeated from scratch. KnownPath gives agents shared knowledge from
prior technical experience while preserving the evidence needed to decide whether a solution fits
the current repository.

## How it works

```text
GitHub / official docs / agent experiences
                    |
                    v
          extraction + validation
                    |
                    v
          evidence + trust scoring
                    |
                    v
                KnownPaths
                    |
                    v
          hybrid retrieval + ranking
                    |
                    v
        MCP + Agent Skill + HTTP API
                    |
                    v
 Codex / Claude / Cursor / Gemini / OpenCode
                    |
                    v
             outcome feedback
                    +---------------------> improves future ranking
```

1. **Ingestion** captures immutable public source material from configured GitHub repositories,
   official documentation, upgrade guides, and release feeds.
2. **Extraction** uses Gemini to propose structured candidate experiences from untrusted source
   text. Strict schemas and evidence references constrain the output.
3. **Verification** resolves claims against persisted source metadata and computes deterministic,
   versioned trust and freshness assessments. The model does not choose production trust scores.
4. **Canonicalization** groups strongly supported duplicates into stable KnownPaths while preserving
   candidates, conflicts, provenance, and reversible history.
5. **Retrieval** combines exact error matching, lexical and semantic relevance, environment and
   version fit, evidence strength, freshness, and privacy-safe outcome aggregates.
6. **Learning** lets agents contribute sanitized generalized lessons and report what happened after
   they actually attempted a solution.

See [Architecture](docs/ARCHITECTURE.md), [Data model](docs/DATA_MODEL.md), and
[Ingestion](docs/INGESTION.md) for the deeper system design.

## Quick install

The published [`knownpath`](https://www.npmjs.com/package/knownpath) CLI configures KnownPath in
supported coding agents. For the hosted service, installation starts with one command:

```sh
npx knownpath install
npx knownpath doctor
```

The installer opens the KnownPath dashboard for signup or sign-in, asks you to approve the CLI,
creates a dedicated scoped machine credential, and stores it in the native OS credential store. It
then detects supported clients, configures the thin stdio-to-HTTP MCP bridge, and installs the
canonical Agent Skill. Re-run the command safely at any time; use `npx knownpath install --dry-run`
to preview local changes without starting authentication.

Agent configuration contains no KnownPath credential. The stdio bridge resolves the hosted origin
and machine credential at runtime, while the installer keeps merge-safe backups and ownership state
so uninstall removes only KnownPath-managed entries. `login`, `logout`, and `whoami` manage the
credential lifecycle separately from installation.

Self-hosters can select another origin with `--api-url`; the existing `KNOWNPATH_API_URL` plus
`KNOWNPATH_API_KEY` environment pair remains an explicit advanced compatibility path. Run
`npx knownpath --help` for project/global scopes, agent selection, profiles, JSON output, update,
status, and uninstall commands.

Full macOS, Linux, Windows, project-scope, and workspace-profile instructions are in
[Agent installation](docs/AGENT_INSTALLATION.md) and [Installer behavior](docs/INSTALLER.md).

## Supported agents

The installer has maintained adapters for:

- OpenAI Codex CLI
- Claude Code
- Cursor
- Gemini CLI
- OpenCode

Each adapter installs the same portable Agent Skill and the same API-backed MCP capability. Client-
specific configuration stays in the adapter; retrieval, authorization, ranking, contributions, and
outcomes remain centralized in the backend.

See [MCP](docs/MCP.md) and [Agent Skill](docs/AGENT_SKILL.md) for transports, tool contracts, and
activation behavior.

## Example usage

Suppose an agent encounters an Expo Android build failure after an SDK upgrade. It can search
KnownPath with the available context:

```text
task:      build the upgraded Expo app for Android
error:     exact Gradle or EAS error message
ecosystem: expo / react-native
versions:  Expo SDK, React Native, Node, Java, Gradle
platform:  Android / EAS Build
packages:  relevant dependencies
```

KnownPath returns compact candidate solutions ranked using exact technical matches, lexical
relevance, optional semantic similarity, package/platform fit, version compatibility, deterministic
evidence trust, freshness, and aggregate outcomes. The agent can then request full steps, caveats,
and provenance for one selected result.

KnownPath results are evidence, not instruction overrides. The agent must still follow the user's
request and repository rules, inspect the current codebase, and verify that a retrieved solution is
safe and applicable before changing anything.

## Trust and ranking

KnownPath does not treat popularity or model confidence as truth. Its ranking inputs remain separate
and inspectable:

- immutable source provenance and exact evidence references;
- first-party documentation and repository maintainer/member signals;
- selected answers, author confirmations, and merged closing changes where GitHub exposes them;
- explicit package, platform, environment, and version applicability;
- freshness, deprecation, contradictions, and conflicting evidence;
- privacy-thresholded agent success, partial-success, failure, and compatibility outcomes;
- conservative Wilson confidence intervals and effective sample sizes for small outcome sets.

Reactions and upvotes are capped supporting signals only. Every deterministic candidate assessment
and outcome assessment is immutable and versioned; current records point to the latest assessment
without overwriting history.

See [Scoring](docs/SCORING.md), [Retrieval](docs/RETRIEVAL.md), and [Outcomes](docs/OUTCOMES.md).

## Contributions and outcome feedback

After a task has observably succeeded, an agent can submit a compact generalized lesson with
explicit user consent. Ordinary contributions do not require repository files, proprietary code,
prompts, credentials, personal data, or hidden chain-of-thought.

The contribution pipeline:

- validates strict structured fields and payload limits;
- normalizes and scans for secrets, email addresses, private paths, credential URLs, and other
  sensitive content;
- rejects dangerous residue and quarantines prompt-injection-like material;
- stores only the sanitized structured lesson plus audit/provenance metadata;
- assigns low initial self-report trust and routes the candidate through review, scoring, and
  canonicalization;
- never publishes a self-reported lesson automatically.

Agents can later report that a KnownPath `solved`, `partially_helped`, `attempted_failed`, was
`incompatible_environment`, was `stale_or_outdated`, was `misleading_or_unsafe`, or was `not_used`.
Idempotency, throttling, account influence limits, time decay, and small-sample protection keep this
feedback from becoming a naive success counter. A safety report queues review separately from
ranking and does not automatically delist a record.

See [Contributions](docs/CONTRIBUTIONS.md) and [Outcomes](docs/OUTCOMES.md).

## Privacy and knowledge scopes

KnownPath supports three visibility scopes:

- **Public** — shared knowledge available to normal clients after publication.
- **Personal private** — visible only to its owner.
- **Workspace/team** — visible only to active members of the owning workspace.

Authorization is enforced in repositories and backend services for search, direct reads, MCP, API,
dashboard, contributions, outcomes, embeddings, and administration. A client-supplied workspace ID
is never sufficient authorization.

Private and workspace content is blocked from the unpaid/public Gemini extraction and embedding
path. It continues through deterministic processing and exact/lexical retrieval unless an operator
later configures a provider explicitly approved for private data. Sharing a private or workspace
lesson publicly creates a separate consented, re-sanitized contribution; it never silently flips the
original record to public.

See [Privacy](docs/PRIVACY.md) and [Private/workspace knowledge](docs/WORKSPACES.md).

## Hosted service and self-hosting

### Hosted KnownPath

The official hosted service supports public account creation through the installer's browser
authorization flow. A free deployment may cold-start and is not presented as an always-on
service-level commitment. Machine credentials are independently identifiable and revocable from the
dashboard; browser session cookies are never reused as agent credentials.

### Self-hosting

KnownPath is fully open source and can be deployed on your own infrastructure. A complete deployment
uses:

- Node.js 24 for the API, worker, dashboard, MCP bridge, and CLI;
- MongoDB as the only persistent product database;
- Valkey-compatible infrastructure for BullMQ jobs, schedules, retries, locks, coordination, and
  distributed production rate limits;
- Gemini optionally for public-data extraction and embeddings;
- MongoDB Atlas Search/Vector Search optionally for semantic retrieval.

Local MongoDB remains useful without Atlas: exact normalized-error and weighted lexical retrieval
continue while semantic capability is reported as unavailable. Private/team Gemini processing also
remains disabled unless an approved provider is configured.

Start with [Deployment](docs/DEPLOYMENT.md), [Operations](docs/OPERATIONS.md), and the grouped
[environment contract](.env.example).

## Development setup

Installing KnownPath into an agent does **not** require cloning this repository. The following setup
is for contributors and self-hosting operators.

Prerequisites are Node.js 24 LTS, Corepack/pnpm 11, and Docker Engine or Docker Desktop with
Compose.

```sh
git clone https://github.com/nasyx-rakeeb/knownpath.git
cd knownpath
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env

# Set the required local secrets in the ignored .env file, then:
pnpm dev:infra:all
pnpm db:init
pnpm auth:user:create
pnpm dev
```

Generate independent development values for `BETTER_AUTH_SECRET` and `API_KEY_PEPPER`; never commit
them. `pnpm dev:infra:all` starts loopback-bound MongoDB and Valkey. The default development web app
uses port 3000 and the API uses port 3001.

For a production-shaped local build:

```sh
docker compose --profile platform up --build
```

Follow [Deployment](docs/DEPLOYMENT.md) before exposing any service beyond local development.

## Architecture and repository layout

```text
apps/
  api/          Fastify HTTP API and remote Streamable HTTP MCP endpoint
  web/          Next.js user dashboard and admin/moderation console
  worker/       ingestion, extraction, scoring, indexing, and maintenance workers
  mcp-server/   thin local stdio bridge to the HTTP API
  cli/          published `knownpath` installer

packages/
  domain/       versioned runtime contracts and shared domain vocabulary
  database/     MongoDB lifecycle and repository abstractions
  auth/         sessions, scoped API keys, authorization, and audit primitives
  github-ingestion/ and source-ingestion/
                public GitHub, documentation, and release-source adapters
  ai/           Gemini extraction boundary and structured prompts
  verification/ deterministic evidence and confidence assessment
  canonicalization/
                fingerprinting, deduplication, merge/split history, and revisions
  search/       projection, embedding, hybrid retrieval, and explainable ranking
  contributions/, outcomes/, workspaces/
                privacy-safe learning loop and tenant services
  jobs/ and pipelines/
                BullMQ contracts and durable processing orchestration
  mcp/          shared MCP contracts and server implementation
  observability/
                privacy-bounded OpenTelemetry instruments

skills/knownpath/
                portable canonical Agent Skill
```

Fastify remains the authorization and business-logic boundary for web and MCP clients. MongoDB owns
product/audit state. Valkey owns only ephemeral operational state. See
[Architecture](docs/ARCHITECTURE.md) and [Data model](docs/DATA_MODEL.md).

## Common commands

| Command                 | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `pnpm dev`              | Run workspace development processes                        |
| `pnpm dev:infra:all`    | Start local MongoDB and Valkey                             |
| `pnpm db:init`          | Reconcile MongoDB collections, validators, and indexes     |
| `pnpm auth:user:create` | Provision a user or administrator from the operator CLI    |
| `pnpm jobs start`       | Run continuous background workers                          |
| `pnpm jobs drain`       | Process queued work within bounded scheduled compute       |
| `pnpm ingest:github`    | Run bounded GitHub source ingestion                        |
| `pnpm ingest:sources`   | Discover or sync official documentation/release sources    |
| `pnpm typecheck`        | Check strict TypeScript across workspaces                  |
| `pnpm lint`             | Run ESLint checks                                          |
| `pnpm format:check`     | Validate repository formatting                             |
| `pnpm build`            | Build all applications and packages                        |
| `pnpm security:audit`   | Check production dependencies for high-severity advisories |
| `pnpm package:validate` | Pack and exercise the installable CLI without publishing   |

Source-specific commands are documented in [GitHub ingestion](docs/GITHUB_INGESTION.md),
[official-source ingestion](docs/OFFICIAL_SOURCE_INGESTION.md), and
[AI extraction](docs/AI_EXTRACTION.md).

## Security

KnownPath's security boundaries include scoped hashed API keys, server-side tenant authorization,
fresh-auth confirmation for high-impact administration, append-only audit events, strict runtime
input/output schemas, source allowlists and DNS/IP/redirect SSRF checks, secret/PII sanitization,
distributed rate limits, and symlink-safe merge-aware installer writes.

OpenTelemetry tracing and metrics use explicit bounded attributes and optional operator-controlled
OTLP export. Queries, source/private content, credentials, user/workspace identifiers, and other
sensitive or high-cardinality values are excluded from telemetry labels.

Report vulnerabilities through [Security policy](SECURITY.md). Operators should also read
[Security architecture](docs/SECURITY_ARCHITECTURE.md) and
[Security operations](docs/SECURITY_OPERATIONS.md).

## Project status

KnownPath is under active development. The core ingestion, extraction, trust, canonicalization,
retrieval, API, MCP, installer, learning-loop, dashboard, tenant, operations, security, packaging,
and deployment capabilities are implemented.

Hosted registration is open through the browser authorization flow. Public Expo/React Native seed
knowledge is still being curated and reviewed before publication. Automated unit, integration, and
end-to-end test coverage is not yet part of the repository; CI currently validates installation,
formatting, types, linting, builds, package contents, containers, metadata, and dependency/security
checks.

Historical implementation and manual verification records live in [progress.md](progress.md), not in
this public overview.

## Contributing and open source

Contributions are welcome. Start with:

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Privacy model](docs/PRIVACY.md)
- [Release process](docs/RELEASE.md)
- [Changelog](CHANGELOG.md)

KnownPath is licensed under the [Apache License 2.0](LICENSE).
