# Administration and moderation operations

Phase 18 adds an internal `/admin` console backed by versioned `/api/v1/admin/*` contracts. It uses
the existing Next.js dashboard and Fastify API; it is not a separate database client or a generic
MongoDB/Valkey console. Fastify authenticates and authorizes every read and mutation. Hiding a link
in the browser is never treated as authorization.

## Access model

Only a valid browser session whose active MongoDB user has role `admin` can access administration
routes. Phase 18 defines named capabilities for sources, operations, knowledge, contributions,
private-content review, users, and audit. The current `admin` role receives the complete set; the
capability boundary allows narrower roles to be introduced later without changing route contracts.

Read-only pages accept any valid admin session. High-impact actions additionally require:

- a session created no more than 30 minutes ago;
- the action and exact target in a versioned confirmation object;
- the exact phrase `CONFIRM <action> <target>`;
- a bounded operator reason.

The API checks all four requirements centrally. This applies to canonical merge/split/reassignment,
moderation transitions, source changes/sync, queue pause/resume, job retry, user suspension/restore,
and private-content reveal. Reauthenticate through the normal sign-in flow when the API returns
`fresh_admin_session_required`.

## Views and safe projections

The console provides cursor-paginated, status-filtered, searchable views for sources and normalized
source items, pipeline runs, extraction attempts, candidates, KnownPaths, contributions, outcomes,
users, and audit events. Details are explicit projections:

- source text is escaped plain text and capped before response serialization;
- candidates include extraction and immutable assessment history;
- KnownPaths include membership, revision, source/outcome confidence, freshness, safety, and
  provenance summaries;
- users expose lifecycle metadata and API-key prefix, scopes, status, and timestamps only;
- health exposes component state, queue counts, worker heartbeat counts, and configured provider
  names, never provider credentials or connection strings.

API-key plaintext/hashes, authorization or cookie values, session tokens, MongoDB/Valkey URIs,
provider credentials, raw embeddings, hidden reasoning, and unrestricted provider payloads have no
admin response fields.

## Private contribution review

Private contribution metadata and sanitization status are visible without content. Sanitized
structured content remains hidden until an administrator with `private_content:read` supplies a
fresh session, a stated moderation/security reason, and target-specific confirmation. Every allowed
or denied attempt creates an audit event. Repeated reveals therefore remain visible by actor and
target.

The reveal endpoint returns only the persisted sanitized V2 payload. KnownPath does not retain a
reversible original submission; its request digest, removed fields, secrets, credentials, and
redacted characters cannot be revealed. Responses use `Cache-Control: no-store`, and the UI keeps
revealed content only in component memory until the operator hides or leaves the view.

## Reversible controls

- Moderation uses lifecycle transitions and optimistic expected-state checks. It does not hard
  delete records or silently change private visibility to public.
- Canonical operations require a read-only preview digest. Execution recomputes the preview before
  using the Phase 8 primitives. Candidates, memberships, revisions, and actor-attributed operation
  events remain available for later split/reassignment.
- Queue pause/resume uses BullMQ's supported operations. Retrying a failed/quarantined step creates
  a new durable operator-triggered run; the original run and step are preserved.
- User suspension is reversible and immediately prevents the suspended identity from authenticating.

Every sensitive action records actor, target, request ID, outcome, timestamp, action, and sanitized
reason in `audit_events`. Canonicalization also records the administrator on its immutable event
stream.

## Operating the console

Start the same foundational services used by the rest of KnownPath:

```sh
pnpm db:init
pnpm dev:infra
pnpm --filter @knownpath/api dev
KNOWNPATH_API_URL=http://127.0.0.1:3001 pnpm --filter @knownpath/web dev
```

Provision an administrator through the existing masked CLI, sign in at `/sign-in`, then open
`/admin`. Queue controls return `queue_unavailable` without configured/reachable Valkey while
read-only MongoDB administration continues. The console does not compensate by claiming a job was
queued.

## References

- [Better Auth admin plugin](https://better-auth.com/docs/plugins/admin)
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management)
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
- [Next.js data security](https://nextjs.org/docs/app/guides/data-security)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [BullMQ pausing queues](https://docs.bullmq.io/guide/workers/pausing-queues)
- [BullMQ retrying jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [WAI-ARIA alert dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/)
