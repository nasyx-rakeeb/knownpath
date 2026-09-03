# Agent contributions

KnownPath accepts generalized technical lessons after a task has observably succeeded. The goal is
to retain the reusable experience—not the user's repository, raw conversation, private code,
credentials, or hidden chain-of-thought.

Contributions are untrusted evidence. A self-reported success starts with low trust and cannot
become published knowledge without the normal sanitization, assessment, canonicalization, and
moderation lifecycle.

## When to contribute

An agent should offer a contribution only when:

- a non-trivial problem was actually solved;
- the solution can be stated without private source material;
- the result was verified through an observable check;
- the user explicitly consents to this submission and visibility.

Do not contribute a hypothesis, an unverified edit, a search result that was not used, or a
transcript of the debugging session.

## Consent and account mode

Each account has one contribution mode:

- `ask` — the default; the agent may ask for explicit consent;
- `disabled` — contribution submissions are rejected.

Every submission still requires consent policy version 1 with `confirmed: true`. There is no
silent/background sharing mode.

Consent intent depends on visibility:

- **public:** submission for review and possible future publication;
- **private:** storage and processing inside the owner's KnownPath account;
- **team:** storage and processing inside the named workspace.

Private or team content is never silently converted to public.

## Submission contract

Use:

- HTTP: `POST /api/v1/contributions`
- MCP: `knownpath_contribute`

The API key needs `knowledge:contribute`. Team submissions additionally require an active
workspace-bound key for the exact `workspaceId`.

A submission includes:

- a UUID `clientSubmissionId`;
- contribution kind: `new_lesson`, `correction`, `additional_evidence`, or `freshness_update`;
- intended visibility and optional workspace;
- agent client name/version;
- generalized problem and symptoms;
- ecosystem, packages, platforms, versions, and toolchain;
- normalized errors;
- solution summary and ordered steps;
- caveats;
- concise observable success checks;
- any consulted KnownPath IDs and whether they materially influenced the fix.

Corrections, evidence additions, and freshness updates must identify the target KnownPath.
Submissions are limited to 48 KiB.

## Sanitization

The backend normalizes Unicode, removes control and bidirectional characters, and scans structured
text with Secretlint's recommended rules. It also detects and redacts common:

- secrets, tokens, and credentials;
- email addresses;
- home-directory usernames and paths;
- credentials embedded in URLs;
- sensitive URL query values;
- prompt-injection-like language;
- excessive source-like content.

Sanitized content is rescanned. High-risk residue or excessive private material is rejected;
prompt-injection-like submissions are quarantined as untrusted data.

KnownPath stores the sanitized structured payload and an HMAC digest of the original request for
idempotency/audit comparison. It does not retain the unsanitized request body.

## Idempotency

Retrying the same `clientSubmissionId` with identical content returns the existing contribution.
Reusing it for different content returns `contribution_idempotency_conflict`.

This makes network retries safe without allowing a client identifier to overwrite previously
submitted evidence.

## Processing lifecycle

A safe submission follows this path:

```text
sanitized contribution
        ↓
immutable source snapshot
        ↓
candidate experience
        ↓
immutable deterministic assessment
        ↓
similarity profile and duplicate discovery
        ↓
moderation / canonical review
```

The contribution record tracks processing through stored, source-created, candidate-created,
assessed, profiled, complete, or failed states. Deferred processing is dispatched through the job
system and can be reconciled safely because the product state remains in MongoDB.

Self-reported candidates are capped at low initial trust. They are not published or highly ranked
solely because the contributor says the fix worked.

## Provider privacy

Provider capability is explicit:

- `public_only`
- `approved_private`

The configured unpaid/public Gemini path can process only public records. Private and team records
are blocked before any external provider call. They remain in KnownPath's backend and MongoDB unless
an operator deliberately configures a provider approved for private data.

There is no fallback that downgrades visibility or sends private data to a public provider.

## Inspection and moderation

`GET /api/v1/contributions/:id` returns the sanitized record only to its owner or an authorized
workspace member. The user dashboard also shows owned contribution status and processing state.

Operators can review, approve, quarantine, reject, or restore submissions through the admin console.
Private content is hidden from admins by default; an authorized moderator may reveal only the
sanitized version using fresh authentication, exact confirmation, and a stated reason. Every reveal
is audited.

See [Admin operations](ADMIN_OPERATIONS.md) and [Privacy](PRIVACY.md).

## Sharing private knowledge publicly

`POST /api/v1/known-paths/:id/share-public` is an authenticated dashboard flow. The user supplies a
new generalized payload and explicit public consent. KnownPath sanitizes it again, stores an
auditable share request, and creates a separate public contribution.

The source private/team KnownPath remains unchanged. A quarantined public share does not expose the
original record.

## Retention

Sanitized contributions and their immutable derived provenance are retained for auditability.
Rejected pre-persistence request bodies are not retained. Automated user-deletion and long-term
retention enforcement are not currently implemented; self-hosting operators should document their
own retention policy.
