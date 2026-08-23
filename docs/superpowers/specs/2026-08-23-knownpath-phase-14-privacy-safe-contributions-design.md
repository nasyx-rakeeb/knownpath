# KnownPath Phase 14 — Privacy-safe agent contributions

**Status:** Approved for specification on 2026-08-23. Implementation requires a separate review of
this written specification before work begins.

## Purpose and phase boundary

Phase 14 adds the first write-side network capability: an authenticated coding agent can submit a
generalized technical lesson after it has observed a real successful result. KnownPath retains the
reusable experience, not the user's repository, private prompts, hidden reasoning, credentials, or
unnecessary source code.

The contribution does not become a trusted or published KnownPath merely because an agent claims
success. It becomes sanitized, versioned evidence, then enters the existing candidate,
deterministic-assessment, and canonicalization review pipeline.

This phase implements public and private contributions. Team contributions remain a schema-level
future value but are rejected at the service authorization boundary until team ownership and
membership exist. Phase 14 does not implement agent-outcome reporting, automatic publication, a
moderation dashboard, team knowledge, or a private-data AI provider.

No automated tests are added, by explicit phase requirement.

## Current-system findings

The repository already provides several foundations that Phase 14 must extend rather than replace:

- `knowledge:contribute` is a closed API-key scope, but no route or MCP tool uses it yet.
- `agent_contributions` exists as a Phase 2 placeholder with a broad `proposedContent` field. It is
  not yet suitable as an external contribution contract.
- candidates resolve their evidence through immutable `source_items`; assessments verify those
  references before scoring.
- candidate assessments are immutable and candidates retain a latest-assessment pointer.
- canonicalization requires identical visibility and ownership across merged candidates.
- public-only Gemini extraction and embedding paths already reject private/team visibility before a
  provider call.
- HTTP and MCP share authentication, authorization, retrieval, auditing, and safe error boundaries
  in the backend. The stdio server remains a thin HTTP bridge.
- the Agent Skill currently mentions future contribution behavior but correctly advertises only the
  four existing read tools.

Phase 14 must preserve these boundaries. It must not create a route-layer write path that bypasses
source provenance, candidate scoring, or canonicalization.

## Research basis

Current official and primary guidance was reviewed on 2026-08-23:

- OWASP Logging Cheat Sheet guidance to minimize logs and remove, mask, sanitize, hash, or encrypt
  source code, tokens, credentials, connection strings, secrets, PII, file paths, network names,
  email addresses, and commercially sensitive information.
- OWASP LLM Prompt Injection Prevention guidance to separate instructions from untrusted data,
  validate outputs, minimize tool privilege, and treat indirect content as hostile input.
- OWASP LLM04 Data and Model Poisoning guidance to track data origin and transformations, validate
  unverified external material, version processing, and avoid granting untrusted data authority.
- NIST Privacy Framework 1.0 and the current 1.1 initial-public-draft materials for purpose-bound
  processing, consent, privacy risk management, and minimization.
- OpenTelemetry's current sensitive-data guidance to avoid collection where possible, allowlist
  useful attributes, delete or transform identifiers, and recognize that hashing a small or
  predictable identifier space is not anonymization.
- the current MCP security guidance for authenticated state handles, least privilege, auditability,
  and untrusted open-world content.
- the current MCP tool-annotation contract: write tools are not read-only; additive writes may set
  `destructiveHint: false`; idempotency must be backed by real server behavior rather than treated
  as a trust control.
- Secretlint's current maintained MIT-licensed TypeScript packages and official programmatic
  `lintSource` API. Registry and repository metadata identified version 13.0.4 with Node.js 22+
  support, compatible with KnownPath's pinned Node.js 24 runtime. The recommended preset covers
  common cloud, source-hosting, package-registry, AI-provider, private-key, basic-auth, database,
  and other credential formats.

Primary references:

- <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>
- <https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html>
- <https://genai.owasp.org/llmrisk/llm04-data-and-model-poisoning/>
- <https://www.nist.gov/privacy-framework>
- <https://opentelemetry.io/docs/security/handling-sensitive-data/>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices>
- <https://github.com/secretlint/secretlint>

Exact dependency versions must be added through the workspace catalog and lockfile from current
registry metadata during implementation, not copied from this prose if registry state changes.

## Approaches considered

### 1. Direct contribution-to-KnownPath publication

Write a canonical record directly from the submitted solution.

**Rejected.** It would treat an agent's success claim as verified truth, bypass deterministic
evidence scoring, make poisoning cheap, and require destructive rollback when a submission is wrong.

### 2. Sanitized contribution as provenance, then candidate processing

Persist an immutable sanitized contribution snapshot, project it into an immutable source item,
create a low-trust candidate, assess it deterministically, generate its similarity profile, and
discover plausible duplicate pairs without automatically publishing or merging it.

**Selected.** This reuses the existing evidence and canonicalization architecture, keeps
self-reported claims explainable, preserves reversible history, and lets later independent evidence
strengthen or contradict the lesson.

### 3. Queue-only asynchronous ingestion

Accept a submission into a durable queue and require a separately deployed worker for all
processing.

**Deferred.** A queue, scheduler, and deployed worker do not yet exist. Adding them solely for this
phase would add infrastructure without improving the privacy boundary. Phase 14 instead uses
bounded, idempotent local processing in the API plus a resumable worker command for incomplete
records. The persisted processing state can move behind a queue later without changing contracts.

## Package and dependency boundaries

Add `@knownpath/contributions` as the transport-independent contribution capability package. It
owns:

- contribution request policy and consent checks;
- local sanitization and content-risk classification;
- immutable sanitized submission construction;
- source snapshot and candidate projection;
- deterministic processing orchestration and resumability;
- provider capability contracts for an optional future generalization stage;
- safe contribution inspection projections; and
- contribution CLI parsing/inspection output.

It may depend inward on `@knownpath/domain`, `@knownpath/database`, `@knownpath/verification`, and
`@knownpath/canonicalization`. It must not depend on Fastify, MCP, apps, Better Auth internals, or a
concrete AI provider.

`@knownpath/api` composes the service and owns HTTP translation. `@knownpath/mcp` owns the shared
tool contract and calls the same gateway used by Streamable HTTP and stdio. The worker composes only
the resumable processing/inspection command.

Secretlint core and the recommended preset are direct runtime dependencies of
`@knownpath/contributions`. A general PII/NLP package is not selected: broad probabilistic entity
recognition would introduce false positives and another data-processing boundary. KnownPath uses
Secretlint for maintained secret formats and small, inspectable deterministic transforms for the
specific PII/private identifiers in scope.

## External contribution contract

The versioned request is a strict structured object. It contains no raw-repository, prompt,
transcript, or arbitrary attachment field.

Required or supported fields:

- `clientSubmissionId`: caller-generated UUID v4 used for owner-bound idempotency;
- `kind`: `new_lesson`, `correction`, `additional_evidence`, or `freshness_update`;
- optional target `knownPathId`, required for non-`new_lesson` kinds;
- `visibility`: only `public` or `private` is accepted in Phase 14;
- consent assertion with policy version and explicit confirmation;
- generalized problem/task statement;
- ecosystem, packages/components, platform, framework/runtime/toolchain, and observed versions;
- normalized symptoms and bounded exact/sanitized error strings;
- generalized solution summary and ordered steps;
- important conditions and caveats;
- concise observable success-evidence summary and bounded checks performed;
- KnownPath IDs consulted, including whether each materially influenced the attempt; and
- privacy-appropriate agent-client name/version metadata.

The request does not accept hidden chain-of-thought, full prompts, complete logs, repository
archives, arbitrary files, raw code fields, device identifiers, or unrestricted environment maps.
Every string and array has an explicit maximum. The complete HTTP/MCP body remains below the
existing MCP 64 KiB transport bound; the contribution route applies a stricter body limit.

## Consent and account setting

Users receive a persisted contribution mode:

- `ask` — default. Every submission requires an explicit consent assertion.
- `disabled` — all submissions fail clearly.

There is no automatic/background mode in Phase 14.

The consent record stores:

- consent policy identifier and version;
- `confirmed: true`;
- the effective intent: `private_backend_storage` or `public_submission_and_future_publication`;
- visibility at the time of consent;
- confirmation timestamp supplied by the server; and
- authenticated user/API-key provenance.

For public contributions, the request must explicitly authorize both submission and possible later
publication. This authorization does not itself publish the contribution. For private contributions,
consent covers backend/MongoDB storage and local processing only.

Session-only account endpoints read and change the contribution mode. Changes append audit events.
The user schema exposes the setting to the repository/auth boundary with a default so existing
accounts remain valid. Better Auth's registered additional-field configuration must retain the field
rather than allowing it to become an unrecognized database attribute.

## Visibility and authorization invariants

Visibility is enforced in schemas, services, repositories, source/candidate projection, and
canonicalization—not only in a UI or tool description.

### Public

- requires explicit public consent on each contribution;
- creates public sanitized contribution provenance, source snapshot, and candidate;
- remains `pending` and unreviewed;
- may be eligible for a future public-only provider because consent and visibility permit it, but
  Phase 14 makes no Gemini/generalization call; and
- is not retrievable until later canonical review/publishing produces a published KnownPath.

### Private

- is owned by the authenticated user at every persistence layer;
- creates private source and candidate records carrying the same `ownerUserId`;
- may be inspected only by that owner through the Phase 14 API;
- cannot enter current public search responses;
- cannot merge with public or differently owned records; and
- cannot be supplied to any `public_only` provider or external provider without an explicit
  `approved_private` capability and operator configuration.

No operation silently changes private visibility to public. Phase 14 introduces no visibility
conversion operation.

### Team

Requests for team visibility fail before contribution persistence with the stable code
`team_contributions_not_supported`. The failure is audit-recorded without storing the submitted
content. No team ID supplied by a caller is trusted as ownership proof.

## Sanitization pipeline

Sanitization is local, deterministic, versioned, field-aware, and runs before any submission body is
persisted or sent elsewhere.

### Stage 1: structural minimization

- parse the strict request schema;
- reject unknown fields;
- normalize Unicode to NFKC;
- remove forbidden control, bidirectional-override, and zero-width characters while preserving
  ordinary newlines/tabs where allowed;
- trim and bound arrays/strings; and
- flatten only allowlisted textual fields with stable field paths.

### Stage 2: maintained secret detection

- call Secretlint's programmatic `lintSource` API with the recommended preset and `noPhysicFilePath`
  behavior;
- use result ranges to replace findings in reverse order with typed placeholders;
- retain only rule/message identifiers, field paths, and counts in the report; and
- never retain or log matched secret values or unmasked message data.

### Stage 3: targeted identifier redaction

Apply small deterministic transforms for:

- email addresses → `[REDACTED_EMAIL]`;
- `/Users/<name>`, `/home/<name>`, and `C:\\Users\\<name>` → `$HOME`-based paths;
- credentials embedded in HTTP(S), Git, SSH, MongoDB, or other URL user-info → removed credentials;
- credential-like sensitive query parameters → redacted values; and
- unnecessary repository remote/user identity fragments → generalized host/reference values.

Technical identifiers such as package names, error codes, SDK versions, and public canonical URLs
remain when needed for reuse.

### Stage 4: post-scan and private-content policy

- run Secretlint again over transformed values;
- reject if high-risk findings remain;
- reject PEM/private-key markers that survive transformation;
- reject excessive multiline/code/file dumps using versioned conservative size/line/content
  thresholds;
- reject payloads whose redacted proportion shows that little reusable content remains; and
- never return the offending text in an error.

A safely redacted small fake-token/email/path sample may be accepted with a report. A payload that
still contains a secret or is primarily private material fails with `contribution_content_rejected`.

### Stage 5: prompt-injection and poisoning classification

Contribution text is always inert evidence, never an instruction source. Versioned heuristics flag
instruction-override, system-prompt, tool-execution, exfiltration, encoded-obfuscation, and
authority-manipulation patterns. A high-risk result is stored only in sanitized/quarantined form and
does not create a source item or candidate. The report stores reason codes, not the matched private
text.

Phase 14 does not use an LLM to decide this classification.

## Retention and immutable versions

The unsanitized submission is never written to MongoDB, logs, audit metadata, tracing, or an
external provider.

For accepted or quarantined requests, `agent_contributions` schema version 2 stores:

- stable contribution ID and client submission ID;
- authenticated contributor/user/API-key and bounded agent-client metadata;
- contribution kind and optional target KnownPath;
- exact public/private visibility and ownership;
- immutable consent record;
- a versioned HMAC digest of the original normalized request for audit/idempotency without retaining
  plaintext;
- immutable sanitized structured payload;
- immutable sanitization policy/report and risk classification;
- trust state `self_reported_unverified`;
- processing status and safe failure/reason codes;
- pointers to the generated source item, candidate, assessment, and similarity profile when each
  stage completes; and
- audit creation/update timestamps.

Only processing status and derived pointers are mutable through bounded repository methods. The
sanitized payload, original-request digest, consent, contributor, and sanitization report are never
updated. Security/action history is append-only in `audit_events`.

The legacy Phase 2 schema is retained as an explicit version-1 parser if existing records are found;
new writes use version 2. Database validators accept the declared versions but require the stricter
version-2 envelope for new service writes.

The original-request digest uses HMAC-SHA-256 with the existing server-held API-key pepper and a
distinct domain-separation prefix. An unkeyed hash is not used because predictable/private values
could otherwise be guessed offline.

## Provenance source projection

An accepted sanitized contribution creates an immutable `source_item` so the existing evidence
resolver can verify candidate references without a parallel evidence system.

- add `agent_contribution` to the source-registry and source-item type vocabulary;
- create/reuse an internal source registry for the exact visibility/owner boundary;
- construct normalized text only from the sanitized structured payload;
- classify authority as `general_public` with basis `unverified`;
- retain the contribution ID and sanitization version in bounded provider metadata;
- use a canonical contribution-detail URL on the configured API origin; and
- apply the same public/private visibility and owner to registry, source, candidate, and later
  canonical records.

The source snapshot never includes the unsanitized request or a full repository dump. Future public
provenance views may show a generalized summary; they must not expose internal sanitization or
identity metadata.

## Candidate projection and initial trust

The candidate schema evolves compatibly so exactly one provenance kind is present:

- existing AI candidates keep `extraction` provenance; or
- contribution candidates use contribution provenance with contribution/source IDs, projector
  identifier/version, sanitized content digest, and projection time.

A deterministic builder maps the sanitized request into the existing problem, symptoms, error
fingerprints, metadata, solution steps, caveats, and evidence structures. It creates no verification
labels and never claims maintainer/official confirmation.

The immutable source item supports the candidate's problem/solution as a self-report. The scoring
layer recognizes `agent_contribution` explicitly, records an `agent_self_reported` signal, and caps
an otherwise uncorroborated contribution at a low confidence grade. Freshness and explicit version
metadata remain separate components. A claimed success check is useful context but does not become
verified outcome evidence or an `agent_outcome`.

The scoring algorithm/verifier/policy versions change wherever behavior changes. Historical
assessments remain immutable.

## Canonicalization and deduplication

After scoring, Phase 14:

1. creates/reuses a deterministic similarity profile;
2. discovers only plausible blocked candidate pairs;
3. uses no embedding by default; and
4. records pair decisions for review.

No contribution-triggered request automatically creates, merges, or publishes a KnownPath.
Semantic-only merges remain impossible. A contribution-origin candidate cannot be merged by the
canonical record service while its contribution is pending/unreviewed. Later moderation or
corroboration may make it eligible without replacing the candidate or contribution history.

Private candidate discovery compares only the same visibility/owner scope. It never requests a
public embedding.

## Provider abstraction and private-data gate

Define an optional `ContributionGeneralizer` capability contract with:

- provider/model/version identity;
- `public_only` or `approved_private` data capability;
- strict structured input/output schemas;
- bounded usage and cancellation metadata; and
- no authority to change visibility, consent, trust, or moderation.

The provider router validates contribution, source, and candidate visibility before constructing or
calling a provider. `public_only` rejects private/team data. Missing private capability fails
clearly; there is no fallback or silent downgrade.

Phase 14 configures no generalizer implementation. Structured deterministic projection is sufficient
and avoids an unnecessary privacy/cost boundary. A paid Gemini account, another provider, or a
self-hosted model can later implement `approved_private` without changing contribution transport,
sanitization, persistence, or candidate processing.

## HTTP API

Add versioned shared domain request/response schemas and thin Fastify routes:

### `POST /api/v1/contributions`

- bearer API key required;
- `knowledge:contribute` required;
- strict body limit and contribution-specific rate policy;
- checks owner account setting and consent;
- performs bounded local sanitization and idempotent processing;
- returns `201` for a new contribution and a safe successful replay result for an identical retry;
- returns only contribution ID, effective visibility, processing/trust state, redaction categories
  and counts, and safe derived IDs/statuses; and
- never echoes secret matches or unrestricted sanitized content.

### `GET /api/v1/contributions/:id`

- session or API key authentication;
- owner-only authorization for both public and private submissions;
- returns a safe inspection view of the generalized sanitized contribution and processing history;
- appends an inspection audit event; and
- does not grant implicit administrator access to another user's private contribution.

### Account settings

- session-only read and update endpoints under `/api/v1/account/contribution-settings`;
- default `ask`, optional `disabled`;
- setting changes are audited; and
- CORS methods are updated explicitly if `PATCH` is selected.

Team requests, missing consent, disabled contribution mode, idempotency mismatch, rejected content,
and unavailable processing stages use stable client-safe error codes.

## MCP contract

Register one new tool: `knownpath_contribute`.

The input uses the same strict shared contribution request schema, with model-friendly field
descriptions and the explicit consent assertion. The output is compact and reports accepted,
quarantined, or pending-review state plus safe sanitization counts and derived IDs.

Annotations:

- `readOnlyHint: false`;
- `destructiveHint: false` because the write is additive and reversible through moderation rather
  than destructive;
- `idempotentHint: true`, backed by required `clientSubmissionId` and owner-bound conflict checks;
  and
- `openWorldHint: true` because the tool writes to a remote shared service.

The shared gateway gains `contribute`. The in-process gateway calls the same contribution service as
HTTP. The stdio gateway sends the request to the Phase 14 HTTP route with its existing API key.
Neither stdio nor the installer receives MongoDB, Secretlint policy, or provider secrets.

The `/mcp` connection continues to require a read-capable API key because the installed capability
is a combined read/write service; the contribution tool additionally enforces
`knowledge:contribute`. Status reports whether the current key can contribute without revealing
credentials.

Tool, server, and contract versions advance compatibly. Contribution and read tools remain one
compact surface; `knownpath_report_outcome` stays unregistered until its own phase.

## Agent Skill and installer behavior

Advance the canonical skill minor version. It instructs an agent to contribute only when:

- the actual task succeeded through an observed build/check/reproduction;
- the lesson is reusable and non-trivial;
- the payload can be generalized without private code or secrets;
- the user explicitly consents to public sharing, or chooses private backend storage; and
- the current MCP server advertises `knownpath_contribute`.

The skill must not contribute merely because a result looked plausible, a patch was written, or a
KnownPath was selected. It must not include hidden reasoning, full prompts/logs/files, credentials,
or proprietary code. Consulted KnownPath IDs are included only when they materially influenced the
solution.

Installer documentation explains the new optional `knowledge:contribute` scope and how to disable
contributions. Agent config remains unchanged: it still stores only references to
`KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`. No consent or API key is written to agent
configuration.

The publishable CLI version and bundled skill version advance, but npm publication is not part of
the Phase 14 implementation commit unless separately requested.

## Audit and safe observability

Add bounded audit events for:

- contribution submitted/replayed;
- contribution rejected or quarantined;
- candidate projected;
- contribution inspected; and
- contribution setting changed.

Events identify authenticated actor, target, request ID, outcome, visibility, policy version, and
safe reason/count metadata. They exclude contribution text, emails, paths, Secretlint matches,
request bodies, credentials, and Authorization headers.

Application logs contain request ID, safe status/stage/reason codes, counts, and latency only.
Fastify's existing credential redaction remains in place and contribution/body fields are added to
redaction defense in depth. No contribution request or response body is logged.

## Error and retry behavior

Stable contribution errors include:

- `contribution_disabled`;
- `contribution_consent_required`;
- `team_contributions_not_supported`;
- `contribution_content_rejected`;
- `contribution_quarantined` where returning a successful quarantined record is not appropriate;
- `contribution_idempotency_conflict`;
- `contribution_not_found`; and
- existing authentication, scope, validation, payload, and rate-limit errors.

The client submission ID is unique within the authenticated owner. An identical retry returns the
existing record. Reusing the ID with a different HMAC digest returns a conflict and changes nothing.
Derived records use versioned deterministic keys so interrupted processing can resume without
duplicates.

## Database evolution and indexes

Evolve validators and named indexes idempotently. Expected high-value indexes are:

- unique owner plus client submission ID;
- unique contribution deduplication/original-request digest key;
- owner, visibility, status, and creation time for inspection/moderation;
- processing status and next stage for resumption;
- target KnownPath and creation time for corrections/evidence;
- partial source/candidate pointer indexes for impact lookup; and
- audit event type/actor/target indexes already covered by the audit collection.

Existing visibility indexes on source registries, KnownPaths, and candidates continue to enforce
owner-aware access patterns. No vector, TTL, queue, cache, or second database is introduced.

## Developer commands

Add a root/worker contribution command with bounded operations:

- `contribute inspect <contribution-id>` — sanitized payload, consent, report, provenance, derived
  IDs, assessment summary, and pair-review state;
- `contribute process <contribution-id>` — idempotently resume derived processing; and
- `contribute pending --limit <n>` — bounded resumption for incomplete accepted submissions.

The command never prints an original unsanitized payload, secret match, API key, or full internal
provider response.

## Manual verification plan

Use a dedicated development database and real HTTP/MCP paths. Do not fabricate canonical knowledge
or publish any verification record.

1. Install dependencies and initialize/reinitialize MongoDB indexes twice.
2. Run typecheck, lint, formatting validation, and build.
3. Start the API with a temporary user/API key containing `knowledge:read` and
   `knowledge:contribute`.
4. Submit a safe synthetic public contribution with explicit consent through HTTP.
5. Invoke `knownpath_contribute` with a safe synthetic private contribution through the official MCP
   client/inspector.
6. Inspect contribution, source item, candidate, immutable assessment, similarity profile, pair
   state, consent, provenance, visibility, and audit records.
7. Confirm neither contribution creates or publishes a KnownPath automatically and the initial score
   remains low/self-reported.
8. Repeat identical submissions and confirm idempotent reuse; repeat a client ID with different
   content and confirm conflict.
9. Submit a local sample containing synthetic token-shaped strings, a fake email, macOS/Linux/
   Windows home paths, and a credential-bearing remote; inspect redactions/report and confirm no
   matched values appear in logs or responses.
10. Submit excessive private/source-like content and prompt-injection-like content; confirm
    rejection or quarantine and no candidate projection.
11. Attempt team visibility and confirm pre-persistence rejection plus safe audit history.
12. Verify owner isolation by attempting to inspect the private contribution as another user.
13. Configure or simulate a `public_only` generalizer boundary and confirm private input is rejected
    before provider construction/call. No real private data is sent externally.
14. Inspect OpenAPI and MCP schemas/context size, tracked files, logs, Git diff, and Git status for
    accidental secrets or generated artifacts.

Temporary verification records are removed only through explicit ID-bounded repository cleanup or
kept in a clearly separate development database. Production KnownPaths remain unchanged.

## Documentation and completion

Implementation updates:

- `docs/ARCHITECTURE.md`;
- `docs/DATA_MODEL.md`;
- `docs/DECISIONS.md`;
- `docs/API.md`;
- `docs/MCP.md`;
- `docs/AGENT_SKILL.md`;
- `docs/INSTALLER.md`;
- a new contribution/privacy guide;
- `.env.example` only if a genuinely required setting is introduced; and
- `progress.md` with observed commands, limitations, and the exact next phase.

The final Phase 14 commit is:

```text
phase 14: add privacy-safe agent knowledge contributions
```

Do not begin Phase 15.
