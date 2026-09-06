# Future autonomous knowledge contribution and publication

Status: **Deferred future work**

KnownPath is launching with a conservative contribution workflow while real usage establishes the
quality, privacy, and moderation characteristics of agent-generated knowledge.

Current behavior:

- every contribution requires explicit per-submission user consent;
- contributions pass server-side schema validation, sanitization, deterministic quality assessment,
  deduplication, scoring, and moderation;
- an administrator approves a contribution before canonicalization;
- the resulting review-state KnownPath requires a separate administrator action to become public;
- KnownPath does not publish agent contributions automatically.

This document preserves two possible product directions for later evaluation. It does not define
current behavior, select a final design, or authorize implementation.

## Why this is deferred

KnownPath needs evidence from ordinary use before reducing its human controls. The useful questions
are empirical: how often agents suggest contributions, how often users accept, how much submitted
material is reusable, how often moderators edit or reject it, whether prompts disrupt users, and
whether moderation limits catalog growth.

The existing system already provides several building blocks: privacy sanitization, secret scanning,
prompt-injection quarantine, deterministic contribution-quality decisions, duplicate-search
provenance, conservative self-report trust caps, scoped visibility, rate limits, auditable
moderation, and outcome aggregation that excludes an originating contributor from independent
evidence. These controls reduce risk, but they do not by themselves justify silent public sharing or
automatic publication.

## Possible removal of per-contribution interruption

The future goal is for an agent that verifies a reusable technical lesson to contribute it without
stopping the user's coding workflow each time. Candidate approaches include:

### One-time account or onboarding consent

The user could authorize automatic contribution once during signup or installation. The consent
record would need a versioned policy, clear visibility scope, revocation, and an auditable history.
A material policy change would require renewed consent.

### Contribution preference

An account-level setting could provide three modes:

- `automatic` — submit eligible lessons under the configured scope without a per-task prompt;
- `ask` — show the generalized preview and request consent for each submission;
- `disabled` — do not suggest or submit contributions.

KnownPath currently exposes `ask` and `disabled`. Adding `automatic` would require server-enforced
policy state; an agent-supplied consent boolean is not sufficient proof of durable user preference.

### Automatic private staging

An agent could stage a minimized lesson in the user's private scope without publishing it. A
separate policy could govern whether a newly sanitized public contribution may be derived from that
private record. Promotion must create a separate record and must never change private content to
public by flipping its visibility.

### Workspace and self-hosted controls

Workspace owners and self-hosted operators could set stricter defaults, prohibit public sharing, or
require workspace review. Local agent configuration cannot be the authorization boundary; the
backend must enforce the effective account and workspace policy.

No approach is selected yet. The eventual design must explain what is shared, where it is stored,
how to disable it, and how private or workspace tasks behave.

### Risks to resolve

Removing per-task confirmation increases the consequences of an incorrect agent judgment. The design
must account for:

- company, customer, product, repository, and internal package names;
- private domains, infrastructure details, paths, usernames, and dependency metadata;
- secrets or credentials not recognized by scanners;
- proprietary architecture that remains identifiable after superficial redaction;
- project-specific fixes that appear general when removed from their context;
- malicious repository instructions that try to trigger publication or bypass privacy controls;
- a mismatch between what users expect and what the account policy permits.

Repository files, documentation, comments, fetched pages, and prompts must remain untrusted inputs
to the contribution decision. Contributions should contain generalized technical facts rather than
repository artifacts, transcripts, source dumps, or hidden reasoning.

## Possible automatic publication

The future goal is for a qualifying contribution to become publicly searchable after deterministic
safety and quality checks, without routine operator approval. Thresholds and exact state transitions
must be chosen from observed contribution and outcome distributions rather than guessed in advance.

A future eligibility policy is likely to require all of the following:

- observable successful verification with an allowed verification type;
- a specific, standalone, cross-project problem and reusable solution;
- sufficient ecosystem, package, platform, version, or toolchain applicability;
- a clean or explicitly acceptable sanitization result with no residual secret or private-data risk;
- no prompt-injection, poisoning, or excessive source-content finding;
- a completed, recent duplicate search and consistent relationship routing;
- no unresolved conflict with an existing KnownPath;
- deterministic quality above a calibrated threshold;
- successful, idempotent canonicalization and search projection;
- contribution and account activity within abuse limits;
- no safety restriction or moderation hold.

Gemini or another model must not decide publication. The ordinary contribution path should continue
to work without an AI provider.

### Advice requiring exception review

Some otherwise functional fixes should remain in manual review unless future deterministic policy
can classify them safely. Examples include instructions that disable authentication, TLS,
certificate or package-integrity checks; grant broad permissions; delete data; rewrite Git history;
bypass security headers; or run opaque remote scripts. A successful local result does not establish
that such advice is safe to distribute.

### Duplicate and corroboration behavior

Automatic publication depends on reliable routing. The first novel contribution may create a
KnownPath. Later substantially matching experiences should normally attach corroborating evidence or
an outcome to that record. Material differences may become a version or platform variant, extension,
correction, or conflict. Semantic similarity alone must not create or merge public records.

### Outcome-driven confidence and containment

The originating success should remain low-trust self-reported evidence. It must not count again as
an independent outcome. Later outcomes from independent accounts can change confidence using the
existing conservative small-sample, version-aware, and freshness-aware model.

Automatic publication would also need a deterministic containment policy. Repeated independent
failures, corroborated safety reports, verified contradictions, or strong version-specific
degradation could reduce ranking or restrict retrieval. A single unverified report should continue
to queue review without allowing one account to delist a record. Automatic restriction criteria must
be auditable and reversible, with manual quarantine and restoration retained for exceptions.

### Manual moderation after automation

Moderation would shift from approving every contribution to reviewing exceptions:

- privacy or sanitization uncertainty;
- risky or destructive advice;
- conflicts and corrections;
- low-quality or borderline generalizability;
- suspicious account or submission patterns;
- safety reports and outcome degradation;
- failed or stalled publication processing.

## Conceptual future flow

```text
Agent solves reusable issue
        ↓
generalizability check
        ↓
privacy minimization
        ↓
duplicate search
        ↓
automatic contribution
        ↓
deterministic safety/quality gate
        ↓
automatic publication if eligible
        ↓
other agents retrieve
        ↓
independent outcomes
        ↓
confidence rises/falls
        ↓
bad/stale/unsafe records are suppressed or quarantined
```

This flow is aspirational. The current consent and publication gates remain authoritative until a
separate reviewed implementation changes them.

## Evidence to collect first

Existing privacy-bounded telemetry and operational records should be used to understand:

- contribution suggestions and submitted contributions;
- accepted and declined consent where clients can report it without sensitive content;
- deterministic quality decisions and reason codes;
- moderation approvals, rejections, edits, and handling time;
- duplicate, corroboration, variant, correction, and conflict routes;
- review-state KnownPaths created and published;
- independent solved, failed, incompatible, stale, and unsafe outcomes;
- safety-review volume and retrieval behavior for low-trust records.

Metrics must remain aggregate and low-cardinality. They must not contain raw queries, contribution
text, repository names, paths, user or workspace identifiers, or credentials.

## When to revisit

Revisit these designs when observed usage shows one or more of the following:

- moderation volume becomes burdensome;
- contribution acceptance is consistently high;
- most approved contributions need little or no editing;
- consent prompts measurably reduce contribution completion;
- users report that contribution prompts interrupt their work;
- catalog growth is materially limited by manual publication;
- the quality distribution of real contributions is understood;
- enough independent outcome data exists to design safe suppression rules;
- duplicate and relationship routing has proven reliable on real repeated problems.

At that point, audit the current implementation and production distributions again. Select consent,
publication, ranking, containment, and workspace policies together; changing only one boundary would
leave the system inconsistent.
