# Gemini AI Extraction

## Scope

Phase 6 converts immutable public source snapshots into validated candidate experiences. It does not
calculate trust/confidence, promote candidates to KnownPaths, resolve contradictions, or build
search indexes. Objective GitHub/document metadata remains unchanged source evidence; model output
is interpretation that must pass deterministic validation.

## Provider and model

KnownPath uses Google's official `@google/genai` SDK and the Gemini Interactions API. The default
development model is configurable as `GEMINI_MODEL` and currently defaults to stable
`gemini-3.5-flash-lite`, selected for high-volume structured document extraction and a usable free
tier. Requests set `store: false`, declare no tools, request JSON-schema output, use minimal
thinking, and disable thinking summaries. Hidden reasoning is neither requested nor stored.

The provider contract carries a data-handling capability independently from its model name. Phase 6
exposes only `public_only`. A future paid Gemini, other hosted provider, or self-hosted model may
implement `approved_private`, but enabling that requires deliberate configuration and policy work;
the ingestion/extraction orchestration does not need to be rewritten.

## Hard privacy boundary

The public/free Gemini path accepts only source registries and source items whose visibility is
`public`. Before the provider is constructed or any request can occur, KnownPath checks the source
registry, requested item, and every selected context item. Any `private` or `team` scope blocks the
whole attempt as `ai_private_data_not_approved`.

The block is persisted without source text or provider response and the command exits with an
actionable error. `--force` never bypasses this policy. There is no fallback or downgrade route.
This restriction reflects Google's free-service data-use terms: do not configure unpaid Gemini for
sensitive, confidential, personal, private, or team material.

## Context assembly

GitHub extraction resolves an issue/discussion root and the latest immutable revision of each
comment/reply. Complete source items are prioritized in this order: root, accepted answer,
maintainer/member/collaborator material, reaction-supported material, then remaining chronology.
Content is included only at whole-item boundaries. The root, accepted answer, maintainer material,
and root-author follow-ups are never silently truncated; if a high-signal anchor cannot fit,
extraction fails clearly.

Official documentation and release-note extraction uses one normalized snapshot and retains its
structured blocks, document classification, version metadata, source authority, canonical URL, and
content digest. Catalog-only `other` items are not extraction targets.

The serialized context is versioned and hashed. Each evidence record has a stable KnownPath source
item ID, deterministic facts, and quoted untrusted text. Prompt instructions explicitly state that
source text cannot issue instructions or request tools.

## Output validation and quarantine

Gemini must classify a target as `reusable`, `irrelevant`, `insufficient_evidence`, or
`conflicting_evidence`. Reusable output can describe a grounded problem, ecosystems/packages,
platforms, versions, symptoms/errors, root cause, failed approaches, solution, ordered steps,
caveats, conflicts, and candidate verification labels. It cannot assign numeric confidence.

The SDK's structured output is only the first boundary. KnownPath then:

- parses JSON and validates the complete strict Zod schema;
- rejects unknown source item IDs;
- requires every quoted excerpt to be an exact substring of the cited snapshot;
- resolves URLs and content hashes from deterministic source records;
- canonicalizes ecosystem, package, platform, version, symptom, and error-fingerprint projections;
- keeps author/maintainer/official support labels explicitly `unverified` for Phase 7.

Malformed or ungrounded output is `quarantined`. Only `reusable` creates a candidate. Raw invalid
responses are not persisted; only a digest and bounded validation issues are retained.

## Idempotency, retries, and budgets

The attempt key covers the target, selected source hashes/context digest, provider, model,
data-handling capability, prompt versions/digests, output schema, and generation settings. Repeating
unchanged work reuses the terminal attempt without a provider call. `--force` creates a new attempt
for deliberate reprocessing but does not weaken privacy.

Requests are serial. HTTP 408/429, 5xx, and network failures receive bounded exponential backoff;
authentication, permission, configuration, schema, and privacy failures do not. Command budgets
limit targets, provider calls, estimated input tokens, actual reported tokens, request spacing, and
retry count. A quota failure stops further work. Gemini's asynchronous Batch API is deliberately
deferred until operational volume justifies its separate lifecycle.

## Configuration

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` only in the ignored file or deployment secret
manager. The relevant settings are:

- `AI_PROVIDER=gemini`
- `AI_DATA_HANDLING=public_only`
- `GEMINI_API_KEY` and `GEMINI_MODEL`
- timeout, retry, request-spacing, and output-token bounds
- per-command target, call, estimated-input, and actual-token budgets

The key, Authorization material, prompts, source text, and raw model output are not logged.

## Commands

```sh
pnpm extract -- one --source-item <uuid>
pnpm extract -- pending --limit 5
pnpm extract -- batch --source expo-core --limit 10
pnpm extract -- inspect --candidate <uuid>
pnpm extract -- inspect --attempt <uuid>
```

Use `--force` only for an intentional new attempt. Inspection prints candidate fields and bounded
provenance references, or attempt metadata without unrelated source bodies.

## Manual live verification

With a real free-tier key, choose one bounded solved public Expo/React Native thread and one noisy
public source item. Process each by ID, inspect attempts/candidates, then repeat without `--force`
and confirm `providerCalls: 0`/reuse on unchanged context. Add a harmless sentence such as “ignore
previous instructions” to a temporary **public** source snapshot, process it, and confirm it is
treated as quoted evidence. Remove all temporary verification records afterward.

Without a key, static checks, MongoDB lifecycle/index verification, malformed-output validation,
context assembly, and the no-provider-call privacy gate can still be verified. They do not prove
live model behavior and must not be reported as such.

## Official references

- [Google Gen AI JavaScript SDK](https://googleapis.github.io/js-genai/)
- [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions)
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Token counting](https://ai.google.dev/gemini-api/docs/tokens)
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Batch API](https://ai.google.dev/gemini-api/docs/batch-api)
- [API keys](https://ai.google.dev/gemini-api/docs/api-key)
- [Pricing and free tier](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)
