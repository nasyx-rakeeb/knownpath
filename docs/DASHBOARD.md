# User dashboard

## Purpose and scope

Phase 17 provides the developer-facing KnownPath dashboard in `apps/web`. It is not the Phase 18
platform administration console. Ordinary users can manage their account and agent credentials,
search published public knowledge, inspect transparent evidence, review their own sanitized
contributions and outcomes, and configure privacy defaults.

Public registration remains closed. An administrator creates accounts with `pnpm auth:user:create`;
the dashboard exposes sign-in, password change, and session revocation but no signup, reset, email
verification, OAuth, moderation, ingestion, or queue controls.

## Local development

Set the dashboard's server-side API origin. There is no localhost fallback:

```sh
export KNOWNPATH_API_URL='http://127.0.0.1:3001'
pnpm --filter @knownpath/web dev
```

The Fastify API needs its normal MongoDB/auth environment and must trust its own `BETTER_AUTH_URL`.
The same-origin dashboard bridge presents the API origin to Better Auth after accepting the
browser's same-origin request. In local development, the dashboard is served at
`http://localhost:3000`.

## Security boundary

- Server Components fetch safe, runtime-validated DTOs directly from Fastify while forwarding only
  the incoming session cookie. Responses are never cached.
- Browser mutations use `/api/knownpath/*`. The bridge has an explicit route allowlist, a 64 KiB
  ceiling, and only supports GET, POST, and PATCH. It cannot proxy admin or arbitrary API routes.
- Authorization headers and API-key values are never forwarded by the bridge. Provider and database
  secrets remain backend-only.
- Full API-key plaintext exists only in the issue/rotate response and transient browser memory. It
  is never placed in a URL, local storage, server log, HTML produced by a Server Component, or later
  list response.
- Sessions are displayed and revoked by non-secret ID. Better Auth's secret session token never
  enters a dashboard response.
- Normal session search is fixed to published public KnownPaths. Review/private/team data is not
  available through the dashboard search surface.

## Routes

- `/` product explanation and truthful evidence-flow preview
- `/sign-in` closed-registration email/password sign-in
- `/app` 30-day activity summary
- `/app/explore` structured public KnownPath retrieval
- `/app/known-paths/[id]` applicability, steps, caveats, trust, freshness, outcomes, and provenance
- `/app/api-keys` issue, list, rotate, revoke, and one-time secret reveal
- `/app/install` client-side platform guidance for `npx knownpath install`
- `/app/contributions` sanitized owned contribution history and processing state
- `/app/outcomes` private owned outcome history and aggregate influence state
- `/app/settings` profile, contribution mode, password, and active sessions

The installer page detects only a broad operating-system family in the browser; that value remains
in the client and is not sent to KnownPath.

## Visual and accessibility system

The primary identity extends KnownPath's warm cream and deep green palette. Evidence and lifecycle
state use semantic text badges with restrained green, amber, and red surfaces. Layout uses borders,
spacing, typography, and hierarchy instead of decorative animation. Interactive controls have
visible keyboard focus, dialogs use Radix focus/escape behavior, mobile navigation is a modal
dialog, and motion is disabled under `prefers-reduced-motion`.
