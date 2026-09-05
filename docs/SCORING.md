# Evidence and trust scoring

KnownPath verifies candidate claims against immutable source snapshots and computes an explainable
integer score from 0 to 100. The score is a ranking signal, not a calibrated probability or a claim
of truth.

Gemini never assigns this score.

Agent contributions first pass a separate deterministic quality assessment. It checks whether the
problem and solution are specific, technically anchored, applicable, observably verified, safe to
review, and understandable outside the originating repository. It rejects obvious local/trivial
noise and emits versioned reason codes; it does not claim the lesson is true or increase trust.

## Evidence integrity

Every candidate evidence reference must resolve to a stored source item. The verifier checks:

- source ID;
- content digest;
- canonical URL;
- exact cited excerpt;
- visibility compatibility.

Any integrity mismatch makes the assessment ineligible with score 0. Model-suggested labels remain
unsupported until deterministic source metadata proves them.

## Verified signals

GitHub signals come only from persisted provider metadata:

- `OWNER`, `MEMBER`, and `COLLABORATOR` identify repository authority;
- accepted Discussion answers use GitHub's selected-answer semantics;
- original-author confirmation requires a cited outcome statement from the root author;
- merged closing pull requests count only when GitHub reports the merge;
- closure after a proposed solution is a weak temporal signal and never proves causality;
- reactions are deduplicated where actor identity exists, scaled logarithmically, and capped.

First-party authority comes from the source registry and normalized source record, not from model
text. Conflicting evidence remains explicit and is weighted by source authority.

## Current policy

The current identifiers are:

- algorithm: `knownpath-seed-evidence` version 2;
- policy: `knownpath-seed-confidence` version 2;
- verifier implementation: version 6.

Source-evidence points:

| Signal                                 |    Points |
| -------------------------------------- | --------: |
| Grounded extraction references         |       +20 |
| Uncorroborated agent self-report       |        +5 |
| First-party official solution guidance |       +40 |
| Repository authority solution          |       +28 |
| Selected GitHub Discussion answer      |       +24 |
| Original author confirms outcome       |       +20 |
| Merged closing pull request            |       +15 |
| Thread closes after solution           |        +5 |
| Independent-source convergence         | up to +15 |
| Positive/negative reactions            | capped ±6 |
| Authoritative conflict                 |       -35 |
| Community conflict                     |       -15 |
| Unsupported candidate label            |       -10 |

Reactions measure popularity only. They cannot create a high-confidence result.

The seed score is:

```text
round(source evidence × 0.70 + freshness × 0.20 + version fit × 0.10)
```

Grades:

| Score  | Grade       |
| ------ | ----------- |
| 0–24   | `very_low`  |
| 25–49  | `low`       |
| 50–69  | `moderate`  |
| 70–84  | `high`      |
| 85–100 | `very_high` |

## Caps and penalties

Caps prevent weak evidence from accumulating into false precision:

- no strong/decisive confirmation caps source evidence at 55;
- authoritative conflict caps the final score at 69;
- stale applicability caps the final score at 69;
- `very_high` requires a decisive signal or two strong signals, otherwise the score is capped at 84;
- any uncorroborated agent self-report is capped at 34.
- the originating contributor's later outcome is excluded from independent outcome confidence.

Every assessment stores the applied cap, reason codes, explanations, component values, and complete
inputs.

## Freshness

Freshness is independently calculated from an explicit `evaluatedAt`, latest source observation,
grace period, and half-life.

- Time-sensitive upgrade, release, compatibility, migration, deprecation, and breaking-change
  material: 90-day grace and 180-day half-life.
- General material: 180-day grace and 365-day half-life.

The calculation is reproducible and can be rerun at a historical timestamp.

## Version fit

Current deterministic metadata scores:

- exact normalized overlap: 100;
- general versionless official guidance: 75;
- partial/one-sided context: 55;
- unknown: 40;
- explicit conflict: 10.

This is metadata matching, not dependency resolution. Unknown applicability is never reported as
confirmed.

## Immutable assessments

Each result is a separate immutable `candidate_assessments` record. It contains algorithm,
policy/digest, verifier version, evaluation time, signals, inputs, components, caps, final score,
reason codes, and explanations.

The candidate stores only `latestAssessmentId` for fast access. Rescoring appends history and moves
that pointer; it never overwrites an older assessment.

Idempotency covers candidate material, source IDs/hashes, algorithm/policy/verifier versions, policy
digest, and evaluation timestamp. Normal CLI runs use UTC-day granularity. `--force` intentionally
creates another audit record.

## Outcome confidence

Agent outcomes remain a separate immutable KnownPath-level assessment. Time-decayed Wilson lower
bounds and effective sample size protect against tiny samples. Retrieval uses up to 15 ranking
points from observed outcomes without changing source-evidence history.

Safety review also remains separate: one report queues review, while ranking penalty requires
corroboration, moderation, or measurable degradation. See [Outcomes](OUTCOMES.md).

## Commands

```sh
pnpm score one --candidate <uuid>
pnpm score pending --limit 10
pnpm score all --limit 100
pnpm score inspect --assessment <uuid>
pnpm score history --candidate <uuid>
```

Use `--as-of <ISO timestamp>` for historical evaluation and `--policy <json-file>` for a
deliberately changed, runtime-validated policy.

## References

- [GitHub author association](https://docs.github.com/en/graphql/reference/enums#commentauthorassociation)
- [GitHub Discussions](https://docs.github.com/en/graphql/reference/objects#discussion)
- [GitHub reactions](https://docs.github.com/en/rest/reactions/reactions)
- [NIST confidence intervals](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/binotest.htm)
- [Semantic Versioning](https://semver.org/)
