# Verified outcomes and reliability

Phase 15 records what happened after an agent actually attempted a KnownPath solution. A search,
view, selection, or self-asserted plan is not success. Outcomes are private operational evidence;
only privacy-thresholded aggregates appear in knowledge responses.

## Contract and authorization

Submit through `POST /api/v1/outcomes` or MCP tool `knownpath_report_outcome`. Both use the same
version 1 contract and `@knownpath/outcomes` service. The API key must include both `knowledge:read`
and `knowledge:outcome` for MCP use. Reporting against a review record additionally requires
`includeReview: true` and an administrator-owned key; ordinary clients can report only against
accessible published records.

Each attempted report includes a client-generated `clientOutcomeId`, one `clientExecutionId`, the
KnownPath ID, observed environment/version metadata, `attemptedAt`, accurate agent-client metadata,
and an optional concise sanitized note. `not_used` must omit `attemptedAt` and has zero evidence
weight.

Current states are:

| State                      | Meaning                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `solved`                   | The attempted KnownPath materially solved the task.                   |
| `partially_helped`         | It advanced the task but did not solve it.                            |
| `attempted_failed`         | It was actually tried and failed.                                     |
| `incompatible_environment` | Observed environment/version facts made it inapplicable.              |
| `stale_or_outdated`        | The record is no longer current for the observed environment.         |
| `misleading_or_unsafe`     | The reporter observed a concrete misleading or safety concern.        |
| `not_used`                 | It was selected or inspected but not attempted; this is not evidence. |

The service never accepts source files, full logs, credentials, prompts, or chain-of-thought. The
optional note is normalized, scanned with Secretlint, and redacted for common email, home-path,
credential-URL, sensitive-query, and control-character values. High-risk residue is rejected.

## Idempotency and abuse resistance

- Reusing a `clientOutcomeId` with identical content returns the original outcome; different content
  returns `outcome_idempotency_conflict`.
- One account cannot report the same KnownPath twice for one `clientExecutionId`.
- Only one report per account, KnownPath, normalized version bucket, and 30-day window is eligible
  to influence confidence. Later reports remain auditable with `duplicate_window` influence.
- Durable limits are 10 reports per API key per rolling hour and 20 per account per UTC day. The
  Fastify route also has an explicit 10-per-minute boundary.
- API credentials and optional notes are never logged. Sensitive actions append actor/key/request
  audit events.

## Immutable assessments

Outcomes are immutable schema-version-2 `agent_outcomes` records. Every recomputation creates or
reuses an immutable `known_path_outcome_assessments` record containing the complete input outcome
IDs, algorithm/policy versions and digest, counts, time weights, Wilson intervals, version
distribution, trend, penalties, reason codes, and explanations. A KnownPath stores only
`latestOutcomeAssessmentId` plus its calculation timestamp for fast access; older assessments are
never overwritten.

Recompute one or a bounded set after algorithm changes:

```sh
pnpm outcomes recompute --id <knownPathId>
pnpm outcomes recompute --limit 100
pnpm outcomes inspect --id <knownPathId>
pnpm outcomes history --id <knownPathId>
```

## Confidence algorithm version 1

Only eligible `solved`, `partially_helped`, and `attempted_failed` reports enter the reliability
interval. Reports receive full weight for 30 days and exponential half-life decay over 180 days.
Kish effective sample size prevents decayed fractional observations from pretending to be many
independent samples.

Two 95% Wilson lower bounds are computed:

```text
any-help = solved + partially_helped versus attempted_failed
full-solve = solved versus partially_helped + attempted_failed
outcome confidence = round(100 × (0.65 × any-help lower bound + 0.35 × full-solve lower bound))
```

This is a conservative ranking component, not a probability that a fix is true. Five perfect reports
therefore do not show 100% certainty. Outcome confidence remains separate from deterministic
source/evidence trust, freshness, and version fit.

Trend comparison uses the recent 90-day window against the preceding portion of a 365-day baseline.
A decline requires recent effective sample size 5, baseline effective sample size 10, Wilson
lower-bound drop at least 0.20, and at least three failed reports from three independent accounts.
The record is marked for revalidation and ranking receives the versioned degradation penalty; no
outcome is deleted.

## Safety review is separate

One eligible `misleading_or_unsafe` report immediately creates an immutable safety event and moves
`KnownPath.safetyReview.status` to `review_queued`. That report alone does not change source trust,
outcome confidence, lifecycle status, moderation status, visibility, or ranking.

A safety ranking penalty currently requires at least two independent eligible reporters within 90
days. Moderators may later move the separate state through `under_review`, `resolved`, or
`restricted`; only an explicit safety policy/moderation action may restrict published visibility.
Repeated reports from one account do not corroborate one another.

## Retrieval and disclosure

Retrieval ranking policy version 2 allocates 15 of 100 points to the conservative outcome score and
reduces deterministic source trust from 12 to 8, exact error from 25 to 20, and semantic similarity
from 15 to 12. Exact/version-compatible relevance remains dominant. Corroborated safety,
statistically meaningful degradation, and a failure-heavy matching version bucket are explicit
penalties with explanations.

Detailed aggregate distributions are returned only after three independent accounts report. Below
that threshold, clients see `limited` plus effective sample size, not individual reports. Search and
MCP responses never expose reporter identity, private notes, raw outcomes, assessment inputs, or
other users' environment data.

## References

- [NIST binomial proportion confidence intervals](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/propconf.htm)
- [NIST Technical Note 2119: coverage intervals for a binomial proportion](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2119.pdf)
- [SumUp: Sybil-resistant feedback aggregation](https://www.usenix.org/legacy/event/nsdi09/tech/full_papers/tran/tran.pdf)
- [Bazaar: Sybil-resilient aggregate queries](https://www.usenix.org/legacy/event/nsdi11/tech/nsdi11_proceedings.pdf)
- [Elastic decay functions](https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/decay)
- [Semantic Versioning](https://semver.org/)
- [OWASP API4: Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
