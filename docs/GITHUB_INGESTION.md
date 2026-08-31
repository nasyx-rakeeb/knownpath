# GitHub ingestion

Phase 4 collects objective public GitHub source material for later processing. It does not infer a
problem, solution, confidence score, or KnownPath. GitHub-authored text is untrusted Markdown and is
stored as source evidence, never executed or treated as an instruction.

## Initial source registry

The versioned manifest at `config/sources/registry.json` is the configuration source of truth. It
currently enables:

| Key                             | Repository                                         | Types               |
| ------------------------------- | -------------------------------------------------- | ------------------- |
| `expo-core`                     | `expo/expo`                                        | issues, discussions |
| `react-native-core`             | `react/react-native`                               | issues              |
| `react-native-discussions`      | `react-native-community/discussions-and-proposals` | discussions         |
| `react-native-new-architecture` | `reactwg/react-native-new-architecture`            | discussions         |
| `react-native-upgrade-support`  | `react-native-community/upgrade-support`           | issues              |

The worker validates the manifest at startup and verifies each repository's canonical API identity
and enabled capabilities before collecting it. Adding an ecosystem source is a data change when the
existing GitHub object types are sufficient.

The manifest is shared with Phase 5 documentation/feed adapters. GitHub entries use the
`github_repository` discriminator; other adapter kinds are ignored by the GitHub selector.

## API and authentication

The collector uses GitHub's official APIs through Octokit:

- REST API version `2026-03-10` supplies repositories, issues, issue comments, labels, and
  reactions. Pull requests returned by the issues endpoint are filtered out.
- GraphQL supplies Discussions, answer state, discussion comments/replies/reactions, and issue
  closing-pull-request references.

Set `GITHUB_TOKEN` to a token permitted to read the selected public repositories. Use the minimum
permissions GitHub's current token documentation requires; KnownPath needs read-only access and
never performs GitHub writes. A token must not be passed as a command argument. It is omitted from
structured logs and stored nowhere in MongoDB.

Public REST requests can run without a token if GitHub still permits them. They currently receive a
much lower primary limit (normally 60 requests/hour rather than 5,000 authenticated requests/hour).
GitHub GraphQL requires authentication, so discussion collection is explicitly counted and logged as
`capabilitySkipped` without a token.

The client processes requests serially, follows explicit cursor/page pagination, observes primary
and secondary rate-limit responses, honors `Retry-After`/reset information through Octokit's
throttling support, and uses bounded retry/backoff for transient failures. Waits longer than
`GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS` fail the run for a later retry. Safe response telemetry
includes status, rate resource, remaining requests, reset time, and GitHub request ID—not headers or
tokens.

## What is stored

Each GitHub issue, discussion, comment, and reply becomes its own immutable `source_items` snapshot.
The normalized envelope contains:

- repository, canonical URL, GitHub database ID/node ID, source identity, and observed revision;
- title/body, state, created/updated/closed timestamps, author, author association, and site-admin
  status where exposed;
- labels, reactions and reaction actors, discussion category/answer state, and reliably exposed
  closing pull requests;
- root and parent identities for thread reconstruction;
- deterministic maintainer/community source quality derived from GitHub author association;
- a content digest, captured timestamp, provider metadata format version, and deterministic snapshot
  deduplication key.

The provider payload is objective source metadata, not a stable public API contract. Its
`formatVersion` must change before an incompatible representation change. Source registries hold
mutable synchronization cursors; ingestion runs hold status and discovered/created/updated/
unchanged/failed/rate-limited counts.

## Running collection

Start MongoDB and reconcile indexes first:

```sh
pnpm dev:infra
pnpm db:init
```

Select exactly one scope. `--limit` bounds top-level threads per enabled source type; related
comments, replies, and reactions are still collected so a thread remains useful.

```sh
# Inspect one configured source without writes.
pnpm ingest:github --source expo-core --types issues --limit 5 --dry-run

# Collect one configured repository.
pnpm ingest:github --repository react/react-native --types issues --limit 20

# Collect every enabled source with each source's normal incremental cursor.
pnpm ingest:github --all --limit 20
```

`--types` accepts `issues`, `discussions`, or both as a comma-separated value and must be supported
by every selected source. `--since` and `--until` require ISO 8601 timestamps with offsets.

## Incremental and backfill behavior

Normal collection starts from a source's last successful updated-time cursor minus
`GITHUB_INCREMENTAL_OVERLAP_HOURS` (24 hours by default). A new source uses its configured lookback.
The overlap captures late edits and timestamp-boundary races; immutable hashes make repeats safe.
REST issue discovery also retains ETags and uses conditional requests when the same lower bound is
reused. Cursors move only after every collected object succeeds.

Use small incremental limits initially. Historical collection must be deliberate and requires an
explicit lower bound:

```sh
pnpm ingest:github \
  --source expo-core \
  --types issues \
  --since 2026-01-01T00:00:00Z \
  --until 2026-02-01T00:00:00Z \
  --limit 100 \
  --backfill
```

Advance backfill windows manually after inspecting rate usage and run counters. Operational syncs
may also be scheduled through the Phase 16 BullMQ/Valkey pipeline; failed or rate-limited durable
runs remain available for operators to inspect and retry.

## Official references

- [GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
- [REST pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)
- [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [REST best practices and conditional requests](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [Issues API](https://docs.github.com/en/rest/issues/issues),
  [comments](https://docs.github.com/en/rest/issues/comments), and
  [reactions](https://docs.github.com/en/rest/reactions/reactions)
- [GraphQL Discussions guide](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)
- [GitHub credential guidance](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure)
- [Octokit](https://github.com/octokit/octokit.js)
