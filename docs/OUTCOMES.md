# Agent outcomes and reliability

An agent outcome records what happened after a KnownPath solution was actually attempted. Search,
view, selection, or intent to try a solution is not success.

Outcomes provide real-world reliability evidence while preserving source trust, freshness, version
fit, and safety review as separate explainable components.

## Reporting an outcome

Use:

- HTTP: `POST /api/v1/outcomes`
- MCP: `knownpath_report_outcome`

The key needs `knowledge:read` and `knowledge:outcome`. Review records additionally require an
explicit administrator review request.

Each report contains:

- `clientOutcomeId` for idempotent retry;
- `clientExecutionId` identifying one attempted task execution;
- KnownPath ID and optional solution variant;
- observed outcome;
- `attemptedAt` for attempted states;
- bounded package, platform, version, and toolchain context;
- agent-client name/version;
- optional concise non-sensitive note;
- matching public, personal, or workspace scope.

## Outcome states

| State                      | Meaning                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `solved`                   | The KnownPath materially solved the task.                      |
| `partially_helped`         | It advanced the task but did not solve it.                     |
| `attempted_failed`         | The solution was tried and failed.                             |
| `incompatible_environment` | Observed environment/version facts made it inapplicable.       |
| `stale_or_outdated`        | The record was no longer current for the observed environment. |
| `misleading_or_unsafe`     | A concrete misleading or safety concern was observed.          |
| `not_used`                 | The record was selected but not attempted.                     |

`not_used` must omit `attemptedAt` and has zero evidence weight.

## Privacy

Outcome reports do not accept source files, full logs, prompts, credentials, or hidden
chain-of-thought. Optional notes use the same normalization, secret scanning, and common PII/path
redaction as contributions. High-risk residue is rejected.

Personal and workspace outcomes aggregate only inside their authorized scope. They never modify
public aggregates or reveal a private record's existence. Public API and MCP responses expose only
privacy-thresholded aggregate reliability, never reporter identity, raw notes, individual outcomes,
or another user's environment.

## Idempotency and abuse controls

- An identical `clientOutcomeId` retry reuses the immutable record.
- Reusing that ID for different content fails.
- One account cannot submit multiple outcomes for the same KnownPath and execution.
- Only one account/KnownPath/version-bucket report per 30-day window influences confidence.
- Additional reports remain auditable but receive `duplicate_window` influence.
- Durable limits allow 10 reports per key per rolling hour and 20 per account per UTC day.
- The HTTP route also applies a 10-request/minute distributed policy.

These controls reduce accidental duplicates and simple account-level manipulation without collecting
invasive device fingerprints.

## Immutable aggregation

Each outcome is immutable. Recalculation creates or reuses a separate immutable
`known_path_outcome_assessments` record containing:

- complete input outcome IDs;
- algorithm and policy versions/digest;
- included/excluded counts;
- time weights and effective sample size;
- Wilson intervals;
- version distributions;
- trend and penalties;
- reason codes and explanations.

The KnownPath stores only `latestOutcomeAssessmentId` and the latest calculation time for fast
access. Historical assessments are never overwritten.

## Confidence calculation

Eligible solved, partially helped, and failed reports receive full weight for 30 days, then
exponential decay with a 180-day half-life. Kish effective sample size prevents decayed fractional
weights from looking like many independent observations.

The algorithm computes 95% Wilson lower bounds for:

```text
any help   = solved + partially_helped versus attempted_failed
full solve = solved versus partially_helped + attempted_failed

outcome score =
  round(100 × (0.65 × any-help lower bound + 0.35 × full-solve lower bound))
```

This score is a conservative ranking component, not a probability that a KnownPath is true. Small
perfect samples therefore do not display perfect certainty.

Below three independent reporters, clients see `limited` and effective sample size rather than
detailed aggregate distributions.

## Freshness and degradation

Trend comparison uses a recent 90-day window and the preceding portion of a 365-day baseline. A
decline requires:

- recent effective sample size of at least 5;
- baseline effective sample size of at least 10;
- Wilson lower-bound drop of at least 0.20;
- at least three failures from three independent accounts.

Qualifying degradation marks the KnownPath for revalidation and applies an explainable versioned
ranking penalty. History and provenance remain intact.

Version buckets are retained so success on an older Expo or React Native line does not imply current
compatibility.

## Safety reports

One eligible `misleading_or_unsafe` report immediately appends an immutable safety event and moves
the separate safety-review state to `review_queued`.

That single report does not:

- reduce the score;
- change evidence confidence;
- delist or unpublish the KnownPath;
- change moderation state.

A ranking penalty requires at least two independent eligible reporters within 90 days, a verified
moderation finding, or measurable outcome degradation. Only explicit safety policy/moderation can
restrict published visibility. Repeated reports from one account do not corroborate one another.

## Recompute and inspect

```sh
pnpm outcomes recompute --id <knownPathId>
pnpm outcomes recompute --limit 100
pnpm outcomes inspect --id <knownPathId>
pnpm outcomes history --id <knownPathId>
```

Recomputation is deterministic for the same inputs, policy, and calculation time and preserves prior
assessments.

## References

- [NIST binomial proportion confidence intervals](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/propconf.htm)
- [NIST Technical Note 2119](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2119.pdf)
- [Semantic Versioning](https://semver.org/)
- [OWASP API resource consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
