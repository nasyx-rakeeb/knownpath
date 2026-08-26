# KnownPath Phase 18 Admin and Operations Console Design

**Status:** Approved on 2026-08-26

## Purpose

Phase 18 adds the internal administration and operations surface required to run KnownPath
responsibly. It extends the existing Fastify API and Next.js dashboard without creating a shadow
data model or a separate administration deployment. The API remains the authorization and business
logic boundary; the web application consumes narrow, runtime-validated administration contracts.

This phase covers administration, moderation, and operational control only. It does not add Phase 19
capabilities, hard deletion, a new identity system, a second product database, or tests.

## Current-state findings

- Better Auth already provides database-backed sessions, the admin plugin, closed registration, and
  a configured 30-minute `freshAge`.
- `requireAdmin` currently accepts only browser sessions and verifies the persisted user role, but
  the principal does not expose session creation time and there is no reusable freshness guard.
- The only custom admin API is the read-only `/api/v1/admin/jobs` endpoint.
- The Phase 17 Next.js bridge deliberately excludes all administration routes.
- MongoDB repositories expose the persisted source, extraction, candidate, scoring,
  canonicalization, contribution, outcome, pipeline, worker, user, API-key, and audit entities, but
  many list methods are bounded rather than cursor-paginated and several admin mutations do not yet
  exist.
- Phase 8 canonicalization preserves candidates, memberships, revisions, and operation history, but
  canonicalization events currently attribute operations to `system`.
- BullMQ exposes queue status and the worker pipeline is idempotent, but the queue registry has no
  administration methods for pause, resume, or bounded retry/reprocessing.
- Contributions persist only sanitized structured content. Original unsanitized request bodies are
  represented by a digest and are not available for display.

## Research basis

The design was checked against current official guidance on 2026-08-26:

- Better Auth [Admin plugin](https://better-auth.com/docs/plugins/admin) and
  [session freshness](https://better-auth.com/docs/concepts/session-management) document
  server-authenticated admin operations and `freshAge` semantics.
- Next.js [authentication](https://nextjs.org/docs/app/guides/authentication),
  [data security](https://nextjs.org/docs/app/guides/data-security), and
  [Server Actions](https://nextjs.org/docs/app/guides/server-actions) guidance requires secure
  authorization close to the data source, treats every mutation entry point as untrusted, and
  recommends narrow DTOs.
- OWASP [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
  recommends least privilege, deny by default, and permission validation on every request.
- OWASP [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  requires security-relevant auditability while excluding session identifiers, access tokens,
  passwords, connection strings, encryption keys, source code, and sensitive PII.
- BullMQ [queue](https://docs.bullmq.io/guide/queues),
  [pause](https://docs.bullmq.io/guide/workers/pausing-queues), and
  [retry](https://docs.bullmq.io/guide/retrying-failing-jobs) guidance defines the supported queue
  controls and retry behavior.
- W3C WAI-ARIA [dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
  [alert dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/), and
  [table](https://www.w3.org/WAI/ARIA/apg/patterns/table/) patterns guide focus-safe confirmation
  and semantic operational data presentation.

## Selected architecture

The selected approach is a dedicated administration application-service layer inside the existing
backend, exposed through versioned Fastify routes and consumed by an `/admin` area in the existing
Next.js application.

Rejected alternatives:

- Route handlers calling repositories directly would be quick but would scatter authorization,
  DTO projection, audit, pagination, and domain invariants.
- A separate administration application and deployment would add operational and authentication
  complexity without improving the current data boundary, because Fastify must still authorize all
  operations.
- A generic database/queue dashboard would expose implementation details, bypass KnownPath domain
  invariants, and fail to provide product-specific moderation or audit semantics.

## Authorization and freshness

### Principals and capabilities

Session principals will carry the persisted session identifier and creation time returned by Better
Auth. Centralized authorization helpers will provide:

- `requireAdmin`: active session plus persisted `admin` role.
- `requireAdminCapability`: admin session plus a named administration capability.
- `requireFreshAdmin`: capability check plus session age no greater than the configured 30-minute
  freshness window.

Phase 18 has one persisted administration role, `admin`. Capability names still form the service
boundary so future specialized moderation or operations roles can be added without changing route
contracts. Ordinary users receive no administration capabilities. Private sanitized-content reveal
uses a distinct capability from general moderation read access.

### Sensitive-action confirmation

Every high-impact request contains a strict confirmation object with:

- a versioned action identifier;
- the exact target identifier or queue name;
- a bounded operator reason;
- an exact server-defined confirmation phrase or token derived from action and target.

The backend validates confirmation after authentication and before mutation. Frontend dialogs are
only a usability layer. Missing, stale, mismatched, or malformed confirmation produces a stable
authorization/validation error and no state change.

Fresh authentication and confirmation are required for:

- merge, split, and reassign operations;
- quarantine, reject, restrict, deprecate, and equivalent destructive moderation actions;
- queue pause, queue resume, failed/quarantined job retry, and broad reprocessing;
- user suspension or restoration;
- private sanitized-content reveal;
- any future action registered as security-sensitive.

Read-only pages and low-risk actions use any valid admin session. The sensitivity registry is
centralized and deny-by-default: an unclassified mutation is treated as sensitive.

## Admin API and service boundary

Administration contracts live in the shared domain package as strict, versioned Zod schemas.
Fastify routes only authenticate, validate, invoke the administration service, map errors, and
record request metadata. The administration service owns safe projection and orchestration across
repositories, canonicalization, queues, and audit.

The initial route families are:

- `/api/v1/admin/overview` and `/api/v1/admin/health`
- `/api/v1/admin/sources` and source/item detail/sync actions
- `/api/v1/admin/jobs`, run/step detail, queue controls, and retry/reprocess actions
- `/api/v1/admin/extractions` and candidate detail
- `/api/v1/admin/known-paths`, revisions, memberships, evidence, and score history
- `/api/v1/admin/canonicalization/preview` and confirmed merge/split/reassign actions
- `/api/v1/admin/contributions` and moderation/private reveal actions
- `/api/v1/admin/outcomes` and safety/abuse review
- `/api/v1/admin/users` and safe API-key metadata
- `/api/v1/admin/audit-events`

List responses use stable opaque cursor pagination with bounded limits and indexed status, type,
date, identity, and safe text filters. Detail responses expose only the fields required by the
operator workflow. API-key hashes, plaintext keys, authorization credentials, provider secrets,
MongoDB/Valkey connection strings, internal embeddings, hidden reasoning, and original unsanitized
contribution material have no response fields.

## Domain operations

### Source and extraction operations

Source registry views show source identity, type, visibility, enabled state, cursor presence, last
attempt/success, lag, related run counts, and safe failure summaries. Source items show provenance,
classification, lifecycle, digests, timestamps, and escaped normalized text/blocks. Provider payloads
are projected through explicit allowlists rather than returned wholesale.

Extraction views show attempts, status, strategy, provider/model/version, usage, latency, validation
issues, failure codes, source references, and projected candidate identifiers. Quarantined or invalid
model output is represented by validated metadata and safe failure information; raw unsafe provider
responses are not exposed.

### Canonical knowledge operations

KnownPath detail combines the current canonical projection with immutable revisions, active/inactive
memberships, candidate assessments, outcome assessments, safety events, provenance, conflicts,
freshness, search state, and complete explainable score components.

Canonicalization uses two stages:

1. A read-only preview resolves all records, validates visibility/ownership/moderation invariants,
   shows affected KnownPaths and memberships, and returns a short-lived digest of the proposed
   operation.
2. A fresh, confirmed request supplies that preview digest. The backend recomputes and compares the
   preview before calling the existing canonicalization service.

Canonicalization service inputs will carry the admin actor. Canonicalization events and the general
audit log will both identify the operator. Existing candidates, revisions, memberships, and prior
events are never destroyed, so split/reassign can reverse an incorrect grouping.

### Moderation

Moderation transitions use existing lifecycle and moderation states wherever possible:

- contributions and candidates: unreviewed, approved, flagged/quarantined, rejected, restored;
- KnownPaths: review, published, deprecated, restricted safety review, restored;
- safety events: queued, under review, resolved, or restricted through the KnownPath safety state.

Hard deletion is not available. Every transition validates its allowed source state, records actor,
reason, previous state, new state, target, request ID, and outcome, and retains the underlying record.
Approval never promotes private material to public or bypasses provider privacy policy.

### Private sanitized-content reveal

Private contribution content is hidden by default. Metadata, sanitization status, finding categories,
processing state, and moderation state remain visible to admins without revealing content.

Revealing sanitized private content requires:

1. the dedicated private-content capability;
2. a fresh admin session;
3. a non-empty moderation or security reason;
4. target-specific explicit confirmation;
5. server-side lookup that verifies the contribution is private and stored in sanitized V2 form;
6. an audit event for every successful or denied reveal attempt.

Only the persisted sanitized structured payload is projected. The original request digest cannot be
reversed and is not displayed. Findings marked as removed remain omitted. The response is `no-store`
and the UI does not persist revealed content in local storage, URLs, analytics, or logs. Repeated
access appears as separate audit events.

### Jobs and queues

MongoDB remains authoritative for pipeline runs, steps, business entities, and audit. Valkey remains
ephemeral queue infrastructure.

- Queue pause/resume uses BullMQ supported controls and reports actual resulting queue state.
- Retrying a failed or quarantined business step creates an operator-triggered `reprocess` run using
  the same validated job/target/options through the existing producer. The prior run and step remain
  immutable historical evidence.
- Broad score/extraction/embedding reprocessing first produces a count/scope preview and then creates
  bounded version-aware jobs after fresh confirmation.
- Controls fail clearly with `503 queue_unavailable` when Valkey is unavailable. No MongoDB product
  state is discarded or silently treated as queued.

## Audit model

The audit event vocabulary will expand with explicit administration events for access denials,
private-content reveals, source changes/syncs, queue controls, retries/reprocessing, moderation
transitions, canonicalization actions, user suspension/restoration, and admin reads of sensitive
views.

Events carry a persisted admin user actor, target, timestamp, outcome, request ID, normalized IP when
available, and bounded non-secret metadata. Reasons are stored in bounded sanitized metadata or a
dedicated operation record as appropriate. No cookie, session token, API key, password, provider
credential, connection string, source code dump, or revealed private content is logged.

Audit list access is itself admin-authorized. Private-content reveal events are filterable by actor
and target so repeated access is visible.

## Web application

The existing Next.js application gains a separately guarded `/admin` route group. Its server layout
fetches an admin bootstrap DTO from Fastify; ordinary users receive a server-side 403/not-found-style
boundary rather than merely hidden navigation. The Phase 17 bridge receives a distinct, explicit
allowlist for administration endpoints and continues to forward only session cookies, safe content
headers, and request correlation data.

Navigation:

- Overview
- Sources
- Jobs
- Extraction
- Knowledge
- Moderation
- Outcomes
- Users
- Audit

The existing cream/deep-green visual system remains primary. Admin surfaces are denser and more
operational, using semantic status hierarchy, native tables for primarily read-only tabular data,
progressive detail pages, restrained motion, explicit focus states, and responsive stacked layouts.
Radix alert dialogs provide accessible confirmation behavior with initial focus on the safe action.

Untrusted source and contribution text is rendered as React text nodes in `<pre>`, `<code>`, lists,
or plain semantic blocks. `dangerouslySetInnerHTML`, raw Markdown HTML, scriptable previews, and
unallowlisted external embeds are prohibited.

## Failure behavior

- Unauthenticated requests return 401; authenticated non-admin requests return 403.
- Stale sensitive sessions return a stable `fresh_admin_session_required` error and perform no work.
- Confirmation/preview mismatch returns a stable conflict/validation error and performs no work.
- Queue-unavailable controls return 503 while read-only MongoDB administration remains available.
- Concurrent moderation/canonicalization mutations use expected-state or preview-digest checks and
  fail safely rather than overwriting newer operator work.
- Audit write failure prevents a sensitive mutation from being reported as successful. Where
  atomicity across infrastructure is impossible, an operation record captures requested and
  resulting state for reconciliation.

## Verification plan

No automated tests will be created. Verification will record literal observed results for:

1. root typecheck, lint, build, and formatting validation;
2. API and web boot against configured development infrastructure;
3. ordinary-user denial from both admin pages and APIs;
4. real admin access to read-only sources, candidates, KnownPaths, scores, jobs, users, and audit;
5. stale-session, missing-confirmation, wrong-target, and wrong-preview rejection;
6. private sanitized-content reveal with fresh authentication, reason, no unsanitized fields, and a
   visible reveal audit event;
7. reversible quarantine/restore on a disposable development record;
8. merge/split or reassign on disposable candidates while preserving provenance and history;
9. retry of a safe failed development job while retaining the original failed step;
10. queue pause/resume where configured, including resulting audit events;
11. response/log inspection for API-key plaintext, hashes, credentials, unsafe provider payloads,
    private revealed content, and other excluded fields;
12. cleanup of disposable verification identities and records without changing unrelated data.

If live infrastructure or suitable disposable records are unavailable, the implementation will
complete all safe verification possible and record the exact remaining manual operation rather than
fabricating a success.

