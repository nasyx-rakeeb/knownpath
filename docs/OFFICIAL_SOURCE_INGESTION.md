# Official Source Ingestion

## Scope

Phase 5 collects normalized first-party Expo and React Native documentation and release material for
later analysis. It does not extract fixes, create candidate experiences or KnownPaths, calculate
trust scores, build search indexes, or publish complete source pages.

All remote content remains untrusted input even when it comes from an official domain.

## Structured sources

| Source key                   | Discovery/content                                                         | Normal curated focus                                                                       | Authority and attribution                                                |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `expo-documentation`         | `https://docs.expo.dev/llms.txt`, `.md` documents, and sitemap metadata   | SDK upgrades, native upgrades, troubleshooting, SDK-library migrations                     | Expo first-party; source repository MIT attribution                      |
| `react-native-documentation` | `https://reactnative.dev/llms.txt`, `.md` documents, and sitemap metadata | Upgrading, troubleshooting, release compatibility, versioning, and strict API guidance     | React Native first-party; documentation CC BY 4.0 attribution            |
| `expo-changelog`             | Official Expo changelog RSS                                               | SDK/tooling releases and migration, compatibility, deprecation, or breaking-change entries | Expo first-party; feed summary only                                      |
| `react-native-releases`      | Official React Native blog RSS                                            | Framework releases and migration, compatibility, deprecation, or breaking-change entries   | React Native first-party; feed-supplied content normalized to plain text |

The source URLs, curation rules, classification patterns, versions, allowlists, publisher,
authority, and licensing metadata live in `config/sources/registry.json`. Adding another supported
source or expanding curation should normally be a reviewed data change, not adapter code.

Official references consulted for the adapter include the
[Expo LLM index](https://docs.expo.dev/llms.txt), [Expo sitemap](https://docs.expo.dev/sitemap.xml),
[Expo robots policy](https://docs.expo.dev/robots.txt),
[Expo changelog feed](https://expo.dev/changelog/rss.xml),
[React Native LLM index](https://reactnative.dev/llms.txt),
[React Native sitemap](https://reactnative.dev/sitemap.xml),
[React Native feed](https://reactnative.dev/blog/rss.xml), and the React Native website's
[CC BY 4.0 documentation license](https://github.com/reactjs/react-native-website/blob/main/LICENSE-docs).

## Curated versus full-catalog behavior

Normal synchronization defaults to `--scope curated`. The adapter always discovers the complete
official index so it can validate a target and notice authoritative removals, but only fetches the
configured high-signal candidates. This keeps routine collection focused and inexpensive.

Every indexed page remains available on demand:

```sh
pnpm ingest:sources -- sync --source expo-documentation \
  --page https://docs.expo.dev/versions/latest/sdk/camera --limit 1
```

An explicit full-catalog operation is supported but remains bounded:

```sh
pnpm ingest:sources -- sync --source react-native-documentation --scope all --limit 25 --dry-run
```

Do not schedule `--scope all` as the normal Phase 5 behavior. Raise limits gradually while observing
response and MongoDB size, run duration, and source policy.

## Commands

MongoDB must be running and initialized before using the worker:

```sh
pnpm dev:infra
pnpm db:init
```

Discover and classify candidates without writing registry, run, snapshot, state, or cursor records:

```sh
pnpm ingest:sources -- discover --source expo-documentation --limit 20
pnpm ingest:sources -- discover --all --limit 10
```

Preview selected content fetches without persistence:

```sh
pnpm ingest:sources -- sync --source react-native-documentation --limit 5 --dry-run
```

Synchronize one source or all enabled official sources:

```sh
pnpm ingest:sources -- sync --source expo-changelog --limit 5
pnpm ingest:sources -- sync --all --limit 5
```

Filter candidates carrying a deterministically detected version:

```sh
pnpm ingest:sources -- sync --source react-native-releases --version 0.87 --limit 5
```

`--page` requires one `--source`; it cannot be combined with `--all`. A targeted indexed page
bypasses the normal curated filter. `--limit` applies per selected source.

## Incremental behavior

Complete indexes, sitemaps, and feeds are stored as small immutable catalog snapshots. Their mutable
`source_item_states` rows retain ETag and Last-Modified values. A `304 Not Modified` reads the
retained catalog body and updates only its fetch timestamp.

Each selected document has a stable identity derived from its canonical URL or feed GUID. Page
requests send `If-None-Match` and `If-Modified-Since` when prior state supplies those values. A new
normalized representation creates an immutable `source_items` revision. A `304` or equal versioned
digest updates only state and increments `unchanged`.

State records include:

- canonical URL and lifecycle (`active`, `deprecated`, or `deleted`);
- latest immutable snapshot ID and normalized digest;
- ETag, Last-Modified, and source-observed revision where available;
- last fetched, last changed, and last observed timestamps;
- document type, framework/ecosystem, detected versions, authority, publisher, and attribution.

Documentation deletion is inferred only after a successful changed complete index fetch during a
non-targeted, non-version-filtered synchronization. Limits affect selected fetches, not complete
index discovery. Missing entries in rolling RSS feeds are never treated as deletions.

## Normalization and provenance

Documentation is fetched from the official Markdown representation rather than rendered website
HTML. The immutable item retains normalized Markdown plus bounded heading, paragraph, code, list,
table, blockquote, and admonition blocks. Release-feed HTML supplied inside RSS is converted to
plain text; scripts, styles, images, and page navigation are not retained.

Every document stores canonical URL, immutable source identity, observed/published/captured times,
content hash, media type, byte length, source registry, provider metadata, deterministic document
type, ecosystem/framework/version metadata, source quality, attribution, and license.

Authority is configuration/provider-derived, not model-derived. Official documents and feeds are
`first_party_official`. GitHub snapshots use GitHub's exposed author association to distinguish
maintainer (`OWNER`, `MEMBER`, or `COLLABORATOR`) from community evidence. A future extraction model
may consume this evidence class but must not invent or elevate it.

## Fetch safety and rate behavior

The official-source adapter needs no credentials. `SOURCE_USER_AGENT`, request timeout, response
size, retry count, and manifest path are explicit in `.env.example`.

The HTTP boundary:

- permits HTTPS and configured origins only;
- validates every redirect target and limits redirect depth;
- checks the configured robots policy before discovery;
- bounds decoded response bytes and request duration;
- accepts only expected text, Markdown, XML, RSS, or Atom media types;
- uses serial requests and bounded exponential backoff with jitter;
- honors numeric or HTTP-date `Retry-After` values up to the bounded wait;
- logs source identities, safe URLs, counts, stages, and error classes, never bodies or credentials.

Treat repeated `429` responses as an instruction to stop or reduce cadence. Phase 5 adds no
distributed scheduler or automatic retry queue.

## Retention and attribution

Catalog and document snapshots are internal evidence for later extraction, deterministic
verification, and refresh. Preserve canonical URLs, publisher, authority basis, attribution, and
license when evolving the data.

KnownPath's future user-facing output must provide generalized reusable knowledge and provenance
links, with only bounded evidence excerpts where justified. It must not become a mirror for complete
copyrighted pages. Expo changelog ingestion therefore stores only the content supplied by its
official feed and does not scrape full changelog article HTML.

Physical purge automation is intentionally deferred until a general retention and takedown policy is
designed. Disabling a registry stops selection but does not silently delete retained provenance.

## Extending curation safely

1. Confirm ownership, reuse terms/license, robots policy, and the most structured official endpoint.
2. Add or adjust a runtime-validated registry entry and keep origins/path prefixes minimal.
3. Use `discover` to inspect discovered/selected counts.
4. Use `sync --dry-run` with a small limit.
5. Synchronize one bounded sample and inspect MongoDB provenance, normalized content, authority,
   versions, validators, and hashes.
6. Repeat the command and require `created: 0` with unchanged snapshots before increasing scope.

Do not add a generic HTML crawler merely to support a new site. A source needing a different
official structured mechanism should receive a focused adapter and an architecture decision.
