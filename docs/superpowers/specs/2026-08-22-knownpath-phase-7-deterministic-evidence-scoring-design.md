# KnownPath Phase 7 Deterministic Evidence and Trust Scoring Design

## Status

Approved on 2026-08-22. This document defines Phase 7 only. It does not authorize Phase 8
canonicalization, duplicate merging, retrieval, MCP knowledge tools, contribution collection, or a
dashboard.

## Goal

Turn extracted candidate interpretations into inspectable, deterministic evidence assessments.
Gemini may identify possible evidence, but only persisted source metadata and KnownPath's versioned
verification code may establish objective signals or calculate production confidence.

Phase 7 must:

- resolve every candidate evidence claim to immutable source records;
- distinguish verified metadata from model-suggested meaning;
- persist every assessment as a separate immutable, versioned record;
- keep a `latestAssessmentId` pointer on the candidate for fast access;
- expose the full signal, component, penalty, freshness, version-fit, and explanation breakdown;
- support deterministic rescoring without overwriting assessment history; and
- reserve statistically conservative outcome-confidence fields without implementing the future
  contribution/outcome workflow.

## Current repository facts

- `candidate_experiences` contains the model-derived problem, solution, evidence references,
  conflicts, candidate verification labels, and extraction provenance.
- Candidate evidence references already contain a source item ID, source content digest, canonical
  URL, relationship, and exact excerpt.
- `source_items` is immutable and contains provider facts, provenance, timestamps, content hashes,
  author identity, source authority, document/version metadata, reactions, discussion-answer state,
  issue state, and closing pull-request metadata where the adapter can obtain them.
- Phase 6 validates known source IDs and exact excerpts before creating a candidate, but candidate
  verification labels intentionally remain `unverified`.
- Confidence currently exists only on the future `KnownPath` schema. Phase 7 adds candidate
  assessment history but does not create or promote KnownPaths.
- Two real public candidates currently exist locally: an official Expo troubleshooting candidate and
  an Expo issue candidate supported by a repository-member comment.

## Research basis

Research was performed on 2026-08-22 using current primary or established technical sources:

- GitHub's GraphQL `CommentAuthorAssociation` enum distinguishes `OWNER`, `MEMBER`, `COLLABORATOR`,
  `CONTRIBUTOR`, and unaffiliated states. `CONTRIBUTOR` means prior commits and is not equivalent to
  current repository authority: <https://docs.github.com/en/graphql/reference/issues>
- GitHub Discussions exposes `answer`, `answerChosenAt`, `answerChosenBy`, `isAnswer`, and upvote
  counts as explicit API facts: <https://docs.github.com/en/graphql/reference/discussions>
- GitHub reaction APIs expose reaction kinds on issues and comments. Reactions express engagement;
  the API does not define them as correctness:
  <https://docs.github.com/en/rest/reactions?apiVersion=2026-03-10>
- GitHub GraphQL exposes pull requests that close issues plus their merged state and `mergedAt`
  timestamp: <https://docs.github.com/en/graphql/reference/pulls>
- NIST documents Wilson intervals for binomial proportions and notes their useful behavior across
  combinations of sample size and observed proportion:
  <https://itl.nist.gov/div898/handbook/prc/section2/prc241.htm>
- Semantic Versioning defines major incompatibility, minor backward-compatible additions and
  deprecations, patch fixes, pre-release instability, and deterministic precedence:
  <https://semver.org/>
- Elasticsearch's documented date-decay functions demonstrate explicit origin, scale, offset, and
  decay parameters instead of an opaque recency boost:
  <https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-function-score-query>
- OpenSSF Scorecard documents per-check criteria, risk, limitations, and explanations alongside
  aggregate scoring. It explicitly warns that undetected evidence is not definitive:
  <https://github.com/ossf/scorecard/blob/main/docs/checks.md>

## Chosen approach

Use a deterministic evidence ledger and a versioned scoring policy.

This is preferred over treating all signals as Bayesian observations because official guidance,
maintainer authorship, closure timing, reactions, and version specificity are not exchangeable
Bernoulli trials. Assigning priors to all of them would create a probability-looking number without
corresponding statistical meaning.

A grade-only rules engine is also rejected because Phase 7 requires a numeric initial confidence
that later phases can sort and threshold. The numeric result is therefore an integer evidence score,
not a probability of truth. All components remain visible and grades communicate the intended
coarseness.

## Package and dependency boundaries

Add `@knownpath/verification` as a reusable capability package.

It owns:

- source-evidence resolution;
- provider-metadata parsing at the verification boundary;
- signal verification;
- policy validation and policy digests;
- freshness/version-fit calculations;
- seed-confidence scoring;
- future outcome-confidence math contracts;
- assessment construction; and
- deterministic explanation generation.

It depends on `@knownpath/domain` and `@knownpath/database`. It does not depend on Gemini, the
GitHub client, Fastify, Next.js, or application code.

`@knownpath/database` owns assessment persistence, indexes, source batch reads, and the candidate
pointer update. `@knownpath/worker` composes the verification service and CLI. No raw MongoDB
collection escapes the database package.

Dependency direction:

```text
apps/worker --> packages/verification --> packages/domain
                         |
                         +-------------> packages/database
```

## Persistence model

### `candidate_assessments`

Every assessment is immutable. There is no general update method.

Required envelope:

- `_id`
- `schemaVersion`
- `candidateExperienceId`
- `idempotencyKey`
- `status`: `completed` or `ineligible`
- `algorithm`: identifier and positive integer version
- `policy`: identifier, positive integer version, and SHA-256 digest of the complete normalized
  policy
- `verifierVersion`
- `evaluatedAt`: the explicit reference time used by freshness calculations
- `candidateDigest`: digest of score-relevant candidate material, excluding assessment pointers and
  mutable audit projections
- `inputs`: referenced source IDs, content digests, observed/published timestamps, item types,
  authorities, and candidate claim identifiers used in the calculation
- `signals`: complete verified/rejected signal ledger
- `components`: source/evidence confidence, freshness, version applicability, and outcome confidence
- `finalScore`: integer seed-confidence score, grade, positive points, penalty points, and caps
- `reasonCodes`
- `explanations`
- immutable creation audit metadata

The record stores no duplicated source body. Provenance IDs, hashes, bounded metadata facts, and
reason codes are sufficient to reproduce the assessment against immutable sources.

### Candidate pointer

Add optional `latestAssessmentId` to `candidate_experiences` (the repository's camelCase persisted
form of the requested `latest_assessment_id` pointer). A successful assessment insert is followed by
a candidate pointer update. Existing candidates remain valid and appear as unassessed.

Assessment persistence occurs first. If pointer update fails, the immutable assessment remains valid
and a subsequent idempotent scoring command can repair the pointer. Rescoring never modifies or
deletes an earlier assessment.

### Idempotency

The assessment idempotency key covers:

- candidate ID and candidate material digest;
- ordered source IDs and content digests;
- algorithm identifier/version;
- policy identifier/version/digest;
- verifier version; and
- `evaluatedAt`.

An ordinary repeat with identical inputs reuses the existing assessment and repairs the candidate
pointer if needed. A policy change, algorithm change, source revision, candidate-material change, or
reference-time change creates a new assessment. `--force` adds an explicit nonce and is reserved for
deliberate diagnostic reruns.

### Indexes

Add named indexes:

- unique `uq_candidate_assessments_idempotency_key`;
- `ix_candidate_assessments_candidate_created_at` for immutable history;
- `ix_candidate_assessments_algorithm_policy_created_at` for rollout comparison;
- `ix_candidate_assessments_status_final_score` for eligibility/score inspection; and
- `ix_candidate_assessments_source_ids` for identifying assessments affected by a source revision.

Do not index `candidate.latestAssessmentId` initially because candidate-to-assessment access starts
from the candidate's `_id`; the pointer is already read directly from that document.

## Evidence resolution and integrity

The service collects all source IDs referenced by:

- candidate evidence;
- symptoms;
- solution steps;
- root cause;
- attempted approaches;
- conflicts; and
- candidate verification labels.

It batch-loads the source items and verifies:

- every source exists;
- the candidate's stored content digest equals the immutable source digest;
- stored canonical URLs, when present, equal source provenance;
- excerpts remain exact substrings of persisted normalized text or structured blocks;
- every nested evidence ID resolves; and
- source visibility is compatible with the candidate.

Missing, mismatched, or visibility-incompatible evidence emits integrity signals and makes the
assessment `ineligible` with final score zero. Integrity failures are not softened into a small
penalty.

Provider metadata is untrusted at the TypeScript boundary even though it was previously validated
during ingestion. `@knownpath/verification` parses only the bounded GitHub facts it needs with
strict runtime schemas. Unknown provider formats do not create GitHub signals.

## Signal model

Each signal records:

- stable signal type;
- polarity: `positive`, `negative`, or `neutral`;
- strength: `weak`, `moderate`, `strong`, or `decisive`;
- integer point effect before caps;
- verification status: `verified`, `rejected`, or `not_applicable`;
- reason code and deterministic explanation;
- candidate claim/relationship when relevant;
- source item IDs and content digests;
- provider fact paths and bounded observed values;
- source/published/observed timestamps; and
- verifier version.

### Strong deterministic signals

`official_solution_guidance`

- Candidate evidence must cite the item as `supports_solution`.
- Source authority must be `first_party_official` and its classification basis must be an official
  domain or repository.
- A model label is not required.

`maintainer_solution`

- Candidate evidence must cite a GitHub comment as `supports_solution`.
- Parsed `authorAssociation` must be `OWNER`, `MEMBER`, or `COLLABORATOR`.
- `CONTRIBUTOR` alone is not a maintainer signal.

`accepted_discussion_answer`

- The cited solution comment must have `isAnswer: true`.
- The root discussion's `answerNodeId` must match the cited comment node ID.
- Answer choice time/actor are retained when available.

`author_confirmed`

- Gemini must have proposed an `author_confirmed` candidate label.
- The cited source must also appear in candidate evidence as `verifies_outcome`.
- The cited comment author must exactly match the immutable thread-root author.
- This verifies attribution and the grounded confirmation claim; it does not infer confirmation from
  arbitrary author comments.

### Moderate and weak deterministic signals

`merged_closing_pull_request`

- Root issue metadata must contain a closing pull request with `merged: true` and `mergedAt`.
- The merge/closure sequence is retained.
- This is relevant linkage but does not prove that every candidate step is correct.

`closed_after_solution`

- Root issue/discussion must have a close timestamp after the cited solution's publication time.
- It receives only weak weight and an explanation that temporal order is not causality.

`solution_popularity`

- Count distinct reaction actors on the specific cited solution comment when actor IDs are present.
- `+1`, `heart`, `hooray`, and `rocket` are weak positive popularity signals.
- `-1` and `confused` are weak negative popularity signals.
- `laugh` and `eyes` are engagement-only and add no confidence.
- Discussion upvotes may contribute only to the same capped popularity component.
- Apply logarithmic growth and a small absolute cap so reactions cannot overpower authority,
  conflicts, or integrity.

`independent_source_convergence`

- Requires solution-supporting evidence from at least two distinct source roots or registries.
- Independence uses deterministic registry/root identities.
- The candidate already asserts that these references support its one solution; Phase 7 does not
  perform semantic candidate merging.

### Negative and rejected signals

`authoritative_conflict`

- A candidate conflict reference resolves to first-party or maintainer evidence.
- It receives a stronger penalty than a community conflict.

`community_conflict`

- A grounded community/general-public conflict receives a bounded penalty.

`unsupported_candidate_label`

- A model-suggested verification label fails its deterministic conditions.
- The signal is rejected and penalized; it never becomes verified by repetition.

`weak_confirmation`

- No official, maintainer, accepted-answer, author-confirmed, or merged-fix signal exists.
- Apply a maximum final-score cap rather than pretending absence disproves the solution.

`stale_applicability`

- Freshness/version applicability indicates that the material may no longer apply.
- This affects explicit components and may cap the final seed score.

## Versioned scoring policy v1

The policy is a strict runtime-validated data object. Its normalized digest is persisted with every
assessment. Production defaults live in a maintained source file, not scattered numeric literals.

The first policy uses integer points and caps. Exact constants remain in the policy object and are
documented in `docs/SCORING.md`; implementation must not hide them in control flow.

Recommended evidence effects:

| Signal                          | Effect                          |
| ------------------------------- | ------------------------------- |
| grounded extraction baseline    | +20                             |
| official solution guidance      | +40, decisive                   |
| maintainer solution             | +28, strong                     |
| accepted discussion answer      | +24, strong                     |
| verified author confirmation    | +20, strong                     |
| merged closing pull request     | +15, moderate                   |
| closed after cited solution     | +5, weak                        |
| independent source convergence  | up to +15, moderate             |
| solution popularity             | logarithmic, capped at +6       |
| negative popularity             | logarithmic, capped at -6       |
| authoritative conflict          | -35 each, capped                |
| community conflict              | -15 each, capped                |
| unsupported candidate label     | -10 each, capped                |
| no strong/decisive confirmation | final source score capped at 55 |

The source/evidence component is clamped to 0–100 after positive effects, penalties, and caps.

The final Phase 7 seed score is:

```text
round(
  sourceEvidenceScore * 0.70 +
  freshnessScore      * 0.20 +
  versionFitScore     * 0.10
)
```

The result is an integer and explicitly labeled `seed_evidence_score`, not a probability. Grades:

- `very_low`: 0–24
- `low`: 25–49
- `moderate`: 50–69
- `high`: 70–84
- `very_high`: 85–100

An assessment cannot reach `very_high` without at least one decisive signal or two independent
strong signals. An integrity failure forces zero/ineligible. An authoritative conflict caps the
final score at `moderate` until resolved.

## Freshness component

Freshness is calculated from an explicit `evaluatedAt` and the latest relevant supporting source
observation. The command captures its default current time once and passes it into every
calculation; callers may provide `--as-of <ISO timestamp>` for reproducibility.

Policy v1 defines source-specific grace and half-life values:

- release, upgrade, migration, breaking-change, deprecation, and explicit compatibility material:
  shorter grace/half-life;
- general troubleshooting and reference documentation: medium horizon;
- GitHub issue/discussion evidence: medium horizon;
- missing reliable timestamps: `unknown`, with a conservative score.

After the grace period, use an explicit exponential decay whose half-life is stored in the policy.
The assessment records age in whole days, grace days, half-life days, input timestamp, score,
status, and next review time. Status is `current`, `aging`, `stale`, or `unknown`.

Freshness is not truth: old guidance may remain correct. It lowers retrieval confidence and triggers
review without deleting evidence.

## Version-applicability component

Phase 7 has no query-time target version and must not invent the current ecosystem version.

Classifications:

- `explicit`: candidate and supporting source contain compatible explicit version/range metadata;
- `general`: guidance is explicitly or structurally version-independent;
- `partial`: only some affected packages/components have version information;
- `unknown`: no reliable applicability statement exists;
- `conflicting`: candidate/source version statements disagree deterministically.

Policy v1 maps these classes to visible integer component scores and reason codes. SemVer parsing is
conservative. Non-SemVer SDK/platform strings remain normalized strings rather than being coerced.
Major-version incompatibility and pre-release status are surfaced when explicit comparable values
exist. Query-specific version fit is deferred to retrieval phases.

## Outcome confidence boundary

Phase 7 does not collect or interpret agent outcomes. Every assessment stores an outcome component
with:

- status `unobserved`;
- successes `0`;
- failures `0`;
- sample size `0`; and
- no point estimate or interval.

The domain contract reserves `observed` fields for a later phase: successes, failures, sample size,
observed proportion, Wilson lower/upper bounds, method identifier/version, and calculated time. Zero
outcomes never imply 0% or 50% success.

When outcome processing is deliberately implemented later, it remains separate from seed evidence
confidence. Its growing sample size may eventually dominate ranking, but Phase 7 does not define or
activate that blend.

## CLI and service operations

Root command:

```sh
pnpm score one --candidate <uuid> [--as-of <ISO>] [--policy <path>] [--force]
pnpm score pending [--limit <n>] [--as-of <ISO>] [--policy <path>]
pnpm score all [--limit <n>] [--as-of <ISO>] [--policy <path>]
pnpm score inspect --assessment <uuid>
pnpm score history --candidate <uuid> [--limit <n>]
```

`pending` selects candidates without a latest assessment for the active algorithm/policy/material.
`all` evaluates every bounded candidate and naturally creates a new record when the policy/version
changes. Both are serial and bounded.

`--policy` loads a strict JSON policy file. It is explicit rather than environment-driven so a
production deployment cannot silently change scoring behavior. The complete policy is validated,
normalized, digested, and represented in every assessment. An invalid policy fails before database
writes.

Inspection prints the full score breakdown, reason codes, explanations, and bounded provenance. It
does not print source bodies or secrets.

## Error handling

- Missing candidate: fail with `candidate_not_found` and no writes.
- Evidence integrity failure: persist an immutable `ineligible` assessment with reason codes and
  final score zero, then update the candidate pointer.
- Unsupported provider metadata: omit provider-specific positives and record a neutral explanation;
  do not fail otherwise valid generic evidence.
- Invalid policy: fail before persistence.
- Duplicate idempotency key: reuse the assessment and repair the latest pointer.
- Assessment insert succeeds but pointer update fails: report the assessment ID and fail clearly;
  rerun repairs the pointer without rewriting history.
- Batch processing continues through candidate-local verification failures but stops on database or
  configuration failures.

## Deterministic explanations

Explanations come from stable templates keyed by reason code and verified values. Examples:

- “Official Expo documentation directly supports the proposed solution.”
- “The solution comment was authored by a repository MEMBER according to stored GitHub metadata.”
- “The issue closed after the cited solution; this is weak temporal support, not proof of
  causality.”
- “Three positive reactions were observed on the cited solution comment; reactions indicate
  popularity, not correctness.”
- “No agent outcomes have been observed, so outcome confidence is unavailable.”

No LLM call is involved in verification, scoring, or explanation generation.

## Documentation changes

- Add `docs/SCORING.md` with the exact policy, formula, signal criteria, limitations, CLI, and
  interpretation guide.
- Update `docs/DATA_MODEL.md` for `candidate_assessments`, candidate pointer, indexes, retention,
  and relationships.
- Update `docs/ARCHITECTURE.md` with the verification package/data flow.
- Append the immutable-assessment and scoring-policy decisions to `docs/DECISIONS.md`.
- Update package/root README command references where useful.
- Append the complete Phase 7 entry to `progress.md` before the final commit.

## Verification plan

No automated tests will be created.

Static verification:

- install only if dependency metadata changes;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm format:check`;
- `pnpm build`;
- `pnpm db:init` twice to confirm collection/index idempotency;
- inspect MongoDB validator and index inventory;
- scan tracked files for accidental credentials and generated artifacts.

Runtime verification:

1. Score the real official Expo documentation candidate.
2. Score the real Expo issue/maintainer candidate.
3. Inspect both immutable assessments and candidate pointers.
4. Rerun with identical policy and `evaluatedAt`; confirm the same assessment is reused.
5. Use bounded temporary candidate/source records to verify an authoritative conflict and stale
   applicability reduce confidence.
6. Create a temporary validated policy file with a new policy version/weight, rescore a candidate,
   and confirm a new immutable assessment is created while history remains readable.
7. Rescore with the default policy and restore the candidate's latest pointer to the production
   assessment.
8. Remove only temporary verification records and confirm absence.
9. Confirm real assessment history remains immutable.

## Deferred work

- semantic duplicate detection and KnownPath promotion (Phase 8);
- cross-candidate convergence discovery not already represented by one candidate's evidence;
- query-time version compatibility;
- agent contribution/outcome collection and outcome-confidence activation;
- calibration against observed usefulness data;
- search ranking, MCP presentation, dashboard controls, and human moderation workflows;
- automatic scheduling or distributed rescoring queues; and
- tests, prohibited by the Phase 7 request.

## Completion boundary

Phase 7 is complete only when deterministic assessments are persisted immutably, candidates point to
their latest assessments, real candidates have inspectable differentiated scores, stale/conflict
penalties and policy-version rescoring are observed, documentation/progress are current, the full
verification suite passes, temporary records are removed, and the Phase 7 implementation commit is
created.

Do not begin Phase 8.
