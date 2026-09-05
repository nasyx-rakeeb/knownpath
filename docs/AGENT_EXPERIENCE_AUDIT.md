# Agent-experience-first knowledge growth audit

> **Implementation status (September 5, 2026):** The minimum redesign recommended by this audit is
> implemented. The original findings below are preserved as the design record; current operational
> behavior is documented in [Contributions](CONTRIBUTIONS.md), [Agent Skill](AGENT_SKILL.md), and
> [Outcomes](OUTCOMES.md).

## Executive conclusion

KnownPath already has most of the infrastructure needed for an agent-experience-first network:
authenticated MCP writes, explicit consent, structured and sanitized contributions, tenant-aware
visibility, immutable provenance, deterministic low-trust scoring, conservative deduplication,
moderation, outcome aggregation, audit events, and durable BullMQ processing.

It is not ready to grow reliably from agent experience yet. The current Agent Skill permits an agent
to offer a contribution after observable success, but it does not require post-success reflection, a
final duplicate search, or a precise cross-project generalizability test. The backend validates
structure and privacy, not reusability. Existing-record contribution kinds are accepted by the
contract but are not routed into distinct corroboration, correction, or freshness behavior. Most
importantly, the processing pipeline attempts canonicalization before moderation and never resumes
it automatically after approval.

The minimum viable redesign should be layered:

1. The Agent Skill decides whether a verified result is worth considering and constructs a minimal
   generalized lesson.
2. Existing `knownpath_search` performs a final duplicate check before any new-lesson offer.
3. Deterministic backend rules reject structurally weak or clearly local submissions and create an
   immutable quality assessment. Gemini is not required.
4. Human moderation approves early public contributions.
5. Approval durably resumes canonicalization and produces a review-state KnownPath.
6. Independent outcomes, explicitly separated from originator validation, strengthen or weaken the
   published record over time.

No production data or configuration was changed during this audit.

## Core quality rule

> Contribute only when the problem, cause or governing condition, solution, and applicability remain
> technically meaningful to an unrelated repository after project-specific identifiers and private
> context are removed, and an observable check confirmed the result.

This rule is stricter than “the task was difficult” and more useful than a broad “could help
someone.” It admits version conflicts, build failures, migration constraints, and reusable
workarounds even when the underlying framework defect is not fully known. It rejects local typos,
business-logic decisions, private configuration values, and fixes whose meaning disappears outside
the originating repository.

## Audit scope and implementation anchors

The findings below are based on the current implementation, principally:

- `skills/knownpath/SKILL.md` and `skills/knownpath/references/examples.md`
- `packages/mcp/src/server.ts` and `packages/mcp/src/contracts.ts`
- `packages/domain/src/feedback.ts` and `packages/domain/src/knowledge.ts`
- `packages/contributions/src/service.ts`, `sanitizer.ts`, `provider.ts`, and `public-share.ts`
- `packages/pipelines/src/index.ts` and `apps/worker/src/operational.ts`
- `packages/verification/src/evidence-signals.ts`, `scoring.ts`, and `policy.ts`
- `packages/canonicalization/src/discovery.ts`, `pair-service.ts`, `profile.ts`, and `service.ts`
- `packages/outcomes/src/service.ts` and `policy.ts`
- `apps/api/src/contribution-routes.ts`, `mcp-gateway.ts`, `admin-service.ts`, and
  `admin-details.ts`
- the user and admin dashboard contribution, settings, and moderation surfaces

The production corpus was already empty at audit start. This report therefore evaluates code and
contracts, not a statistical distribution of live contributions.

## Current successful-problem-solving behavior

### What the Agent Skill currently does

The skill activates for non-trivial or unfamiliar debugging, migrations, dependency and toolchain
conflicts, build/configuration failures, environment mismatches, and version-dependent behavior. It
explicitly excludes formatting, routine edits, obvious syntax corrections, and confidently
understood work.

The current scenario behaves as follows:

| Step                  | Current behavior                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial problem       | The agent may activate the skill and search if prior experience could materially shorten investigation.                                                                                                                     |
| Empty or poor search  | The skill prefers no result over a vague or incompatible result. It does not explicitly say “continue normal debugging after zero results,” although its unavailable-tool rule does say to continue ordinary investigation. |
| Independent debugging | KnownPath imposes no restriction; the agent continues using repository evidence and normal verification.                                                                                                                    |
| Observable success    | The contribution section becomes applicable: “After the task has observably succeeded, you may offer to call `knownpath_contribute`.”                                                                                       |
| Reusability decision  | The skill asks for a “generalized” problem, environment, errors, solution, caveats, and success checks, but supplies no precise reusable-versus-local test.                                                                 |
| Consent               | The agent must obtain explicit consent for every submission and may never call the tool silently.                                                                                                                           |

The wording is permissive, not a mandatory post-success checkpoint. A compliant agent may offer a
contribution, but it is not told to reconsider KnownPath after every qualifying success. There is no
runtime event or hook that invokes the tool automatically; behavior depends on the model noticing
and following the skill.

A prior KnownPath search is not required by the contribution section. A contribution can have an
empty `consultedKnownPaths` array, so an agent can contribute after a qualifying solved task even if
it never searched. Contribution is not limited to debugging: once the skill is active, its wording
also covers migrations, deployment/build issues, version conflicts, native configuration, and
tooling behavior.

### Exact answer for the target scenario

Today the closest answer is **B, conditionally**:

- the agent may recognize a generalized lesson and offer to contribute;
- it must ask the user for consent;
- it must not contribute automatically;
- it may also do nothing because post-success reflection and the offer are optional;
- it does not perform a mandatory final duplicate search.

## Target contribution trigger

The desired trigger should be a quiet post-success decision gate, not a prompt after every edit.

An agent should consider contribution only when all of these are true:

1. **Observed success:** a build, test, reproduction, runtime check, deployment check, or other
   concrete task-specific verification passed.
2. **Specific technical lesson:** the submission identifies a stable symptom or error, a cause or
   governing compatibility/configuration condition, and an actionable solution.
3. **Non-trivial discovery:** the result required investigation beyond an obvious syntax, typo,
   local import, or routine documented operation.
4. **Cross-project meaning:** the core lesson survives removal of repository names, local paths,
   variable names, organization names, private package names, and business context.
5. **Clear applicability:** at least one useful ecosystem, package/framework/toolchain, platform, or
   version boundary explains where the lesson applies.
6. **Privacy-minimizable:** the lesson can be stated without repository artifacts or proprietary
   context.
7. **No adequate existing record:** a final generalized search does not find a KnownPath that
   already captures the same problem, solution, and applicability.

Search should normally happen before substantial rediscovery for the existing activation cases. It
should also be mandatory immediately before offering any **new lesson**, using the intended public,
personal, or workspace search scope. The final search uses the generalized signature, not raw
repository text. This adds one read request but substantially reduces duplicate moderation and
storage. It should be skipped only when search is unavailable; in that case the contribution can be
submitted with an explicit `duplicate_check` state of `unavailable`, leaving backend review to
resolve it.

When the final search finds an existing record:

- if that record was retrieved and materially used, report the observed outcome;
- if the agent independently discovered the same solution, offer privacy-safe corroborating evidence
  rather than claiming the KnownPath caused the success;
- if the result adds a version boundary, caveat, alternative, correction, or contradiction, target
  the existing record with the corresponding contribution relationship;
- create a new lesson only when the generalized problem/solution is materially novel.

## Generalizability audit and recommended model

### What exists

The skill excludes several trivial search cases and asks for generalized content. The API requires
an ecosystem, at least one symptom, a solution, at least one step, and success evidence. The
sanitizer rejects excessive source-like content and redacts secrets, emails, credential-bearing
URLs, and home paths. Canonicalization normalizes technical text, error identifiers, package names,
platforms, and versions.

None of these mechanisms classifies a contribution as reusable across unrelated repositories. A
payload can currently satisfy the schema with a meaningless ecosystem string, no packages,
platforms, or versions, a local symptom, a generic solution, and a free-form success check.

### Approaches considered

1. **Skill-only judgment:** lowest backend cost and best access to task context, but inconsistent
   across models and easy for malicious repository instructions or weak agents to bypass.
2. **Mandatory model classifier:** flexible language judgment, but creates quota, availability,
   privacy, reproducibility, and poisoning concerns. It would incorrectly make Gemini a dependency
   of the core loop.
3. **Layered agent + deterministic backend + moderation:** recommended. The agent applies the
   semantic cross-project test; the backend verifies minimum technical anchors and privacy; humans
   decide ambiguous early public submissions. Optional models may assist review but never determine
   trust or publication.

### Skill-level test

Before asking for consent, the agent should answer internally, without exposing chain-of-thought:

> If all repository-specific names, paths, private values, and business context were removed, would
> an unrelated developer still recognize the problem, know when the solution applies, and be able to
> verify it?

If no, do not suggest contribution. The skill should include a compact exclusion list covering
syntax/typos, local imports and paths, private values, one-off UI changes, and repository-specific
business logic.

### Deterministic backend gate

Deterministic checks should not pretend to understand semantics fully. They should reject or route
to review only clear structural failures:

- no stable technical anchor: ecosystem plus at least one package/framework, platform, toolchain,
  version, or normalized error identifier;
- no concrete symptom or reproducible behavior;
- no observable verification check;
- problem/solution dominated by local paths, filenames, identifiers, URLs, or redaction markers;
- an empty or generic applicability statement;
- triviality reason codes matched with high confidence, such as a bare syntax punctuation fix or a
  misspelled local import with no ecosystem-level cause;
- solution text that is only generic advice such as “update dependencies,” “clear cache,” or “check
  configuration” without a specific condition and verification;
- excessive overlap with a known project-specific/noise vocabulary after normalization.

The result should be an immutable, versioned `contribution_quality_assessment` containing inputs,
reason codes, and one of `eligible`, `review`, or `rejected`. Borderline cases belong in review;
deterministic rules should not over-reject uncommon but useful lessons.

### Model-based assistance

Gemini should not be required for ordinary agent submissions. The coding agent has already produced
the generalized structured lesson. Optional AI can later summarize a verbose **public** submission,
assist a moderator, or retrieve targeted public corroboration. Private/team use remains blocked
unless an explicitly approved private-data provider is configured. Provider failure must leave the
deterministic contribution path usable.

## Contribution schema audit

### Existing request fields

| Needed concept               | Current representation                                            | Assessment                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Problem                      | `payload.problem`                                                 | Present and required.                                                                                                    |
| Symptoms                     | `payload.symptoms[]`                                              | Present; at least one required.                                                                                          |
| Error signature              | `payload.errors[]`                                                | Present and normalized into fingerprints; optional.                                                                      |
| Ecosystem                    | `payload.ecosystem`                                               | Present and required, but only syntactically validated.                                                                  |
| Packages                     | `payload.packages[]` with ecosystem/name/version                  | Present and useful; optional.                                                                                            |
| Versions                     | package versions plus `payload.versions[]`                        | Present, but duplicated/free-form.                                                                                       |
| Platform/environment         | `platforms[]`, `toolchain[]`                                      | Partially present; runtime, OS, architecture, framework, and build mode are not structured in the contribution contract. |
| Root cause                   | None in the contribution payload                                  | Missing. The candidate domain supports an optional evidenced `rootCause`, but the contribution projector never sets it.  |
| Solution                     | `solutionSummary`, ordered `steps[]`                              | Present and required.                                                                                                    |
| Verification                 | `successEvidence.summary/checks[]` and optional step verification | Present, but verification type/result is unstructured.                                                                   |
| Applicability                | Implied by ecosystem/packages/platforms/versions                  | Missing an explicit “applies when” statement.                                                                            |
| Exclusions                   | `caveats[]`                                                       | Partial; caveats do not clearly distinguish non-applicable environments.                                                 |
| Existing-record relationship | `kind` and optional `knownPathId`                                 | Contract exists, but service behavior does not route kinds differently.                                                  |
| Prior search/use             | `consultedKnownPaths[]` with `consulted` or `materially_applied`  | Partial; no search ID, duplicate-check result, or independent-discovery distinction.                                     |
| Agent/client                 | `agentClient`                                                     | Present.                                                                                                                 |
| Consent/visibility           | `consent`, `visibility`, optional `workspaceId`                   | Present and correctly server-enforced.                                                                                   |

### Minimal schema adjustments

Keep the payload compact. Add:

- optional `rootCause` with a short statement and an `observed`/`suspected` certainty; a known cause
  should be strongly preferred, but workarounds for verified external defects must remain possible;
- required `applicability.appliesWhen` and optional bounded `doesNotApplyWhen[]`;
- `verification` with a small type enum such as build, test, reproduction, runtime, deployment, or
  other, plus the current summary/checks;
- a small `discovery` object containing final-search state, optional `searchId`, and relationship:
  novel, independently-corroborates, extends, corrects, or contradicts;
- structured runtime/framework/OS/build-environment fields only where they improve matching. Do not
  require every field.

Retain existing problem, symptoms, errors, package, platform, versions, solution, steps, caveats,
consent, client IDs, and idempotency fields. Do not add repository names, file dumps, conversation
summaries, or arbitrary environment maps.

## Provenance and evidence

### What exists

The current persisted contribution records:

- source type through an `agent_contribution` source registry/item;
- internal contributor user and optional API-key identity;
- agent client name/version and channel;
- sanitized content digest and HMAC digest of the original request;
- explicit consent intent, user, visibility, and timestamp;
- immutable source item with content digest;
- self-reported observable success summary/checks;
- created/captured/projected timestamps;
- optional consulted KnownPath IDs and influence labels.

It does not retain the unsanitized request, hidden reasoning, repository content, or a repository
identifier. That boundary should remain.

### Missing minimum provenance

Add only privacy-safe facts needed to interpret the evidence:

- verification type and time;
- whether the fix was actually applied in the originating task;
- final duplicate-search state and optional search event ID;
- whether a target KnownPath was previously used, independently rediscovered, extended, corrected,
  or contradicted;
- an immutable quality-assessment ID and policy version;
- the contribution origin on canonical membership so later outcome aggregation can identify the
  originator without exposing them publicly.

No raw transcript, prompt, repository URL, branch, filename inventory, diff, or source file is
needed.

## Originator validation versus independent outcomes

The current evidence scorer correctly creates a weak `agent_self_report` signal worth five source
points and caps any candidate containing it at 34/100. That is the right initial direction.

Outcome aggregation is separate and conservative: reports are immutable, `not_used` has zero weight,
one account/version bucket can influence a KnownPath once per 30 days, time decay is applied, and
confidence uses Wilson lower bounds and effective sample size.

There is one important gap: the outcome service labels any first eligible account/version-window
report as `independent_account_window`. It does not compare the reporter with the contributor(s)
behind the canonical membership. After publication, the originator could submit a solved outcome and
receive independent outcome weight.

Recommended hierarchy:

1. **Originator validation:** stored as the contribution's observed-success evidence; weak,
   auditable, and subject to the current low cap.
2. **Originator later report:** allowed for history and compatibility notes but marked
   `originator_non_independent` and excluded from independent confidence.
3. **Independent attempted outcome:** a different user actually retrieved/applied the KnownPath;
   eligible under existing account/version-window controls.
4. **Multiple independent outcomes:** confidence grows through the existing conservative Wilson and
   decay model.

Eligibility should resolve contributor user IDs through active and historical canonical memberships.
API-key rotation must not turn the same account into an independent reporter.

## Duplicate and existing-KnownPath handling

### What exists

Canonicalization already has good foundations:

- deterministic blocking occurs before pair comparison;
- exact normalized errors, error codes/classes, problem/solution fingerprints, package overlap,
  ecosystem, platform, version, and root-cause compatibility influence decisions;
- embeddings are optional and only strengthen review priority;
- semantic similarity cannot authorize an automatic merge;
- visibility and tenant ownership must match;
- merge/split/reassign history is immutable and reversible.

### Gaps

- The skill performs no required final duplicate search.
- Submission does not return a pre-canonicalization “likely existing record” disposition.
- `new_lesson`, `additional_evidence`, `correction`, and `freshness_update` all project through the
  same candidate path.
- Although non-new contributions require `knownPathId`, the service does not use it to select a
  canonical target, membership disposition, or rebuild behavior.
- `consultedKnownPaths` is stored but not used by scoring/canonicalization routing.
- A deterministic pair marked `review` does not hold the new candidate for a duplicate decision; the
  operational canonicalizer creates a separate KnownPath unless it sees an `auto_merge` pair.
- Only the first `auto_merge` pair is selected by the operational path, which is sufficient for a
  conservative initial merge but not a complete multi-record cluster decision.

### Recommended routing

| Final-search relationship                 | Backend behavior                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing record was materially used       | Report an outcome; do not create a lesson contribution unless there is a distinct extension/correction.                                                           |
| Same solution independently discovered    | Submit `additional_evidence` with target KnownPath and originator verification; attach a corroborating candidate/membership without claiming retrieval causality. |
| Version/platform extension or alternative | Create a targeted variant/applicability candidate and require duplicate review.                                                                                   |
| Contradiction or unsafe caveat            | Create a targeted conflicting/correction candidate and queue moderation.                                                                                          |
| No adequate match                         | Create a new-lesson candidate.                                                                                                                                    |

The current six-tool MCP surface can support this with a strengthened contribution contract and
backend routing. A separate similarity tool is not required for the minimum launch because
`knownpath_search` already performs the agent-side final check and backend canonicalization remains
authoritative.

## Consent experience

The current security invariant is correct: every submission requires explicit consent, account mode
defaults to `ask`, `disabled` rejects submissions, and silent public contribution does not exist.

The skill should ask only after the trigger and duplicate gates pass. Before asking, it should show
a concise preview:

- generalized problem and solution;
- applicability and verification;
- excluded private/project-specific material;
- intended visibility;
- whether the lesson is new, corroborating, extending, or correcting an existing KnownPath.

A suitable prompt is:

> I verified a reusable technical lesson that may help other KnownPath users. The preview contains
> only generalized technical details—no repository code, prompts, or secrets. Contribute it as
> public/private/workspace knowledge?

Recommended defaults:

- account setting `ask` remains default;
- `disabled` means do not suggest or submit;
- no “always publish” mode;
- public, private, or workspace scope is explicit for each submission;
- the user sees the exact generalized preview before consent;
- declining ends the flow without repeated prompting during the same task.

The current setting is only `ask` or `disabled`; it does not distinguish “allow but never suggest.”
That extra preference is useful but not required for the minimum launch because `disabled` already
provides a clear opt-out.

## Contribution state machine

### Current lifecycle

```text
API/MCP request
  -> validate scope and consent
  -> sanitize or quarantine/reject
  -> store pending contribution
  -> enqueue contribution.process
  -> create agent-contribution source item
  -> create pending candidate
  -> create deterministic assessment (self-report cap 34)
  -> create similarity profile and pair assessments
  -> mark contribution processing complete
  -> chain candidate.score
  -> chain candidate.canonicalize
  -> canonicalization rejects because contribution is pending/unreviewed
  -> failed/quarantined pipeline step
  -> admin approves contribution
  -> contribution becomes accepted/approved, but no canonicalization job is enqueued
```

### Confirmed canonicalization-resume defect

`packages/pipelines/src/index.ts` unconditionally chains `contribution.process` to
`candidate.score`, then to `candidate.canonicalize`. `CanonicalRecordService.mergeCandidates`
requires an agent contribution to be `accepted` and moderation `approved`, so the first attempt
fails by design. `AdminService.moderate` updates contribution moderation/status but does not enqueue
or redispatch canonicalization. Meanwhile, `ContributionService.process` has already marked its own
processing stage `complete`, so retrying contribution processing is a no-op.

The result is an approved contribution with a scored/profiled candidate but no automatic route to a
review KnownPath. An operator must manually retry or enqueue canonicalization.

### Desired lifecycle

```text
submitted
  -> sanitized | rejected | quarantined
  -> quality_assessed
  -> duplicate_checked
  -> candidate_ready
  -> awaiting_moderation
  -> approved | rejected | quarantined
  -> canonicalization_pending
  -> canonicalized
  -> review KnownPath
  -> separately published | rejected | returned for revision
```

The first pipeline must stop successfully at `awaiting_moderation`; a deliberate gate is not a
failed job. Approval should create a durable, idempotent `candidate.canonicalize` intent. A
reconciler should find accepted/approved contributions with a candidate but no active membership and
enqueue the same deterministic intent, closing the crash window between moderation and queue
dispatch.

State transitions should use compare-and-set expectations. Rejection/quarantine should mark the
candidate consistently and prevent later canonicalization. Resubmission should create a new
revision/submission identity or use an explicit replacement relationship; it must never overwrite
the immutable sanitized original. Retry keys should include contribution/candidate ID and the
moderation decision version so retries deduplicate while a later re-approval can progress.

## Publication strategy

For the initial contribution-first launch, keep publication manual:

1. a contribution passes privacy and quality gates;
2. a moderator approves it;
3. canonicalization produces a review KnownPath;
4. a moderator separately previews and publishes the KnownPath.

This preserves the distinction between accepting evidence and publishing network guidance. It also
provides real data needed to calibrate quality rules.

Automatic promotion should wait until KnownPath has enough observed data to define a versioned
policy. A later policy may require an approved contribution, multiple independent eligible outcomes,
a conservative confidence lower bound, no unresolved contradiction or safety state, and current
applicability. This audit intentionally does not select numeric thresholds without a live
distribution.

## Moderation and dashboard audit

### Existing strengths

- server-side admin authorization, fresh-session enforcement, exact confirmation, and audit events;
- paginated resources with status/search filters;
- public contribution problem/solution/ecosystem preview;
- candidate assessment explanations and KnownPath trust components;
- reversible merge/split/reassign primitives;
- private contribution content hidden by default and revealable only in sanitized form with a reason
  and fresh authentication;
- user contribution history exposes status, sanitization, processing stage, and trust state.

### Genuine scaling gaps

- Contribution detail omits structured steps, applicability, verification checks, duplicate pair
  results, quality reasons, candidate link, and resulting KnownPath state.
- Approve/reject lives in a generic controls form that requires manually copying an ID and expected
  status; there are no inline actions on the contribution detail page.
- Lists cannot sort by quality/trust, source type, duplicate risk, or age beyond repository default
  ordering.
- There is no filter for “approved but canonicalization missing” or other state-machine stalls.
- Similar candidate/KnownPath matches and proposed disposition are not presented together.
- There is no end-to-end preview of the exact public canonical content before publication.
- There are no bounded bulk actions. Bulk publication is not required initially, but batch triage
  will matter after volume grows.

Minimum UI work should add one review page joining the sanitized contribution, quality assessment,
candidate assessment, similar records, proposed relationship, processing state, and inline
approve/reject action. Bulk moderation can wait.

## MCP surface audit

The six tools remain sufficient for the minimum model:

- `knownpath_search`: initial retrieval and final generalized duplicate search;
- `knownpath_get`: evidence/applicability review before using an existing record;
- `knownpath_alternatives`: solution variants on a selected record;
- `knownpath_status`: capability and workspace diagnostics;
- `knownpath_contribute`: new, corroborating, extending, correcting, or conflicting experience;
- `knownpath_report_outcome`: only when a KnownPath was actually attempted.

Required changes are contract semantics, not tool proliferation:

- enrich `knownpath_contribute` with applicability, verification type, optional root cause, and
  duplicate/discovery relationship;
- make existing-record contribution kinds actually route to the target KnownPath;
- return a compact processing/duplicate disposition in the receipt;
- correct the current tool description saying team visibility is unsupported—the schema, backend,
  and documentation currently support authorized team contributions;
- keep contribution preview agent-side before consent rather than add another remote tool.

No tool should combine contribution with outcome reporting. Independently rediscovering an existing
solution is corroboration, not proof that retrieval helped.

## Agent Skill changes

The skill should remain concise and add one bounded post-success flow:

1. **Search activation:** retain current non-trivial categories and exclusions.
2. **No-result behavior:** explicitly continue normal repository investigation; KnownPath absence is
   not a failure.
3. **Post-success reflection:** after observable success, ask internally whether the core quality
   rule holds.
4. **Generalizability gate:** exclude local/trivial/project-specific lessons and do not prompt.
5. **Generalized duplicate check:** search once using the minimized problem/error/applicability
   signature.
6. **Existing match:** report an outcome only if the KnownPath was actually used; otherwise offer a
   targeted corroboration/extension/correction when material.
7. **Contribution preview:** show the exact compact lesson and scope.
8. **Explicit consent:** call `knownpath_contribute` only after approval.
9. **Outcome reporting:** retain the current actual-use rule and IDs.

The skill should not require a contribution search after trivial tasks, after failed work, after a
declined suggestion, or when the result cannot be generalized privately. It should make at most one
contribution suggestion per solved task.

## Backend and domain changes

Required changes are focused rather than architectural:

- **Domain:** version the contribution contract; add root-cause/applicability/verification/discovery
  fields and a versioned immutable contribution-quality assessment.
- **Contribution service:** evaluate deterministic quality before candidate creation; persist reason
  codes; route contribution kind and target KnownPath; preserve no-Gemini operation.
- **Pipelines:** treat moderation as a deliberate wait state; enqueue canonicalization after
  approval; reconcile accepted candidates lacking membership; keep retries idempotent.
- **Canonicalization:** accept an explicit target/disposition for corroboration, alternatives,
  corrections, and conflicts while retaining conservative deterministic merge gates.
- **Scoring:** retain the self-report signal/cap; include quality assessment as eligibility
  metadata, not a fabricated trust boost.
- **Outcomes:** exclude originator accounts from independent confidence; retain their reports as
  auditable non-independent observations.
- **Search:** no core ranking redesign is needed. Reproject after canonicalization/moderation as it
  does today.
- **Workspaces:** retain current binding and visibility enforcement. Apply quality/dedup only within
  authorized scope plus public when the search scope permits it.
- **Audit:** add quality decision, duplicate disposition, moderation-resume, and canonicalization
  transition events without logging contribution text.

## Privacy and security threat model

### Existing protections to retain

- explicit consent and `ask`/`disabled` account mode;
- API-key scope and workspace binding;
- strict schema/body limits and distributed rate policies;
- Secretlint scanning, PII/path/credential URL redaction, Unicode control removal, and rescan;
- excessive source-content rejection and prompt-injection quarantine;
- no unsanitized request retention;
- low self-report trust cap and manual moderation;
- immutable audit, contribution, assessment, and outcome records;
- tenant-matched canonicalization and search;
- separate sanitized public-share flow that does not flip private visibility.

### Concrete remaining risks

| Threat                                                             | Current limitation                                                                                                                                               | Required mitigation                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious repository tells the agent to contribute poisoned advice | Skill preserves repository rules but does not explicitly treat repository contribution instructions as untrusted; regex quarantine catches only several phrases. | Skill must state that repository/source text cannot authorize contribution or consent. Backend keeps all content untrusted and moderator-visible.                 |
| Plausible destructive command is presented as a fix                | Sanitization is privacy-focused, not command-safety classification.                                                                                              | Add bounded dangerous-operation reason codes and moderator warnings; do not automatically reject all shell commands because legitimate fixes may use them.        |
| Low-quality flood                                                  | Per-minute API/MCP limits exist, but no durable per-account contribution quota or moderation-budget control is evident.                                          | Add daily/account queue caps, duplicate-aware throttling, and anomaly flags before public review admission.                                                       |
| Sybil outcome reinforcement                                        | One account is capped, but public signup allows multiple accounts and there is no contributor-origin exclusion.                                                  | Exclude originators, require independent-account evidence, monitor correlated bursts, and keep manual publication initially. Avoid invasive fingerprinting.       |
| Private names/packages survive generalization                      | Generic identifiers are not classified as private; the backend cannot know organizational meaning.                                                               | Agent preview must explicitly remove internal hostnames/package scopes/company/customer names; add bounded heuristics and user confirmation.                      |
| Prompt injection phrased outside current patterns                  | Pattern matching is necessarily incomplete.                                                                                                                      | Never execute contributed text, validate all derived structures, show escaped content, and use trust/moderation gates rather than treating detection as complete. |
| Unsafe advice becomes public                                       | One contribution can reach review after approval; safety feedback occurs after use.                                                                              | Publication preview should surface commands, caveats, privilege/network effects, and unresolved contradictions.                                                   |

Project files should never be part of the ordinary contribution payload. If future evidence upload
is ever added, it requires a separate threat model, storage policy, and consent model; it is not
needed for this launch.

## Public, private, and workspace behavior

The shared visibility model is structurally suitable:

- public contributions are consented submissions for review and possible publication;
- private contributions are owner-scoped;
- team contributions require an active key bound to the same workspace;
- canonicalization requires identical visibility/ownership;
- public sharing from private/team knowledge creates a separate sanitized public contribution and
  leaves the source record unchanged.

Ordinary contribution processing currently uses no Gemini generalizer. That is ideal for private
repositories. If optional providers are enabled later, existing `public_only` versus
`approved_private` capability checks must remain mandatory.

The redesign should not infer that a lesson from a private task is private forever or safe to make
public. The user chooses a separately previewed scope. A public version must contain only newly
generalized content and never inherit private source text, embeddings, outcomes, or identifiers.

## Public-source pipeline's future role

Keep GitHub and official-document ingestion available but operator-initiated. Its appropriate roles
are:

- targeted corroboration for a submitted agent lesson;
- curated bootstrap for a clearly defined ecosystem gap;
- version/deprecation refresh for an existing KnownPath;
- investigation of contradictions or safety concerns;
- manually initiated research and evidence enrichment.

It should not be a prerequisite for accepting or canonicalizing an ordinary agent contribution.
Documentation should present agent experience as the primary growth loop and source ingestion as an
optional evidence subsystem. The broad-source schedule gate should remain disabled by default for
the hosted deployment.

## Gemini's future role

Gemini is not needed for the core loop. The agent already provides structured generalized content,
and deterministic code must remain responsible for validation, evidence classification, scoring,
deduplication gates, and state transitions.

High-value optional uses are:

- targeted extraction from public evidence selected by an operator;
- public-only moderation assistance with strictly validated output;
- public semantic embeddings for duplicate review and retrieval;
- optional rewriting of a verbose public submission while retaining the original sanitized
  structured fields.

Quota exhaustion should degrade semantic enrichment, not contribution acceptance, moderation,
canonicalization, exact/lexical search, or outcome reporting. Private/team content remains blocked
from unpaid/public Gemini.

## Empty-network behavior

The current MCP search contract already returns a successful response with an empty `results` array,
and the skill prefers no result over a weak match. The skill should make the next step explicit:

```text
no useful result
  -> say briefly that shared experience did not resolve the problem
  -> continue normal investigation
  -> verify any independently discovered fix
  -> run the post-success generalizability gate
```

The agent must not stop, repeatedly query with superficial variations, or imply KnownPath failure is
the task result. The empty state is the beginning of potential learning, not an error.

## Product metrics

Existing privacy-bounded telemetry already records search request/result class, MCP tool outcomes,
contribution status/visibility, and outcome class without query text or user IDs in metric labels.
Retain that policy and add only low-cardinality aggregates:

| Metric                                                                    | Purpose                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Search empty/non-empty and selected-result counts                         | Identify knowledge gaps and retrieval usefulness without storing query text in telemetry.   |
| Post-success reflection eligible/ineligible counts                        | Measure how often agents identify a reusable lesson; record reason class, not task content. |
| Contribution suggestions and consent accepted/declined                    | Measure UX quality and prompt fatigue.                                                      |
| Quality eligible/review/rejected by bounded reason code                   | Tune deterministic gates.                                                                   |
| Final duplicate checks and duplicates avoided                             | Measure corpus cleanliness.                                                                 |
| Contributions submitted, moderated, canonicalized, stalled, and published | Measure funnel health.                                                                      |
| Time in moderation and approval-to-canonicalization latency               | Detect the current class of pipeline defect.                                                |
| Independent versus originator outcome counts                              | Protect confidence semantics.                                                               |
| Solved/partial/failed/incompatible/stale/safety outcome classes           | Measure real-world usefulness and risk.                                                     |

Do not place queries, contribution text, user/workspace IDs, repository identifiers, package names,
or errors in OpenTelemetry labels. Detailed operational records remain authorized MongoDB product
state, not telemetry dimensions.

## Product positioning and documentation impact

After implementation, the core description should become:

> KnownPath lets coding agents share reusable solutions learned from real, successfully verified
> development work.

“What one agent learns, every agent can use” remains an accurate short tagline, provided the docs
explain consent, moderation, and evidence rather than implying automatic trust.

The implementation task should update `README.md`, the CLI package README, and at least
`ARCHITECTURE.md`, `AGENT_SKILL.md`, `MCP.md`, `CONTRIBUTIONS.md`, `OUTCOMES.md`, `SCORING.md`,
`CANONICALIZATION.md`, `INGESTION.md`, `AI_EXTRACTION.md`, `PRIVACY.md`, `SECURITY_ARCHITECTURE.md`,
`DASHBOARD.md`, and `ADMIN_OPERATIONS.md`. This audit does not rewrite those documents.

## Minimum viable redesign

### Required before contribution-first launch

1. Fix the moderation-to-canonicalization state transition and reconciliation path.
2. Add the concise post-success quality rule, explicit empty-result continuation, final duplicate
   search, one-off preview, and consent behavior to the Agent Skill.
3. Version the contribution schema with explicit applicability, verification type, optional root
   cause, and discovery/relationship provenance.
4. Add a deterministic, immutable generalizability/quality assessment and enforce it before public
   moderation admission.
5. Route new lessons versus existing-record corroboration, variants, corrections, and conflicts.
6. Exclude the originating contributor account from independent outcome confidence.
7. Make admin contribution review show the complete sanitized lesson, quality decision, duplicate
   context, processing state, and inline moderated action.
8. Correct the MCP team-visibility description and align all tool/skill contract versions.

### Important soon

- durable per-account daily contribution limits and moderation backlog controls;
- dangerous-command warnings and structured safety review context;
- user-visible contribution revision/resubmission after rejection;
- targeted public-source corroboration from the review workflow;
- bounded triage filters and sorting by quality, duplicate risk, and age;
- expanded privacy heuristics for internal package scopes, hostnames, and organization/customer
  names;
- product funnel metrics described above.

### Later, after meaningful volume

- calibrated automatic publication using observed independent-outcome distributions;
- moderator-assisted public-only AI summaries;
- bulk moderation with reversible batch previews;
- contributor reputation or coordinated-abuse analysis that does not require invasive identity
  tracking;
- more advanced variant/contradiction clustering and private-approved embedding providers;
- evidence uploads or repository integrations, only if a separate privacy case justifies them.

## Ordered implementation workstreams

### 1. Correct the contribution state machine

- **Files/modules:** `packages/domain/src/feedback.ts`, `packages/contributions/src/service.ts`,
  `packages/pipelines/src/index.ts`, `packages/jobs`, `apps/worker/src/operational.ts`,
  `apps/api/src/admin-service.ts`, database repositories/index initialization.
- **Change:** stop successfully at moderation; approval creates an idempotent canonicalization
  intent; reconciliation repairs accepted contributions without membership.
- **Risk:** duplicate canonical records or impossible mixed states under concurrent
  moderation/retry.
- **Dependencies:** existing Mongo idempotency keys, BullMQ producer, canonical service.
- **Verification:** one contribution can be retried at every boundary; approval exactly once
  produces one review KnownPath and one active membership; rejection never canonicalizes.

### 2. Tighten Agent Skill behavior

- **Files/modules:** `skills/knownpath/SKILL.md`, examples, bundled installer skill metadata/docs.
- **Change:** explicit empty-result continuation, post-success reflection, core quality rule, final
  generalized search, existing-match routing, preview, and one consent prompt.
- **Risk:** excessive tool calls or annoying prompts.
- **Dependencies:** existing search/contribute/outcome tools.
- **Verification:** Codex and OpenCode scenarios cover trivial exclusion, novel reusable fix,
  existing used match, independent corroboration, failed task, and declined consent.

### 3. Version contribution quality and provenance

- **Files/modules:** domain feedback/knowledge schemas, MCP contracts, contribution service, MongoDB
  validators/indexes, API examples.
- **Change:** add minimal applicability, verification, optional cause, discovery relationship, and
  immutable quality assessment.
- **Risk:** contract incompatibility with installed clients.
- **Dependencies:** schema versioning and backward-compatible MCP/API parsing strategy.
- **Verification:** old requests remain readable or fail with a clear version error; local/trivial
  samples receive stable reason codes; valid cross-project lessons remain eligible without Gemini.

### 4. Route duplicates and existing-record evidence

- **Files/modules:** contribution projector, canonicalization discovery/service, repositories,
  moderation detail projections.
- **Change:** make `kind` and `knownPathId` meaningful; distinguish outcome, corroboration, variant,
  correction, conflict, and novel candidate paths.
- **Risk:** attaching evidence to the wrong canonical identity.
- **Dependencies:** workstreams 1 and 3; tenant-equal visibility checks.
- **Verification:** exact existing solutions do not create duplicate KnownPaths; partial matches
  stay reviewable; cross-tenant candidates never compare or attach.

### 5. Separate originator and independent outcomes

- **Files/modules:** outcome service/policy/domain assessment, canonical membership provenance,
  search projection explanations.
- **Change:** mark originator reports non-independent and exclude them from public outcome
  confidence while retaining audit/history.
- **Risk:** incorrectly excluding legitimate independent users on multi-author records.
- **Dependencies:** reliable contribution-to-membership origin mapping.
- **Verification:** contributor solved report has zero independent weight; another account's actual
  attempt is eligible; key rotation does not create independence.

### 6. Make moderation operable

- **Files/modules:** admin detail contracts/service/routes, contribution resource pages and
  controls, dashboard contribution history.
- **Change:** joined review context, inline fresh-auth actions, stalled-state visibility, and public
  preview.
- **Risk:** private-content exposure or frontend-only authorization.
- **Dependencies:** new quality/state fields; existing fresh-admin confirmation.
- **Verification:** ordinary users cannot access review data; private content stays hidden by
  default; every reveal/action is server-enforced and audited.

### 7. Harden contribution abuse boundaries

- **Files/modules:** auth rate policies, contribution service, sanitizer/privacy package,
  observability, admin safety surfaces.
- **Change:** durable account quotas, anomaly reasons, repository-instruction warning, internal-name
  heuristics, and dangerous-operation moderator warnings.
- **Risk:** false positives against legitimate technical lessons.
- **Dependencies:** quality assessment reason-code model.
- **Verification:** bounded fake-secret/local-identifier/poisoning/flood samples are rejected,
  quarantined, or warned without leaking content into logs or telemetry.

### 8. Align product documentation and metrics

- **Files/modules:** public docs listed above, CLI package README, observability counters, dashboard
  aggregate endpoints where needed.
- **Change:** make agent experience the primary growth story and source ingestion optional; add
  privacy-safe funnel metrics.
- **Risk:** docs getting ahead of deployed behavior.
- **Dependencies:** completed behavior from workstreams 1–7.
- **Verification:** docs match registered tools and schemas; metrics contain no sensitive or
  high-cardinality labels.

### 9. Validate with real agents

- **Files/modules:** no special production feature; use the installed skill/MCP against a bounded
  development environment first.
- **Change:** exercise complete Codex and OpenCode flows before inviting broad usage.
- **Risk:** model-specific skill compliance differs even with identical instructions.
- **Dependencies:** all required workstreams and an isolated moderation dataset.
- **Verification:** each agent searches, continues after no result, solves, suppresses trivial
  contributions, previews a reusable lesson, obtains consent, submits once, reaches review after
  approval, and later records a genuinely independent outcome.

## Final recommendation

Do not rebuild the platform or add more MCP tools. Correct the state machine, make the existing
skill's post-success behavior precise, version the contribution quality/provenance contract, route
existing-record evidence correctly, and protect independent outcome semantics. Keep manual public
moderation while the network is empty and data is scarce. The rest of KnownPath's persistence,
tenant boundaries, retrieval, audit, queue, and privacy architecture should remain substantially as
it is.
