# KnownPath Phase 15 — Verified outcomes and freshness ranking

**Status:** Approved for specification on 2026-08-23. Implementation requires a separate review of
this written specification before work begins.

## Purpose and phase boundary

Phase 15 closes the first learning loop. An authenticated agent can report whether it actually used
a KnownPath and what observable result followed. KnownPath turns those immutable reports into a
versioned, explainable outcome assessment that can gradually outweigh seed signals as independent,
recent, compatible evidence accumulates.

An outcome is not created by search, view, or selection. An attempted result requires a completed
attempt; `not_used` is a zero-weight disposition that closes a selected record without claiming an
attempt. Reports contain structured environment metadata and an optional concise sanitized note, not
repository files, private code, prompts, transcripts, credentials, or chain-of-thought.

This phase adds outcome submission, aggregation, ranking integration, safety-review signaling,
recomputation, supersession primitives, MCP exposure, and Agent Skill behavior. It does not add a
moderation dashboard, team ownership, public signup, automatic delisting, distributed rate-limit
infrastructure, or tests.

## Current-system findings

The repository already provides boundaries that Phase 15 extends:

- `agent_outcomes` exists as a Phase 2 placeholder with four broad values and three indexes. No
  service, API, MCP tool, aggregation, throttling, or ranking effect uses it.
- candidate assessments are immutable and already reserve an unobserved Wilson outcome component.
  Those historical seed assessments must not be overwritten.
- canonical KnownPaths project deterministic candidate trust and freshness into immutable revisions
  and mutable current records.
- search documents hardcode `outcome: unobserved`, and ranking assigns outcomes zero of three
  possible points.
- a search selection is explicitly usage only and never success.
- API keys expose `knowledge:read` and `knowledge:contribute`; outcomes need a separate least-
  privilege capability.
- HTTP and MCP share backend business logic. The stdio bridge calls HTTP and must remain free of
  MongoDB/provider secrets.
- the Agent Skill already remembers materially influential KnownPath IDs but does not advertise an
  outcome tool.

## Research basis

Current official and primary references were reviewed on 2026-08-23:

- NIST proportion-confidence guidance recommends Wilson and Jeffreys-style intervals over the naive
  Wald interval for small samples and extreme observed proportions. The NIST technical note
  explicitly warns that small samples need conservative interval methods.
- Wilson's score method produces bounded intervals and prevents one observed success from appearing
  certain. KnownPath uses the lower bound as a conservative ranking input and stores the complete
  interval rather than exposing a raw ratio as confidence.
- OWASP API4:2023 requires per-operation payload and interaction-frequency limits. Outcome
  submission therefore receives explicit route throttles plus durable account/API-key influence caps
  rather than relying only on the existing process-local IP limiter.
- USENIX reputation-system work documents Sybil, whitewashing, collusion, and repeated-vote risks.
  KnownPath does not claim full Sybil resistance; it limits effective influence by authenticated
  account, treats API keys as installation-like rate principals rather than independent voters, and
  records anomaly signals for later moderation.
- Elasticsearch's official decay-function model provides an inspectable origin, offset, scale, and
  decay vocabulary. KnownPath applies a versioned exponential time weight and records its parameters
  and effective sample size.
- Semantic Versioning defines explicit compatibility boundaries but cannot prove compatibility for
  arbitrary ecosystems. Outcomes therefore retain normalized versions and compatibility buckets;
  unknown version fit remains unknown.

Primary references:

- <https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/propconf.htm>
- <https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2119.pdf>
- <https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/>
- <https://www.usenix.org/legacy/event/nsdi09/tech/full_papers/tran/tran.pdf>
- <https://www.usenix.org/legacy/event/nsdi11/tech/nsdi11_proceedings.pdf>
- <https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/decay>
- <https://semver.org/>

## Approaches considered

### 1. Raw success ratio

Rank by `successes / attempts`.

**Rejected.** One success becomes 100%, partial outcomes are ambiguous, old/incompatible attempts
pollute current reliability, and repeated accounts can manipulate the numerator.

### 2. Hierarchical Bayesian reputation model

Infer account reputation, record reliability, environment effects, and temporal drift jointly.

**Deferred.** This may become useful with a substantial corpus, but the current two-record dataset
cannot calibrate it. Adding opaque priors and latent reputation now would create false
sophistication and a hard-to-audit ranking system.

### 3. Wilson lower bounds with stratification, decay, and influence caps

Store immutable raw reports, deterministically select effective reports, compute conservative Wilson
intervals for any-help and full-solve rates, retain version/environment distributions, and use a
bounded outcome component in retrieval.

**Selected.** It is explainable, reproducible, conservative under small samples, implementable
without another service, and can later be replaced through versioned immutable reassessment.

## Package and dependency boundaries

Extract the field-aware generic text scanner/redactor from the Phase 14 contribution implementation
into a small `@knownpath/privacy` package. It owns maintained Secretlint invocation and reusable
single-string normalization/redaction; contribution-specific payload policy remains in
`@knownpath/contributions`. Both contribution and outcome services depend inward on this package,
avoiding duplicated secret rules or an outcomes-to-contributions dependency.

Add `@knownpath/outcomes` as the transport-independent capability package. It owns:

- strict submission validation and outcome state invariants;
- privacy-safe note sanitization;
- idempotent immutable outcome creation;
- durable account/API-key throttling and anomaly classification;
- deterministic effective-sample selection;
- versioned outcome assessment, Wilson, decay, trend, and compatibility calculations;
- independent safety-review event creation;
- recompute, inspection, and supersession commands; and
- safe aggregate projections for API/MCP/search consumers.

It may depend inward on `@knownpath/domain`, `@knownpath/database`, and deterministic normalization
helpers. It must not depend on Fastify, MCP, apps, or an AI provider. No Gemini, embedding, or other
external provider is used for outcome processing.

`@knownpath/api` performs authentication, authorization, rate-policy attachment, request/audit
translation, and delegation. `@knownpath/mcp` adds one shared tool contract. `@knownpath/search`
consumes only the latest safe aggregate projection. The stdio bridge continues to call the HTTP API.

## External outcome contract

The versioned strict request contains:

- `contractVersion`;
- caller-generated UUID v4 `clientOutcomeId` for request idempotency;
- UUID v4 `clientExecutionId` identifying one task execution;
- `knownPathId`;
- optional `searchId` proving the retrieval/selection context when available;
- one outcome state;
- attempt/result timestamp supplied by the client and bounded against unreasonable clock drift;
- agent-client name/version;
- structured ecosystem, packages, platforms, runtime/toolchain, and version metadata;
- optional concise, non-sensitive note with a strict maximum; and
- optional solution-variant ID if the agent can identify the attempted variant.

Outcome states are:

- `solved`: the applied KnownPath materially produced the successful result;
- `partially_helped`: useful progress, but not a complete solution;
- `attempted_failed`: the solution was attempted and did not solve the problem;
- `incompatible_environment`: the solution could not validly apply to the observed environment or
  version;
- `stale_or_outdated`: the solution was attempted or evaluated and is no longer current;
- `misleading_or_unsafe`: the attempted or inspected guidance appears materially misleading or
  unsafe and requires review; and
- `not_used`: the record was considered but not attempted. It is retained only as a zero-weight
  usage disposition.

Every state except `not_used` requires `attemptedAt`. `not_used` must not claim attempt evidence.
Attempt times may be at most five minutes in the future and five years in the past; the server
stores its own receipt time separately. The service verifies the KnownPath is accessible to the
principal; explicit review-record outcomes retain the existing admin-key review authorization rule.
Private/team outcome submission remains unsupported because private/team KnownPath retrieval is
unsupported.

## Privacy and sanitization

The contract contains no arbitrary environment map, raw command output, code, stack dump, file, or
prompt field. Environment data uses bounded normalized identifiers. The note is optional and is not
needed for ranking.

Outcome note sanitization reuses the maintained Secretlint boundary and targeted email/home-path/
credential-URL/control-character handling established for contributions. High-risk residue or
source-like content is rejected. Stored and logged audit data contains IDs, state, visibility,
reason codes, and counts—not raw note content.

Individual reports are owner-private operational records even when they target a public KnownPath.
Only k-anonymous-style bounded aggregates are exposed to agents; no reporter, API-key, execution,
note, precise timestamp, or rare environment combination is returned through search/detail/MCP.
Phase 15 uses a minimum aggregate disclosure threshold before returning detailed distributions.

## Identity, idempotency, and influence control

The authenticated user ID is the primary independent-reporter identity. API-key ID is an
installation-like throttle and provenance principal, not another independent vote. Client-supplied
agent identity never increases weight.

Idempotency rules:

- `(userId, clientOutcomeId)` is unique;
- repeating the same request returns the existing receipt;
- reusing the ID for different canonical content returns `outcome_idempotency_conflict`;
- `(userId, clientExecutionId, knownPathId)` admits at most one report; and
- one execution cannot report conflicting states for the same KnownPath.

All raw valid reports remain immutable. Aggregation selects at most one effective report per user,
KnownPath, normalized version bucket, and policy time window. Additional reports remain auditable
but receive zero ranking weight with an explicit reason code. Creating more keys under one account
does not increase influence.

The initial durable limits complement the process-local route limiter:

- 10 accepted attempts per API key per rolling hour;
- 20 accepted attempts per account per UTC day;
- one effective report per account, KnownPath, normalized version bucket, and 30-day window; and
- anomaly flags for bursts, repeated zero-weight reports, many keys, or concentrated negative
  targeting.

The limits are versioned policy values and return actionable `outcome_rate_limited` errors. They are
not presented as complete Sybil resistance.

## Immutable persistence model

### `agent_outcomes`

Evolve the placeholder with schema version 2. Store immutable request provenance, normalized
environment, sanitized note/report, outcome state, idempotency keys, influence disposition, target
KnownPath/revision/solution, user/API-key/client identity, timestamps, and audit metadata.

### `known_path_outcome_assessments`

Each recomputation appends an immutable record containing:

- assessment ID, KnownPath/revision, algorithm/method/policy versions and digests;
- explicit `calculatedAt` and calculation window;
- all considered outcome IDs and deterministic input digests;
- raw, eligible, effective, excluded, unique-user, and unique-key counts;
- counts for all seven states;
- `lastSuccessfulAt`, `lastFailedAt`, and latest compatibility/safety observations;
- time weights and effective sample sizes;
- any-help and full-solve observed rates plus Wilson lower/upper bounds;
- version, platform, ecosystem, and environment distributions with disclosure safety metadata;
- recent versus baseline trend values and drop detection;
- global and version-bucket confidence components;
- reason codes, exclusions, anomaly summaries, and human-readable explanations; and
- audit metadata.

Exact same inputs, policy, method, and calculation timestamp bucket reuse an assessment. Force or a
changed version creates a new immutable result. Existing assessments are never overwritten.

KnownPaths gain only `latestOutcomeAssessmentId` for fast access. Search documents copy the safe
latest aggregate plus assessment ID. Candidate seed assessments remain unchanged.

### `known_path_safety_events`

Safety review is separate from outcome confidence and moderation. Immutable events record report
provenance, transition, reason code, actor, and timestamp without publishing the private note.
KnownPaths gain `safetyReview` with status `clear`, `review_queued`, `under_review`, `resolved`, or
`restricted`, first/latest event timestamps, and `latestSafetyEventId`. Only an authorized safety
decision can enter `under_review`, `resolved`, or `restricted`.

The first valid `misleading_or_unsafe` report opens or queues review immediately and writes an audit
event. Repeated reports from the same account do not repeatedly transition or amplify review state.
Opening safety review does not alter ranking, moderation, lifecycle, or visibility.

## Statistical assessment

Phase 15 calculates two binary views over effective reports:

- any help: `solved` and `partially_helped` are successes; `attempted_failed` is failure;
- full solve: only `solved` is success; `partially_helped` and `attempted_failed` are failures.

`incompatible_environment` and `stale_or_outdated` populate applicability/freshness distributions
and penalties only when the query context is relevant. `misleading_or_unsafe` enters safety review
but has no direct ranking weight without corroboration. `not_used` has no reliability weight.

Each effective report receives a versioned exponential recency weight with an explicit grace period
and half-life. The assessment stores total weight and Kish-style effective sample size. Wilson
intervals use the weighted observed proportion and effective sample size; the result is labeled a
decay-adjusted interval, not an exact unweighted binomial interval.

The initial decay policy has a 30-day no-decay grace period and 180-day half-life. The
outcome-confidence score is `round(100 × (0.65 × anyHelpLowerBound + 0.35 × fullSolveLowerBound))`;
an unobserved assessment is zero. It remains low for tiny samples, rises gradually with repeated
independent success, and falls with repeated failures. Values are rounded for display; full
calculation inputs remain stored so precision is not fabricated.

Version buckets distinguish exact normalized versions, compatible ranges where deterministic SemVer
reasoning is valid, and unknown/non-SemVer metadata. Query-time ranking prefers an applicable
bucket, falls back to ecosystem-wide evidence with an explanation, and never treats unknown as
confirmed compatibility.

## Trend, freshness, and revalidation

Assessments compare a recent 90-day window to a 365-day baseline only when the recent effective
sample size is at least 5 and the baseline effective sample size is at least 10. The initial
meaningful-decline gate requires an any-help lower-bound drop of at least 0.20 plus at least three
recent failed attempts from three independent users. Crossing that boundary:

- adds an outcome-degradation ranking penalty;
- opens or updates safety/revalidation review through a separate event;
- preserves the record and all history; and
- does not automatically archive or delete it.

Repeated compatible current-version successes update aggregate `lastSuccessfulAt` and can improve
freshness. Old successes decay and cannot keep a record universally current. Current-version
incompatibility/stale reports reduce version fit only after independent corroboration.

## Safety policy

One valid `misleading_or_unsafe` report immediately queues the KnownPath for safety review. It does
not directly apply a ranking penalty and does not automatically delist a published record.

Ranking action requires one of:

- at least two independent safety reports in 90 days;
- a verified moderation finding;
- a statistically meaningful outcome decline; or
- an explicit authorized safety decision with a persisted reason.

Independent reports or degradation can apply a bounded ranking penalty and request revalidation;
they do not change visibility. Only an explicit authorized `restricted` safety decision backed by a
verified finding may restrict published visibility. Safety review state, moderation state, lifecycle
status, outcome confidence, and retrieval ranking remain distinct fields and transitions.

## Retrieval and overall confidence integration

Search ranking policy version 2 reallocates bounded points so mature outcome evidence can exceed
seed trust while exact errors, relevance, and explicit version compatibility remain dominant. The
initial 100-point maxima are:

- exact normalized error: 20;
- lexical relevance: 15;
- semantic relevance: 12;
- ecosystem/package/platform metadata: 15;
- query-specific version fit: 10;
- deterministic source trust: 8;
- freshness: 5; and
- outcome evidence: 15.

Unobserved outcomes contribute zero and are labeled unobserved. One success cannot earn full outcome
points because its Wilson lower bound is low. Outcome penalties are separate and require the
corroboration/degradation policy. Two independent matching-version incompatibility or stale reports
may apply a bounded query-specific penalty; corroborated safety and meaningful recent degradation
may each apply a bounded policy penalty without rewriting source trust. Explicit incompatible
versions retain a hard cap regardless of semantic similarity or outcome popularity.

Search documents are regenerated when the latest outcome assessment changes; embedding input does
not include outcome values, so unchanged knowledge text reuses its existing embedding without a
provider call. Search/detail/MCP responses expose only bounded aggregates such as effective sample
size band, recent verified-success count, outcome confidence band, compatibility summary,
last-success recency, review-needed indicator, and explanations. Version/environment distributions
are exposed only when at least three independent reporters contribute to the bucket.

## Supersession

Add an explicit developer/admin command to supersede an older KnownPath with a newer canonical
alternative. It validates distinct records, compatible visibility, target lifecycle, and reason;
sets `supersededByKnownPathId`; appends canonical/safety audit history; rebuilds the search
projection; and preserves memberships, revisions, outcomes, assessments, and provenance.

Outcome processing may recommend supersession review but never chooses a replacement automatically.

## API, authorization, rate policy, and audit

Add API-key scope `knowledge:outcome`. It authorizes only outcome submission, not contribution,
review reads, or account management.

Add `POST /api/v1/outcomes` with a strict body limit and named route policy. The response is a safe
receipt containing outcome ID, reused state, accepted outcome state, influence disposition, review-
queued flag, and aggregate-recompute status. It does not return another user's data or claim that
ranking changed synchronously unless recomputation actually completed.

Audit events cover accepted, replayed, rejected, throttled, safety-review-queued,
assessment-created, and supersession actions. Audit metadata never includes the report note or
credential material.

Stable errors include `outcome_not_found`, `outcome_idempotency_conflict`,
`outcome_execution_conflict`, `outcome_rate_limited`, `outcome_note_rejected`,
`outcome_target_not_accessible`, and existing authentication/authorization/validation codes.

## MCP and Agent Skill

Register one additive write tool: `knownpath_report_outcome`. It uses the shared domain contract and
gateway for both Streamable HTTP and stdio. Its description states that selection/view is not
success, observable results must be known, notes must be minimal and non-sensitive, and `not_used`
has no reliability weight.

The skill records the selected KnownPath/search/execution identifiers locally in task context and
reports only after the task result is known. It maps observable outcomes to the seven states, asks
for no hidden reasoning, avoids private code, and never reports success merely because steps were
applied. It advertises the tool only after implementation. Contribution remains a separate consented
workflow.

## Commands

Add worker/root commands under `pnpm outcomes`:

- `inspect --outcome <uuid>`;
- `inspect-assessment --assessment <uuid>`;
- `history --known-path <uuid>`;
- `recompute --known-path <uuid> [--as-of <timestamp>] [--force]`;
- `recompute --all --limit <n> [--as-of <timestamp>]`;
- `safety-history --known-path <uuid>`; and
- `supersede --known-path <uuid> --replacement <uuid> --reason <text>`.

Commands print safe structured summaries, never individual private notes by default.

## Error handling and concurrency

Runtime schemas reject unknown fields before persistence. Duplicate-key races resolve through the
idempotency repository lookup. Aggregate recomputation reads a bounded deterministic outcome set,
creates an immutable assessment, then atomically advances the latest pointer. A newer pointer is not
replaced by an older `calculatedAt` result.

Safety-event insertion and state projection are idempotent by source outcome and policy version.
Partial failure is resumable through recompute commands; an accepted immutable raw report is not
deleted because aggregate refresh failed.

## Verification without tests

Use a dedicated Atlas verification database copied from the two existing real review KnownPaths so
production ranking/history is not polluted. Do not fabricate more canonical records or change their
lifecycle.

Verify:

1. initialize the evolved collections/indexes twice and inspect idempotency;
2. create a scoped temporary user/key through the safe closed-registration flow;
3. submit controlled states through HTTP and the official MCP SDK client;
4. repeat identical requests and confirm one immutable outcome;
5. reuse execution/idempotency IDs with changed content and confirm conflicts;
6. submit multiple reports from one account/key and confirm influence caps/anomaly signals;
7. observe Wilson bounds and ranking movement at one, several, and larger independent effective
   samples without claiming perfect certainty;
8. compare older-version and current-version outcomes and inspect compatibility/decay behavior;
9. submit one `misleading_or_unsafe` report and confirm safety review opens while rank, moderation,
   lifecycle, and visibility remain unchanged;
10. add independent corroboration or measurable degradation and confirm only then a ranking penalty
    and revalidation reason can appear;
11. exercise recomputation with a changed policy/version and confirm immutable history;
12. exercise supersession on temporary development state and restore/clean it without losing history
    required by the verification database;
13. inspect HTTP/MCP responses and logs for private fields or credentials; and
14. run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, and `git diff --check`.

No unit, integration, or end-to-end tests are added.

## Documentation and release updates

Update `docs/SCORING.md`, `docs/RETRIEVAL.md`, `docs/DATA_MODEL.md`, `docs/API.md`, `docs/MCP.md`,
`docs/AGENT_SKILL.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, relevant package READMEs,
`.env.example` only if a real new setting exists, the root README, and `progress.md`.

The canonical skill receives a minor version increment. MCP/server/installer package versions move
to the next compatible feature release, but npm publication and production deployment occur only if
explicitly requested after the Phase 15 implementation commit.

## Explicitly deferred

- team outcomes and team-owned reputation;
- public anonymous outcome submission;
- an inferred or externally purchased device identity;
- a complete Sybil-proof global reputation graph;
- Bayesian/hierarchical account reputation learned from a large corpus;
- moderation/dashboard UI and automatic safety adjudication;
- silent delisting from one unverified report;
- private/team retrieval or external private-data providers;
- distributed rate limiting, queues, and schedulers;
- outcome-driven automatic canonical merging or replacement; and
- automated tests.
