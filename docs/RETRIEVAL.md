# Hybrid retrieval and ranking

KnownPath retrieval combines technical relevance with applicability and evidence quality. Vector
similarity is one signal, never the whole rank.

The same authorization-aware service powers HTTP, MCP, and dashboard search.

## Query inputs

Queries can include:

- natural-language task or problem;
- exact or partial error messages;
- ecosystem and package names;
- framework, SDK, runtime, and package versions;
- platform and build environment;
- concise source-code-independent context;
- semantic mode, result limit, and minimum score;
- public, personal, or workspace scope.

Inputs are normalized with the same conservative technical rules used by indexing.

## Staged retrieval

The service builds a bounded candidate pool:

1. indexed exact error/error-code and ecosystem/package/platform blocking;
2. weighted text search;
3. optional public query embedding and MongoDB Vector Search;
4. deterministic application-side reranking, caps, and thresholding.

This keeps exact/version-compatible evidence from being displaced by a merely similar vector.

## Search backends

### Local

`SEARCH_BACKEND=local` uses ordinary MongoDB indexes and the weighted
`tx_known_path_search_documents_v1` text index. Exact and lexical retrieval remain useful; semantic
capability is reported as unavailable.

### Atlas

`SEARCH_BACKEND=atlas` uses:

- `knownpath_lexical_v1` for bounded text and filter fields;
- `knownpath_vector_v1` for cosine vectors and visibility/lifecycle/model/ecosystem/package/
  platform filters.

Initialization compares live definitions, creates missing indexes, updates drifted definitions, and
waits until the latest generation is both `READY` and queryable. Operators can print definitions
without contacting Atlas:

```sh
pnpm run search indexes print
SEARCH_BACKEND=atlas pnpm run search indexes create
SEARCH_BACKEND=atlas pnpm run search indexes status
```

Atlas Free clusters support a limited number of Search/Vector Search indexes. Local development does
not require Atlas or a dedicated vector database.

## Search projection

`known_path_search_documents` is a rebuildable projection of one stable KnownPath and immutable
revision. It contains bounded searchable text, technical identifiers, applicability, trust,
freshness/outcome summaries, visibility filters, and embedding metadata.

One active projection exists per KnownPath and embedding model/version/dimensions. Changed content
or model metadata creates a new projection; older ones are retired rather than overwritten.

Projection idempotency covers revision/content digest, projection/input versions, provider,
model/version, dimensions, and embedding mode.

## Embeddings

The real configured provider uses `gemini-embedding-2` with 768 dimensions. Stored metadata includes
provider, model, version, dimensions, input-format version/hash, generation time, and latency.

Document and query inputs use asymmetric retrieval task formatting. Unchanged projections reuse
their vector without another provider call.

The unpaid provider is `public_only`. Before embedding, KnownPath verifies the KnownPath, supporting
candidates, and referenced sources are public. Non-public query text and records are never sent to
that provider.

Private/team searches therefore disable semantic retrieval and use exact/lexical paths unless an
`approved_private` provider is deliberately added. They never fall back across tenants.

## Ranking policy

`knownpath-retrieval-ranking` version 2 allocates at most:

| Component             | Points |
| --------------------- | -----: |
| Exact error match     |     20 |
| Lexical relevance     |     15 |
| Semantic similarity   |     12 |
| Metadata fit          |     15 |
| Version fit           |     10 |
| Source/evidence trust |      8 |
| Freshness             |      5 |
| Agent outcomes        |     15 |

Penalties cover:

- contradictory evidence;
- stale applicability;
- moderation flags;
- explicit version incompatibility;
- deprecated lifecycle;
- corroborated safety concerns;
- statistically meaningful outcome degradation;
- failure-heavy matching version buckets.

Explicit version incompatibility caps a result at 34; deprecated records are capped at 25. Unknown
compatibility remains `unknown`, not confirmed. One unverified safety report queues review but does
not penalize rank.

Unobserved outcomes contribute zero. Small samples use conservative Wilson/effective-sample handling
and outcomes from a KnownPath's originating contributor are excluded from independent confidence.
described in [Outcomes](OUTCOMES.md).

## Explanations

Every ranked result carries:

- component points;
- penalties and any final cap;
- final integer score;
- reason codes and human-readable explanations;
- exact, lexical, and/or semantic channels;
- version compatibility;
- trust, freshness, outcome, and applicability summaries.

The score is not a probability and does not remove the need for the agent to inspect evidence.

## Visibility enforcement

The default query returns published public KnownPaths. Personal/workspace scopes are derived from
the authenticated principal and use owner/workspace predicates before ranking.

Administrator review access is explicit, API-key-only, and audited. Knowing a KnownPath ID does not
bypass lifecycle or tenant checks.

## Commands

```sh
pnpm run search project --pending --limit 10
pnpm run search project --known-path <uuid> --no-embeddings
pnpm run search reembed --all --limit 10
pnpm run search inspect --known-path <uuid>

pnpm run search query \
  --text "EAS build cannot find an imported file" \
  --error "None of these files exist" \
  --ecosystem expo \
  --package eas-build \
  --platform android \
  --include-review
```

`--semantic disabled|optional|required` controls behavior. `optional` degrades explicitly to
exact/lexical search; `required` fails if the provider or Vector Search is unavailable. Direct CLI
querying is public-only because it has no authenticated tenant principal.

HTTP/MCP clients should use [API](API.md) or [MCP](MCP.md) rather than direct database commands.

## References

- [MongoDB Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/)
- [MongoDB hybrid search](https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/)
- [MongoDB Search compatibility](https://www.mongodb.com/docs/search/deployment/feature-compatibility/)
- [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [Semantic Versioning](https://semver.org/)
