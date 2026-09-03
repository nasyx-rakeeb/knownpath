# Official Expo and React Native sources

KnownPath ingests structured first-party documentation and release material to complement community
evidence. Official content is authoritative context, but it remains untrusted input at the ingestion
boundary and may be version-specific or outdated.

## Sources

| Source key                   | Structured source                                | Default focus                                   |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `expo-documentation`         | Expo `llms.txt`, Markdown pages, sitemap         | upgrades, migrations, troubleshooting           |
| `react-native-documentation` | React Native `llms.txt`, Markdown pages, sitemap | upgrades, compatibility, troubleshooting        |
| `expo-changelog`             | Expo changelog RSS                               | SDK/tool releases and breaking/deprecation info |
| `react-native-releases`      | React Native blog RSS                            | releases, migration, compatibility              |

All URLs, origins, path prefixes, curated rules, version patterns, authority, publisher, license,
and attribution live in `config/sources/registry.json`.

## Curated sync and full discovery

Normal sync uses `--scope curated`. It discovers the complete official index but fetches only
configured high-signal pages likely to contain reusable technical knowledge.

Any indexed page remains available for targeted refresh:

```sh
pnpm ingest:sources sync \
  --source expo-documentation \
  --page https://docs.expo.dev/versions/latest/sdk/camera \
  --limit 1
```

Full-catalog ingestion is possible but must be explicit and bounded:

```sh
pnpm ingest:sources sync \
  --source react-native-documentation \
  --scope all \
  --limit 25 \
  --dry-run
```

Do not schedule full-catalog ingestion by default.

## Commands

```sh
pnpm dev:infra
pnpm db:init

pnpm ingest:sources discover --source expo-documentation --limit 20
pnpm ingest:sources discover --all --limit 10
pnpm ingest:sources sync --source react-native-documentation --limit 5 --dry-run
pnpm ingest:sources sync --source expo-changelog --limit 5
pnpm ingest:sources sync --all --limit 5
pnpm ingest:sources sync --source react-native-releases --version 0.87 --limit 5
```

`discover` makes no registry, run, snapshot, state, or cursor writes. `--page` requires one source
and bypasses its curated filter. `--limit` applies per source.

## Normalization

Documentation is fetched from the official Markdown representation rather than rendered site HTML.
KnownPath stores normalized text plus bounded:

- headings and paragraphs;
- code and lists;
- tables;
- blockquotes;
- admonitions.

Feed-supplied HTML is converted to plain text. Scripts, styles, images, navigation, and complete
rendered pages are not retained.

Metadata includes canonical URL, source identity, document type, framework/ecosystem, detected
versions, published/observed/captured time, content hash, media type, size, authority, publisher,
attribution, and license.

Authority is registry/provider metadata, not an AI judgment. These sources are classified
`first_party_official`.

## Incremental refresh

Catalog and page state stores ETag, Last-Modified, latest source hash/snapshot, lifecycle, and fetch
times. Requests send `If-None-Match` and `If-Modified-Since` when available.

- `304 Not Modified` reuses the retained body and updates fetch state.
- Equal normalized content records `unchanged`.
- Changed content creates another immutable source revision.
- A successful changed complete documentation index may mark missing pages deprecated.
- Missing items in a rolling RSS feed are never treated as deletion.

Lifecycle values are `active`, `deprecated`, and `deleted`. Disabling a registry stops selection but
does not erase retained provenance.

## Fetch security

The adapter permits only configured HTTPS origins, standard HTTPS ports, and canonical path
prefixes. It:

- validates every DNS A/AAAA result and rejects non-public destinations;
- pins validated resolution to prevent DNS rebinding;
- revalidates each redirect's origin, path, DNS destination, and port;
- enforces redirect, time, decoded-size, and media-type limits;
- checks robots policy before discovery;
- uses serial requests and bounded exponential backoff with jitter;
- honors bounded numeric and HTTP-date `Retry-After` values.

A hostname resolving to even one loopback, private, link-local, multicast, reserved, unspecified, or
mapped-private address fails closed. Network egress filtering remains recommended defense in depth.

The adapter requires no credential. Its user agent, timeouts, response size, retry count, and
registry path are configured in `.env.example`.

## Attribution and retention

KnownPath retains source text internally as evidence for extraction, verification, and refresh. The
user-facing product exposes generalized knowledge, canonical links, and bounded evidence excerpts;
it is not a mirror of complete copyrighted pages.

Expo documentation retains its configured MIT attribution. React Native documentation retains
CC-BY-4.0 attribution. Expo changelog collection stores only feed-provided summaries and does not
scrape the full article.

Before adding a source:

1. confirm ownership, terms/license, robots policy, and the most structured official endpoint;
2. add the narrowest registry allowlist and curation rules;
3. inspect discovery;
4. run a small dry-run;
5. sync one sample and inspect provenance;
6. repeat it and confirm no duplicate snapshot.

## Official sources

- [Expo `llms.txt`](https://docs.expo.dev/llms.txt)
- [Expo sitemap](https://docs.expo.dev/sitemap.xml)
- [Expo robots policy](https://docs.expo.dev/robots.txt)
- [Expo changelog feed](https://expo.dev/changelog/rss.xml)
- [React Native `llms.txt`](https://reactnative.dev/llms.txt)
- [React Native sitemap](https://reactnative.dev/sitemap.xml)
- [React Native release feed](https://reactnative.dev/blog/rss.xml)
- [React Native documentation license](https://github.com/react/react-native-website/blob/main/LICENSE-docs)
