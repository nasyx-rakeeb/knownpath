# KnownPath Phase 6 Gemini Extraction Design

## Status

Approved on 2026-08-22. This specification covers Phase 6 only. It does not authorize Phase 7
scoring, canonical promotion, retrieval, MCP knowledge tools, Agent Skill distribution,
contributions, or dashboard work.

## Goal

Convert immutable public Expo and React Native source snapshots into structured, reviewable
candidate experiences through Gemini while preserving a strict boundary between deterministic source
facts and model interpretation. Processing must be reproducible, evidence-addressable,
prompt-injection resistant, quota-aware, and idempotent.

## Current research baseline

Official Google documentation and current registry metadata were checked on 2026-08-22:

- The maintained JavaScript/TypeScript SDK is `@google/genai`; the current release is 2.18.0,
  Apache-2.0 licensed, and supports Node.js 20 or newer. The older `@google/generative-ai` library
  is not actively maintained.
- The Interactions API is generally available and Google's recommended interface for new projects.
  Requests are stored by default, so KnownPath will explicitly set `store: false`.
- Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) is a stable GA model intended for high-throughput,
  low-cost document parsing and extraction. It supports structured output and has a 1,048,576-token
  input limit and 65,536-token output limit.
- Gemini 3.5 Flash-Lite currently has free input/output usage and free Batch API usage. Free-tier
  content may be used by Google to improve its products and may be reviewed; therefore the unpaid
  path is restricted to public source records.
- Structured output accepts a supported JSON Schema subset. Schema compliance does not guarantee
  semantic correctness, so output still requires Zod validation and deterministic evidence checks.
- Current rate limits are project- and model-specific and must be inspected in AI Studio. They are
  measured across requests, input tokens, and daily requests. `429`, `408`, and `5xx` failures are
  transient candidates for bounded exponential backoff with jitter.
- The asynchronous Batch API is currently available only through `generateContent`. It offers inline
  requests below 20 MB or JSONL file jobs and targets completion within 24 hours.
- Gemini 3.5 Flash-Lite defaults to minimal thinking. Thought summaries are opt-in. KnownPath does
  not request, store, or log thought summaries or signatures.

Official references:

- [Gemini API libraries](https://ai.google.dev/gemini-api/docs/libraries)
- [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Token counting and usage](https://ai.google.dev/gemini-api/docs/tokens)
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Batch API](https://ai.google.dev/gemini-api/docs/batch-api)
- [Retry guidance](https://ai.google.dev/gemini-api/docs/troubleshooting)
- [API-key guidance](https://ai.google.dev/gemini-api/docs/api-key)
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)
- [Official TypeScript/JavaScript SDK](https://github.com/googleapis/js-genai)

## Selected approach

Use a provider-neutral extraction service with a real Gemini implementation over the stateless
Interactions API and a durable extraction-attempt ledger. The worker composes this service but does
not own prompts, privacy rules, provider calls, or extraction persistence.

This is preferred over implementing Gemini Batch API now because Interactions is the recommended
new-project API, while asynchronous batch submission/reconciliation would add another operational
lifecycle before scheduling exists. Phase 6 still provides bounded application batches, quota
budgets, serial request pacing, and a provider contract capable of adding a batch transport later.

Calling Gemini directly from the worker is rejected because it would couple provider details,
privacy enforcement, persistence, and source assembly to a process entry point.

## Package and dependency boundaries

### `@knownpath/domain`

Owns provider-independent runtime schemas and types for extraction attempts, extraction outcomes,
candidate interpretations, evidence claims, usage metadata, and lifecycle values. It owns no Gemini
or MongoDB imports.

### `@knownpath/database`

Owns the `extraction_attempts` collection, its validator and indexes, source-context query methods,
candidate persistence, and attempt lifecycle transitions. Raw collections remain private.

### `@knownpath/ai`

Owns:

- provider contracts and provider capability metadata;
- the Gemini provider implementation;
- versioned prompt loading and prompt digests;
- target resolution and source-context assembly;
- public/private data-policy enforcement;
- strategy selection for GitHub threads versus official documents/releases;
- structured-output schemas and runtime validation;
- deterministic evidence validation and normalization;
- extraction orchestration, retries, budgets, and idempotency;
- inspection formatting.

Only Gemini is implemented. No fake provider is added.

### `@knownpath/worker`

Owns CLI routing, typed configuration composition, safe structured logging, signal handling, and
database shutdown. It does not inspect source text or provider responses in logs.

## Provider abstraction and data policy

The provider contract accepts a provider-neutral extraction request containing the system prompt,
strategy prompt, untrusted evidence envelope, output JSON Schema, model configuration, and abort
signal. It returns final output text, model identity, provider usage fields, latency, and safe
response metadata.

Every provider instance advertises one data-handling capability:

- `public_only`
- `approved_private`

Phase 6's Gemini provider can only be constructed as `public_only`. The current configuration
accepts only `AI_DATA_HANDLING=public_only`; an unsupported value fails during config parsing.
Future paid Gemini, another provider, or a self-hosted model may advertise `approved_private` only
after a new reviewed implementation and architecture decision.

Before context serialization or any provider SDK call, deterministic policy evaluates every source
record in the target:

- all records public: eligible for the unpaid Gemini path;
- any private or team record: block the entire target;
- missing or inconsistent visibility: block the entire target.

Blocked attempts use `ai_private_data_not_approved`, contain no copied source text or provider
response, and explain that an explicitly approved private-data provider/account is required. There
is no fallback, silent downgrade, partial-context send, or convenience override.

## Configuration

Centralized configuration includes:

- `AI_PROVIDER=gemini` (the only accepted Phase 6 provider);
- `AI_DATA_HANDLING=public_only` (the only accepted Phase 6 handling mode);
- `GEMINI_API_KEY` with no committed default;
- `GEMINI_MODEL=gemini-3.5-flash-lite` as a configurable default;
- request timeout, maximum retries, and minimum request spacing;
- maximum input-token estimate, maximum output tokens, and maximum targets/calls/tokens per command;
- prompt directory or explicit prompt-set identifier only if needed for contributor operation.

Provider/model names are never scattered through orchestration code. The API key is passed only to
the server-side SDK constructor and is never logged, persisted, or accepted as a CLI argument.

## Extraction targets

One extraction target represents one reusable evidence unit:

- a GitHub issue plus the latest known revisions of its comments;
- a GitHub discussion plus the latest known revisions of its comments/replies;
- one official documentation page;
- one official release note.

Catalog snapshots (`itemType: other`) are excluded. A standalone comment resolves to its root; it is
not extracted independently. Deleted/deprecated source state remains available as provenance but is
not selected by the normal pending command.

## Source-context assembly

### GitHub threads

The repository returns the latest revision for each source-native identity in a root thread. Context
records preserve source item ID, source-native ID, root/parent identity, content digest, canonical
URL, objective author association, answer state, source quality, timestamps, and body text.

Before applying size budgets, context is prioritized deterministically:

1. root issue/discussion;
2. accepted answer or `isAnswer` comments;
3. maintainer-authored comments;
4. closing pull-request metadata;
5. highly reacted comments;
6. remaining comments in chronological order.

Normal threads are sent in one request. Oversized threads split only at complete source-item
boundaries. Root and confirmed/maintainer anchor records remain available to each semantic chunk.
Chunk results may be combined through a separate synthesis prompt that accepts only prior structured
observations and their original evidence references. If anchor/context budgets cannot be satisfied,
processing fails clearly instead of arbitrarily truncating the likely fix.

### Official documents and releases

The latest immutable snapshot is assembled from title, deterministic document metadata, structured
blocks, and normalized text. Oversized documents split only at complete block boundaries and retain
heading context. Release summaries use the same strategy without pretending they contain the full
linked article.

### Budgeting

Context assembly uses a conservative local token estimate for preflight budgeting and records actual
provider usage afterward. A target that exceeds the configured safe limit follows its strategy's
chunk path or fails with an actionable size error. The model's maximum context window is an upper
cap, not the routine processing budget.

## Prompt design and injection defense

Prompts are maintained as versioned source files, not giant inline strings:

- one shared system/security prompt;
- one GitHub-thread extraction prompt;
- one official-document/release prompt;
- one synthesis prompt for evidence-preserving multi-chunk extraction.

Each prompt has a stable identifier, semantic version, and SHA-256 content digest stored with the
attempt. Prompt changes require an explicit version change or naturally change the attempt key
through the content digest.

The system instruction states that source content is quoted, untrusted evidence and can never modify
the task, schema, system rules, or available capabilities. Evidence is serialized as a versioned
JSON data envelope with stable evidence IDs; source strings are values, never concatenated as
instructions. The provider receives no tools, URL context, code execution, file access, function
calls, or search grounding. It uses `store: false`, minimal thinking, and
`thinking_summaries: none`.

Prompt controls are defense in depth, not the sole security boundary. Deterministic validation
rejects references outside the supplied evidence allowlist and excerpts that do not occur in their
cited record. The model cannot trigger side effects.

## Structured extraction output

The provider output is one strict classification:

- `reusable`
- `irrelevant`
- `insufficient_evidence`
- `conflicting_evidence`

Every output includes a concise evidence-grounded classification reason, not chain-of-thought. A
`reusable` result may contain:

- concise problem statement;
- ecosystem, packages/components, platforms, environments, and source-supported versions;
- normalized symptoms and error-message candidates;
- evidence-supported root cause;
- attempted approaches and why they failed;
- solution summary and ordered reusable steps;
- caveats and conditions;
- supporting and conflicting evidence IDs;
- candidate labels such as author-confirmed, maintainer-confirmed, and official-doc-supported.

The schema contains no numeric confidence/trust score. Candidate labels remain model assertions for
Phase 7 deterministic verification and are never promoted to objective metadata by Phase 6.

## Deterministic validation and normalization

After JSON parsing and strict Zod validation, KnownPath:

- rejects unknown evidence IDs and source-item IDs;
- verifies each quoted excerpt is present in the normalized cited source text;
- resolves all evidence URLs, content digests, authorship, dates, labels, reactions, answer state,
  source authority, and visibility from persisted source records;
- normalizes ecosystems, packages, platforms, versions, symptoms, and error messages through
  versioned deterministic helpers;
- creates error fingerprints deterministically from normalized signatures;
- enforces ordered, unique steps and bounded collection/string sizes;
- rejects semantic contradictions such as reusable output without solution evidence;
- records candidate verification labels as unverified claims.

Invalid JSON, schema violations, unknown references, fabricated excerpts, or semantic invariant
failures become `quarantined`; they never create a candidate.

## Persistence model

### `extraction_attempts`

A separate collection records processing even when no candidate exists. Lifecycle values are:

- `queued`
- `running`
- `succeeded`
- `irrelevant`
- `insufficient_evidence`
- `conflicting_evidence`
- `quarantined`
- `blocked`
- `failed`

An attempt stores:

- target kind/identity and ordered source item IDs/content hashes;
- context digest and assembly version;
- provider, model, provider data-handling capability;
- prompt IDs, versions, and digests;
- output schema version and relevant generation configuration;
- status, attempt count, retry/lease timestamps, and safe failure classification;
- provider request/response identifiers when non-secret and useful;
- input/output/thinking/cached/total usage exposed by the API;
- latency and timestamps;
- candidate ID when one is created;
- bounded validation issues and response digest for quarantined output.

Raw malformed provider output is retained only if a bounded internal quarantine field is justified
during implementation; it must never enter normal candidate output or logs. The preferred default is
a digest plus bounded validation details.

### `candidate_experiences`

Only a validated `reusable` result creates a candidate. The candidate schema evolves to represent
root cause, failed attempts, caveats, conflicts, candidate verification labels, and full extraction
provenance. Exact evidence references point to immutable source items and content digests.

Candidate records do not require final confidence or freshness. Those remain canonical KnownPath
concerns for Phase 7. Existing Phase 2 candidate status values remain review-oriented; irrelevant,
blocked, failed, and quarantined processing outcomes live on attempts rather than fake candidates.

## Idempotency and reprocessing

The extraction attempt key is a versioned digest of:

- target identity;
- ordered source item IDs and content hashes;
- context-assembly version and digest;
- provider and model;
- provider data-handling capability;
- prompt identifiers, versions, and digests;
- output-schema version;
- relevant generation configuration.

Terminal attempts are returned without another provider call. This includes reusable success,
irrelevant, insufficient, conflicting, quarantined, and blocked results. A transient failed attempt
may retry within its bounded attempt policy. A changed source hash, prompt, schema, assembly
version, model, or provider creates a new key. `--force` creates an explicitly marked new attempt
and is never allowed to bypass the data policy.

## Retry, quota, and cost controls

Provider calls are serial by default. `408`, `429`, and `5xx`/network failures receive bounded
exponential backoff with jitter. Authentication, permission, unsupported-model, invalid-request,
schema, and privacy failures do not retry. A quota error increments quota counters and, by default,
stops the remaining command so the worker does not hammer the project limit.

Every command can bound:

- number of targets;
- provider calls;
- estimated input tokens;
- actual total tokens accumulated from successful responses;
- output tokens per call;
- request spacing;
- retries per target.

Google's asynchronous Batch API is documented but deferred. Its later addition should implement the
same provider request/output contracts and attempt lifecycle rather than bypassing them.

## Commands

The root exposes one extraction command routed through the worker:

```sh
pnpm extract -- one --source-item <uuid>
pnpm extract -- pending --limit 5
pnpm extract -- batch --source expo-core --limit 10
pnpm extract -- inspect --candidate <uuid>
pnpm extract -- inspect --attempt <uuid>
```

`one` resolves a comment to its root. `pending` selects bounded latest public targets without a
terminal attempt for the current extraction key. `batch` filters by configured source registry.
Inspection prints the candidate/attempt, extraction provenance, and exact evidence references
without printing credentials, hidden thoughts, or unrelated source bodies.

## Logging and secrets

Safe logs contain target IDs, attempt IDs, provider/model, prompt/schema versions, statuses, counts,
latency, usage, and safe error codes. They exclude API keys, request/response bodies, source text,
quoted evidence, hidden thoughts, and authorization metadata. The Gemini key has no committed value
and is read only through centralized configuration.

## Manual verification

No automated tests are added. Verification will include:

1. install, typecheck, lint, formatting validation, and build;
2. MongoDB initialization twice and direct index/validator inspection;
3. a repository-layer extraction-attempt/candidate round trip with cleanup;
4. a public eligibility check and explicit private/team blocked attempts with no provider call;
5. bounded real Gemini processing of a solved thread and noisy/non-solution thread when a key is
   available;
6. structured candidate/evidence inspection and irrelevant classification inspection;
7. a harmless prompt-injection sentence in a local public source sample, followed by confirmation
   that it is treated only as evidence;
8. an intentionally malformed local provider response through the validation boundary, confirming
   quarantine without a candidate;
9. a repeated unchanged extraction, confirming the attempt is reused without a provider call;
10. credential/source-body log and committed-secret scans.

No Gemini key is currently available in the shell or repository `.env`. If that remains true, all
non-network verification will be completed and the exact live commands will be recorded as a manual
requirement. A paid substitute will not be used to claim completion.

## Documentation changes

Phase 6 adds an extraction operations/security guide and updates the root README, architecture, data
model, decision log, package READMEs, `.env.example`, and `progress.md`. Documentation must state
that free-tier Gemini may process only public records and that candidate labels are not verified
trust signals.

## Deferred work

- final numeric confidence/trust scoring and deterministic verification;
- candidate acceptance and canonical KnownPath promotion;
- semantic deduplication and contradiction resolution across candidates;
- asynchronous Gemini Batch API job submission/reconciliation;
- paid/private Gemini configuration, other providers, and self-hosted models;
- queues, schedulers, leases across multiple workers, and distributed rate limiting;
- embeddings, search, retrieval, MCP knowledge tools, Agent Skill distribution, contributions, and
  dashboards.

## Exact next phase

Phase 7 will implement deterministic verification and confidence/trust scoring for extracted
candidate experiences, including validation of candidate authority labels and promotion eligibility.
It must not treat Gemini output as objective evidence or begin later search/MCP/dashboard phases.
