# Privacy-safe agent contributions

KnownPath accepts compact generalized lessons only after an observable successful task and explicit
user consent. It does not ask for repository files, proprietary code, prompts, credentials, personal
data, or hidden chain-of-thought.

## Privacy and trust flow

1. An API key with `knowledge:contribute` submits the versioned structured contract.
2. Account mode must be `ask` (the default); `disabled` blocks submission. Public consent means
   submission and possible future publication. Private consent means owner-scoped backend storage.
   Team visibility is rejected until team ownership and authorization exist.
3. The backend normalizes Unicode and strips control characters, redacts Secretlint findings, email
   addresses, home-directory usernames, URL credentials, and sensitive query values, then rescans.
   High-risk residue or excessive source-like content is rejected. Prompt-injection-like language is
   quarantined as untrusted data.
4. Only the sanitized structured payload is retained. An HMAC digest supports idempotency/audit
   comparison without retaining the original unsanitized request.
5. A sanitized source snapshot, candidate, immutable deterministic assessment, and similarity
   profile are created. The candidate remains pending and self-reported; its score is capped at 34.
   It cannot become canonical until a future moderation workflow explicitly approves both the
   contribution and its moderation state.

Private visibility is enforced in persisted source, contribution, and candidate records. The
generalizer provider interface declares `public_only` or `approved_private`; a gate runs before any
provider call. Phase 14 configures no external generalizer, so private payloads remain entirely in
the KnownPath backend and MongoDB. There is no silent public fallback or visibility conversion.

## API

- `POST /api/v1/contributions` submits an idempotent contribution (48 KiB maximum).
- `GET /api/v1/contributions/:id` returns the sanitized owned record only.
- `GET|PATCH /api/v1/account/contribution-settings` reads or changes session-owned `ask|disabled`.

Every request uses strict runtime schemas. `clientSubmissionId` must be a UUID and retries with the
same content reuse the record; reuse with different content returns a conflict. Sensitive actions
produce audit events containing IDs, outcome, visibility, and reason codes—not submitted content.

## Retention and moderation

Sanitized contributions and their derived immutable source/assessment history are retained for
auditability until a later user-deletion and retention phase defines lifecycle automation. Rejected
pre-persistence bodies are not retained. Quarantined payloads are owner-visible but do not enter the
candidate pipeline. Never display or execute contributed text as instructions.
