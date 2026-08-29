# Initial Expo and React Native seed

This runbook takes an empty KnownPath database to a small, real, reviewable seed. It deliberately
starts bounded. Do not enable every schedule or ingest complete documentation catalogs merely to
fill the database.

## 1. Prepare infrastructure and secrets

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:infra:all
pnpm db:init
```

Set unique auth secrets. A GitHub token is optional for public REST but enables higher limits and is
required for Discussions/GraphQL. Use a fine-grained token without write permissions. Set
`GEMINI_API_KEY` only for the approved public-data account; `AI_DATA_HANDLING=public_only` is a hard
boundary.

## 2. Inspect the registry and discover

The data-driven registry in `config/sources/registry.json` identifies canonical Expo and React
Native repositories, curated official pages, full `llms.txt` discovery indexes, authority class, and
refresh cadence.

```sh
pnpm ingest:github --source expo-core --types issues --limit 5 --dry-run
pnpm ingest:sources discover --source expo-documentation --limit 20
pnpm ingest:sources sync --source expo-documentation --limit 5 --dry-run
```

Review URLs and expected counts before writes. Normal documentation sync uses curated high-signal
upgrade, troubleshooting, compatibility, deprecation, migration, and release material. Full indexes
remain available only for bounded on-demand page/catalog work.

## 3. Ingest bounded real sources

```sh
pnpm ingest:github --source expo-core --types issues --limit 5
pnpm ingest:sources sync --source expo-documentation --limit 5
```

Inspect MongoDB provenance, normalized text, content hashes, ETags/last-modified metadata, and the
ingestion run. Rerun the same commands and confirm unchanged items remain unchanged. Expand by
source/time window only after checking provider limits. See [GitHub ingestion](GITHUB_INGESTION.md)
and [official sources](OFFICIAL_SOURCE_INGESTION.md).

## 4. Extract public candidates

```sh
pnpm extract pending --limit 5
pnpm extract inspect --candidate <candidate-uuid>
```

Inspect both useful and irrelevant/noisy classifications, evidence references, prompt/schema/model
versions, and source hashes. Malformed output belongs in quarantine. Never route private or
workspace data through this public provider path. See [AI extraction](AI_EXTRACTION.md).

## 5. Verify and score

```sh
pnpm score pending --limit 10
pnpm score history --candidate <candidate-uuid>
```

Scoring reads deterministic source metadata and appends immutable assessments. Reactions are
supporting popularity signals, not truth. Review the complete component/reason breakdown before
canonicalization. See [Scoring](SCORING.md).

## 6. Canonicalize conservatively

```sh
pnpm canonicalize profile --limit 10
pnpm canonicalize discover --limit 10
pnpm canonicalize review --limit 20
pnpm canonicalize auto-merge --limit 10
```

The final command is dry-run unless `--apply` is explicit. Deterministic fingerprints/blocking come
first; semantic similarity can strengthen or flag a pair but cannot authorize a semantic-only merge.
Keep ambiguous candidates separate/reviewable and preserve every source relationship.

## 7. Build retrieval projections and embeddings

```sh
pnpm run search project --pending --limit 10
pnpm run search indexes print
pnpm run search query --text "EAS build cannot resolve module" --ecosystem expo --include-review
```

Local retrieval remains useful without vector search. Atlas deployments create/search current
indexes through the documented search commands. Public-only embedding generation records model,
version, dimensions, timestamp, and content hash. See [Retrieval](RETRIEVAL.md).

## 8. Review and publish

Use the authenticated admin console to inspect source provenance, extraction, immutable scores,
canonical memberships, conflicts, and caveats. Review state is the correct seed state until an
operator has evidence to publish. Do not mark records verified/published merely to make search
demonstrations easier.

Once the bounded chain is understood, enable schedules deliberately:

```sh
QUEUE_SCHEDULES_ENABLED=true pnpm jobs schedules apply
pnpm jobs schedules status
```

Provider quotas, retries, quarantine, and recovery are documented in [Operations](OPERATIONS.md).
