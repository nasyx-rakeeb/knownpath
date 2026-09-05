# Gemini candidate extraction

Gemini extraction is optional operator tooling for targeted public-source research. The normal agent
contribution path is already structured by the coding agent and uses sanitization, deterministic
quality assessment, moderation, and canonicalization with zero Gemini calls.

KnownPath uses AI to turn normalized public source material into structured candidate experiences.
The model interprets technical text; it does not own objective metadata, verify authority, assign
trust, merge records, or publish knowledge.

## Provider boundary

`@knownpath/ai` defines the extraction provider contract. The current implementation uses Google's
official `@google/genai` SDK and the Gemini `generateContent` API.

Configuration is environment-based:

```dotenv
AI_PROVIDER=gemini
AI_DATA_HANDLING=public_only
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

The application and scheduled-worker default model is `gemini-3.5-flash-lite`, selected for
structured, high-volume document extraction. The repository variable `KNOWNPATH_GEMINI_MODEL` can
override the scheduled-worker model. Model identity is configurable and recorded with every attempt.

Requests use the stateless `generateContent` API, provide no tools, require JSON-schema output, and
do not request thought output. KnownPath never asks for or stores hidden chain-of-thought.

## Public-only provider policy

The configured Gemini capability is `public_only`. Before provider construction or request,
KnownPath verifies the registry, target item, and every context item are public.

Any private or team record blocks the complete attempt with `ai_private_data_not_approved`.
`--force` cannot bypass this rule. There is no silent redaction, public downgrade, or fallback.

The provider abstraction can later accept an `approved_private` implementation, such as a
deliberately approved paid account or self-hosted model, without changing the extraction pipeline.
No such provider is currently configured.

## Context assembly

GitHub threads use the latest immutable revision of the root and each comment/reply. Complete items
are prioritized:

1. root issue or discussion;
2. accepted answer;
3. maintainer/member/collaborator content;
4. original-author follow-up;
5. reaction-supported content;
6. remaining chronology.

High-signal items are not silently truncated. If required context cannot fit, extraction fails
clearly.

Official documents preserve structured blocks, document type, version metadata, authority, canonical
URL, and content hash. Catalog-only records are not extraction targets.

The context is versioned and hashed. Every source passage is labeled as quoted, untrusted evidence
that cannot issue instructions or request tools.

## Structured result

The model first classifies the source as:

- `reusable`;
- `irrelevant`;
- `insufficient_evidence`;
- `conflicting_evidence`.

A reusable candidate may contain:

- concise problem statement;
- ecosystem, packages/components, platforms, and versions;
- symptoms and normalized error candidates;
- evidence-supported root cause;
- failed approaches;
- solution summary and ordered steps;
- caveats and conflicts;
- exact source-item references and excerpts;
- proposed evidence labels awaiting deterministic verification.

Gemini cannot assign the production confidence score.

## Validation and quarantine

Structured output is validated twice: first by Gemini's response schema, then by strict Zod
contracts and deterministic provenance checks.

KnownPath rejects:

- malformed or unknown fields;
- missing reusable problem/solution fields;
- unknown source-item IDs;
- excerpts that are not exact substrings of the cited snapshot;
- model-supplied URLs or hashes that disagree with stored data;
- unsupported objective labels.

URLs, content hashes, timestamps, identities, author association, reactions, issue state, and error
fingerprints come from deterministic source records. Invalid or ungrounded output is quarantined.
Raw invalid model output is not retained; the attempt stores a digest and bounded validation issues.

Only `reusable` output creates a candidate experience.

## Idempotency and budgets

An extraction attempt key includes:

- target and selected source hashes;
- context digest;
- provider, model, and capability;
- prompt versions and digests;
- output schema version;
- generation settings.

An unchanged terminal attempt is reused without another provider call. `--force` creates a
deliberate new attempt but does not weaken privacy.

Requests are serialized. Network, 408, and 5xx failures receive bounded exponential backoff. A 429
is recorded as quota exhaustion without an immediate retry storm; operators can explicitly requeue
the failed extraction after the project's quota window resets. Authentication, permission,
configuration, schema, and privacy errors do not.

Command budgets limit target count, provider calls, estimated input, reported tokens, output tokens,
request spacing, and retries. Quota exhaustion stops the batch. The asynchronous Gemini Batch API is
not currently used.

## Prompt maintenance

Versioned prompt sources live under `packages/ai/src/prompts/`:

- shared safety and output rules;
- GitHub-thread strategy;
- official-document/release strategy.

Changing prompt behavior, context assembly, output schema, or model metadata changes the idempotency
inputs so records can be reprocessed safely.

## Commands

```sh
pnpm extract one --source-item <uuid>
pnpm extract pending --limit 5
pnpm extract batch --source expo-core --limit 10
pnpm extract inspect --candidate <uuid>
pnpm extract inspect --attempt <uuid>
```

Use small batches until current Gemini project/model quotas are understood. Keep the key in an
ignored environment file or deployment secret manager; prompts, source text, raw model output, and
credentials are not logged.

## Responsibilities after extraction

Candidate labels remain unverified until [deterministic scoring](SCORING.md) resolves them against
stored evidence. [Canonicalization](CANONICALIZATION.md) handles duplicates and conflicting
candidate membership. [Retrieval](RETRIEVAL.md) projects only appropriate canonical records.

## Official references

- [Google Gen AI JavaScript SDK](https://googleapis.github.io/js-genai/)
- [Gemini text generation](https://ai.google.dev/gemini-api/docs/text-generation)
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)
