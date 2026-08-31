# KnownPath Phase 5 Official Sources Ingestion Design

**Date:** 2026-08-22

**Status:** Approved for implementation

**Scope:** Phase 5 only

## Goal

Expand KnownPath's seed corpus with authoritative Expo and React Native documentation, upgrade and
migration guidance, compatibility information, deprecation and breaking-change notices, and release
material. The phase discovers official catalogs, fetches a configurable high-signal subset during
normal synchronization, normalizes the source material without interpreting solutions, and preserves
durable provenance for later extraction and verification.

Phase 5 does not invoke an LLM, create candidate experiences or canonical KnownPaths, calculate
trust scores, build semantic search, expose MCP tools, or implement dashboard behavior.

## Research basis

The design is based on official sources and live endpoint behavior checked on 2026-08-22:

- [Expo documentation for LLMs](https://docs.expo.dev/llms.txt) publishes an official index of clean
  Markdown document endpoints. Individual documentation URLs support a `.md` representation, and the
  [Expo sitemap](https://docs.expo.dev/sitemap.xml) supplies canonical URL discovery and `lastmod`
  values where available.
- [Expo robots policy](https://docs.expo.dev/robots.txt) allows documentation discovery and declares
  search and AI-input content signals. Expo documentation links to the MIT-licensed
  [expo/expo repository](https://github.com/expo/expo), where the documentation source is
  maintained.
- The official [Expo changelog RSS feed](https://expo.dev/changelog/rss.xml) supplies stable entry
  identifiers, links, publication dates, authors, and summaries. The feed does not consistently
  contain full article bodies, so KnownPath must not scrape proprietary changelog HTML to fill that
  gap.
- [React Native documentation for LLMs](https://reactnative.dev/llms.txt) publishes current clean
  Markdown document endpoints. The [React Native sitemap](https://reactnative.dev/sitemap.xml)
  provides canonical discovery, though it does not consistently provide modification dates.
- React Native documentation is maintained in the official
  [react-native-website repository](https://github.com/react/react-native-website). Its
  documentation content is licensed under
  [CC BY 4.0](https://github.com/react/react-native-website/blob/main/LICENSE-docs), requiring
  preserved attribution.
- The official [React Native RSS feed](https://reactnative.dev/blog/rss.xml) exposes full feed
  content for release and announcement entries. Framework release provenance is also available from
  the official [React Native releases](https://github.com/react/react-native/releases) surface.

The live checks also confirmed conditional-response metadata such as ETags on the documentation
indexes, Markdown representations, and feeds. These validators are inputs to synchronization rather
than assumptions embedded in adapter code.

## Selected collection strategy

Use official structured publishing surfaces in this order:

1. `llms.txt` for complete documentation catalog discovery;
2. first-party `.md` representations for normalized documentation content;
3. official sitemaps for canonical URL and modification metadata enrichment;
4. official RSS/Atom feeds for release and changelog entries;
5. official Git repositories and release pages as attribution and provenance references.

Normal synchronization discovers the complete official index but fetches only a configurable
high-signal subset. Full catalogs remain addressable through targeted page fetches and an explicit,
bounded full-catalog mode. This avoids continuously ingesting large reference catalogs while keeping
the architecture capable of doing so later.

Rejected approaches:

- General HTML crawling is brittle, collects navigation chrome, and creates avoidable terms and
  copyright risk when structured official sources already exist.
- Cloning documentation repositories as the primary adapter exposes MDX build-time components and
  repository layout as ingestion contracts. Repository links remain valuable provenance.
- Hardcoding page paths in adapter logic makes curation difficult to maintain and prevents future
  full-catalog operation.
- Treating every document hosted by an official project as equivalent authority would incorrectly
  classify community-authored material in official issue trackers.

## Source registry and package boundaries

Replace the GitHub-only manifest shape with one versioned, runtime-validated source registry. Every
entry has common identity, display name, ecosystem, canonical URL, adapter type, enabled state,
publisher, source-quality classification, attribution, and license metadata. Adapter-specific
settings form a discriminated union:

- `github_repository` preserves the Phase 4 repository configuration;
- `documentation_site` defines index, sitemap, content representation, allowed origins, curated
  selection rules, document classification rules, and version-detection rules;
- `release_feed` defines feed URL, allowed origins, content policy, entry classification, and
  curation rules;
- future adapter kinds can be added by extending the union without changing existing adapters.

Curated rules live in the registry data and select stable URL prefixes, path patterns, index
sections, or feed title patterns. Adapter code implements general matching and validation only.

Create `@knownpath/source-ingestion` for shared manifest contracts, catalog discovery types,
conditional HTTP behavior, normalization primitives, synchronization orchestration, and safe
operational results. Keep provider transports in focused adapter packages so documentation/feed
logic does not become part of the GitHub adapter. The worker remains the CLI/process-lifecycle
boundary. Domain and database packages remain independent of HTTP clients and parsing libraries.

## Initial official sources

The initial registry contains:

| Source                     | Adapter              | Normal-sync content                                                                                   | Content policy                             |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Expo documentation         | `documentation_site` | Curated upgrade, troubleshooting, compatibility, migration, deprecation, and breaking-change material | Official Markdown representation           |
| React Native documentation | `documentation_site` | Curated upgrade, troubleshooting, compatibility, migration, deprecation, and breaking-change material | Official Markdown representation           |
| Expo changelog             | `release_feed`       | Relevant SDK and tooling release entries                                                              | Feed metadata and supplied summary only    |
| React Native blog/releases | `release_feed`       | Framework release, migration, compatibility, and breaking-change entries                              | Full content supplied by the official feed |

The full `llms.txt` catalogs are persisted as discovery state or re-fetched conditionally and remain
available for targeted on-demand retrieval. They are not continuously materialized as source-item
snapshots during normal curated synchronization.

## Domain model

Extend the source domain with provider-neutral document metadata:

- document type: `upgrade_guide`, `troubleshooting`, `release_note`, `compatibility_reference`,
  `migration_guide`, `deprecation_notice`, `breaking_change`, `guide`, `reference`, or `other`;
- ecosystem and framework identifiers plus zero or more deterministically detected versions;
- canonical URL, source section, publisher, attribution URL, license identifier, and license URL;
- source quality: `first_party_official`, `maintainer`, `community`, or `general_public`;
- classification basis such as official domain, official repository, provider author association, or
  unverified;
- document lifecycle: `active`, `deprecated`, or `deleted`;
- normalized plain text and bounded structured blocks such as heading, paragraph, code, list, table,
  blockquote, and admonition.

Classification is deterministic and registry/provider-derived. Official documentation and official
release feeds are `first_party_official`. Existing GitHub content remains classified using exposed
author association: owner/member/collaborator material may be `maintainer`, while other authors are
`community`. An LLM is never allowed to invent authority.

Version detection uses configured path, title, front-matter, index-section, and feed-title patterns.
Detected values are normalized with existing canonicalization helpers and retain the original value
in provider metadata. Ambiguous versions remain absent rather than guessed.

## Immutable snapshots and mutable synchronization state

Continue storing normalized document revisions as immutable `source_items`. Add a mutable
`source_item_states` collection as a synchronization projection with one row per source-registry and
stable source-native identity. It stores:

- current lifecycle status and canonical URL;
- latest source-item snapshot ID and content digest;
- ETag and Last-Modified validators where supplied;
- source-observed modification value;
- `lastFetchedAt`, `lastChangedAt`, and last successful observation time;
- latest document type, versions, and source-quality metadata needed for operational filtering.

This separation is necessary because a successful `304 Not Modified` must advance `lastFetchedAt`
without mutating historical snapshots or creating a duplicate revision.

Important indexes include:

- unique `(sourceRegistryId, sourceIdentity)` for item state;
- `(sourceRegistryId, lifecycleStatus, lastFetchedAt)` for refresh and deletion workflows;
- `(sourceRegistryId, documentType, versions)` for targeted operations;
- existing immutable snapshot deduplication indexes remain authoritative for revision insertion.

Index creation remains idempotent and is documented in `docs/DATA_MODEL.md`. No vector indexes are
added.

## Incremental synchronization

For documentation sources:

1. Fetch the configured index conditionally using its stored ETag/Last-Modified value.
2. Parse and validate the complete catalog, retaining canonical URL and index-section context.
3. Enrich candidates with sitemap metadata where available.
4. Select candidates using the requested page/version/scope and data-driven curated rules.
5. Fetch selected pages with `If-None-Match` and `If-Modified-Since` when prior state exists.
6. Normalize the document and compute a versioned SHA-256 digest over its canonical representation.
7. On `304`, update only fetch state and count the item unchanged. On `200` with an unchanged
   digest, update validators/fetch state only. On a changed digest, create an immutable snapshot and
   advance state to it.

A source item can be marked deleted only after a complete, authoritative index fetch succeeds and
the identity is absent. Partial, limited, failed, targeted, or conditionally unchanged discovery
runs never infer deletion. Deprecation is derived only from explicit source signals or configured
classification rules.

For feeds, stable GUID or canonical URL is the source identity. Entries follow the same hash and
validator behavior, but absence from a rolling feed never implies deletion.

Registry checkpoints advance only after their selected work completes successfully. Partial errors
remain visible in ingestion-run counts and do not skip unfinished pages in later runs.

## Commands and operational controls

The worker exposes source-neutral commands through a root script:

```text
pnpm ingest:sources discover --source <source-key>
pnpm ingest:sources sync --source <source-key>
pnpm ingest:sources sync --all
```

Supported controls include:

- `--page <canonical-or-indexed-url>` for one allowlisted indexed page;
- `--version <version>` for deterministic version filtering;
- `--scope curated|all`, defaulting to `curated`;
- `--limit <count>` for bounded discovery or synchronization;
- `--dry-run` for validated discovery and selection without persistence;
- explicit source selection for reproducible contributor operation.

Full-catalog synchronization requires `--scope all` and a finite limit in this phase. Existing
`pnpm ingest:github` behavior remains available, backed by the generalized registry rather than a
duplicate configuration system.

Operational output includes source key, counts, lifecycle results, validators/rate metadata, and
safe failure classes. It never prints untrusted document bodies or credentials.

## Fetch and content safety

All fetched material is untrusted input, including first-party content. Each adapter:

- permits only HTTPS URLs and configured origins/path prefixes;
- validates every redirect target before following it;
- enforces response timeout and maximum compressed/uncompressed size;
- accepts only expected text, Markdown, XML, or feed content types;
- parses content without executing HTML, MDX components, scripts, or embedded instructions;
- bounds document/block counts and field lengths before MongoDB insertion;
- serializes requests conservatively and uses transient retry with jitter and Retry-After handling;
- reduces persisted/logged errors to safe metadata.

Robots policy is checked for documentation origins during source validation. A new source fails
closed when its policy or ownership cannot be established.

## Attribution, retention, and future presentation

Source snapshots retain canonical URL, publisher, authority classification, attribution, license,
fetch time, content hash, validators, and immutable registry linkage. Normalization removes
navigation chrome and other unnecessary payloads; raw whole-page HTML is not stored.

The source corpus is internal evidence for extraction, verification, and refresh. KnownPath's future
user-facing records must present generalized reusable knowledge with provenance links and only
bounded evidence excerpts where justified. They must not act as mirrors of complete copyrighted
pages. Source retention and removal follow source lifecycle and licensing requirements; physical
purging is deferred until a general retention policy is designed.

## Failure handling and observability

Every synchronization creates an ingestion run with discovered, selected, created, updated,
unchanged, deprecated, deleted, failed, and rate-limited/skipped counts as applicable. Permanent
validation, origin, content-type, and not-found failures are recorded without retry storms.
Transient network, `429`, and eligible `5xx` responses use bounded retry/backoff and honor
`Retry-After`.

An item failure does not corrupt prior state. A registry cursor or authoritative deletion comparison
is committed only for a clean discovery boundary. Dry runs do not create runs, states, snapshots, or
cursor changes.

## Verification strategy

Phase 5 adds no automated tests. Verification must include:

1. dependency installation and root typecheck, lint, format validation, and build;
2. idempotent database initialization with direct index inspection;
3. bounded Expo or React Native official-document discovery and synchronization;
4. direct MongoDB inspection of normalized text/blocks, canonical URLs, authority, version metadata,
   attribution, hashes, validators, and timestamps;
5. repeating the same synchronization and observing unchanged behavior without duplicate snapshots;
6. targeted page and dry-run command checks;
7. inspection that no credentials, full HTML pages, website chrome, or generated artifacts were
   committed or persisted unnecessarily.

If a remote endpoint does not supply ETag or Last-Modified, the content digest remains the
deterministic unchanged check and the limitation is recorded rather than fabricated.

## Explicitly deferred

- LLM extraction and candidate experience generation;
- semantic deduplication, embeddings, vector indexes, and retrieval;
- trust-score calculation beyond deterministic source-quality metadata;
- MCP, agent skills, contribution flows, and dashboards;
- continuous scheduling, queues, webhooks, and distributed rate limiting;
- automatic full-catalog synchronization;
- user-facing reproduction or rendering of complete source documents;
- generalized physical-retention and purge automation.
