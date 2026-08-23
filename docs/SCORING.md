# Deterministic evidence and seed-confidence scoring

## Scope

Phase 7 verifies extracted candidate claims against immutable source snapshots and produces an
explainable seed-confidence assessment. It does not call Gemini, merge duplicate candidates, promote
candidates into KnownPaths, or incorporate agent outcomes. A score is an integer ranking signal from
0–100, not a calibrated probability that a solution is true.

## Evidence verification

Every referenced source ID must resolve through `@knownpath/database`. Direct evidence digests,
canonical URLs, exact excerpts, and visibility must match persisted source data. Any mismatch makes
the assessment `ineligible` with score 0. Model-suggested labels remain untrusted until the verifier
can establish them from objective metadata.

GitHub signals are derived only from captured provider metadata:

- `OWNER`, `MEMBER`, and `COLLABORATOR` identify current repository authority. `CONTRIBUTOR` is not
  treated as current authority.
- `isAnswer` verifies a selected Discussion answer.
- Original-author confirmation requires a `verifies_outcome` reference authored by the thread's
  original author. Text similarity alone is insufficient.
- A merged closing pull request is strong supporting evidence when GitHub exposes it.
- Closure after a solution is worth only five points and explicitly does not establish causality.
- Reactions/upvotes are deduplicated by actor where identities exist, logarithmically scaled, and
  capped at +6/-6. They are popularity signals, never truth.

First-party official source classification comes from deterministic registry/source metadata, not
the model. Conflicts remain explicit negative signals; authoritative conflicts carry a stronger
penalty and cap the final result below `high`.

## Version 2 algorithm and policy

The algorithm identifier is `knownpath-seed-evidence`, algorithm version 2. The bundled policy is
`knownpath-seed-confidence`, policy version 2. The verifier implementation is independently
versioned. Each assessment stores all three versions plus the complete policy digest.

Source-evidence points are additive and clamped to 0–100:

| Signal                                 |    Points | Strength             |
| -------------------------------------- | --------: | -------------------- |
| Grounded extraction references         |       +20 | moderate             |
| Uncorroborated agent self-report       |        +5 | weak                 |
| First-party official solution guidance |       +40 | decisive             |
| Repository authority solution          |       +28 | strong               |
| Selected GitHub Discussion answer      |       +24 | strong               |
| Original author confirms outcome       |       +20 | strong               |
| Merged closing pull request            |       +15 | strong               |
| Thread closes after solution           |        +5 | weak temporal signal |
| Independent-source convergence         | up to +15 | moderate             |
| Positive/negative reactions            | +6/-6 max | weak popularity      |
| Authoritative conflict                 |       -35 | strong               |
| Community conflict                     |       -15 | moderate             |
| Unsupported model-suggested label      |       -10 | moderate             |

No strong/decisive confirmation caps source evidence at 55. An authoritative conflict caps the final
score at 69. A stale applicability result also caps it at 69. A `very_high` result requires a
decisive signal or at least two strong signals; otherwise it is capped at 84. Any assessment
containing an agent self-report signal is capped at 34 until independent evidence or future observed
outcomes justify a stronger score.

The seed result is:

```text
round(source evidence × 0.70 + freshness × 0.20 + version fit × 0.10)
```

Grades are `very_low` 0–24, `low` 25–49, `moderate` 50–69, `high` 70–84, and `very_high` 85–100. The
complete component values, raw inputs, applied caps, reason codes, and explanations are stored.

## Freshness and version fit

Freshness uses an explicit `evaluatedAt`, latest source observation time, grace period, and
half-life. Time-sensitive upgrade/release/compatibility/migration/deprecation/breaking-change
material uses 90 grace days and a 180-day half-life. General material uses 180 grace days and a
365-day half-life. This makes decay reproducible and inspectable rather than dependent on hidden
wall-clock reads.

Version fit is independent: exact normalized overlap scores 100; general versionless official
guidance 75; one-sided context 55; unknown 40; explicit conflict 10. This is intentionally lexical
metadata matching, not semantic compatibility inference.

## Immutable history and idempotency

Every result is a new `candidate_assessments` document. Existing assessments are never updated. The
candidate has only a mutable `latestAssessmentId` pointer for fast access. The idempotency key
covers the candidate material digest, resolved source IDs/hashes, algorithm/policy/verifier
versions, policy digest, and evaluation timestamp. Normal CLI defaults use UTC-day evaluation
granularity so same-day unchanged reruns reuse an assessment. `--force` intentionally creates
another immutable record.

Future agent outcomes are represented as `unobserved` with zero samples. The schema reserves an
observed component containing successes, failures, sample size, observed proportion, Wilson bounds,
method version, and calculation time. Outcome evidence does not affect Phase 7 seed scores, avoiding
overconfidence from small samples.

## Commands

```sh
pnpm score one --candidate <uuid>
pnpm score pending --limit 10
pnpm score all --limit 100
pnpm score inspect --assessment <uuid>
pnpm score history --candidate <uuid>
```

Use `--as-of <ISO timestamp>` for reproducible historical evaluation. Use `--policy <path-to-json>`
to inspect a deliberately modified, runtime-validated policy. Use `--force` only when a distinct
audit record is intentional. `pending` selects candidates without a latest pointer; `all` safely
re-evaluates every selected candidate and reuses exact matches.

## References

- [GitHub GraphQL `CommentAuthorAssociation`](https://docs.github.com/en/graphql/reference/enums#commentauthorassociation)
- [GitHub Discussions GraphQL objects](https://docs.github.com/en/graphql/reference/objects#discussion)
- [GitHub reactions REST API](https://docs.github.com/en/rest/reactions/reactions)
- [NIST confidence intervals and Wilson method](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/binotest.htm)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Elasticsearch date-decay functions](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-function-score-query.html#function-decay)
- [OpenSSF Scorecard checks](https://scorecard.dev/)
