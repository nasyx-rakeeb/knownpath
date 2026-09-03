# GitHub ingestion

KnownPath collects objective public GitHub material through official APIs. It does not scrape GitHub
HTML and does not infer a fix during collection.

Issue and discussion text is untrusted evidence. It may contain prompt-injection-like instructions,
malicious markup, or incorrect technical claims.

## Configured repositories

The source of truth is `config/sources/registry.json`.

| Source key                      | Repository                                         | Content             |
| ------------------------------- | -------------------------------------------------- | ------------------- |
| `expo-core`                     | `expo/expo`                                        | issues, discussions |
| `react-native-core`             | `react/react-native`                               | issues              |
| `react-native-discussions`      | `react-native-community/discussions-and-proposals` | discussions         |
| `react-native-new-architecture` | `reactwg/react-native-new-architecture`            | discussions         |
| `react-native-upgrade-support`  | `react-native-community/upgrade-support`           | issues              |

The manifest records canonical repository identity, allowed source types, ecosystem hints, refresh
cadence, publisher, attribution, and source-quality classification.

## API clients

The collector uses Octokit with:

- GitHub REST API version `2026-03-10` for repositories, issues, issue comments, labels, and
  reactions;
- GitHub GraphQL for Discussions, selected answers, nested comments/replies/reactions, and
  closing-pull-request metadata.

Pull requests returned from the REST issues endpoint are filtered out.

## Authentication

`GITHUB_TOKEN` is optional for public REST collection but strongly recommended for practical rate
limits. GraphQL Discussions require authentication.

Use a fine-grained read-only token with access only to the selected public repositories. KnownPath
does not perform GitHub writes, store the token in MongoDB, or include it in logs.

An existing GitHub CLI session can supply a token for a bounded local run:

```sh
export GITHUB_TOKEN="$(gh auth token)"
pnpm ingest:github --source react-native-discussions --types discussions --limit 1
unset GITHUB_TOKEN
```

Use a dedicated shell, keep shell tracing disabled, and prefer the deployment secret manager for
long-running workers.

Without a token, unsupported GraphQL capability is reported as skipped rather than faked.

## Collected objects

Issues, discussions, comments, and replies become separate immutable source-item revisions. Stored
metadata includes, when exposed:

- repository identity;
- immutable GitHub database and node IDs;
- canonical URL and parent/root identities;
- title and body;
- open/closed state;
- created, updated, edited, answered, and closed timestamps;
- author, site-admin flag, and author association;
- labels;
- reaction summaries and identifiable actors;
- discussion category and accepted-answer identity;
- linked closing pull requests and merge state;
- content hash, observed revision, and capture time.

KnownPath preserves `OWNER`, `MEMBER`, and `COLLABORATOR` associations as objective metadata for
later verification. It does not treat them—or reactions—as truth during ingestion.

## Run commands

Initialize MongoDB first:

```sh
pnpm dev:infra
pnpm db:init
```

Preview one source:

```sh
pnpm ingest:github --source expo-core --types issues --limit 5 --dry-run
```

Collect by repository or every enabled source:

```sh
pnpm ingest:github --repository react/react-native --types issues --limit 20
pnpm ingest:github --all --limit 20
```

`--types` accepts `issues`, `discussions`, or a comma-separated combination supported by every
selected registry entry. `--limit` bounds root threads per type; their comments, replies, and
reactions are still collected to preserve usable context.

`--since` and `--until` require ISO 8601 timestamps with offsets.

## Incremental synchronization

Normal synchronization starts from the last successful updated-time cursor minus
`GITHUB_INCREMENTAL_OVERLAP_HOURS` (24 hours by default). The overlap protects against late edits
and boundary races; content hashes make replay safe.

REST discovery retains ETags and uses conditional requests when the same lower bound is reused.
Cursors advance only after every selected object completes. Runs record discovered, created,
updated, unchanged, failed, rate-limited, and capability-skipped counts.

For historical data, provide an explicit bounded window:

```sh
pnpm ingest:github \
  --source expo-core \
  --types issues \
  --since 2026-01-01T00:00:00Z \
  --until 2026-02-01T00:00:00Z \
  --limit 100 \
  --backfill
```

Advance windows only after inspecting run counts and remaining quota.

## Pagination, rate limits, and retries

REST pages and GraphQL cursors are followed explicitly. Requests are serialized. Octokit's
throttling support honors primary/secondary rate limits, `Retry-After`, and reset information.
Transient failures use bounded exponential backoff with jitter.

If the requested wait exceeds `GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS`, the run fails for later queue
retry instead of sleeping indefinitely. Logs include safe request/rate metadata, never credentials
or response bodies.

## Idempotency and provenance

Stable GitHub identities plus versioned normalized content hashes prevent duplicates. A new edit
creates a new immutable source revision; an unchanged replay increments `unchanged`.

Source registries keep mutable sync cursors. Ingestion runs keep operational state and counts.
Downstream extraction cites exact source-item IDs and excerpts, so later scoring can resolve claims
back to the immutable GitHub snapshot.

## Official references

- [GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
- [REST pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)
- [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [REST API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [Issues API](https://docs.github.com/en/rest/issues/issues)
- [Reactions API](https://docs.github.com/en/rest/reactions/reactions)
- [GraphQL Discussions](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)
- [GitHub credential security](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure)
