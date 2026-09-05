# Knowledge ingestion

KnownPath turns high-signal public sources and consented agent experiences into normalized evidence
for later knowledge processing. Ingestion preserves provenance; it does not decide that a statement
is true or publish a KnownPath.

## Pipeline

```text
source registry
      ↓
discovery and incremental synchronization
      ↓
immutable normalized source items
      ↓
AI-assisted candidate extraction
      ↓
deterministic evidence assessment
      ↓
conservative canonicalization
      ↓
search projection and retrieval
```

MongoDB is the source of truth at every durable step. Valkey carries only jobs, schedules, retries,
locks, rate limits, and other ephemeral coordination.

## Source registry

`config/sources/registry.json` declares:

- adapter type;
- canonical source identity;
- enabled content types;
- allowlisted origins and paths;
- ecosystem/framework hints;
- authority and attribution;
- curated discovery rules;
- version patterns;
- refresh interval.

Current adapter types are:

- `github_repository`
- `documentation_site`
- `release_feed`

Adding a source that fits an existing adapter should usually be a reviewed registry change rather
than new collector code.

## Operator-controlled public sources

The source registry includes adapters for:

- Expo and React Native issues/discussions from selected GitHub repositories;
- Expo documentation and changelog;
- React Native documentation and release feed.

The hosted service does not schedule broad public-source synchronization or extraction. These
adapters remain available for explicit, bounded corroboration, ecosystem refreshes, gap filling, and
operator-reviewed seeding. Official-document selection is curated for upgrades, migrations,
compatibility, troubleshooting, deprecations, breaking changes, and release guidance. Complete
`llms.txt` catalogs remain discoverable for targeted or bounded full-catalog work.

See [GitHub ingestion](GITHUB_INGESTION.md) and
[Official-source ingestion](OFFICIAL_SOURCE_INGESTION.md).

## Immutable source items

Each accepted revision creates an immutable `source_items` record with:

- stable provider/source identity;
- canonical URL;
- normalized text or structured blocks;
- content hash and snapshot key;
- observed/published/captured timestamps;
- ecosystem, framework, version, document type, and source quality;
- attribution and license metadata where known;
- adapter-specific objective metadata.

Mutable synchronization state—cursor, ETag, Last-Modified, fetch time, and current lifecycle—lives
separately. This keeps source history reproducible while allowing efficient refresh.

All remote content is untrusted. It is stored as evidence text and is never interpreted as an
instruction.

## Initial seed from an empty database

Operators can create a small reviewable Expo/React Native seed:

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:infra:all
pnpm db:init

pnpm ingest:github --source expo-core --types issues --limit 5 --dry-run
pnpm ingest:sources discover --source expo-documentation --limit 20

pnpm ingest:github --source expo-core --types issues --limit 5
pnpm ingest:sources sync --source expo-documentation --limit 5
```

Repeat the same commands and confirm unchanged records are reused rather than duplicated.

Continue the bounded pipeline:

```sh
pnpm extract pending --limit 5
pnpm score pending --limit 10
pnpm canonicalize profile --limit 10
pnpm canonicalize discover --limit 10
pnpm canonicalize review --limit 20
pnpm run search project --pending --limit 10
```

`canonicalize auto-merge` is a preview unless `--apply` is supplied. Do not publish records merely
to populate a demo. Inspect source provenance, candidate output, score explanations, merge
decisions, caveats, and applicability before moderation.

## Incremental behavior

Stable provider IDs and versioned content hashes make synchronization idempotent:

- unchanged content updates mutable observation state only;
- changed content creates a new immutable snapshot;
- cursors advance only after successful bounded collection;
- failed items do not block unrelated source records;
- downstream idempotency keys incorporate source hashes and processing versions.

When an operator explicitly enables source schedules, changed source items dispatch into extraction,
scoring, canonicalization, and projection without relying on Valkey as business storage. Source
schedules are disabled by default and are disabled on the hosted service. See
[Operations](OPERATIONS.md).

## Privacy boundary

Public source records may use the configured public Gemini extraction and embedding provider.
Personal-private and workspace/team records are blocked before unpaid/public provider calls.

Agent contributions enter through the same source/candidate/assessment architecture only after
consent and sanitization. See [Contributions](CONTRIBUTIONS.md).

## Operating safely

- Start with `--dry-run` and a small `--limit`.
- Expand time windows gradually.
- Use a read-only GitHub token for authenticated collection.
- Respect source refresh intervals, robots policies, rate limits, and `Retry-After`.
- Keep source allowlists minimal.
- Review quarantined records instead of retrying malformed content indefinitely.
- Preserve attribution and provenance when changing normalization.

Deployment prerequisites and scheduled worker operation are documented in
[Deployment](DEPLOYMENT.md) and [Operations](OPERATIONS.md).
