# Administration and moderation

The internal `/admin` console is for trusted KnownPath operators. It uses the same Next.js
application, API, repositories, and domain services as the product; it is not a raw MongoDB or
Valkey console.

Every read and mutation is authorized by the Fastify backend. Hiding navigation is not
authorization.

## Access model

Only an active user with role `admin` and a valid browser session can access admin routes under
`/api/v1/admin`.

Named capabilities cover:

- sources;
- operations/jobs;
- knowledge/moderation;
- contributions;
- private sanitized content;
- users;
- audit history.

The current admin role receives the complete set. Capability checks remain centralized so narrower
operator roles can be introduced without changing endpoint contracts.

## Fresh authentication and confirmation

Read-only pages can use any valid admin session. High-impact actions require:

- a session created within the last 30 minutes;
- confirmation contract version;
- exact action;
- exact target;
- exact phrase `CONFIRM <action> <target>`;
- a bounded operator reason.

The API validates every field. Frontend confirmation alone never authorizes an action.

Fresh confirmation applies to:

- merge, split, and reassignment;
- approve, quarantine, reject, deprecate, and restore;
- source changes and sync;
- queue pause/resume;
- job retry/reprocess;
- user suspension/restore;
- private sanitized-content reveal.

Sign in again when the API returns `fresh_admin_session_required`.

## Available views

The console provides filtered, searched, cursor-paginated views for:

- source registries and normalized source items;
- pipeline runs and steps;
- extraction attempts and validation quarantine;
- candidate experiences and immutable assessments;
- KnownPaths, revisions, memberships, trust, freshness, outcomes, and safety;
- agent contributions;
- suspicious/abuse outcome signals;
- users and API-key metadata;
- audit events;
- health, queues, worker heartbeats, and provider state.

## Safe projections

Admin responses intentionally omit:

- API-key plaintext and hashes;
- Authorization/cookie/session values;
- MongoDB and Valkey URIs;
- provider credentials;
- raw embeddings;
- hidden reasoning;
- unrestricted provider payloads.

Source text is returned as bounded escaped plain text. Public candidates and KnownPaths expose
bounded evidence and score breakdowns. Private candidates and KnownPaths show metadata only.
User-key views contain prefix, status, scopes, binding, and timestamps.

## Private contribution reveal

Private contribution metadata and sanitization status are visible by default; content is not.

Revealing content requires:

- `private_content:read`;
- fresh admin authentication;
- exact target confirmation;
- a stated moderation/security reason.

The endpoint returns only the persisted sanitized version 2 payload with `Cache-Control: no-store`.
KnownPath does not store a reversible original request, so removed secrets, fields, and redacted
characters cannot be recovered.

Every allowed or denied reveal attempt is audited. The UI keeps revealed content only in component
memory until hidden or navigated away.

## Moderation

Moderation uses reversible lifecycle transitions with expected-state checks. It does not hard-delete
records or change private content to public.

Available transitions depend on the resource and include:

- approve;
- quarantine;
- reject;
- deprecate;
- restore.

Each action records actor, target, request ID, action, sanitized reason, timestamp, and success or
failure.

Contribution details show the sanitized public preview, relationship/target, applicability,
verification, immutable quality reasons, initial trust score, similarity decisions, and processing
state. Approval and rejection are available from the detail view under the same fresh-session,
reason, exact-confirmation, and audit requirements. Approval schedules normal idempotent
canonicalization; publication remains a separate KnownPath moderation action.

## Canonical merge and split

The console requires a read-only preview before execution. The preview identifies candidates,
affected KnownPaths, relationship changes, and a digest. Execution recomputes that preview and
rejects a stale/mismatched digest.

Underlying canonicalization operations preserve candidates, memberships, revisions, provenance, and
actor-attributed events. A mistaken merge can be split or reassigned.

## Job and source controls

Operators can:

- inspect queue/run/step state;
- pause or resume supported queues;
- retry a failed or quarantined pipeline step;
- request bounded source sync;
- trigger score, extraction, canonicalization, or embedding reprocessing through existing jobs.

Retry creates a new durable operator-triggered run. The original run and step remain in history.
Queue operations use BullMQ APIs; if Valkey is unavailable, mutations fail explicitly with
`queue_unavailable`. Read-only MongoDB views continue where possible.

## User administration

Admins can inspect minimized user lifecycle metadata and key prefixes/scopes/status, then suspend or
restore an account with fresh confirmation.

Suspension immediately prevents authentication. The API never returns a user's password hash,
session token, or API-key secret.

## Audit review

Review audit history for:

- repeated private-content access;
- moderation and canonicalization changes;
- source and queue controls;
- failed sensitive confirmations;
- user suspension/restore;
- review-record knowledge access.

Audit metadata is bounded and excludes submitted content and credentials.

## Run locally

```sh
pnpm dev:infra
pnpm db:init
pnpm --filter @knownpath/api dev
KNOWNPATH_API_URL=http://127.0.0.1:3001 pnpm --filter @knownpath/web dev
```

Create the first admin through the masked CLI:

```sh
pnpm auth:user:create
```

Sign in at `/sign-in`, then open `/admin`.

See [Operations](OPERATIONS.md), [Security operations](SECURITY_OPERATIONS.md), and
[Security architecture](SECURITY_ARCHITECTURE.md).
