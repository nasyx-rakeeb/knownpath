# Hybrid Retrieval

## Scope

Phase 9 established canonical retrieval through an explainable staged pipeline. Phase 10 now exposes
that service through authenticated safe HTTP contracts; it still does not expose an anonymous public
endpoint or MCP tool. The developer CLI remains available for direct inspection.

## Backends

`SEARCH_BACKEND=local` is the default free contributor path. It uses ordinary MongoDB indexes for
normalized error/metadata blocking and the weighted `tx_known_path_search_documents_v1` text index.
Semantic retrieval is explicitly reported as unavailable; exact and lexical retrieval continue.

`SEARCH_BACKEND=atlas` enables two separately managed MongoDB Search indexes:

- `knownpath_lexical_v1` maps only the bounded text/filter fields needed by lexical retrieval.
- `knownpath_vector_v1` indexes `embedding.values` as a 768-dimensional cosine vector by default and
  includes visibility, lifecycle, model, ecosystem, package, and platform filter fields.

Atlas index creation is idempotent by name and polls `listSearchIndexes()` until both indexes are
queryable or the configured timeout expires. `pnpm run search indexes print` emits the exact current
definitions without contacting Atlas. A MongoDB Atlas Free cluster currently permits three combined
Search and Vector Search indexes and 0.5 GB storage; programmatic search-index creation may be
unavailable on some Free-cluster configurations, in which case create the printed definitions in the
Atlas UI. No paid service or dedicated vector database is required for local development.

## Projection and embedding lifecycle

`known_path_search_documents` is a materialized, rebuildable projection of a stable KnownPath and
one immutable revision. It stores normalized searchable text, error identifiers, applicability,
trust assessment pointers, freshness/outcome summaries, and embedding metadata. One active
projection exists per KnownPath and embedding model/version/dimension tuple; older projections are
retired, not overwritten.

Projection idempotency covers the revision/content digest, projection/input versions, provider,
model/version, dimensions, and embedding mode. An unchanged rerun reuses the document and makes no
Gemini call. Re-embedding with changed content or model metadata creates a new projection and then
changes the active projection.

Gemini uses configurable `gemini-embedding-2`. Retrieval documents and queries use Google's
asymmetric retrieval task formatting. Model identifier, model version, dimensions, input-format
version/hash, generated time, and latency are stored so vectors can be regenerated safely.

The configured unpaid provider capability is `public_only`. A KnownPath, every supporting candidate,
and every referenced source must be public before a document provider is constructed. Private/team
query text is likewise rejected before query embedding. There is no fallback or silent downgrade to
the public provider. Authenticated API/MCP retrieval supplies server-derived owner/workspace context
and uses exact/lexical fallback with semantic mode blocked. The direct Phase 9 CLI remains public-
only because it has no authenticated tenant principal.

## Staged retrieval and ranking

The service validates and normalizes the query, then gathers a bounded candidate pool:

1. ordinary indexed exact/error-code and ecosystem/package/platform blocking;
2. MongoDB weighted text retrieval locally, or MongoDB Search lexical retrieval on Atlas;
3. optional public query embedding and MongoDB Vector Search on Atlas;
4. deterministic application-side reranking and thresholding.

The versioned `knownpath-retrieval-ranking` policy stores a digest with every explanation. Policy
version 2 maximum positive components are exact error 20, lexical 15, semantic 12, metadata 15,
version fit 10, deterministic source trust 8, freshness 5, and conservative observed outcomes 15.
Unobserved outcomes contribute zero. Conflicts, staleness, moderation, deprecation, explicit version
incompatibility, corroborated safety, qualified recent degradation, and failure-heavy matching
version buckets add visible penalties or caps. One unverified safety report does not penalize rank.
An incompatible record is capped below the default minimum score. Unknown compatibility remains
`unknown`; it is never described as confirmed. See [`OUTCOMES.md`](OUTCOMES.md).

Vector similarity is only one relevance component. It cannot override explicit version
incompatibility, weak trust, conflict, or visibility rules. Results include component values,
penalties, cap, final integer score, reason codes, explanations, matched channels, and immutable
trust-assessment IDs.

## Commands

```sh
pnpm run search project --pending --limit 10
pnpm run search project --known-path <uuid> --no-embeddings
pnpm run search reembed --all --limit 10
pnpm run search inspect --known-path <uuid>

pnpm run search query --text "EAS build cannot find an imported file" \
  --error "None of these files exist" --ecosystem expo --package eas-build \
  --platform android --include-review

pnpm run search indexes print
SEARCH_BACKEND=atlas pnpm run search indexes create
SEARCH_BACKEND=atlas pnpm run search indexes status
```

`--semantic disabled|optional|required` controls semantic behavior. `optional` degrades explicitly
to exact/lexical retrieval; `required` fails when Vector Search or an approved provider is absent.
Default queries include only `published`; use `--include-review` for development inspection.
Explicit `reembed` requires a configured key and cannot replace a ready vector with an unavailable
placeholder.

The HTTP transport applies a stricter boundary than the developer CLI: `includeReview` requires an
admin-owned `knowledge:read` API key, is never the default, and is audited. See
[`docs/API.md`](API.md).

## Current official references

- [MongoDB Vector Search index syntax](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-type/)
- [MongoDB `$vectorSearch`](https://www.mongodb.com/docs/manual/reference/operator/aggregation/vectorsearch/)
- [Create and manage MongoDB Search indexes](https://www.mongodb.com/docs/atlas/atlas-search/create-index/)
- [MongoDB Search deployment options](https://www.mongodb.com/docs/manual/core/search/)
- [Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [`gemini-embedding-2`](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2)
- [Gemini pricing and unpaid-service data use](https://ai.google.dev/gemini-api/docs/pricing)
- [Semantic Versioning](https://semver.org/)
