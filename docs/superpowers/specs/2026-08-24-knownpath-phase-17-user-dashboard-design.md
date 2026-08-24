# KnownPath Phase 17 user dashboard design

**Status:** Approved architecture and visual direction on 2026-08-24. Implementation requires a
final review of this written specification before work begins.

## Purpose and phase boundary

Phase 17 turns the existing Next.js shell into the user-facing KnownPath product for developers who
install the Agent Skill and MCP bridge. It supports closed-registration sign-in, account/session and
API-key management, installation guidance, safe knowledge exploration, owned contribution and
outcome history, usage summaries, and privacy settings.

This is not the platform administration console. It must not expose ingestion controls, queue
operations, source records, candidate assessments, moderation operations, review-only knowledge,
embeddings, provider configuration, or administrative user management. Those remain backend or
future Phase 18 concerns.

The phase adds no automated tests, by explicit requirement.

## Current-system findings

- `@knownpath/web` is a Next.js 16.3.2 App Router application with React 19.2.8. Its only page is a
  Phase 2 static placeholder using a warm cream, forest green, and serif treatment. It has no auth,
  data-access, component, or application-shell implementation.
- Better Auth 1.7.1 is composed inside the Fastify API. Registration, email verification, password
  reset, OAuth, email changes, and account deletion are intentionally disabled. Users and admins are
  provisioned only by the safe CLI.
- Fastify already exposes closed-registration sign-in/sign-out, current session, password change,
  session listing/revocation, account identity, API-key lifecycle, knowledge search/detail,
  contribution inspection/settings, and outcome submission.
- Existing session authorization, API-key ownership, review access, safe knowledge projection,
  contribution visibility, and private-provider restrictions are backend rules and must not be
  recreated as UI-only checks.
- The API has no user-scoped list contracts for contribution history, outcome history, search
  activity, or an aggregate dashboard summary. Repository support also lacks the required
  owner-scoped cursor queries. Phase 17 must add these through services and safe shared contracts,
  not direct collection calls in routes.
- Normal sessions can access only public, published KnownPaths. Even an administrator session cannot
  request review records. This is correct for the user dashboard and must not be weakened to make
  development data visible.
- The current Atlas data had zero published KnownPaths at the last verified retrieval phase. Manual
  dashboard verification may use an isolated database containing a temporary published projection of
  existing real evidence, then remove it. Production review records must not be published merely to
  demonstrate the dashboard.

## Research basis

Current official guidance was reviewed on 2026-08-24:

- Next.js 16 App Router data-fetching, authentication, data-security, Backend-for-Frontend, Route
  Handler, environment-variable, loading, and error-boundary guidance. Next.js recommends a
  server-only data access layer, minimal safe DTOs, authorization at every reachable mutation, and
  treating Route Handlers and Server Actions as public entry points.
- Better Auth's current React client and Next.js integration. The React client supports a
  same-origin base path and reactive session state; Next.js 16 uses `proxy.ts`, but cookie presence
  is only an optimistic redirect and does not replace authorization at the data boundary.
- WCAG 2.2 and WAI-ARIA Authoring Practices for visible focus, keyboard operation, target sizing,
  accessible authentication, status announcements, dialogs, navigation, forms, and responsive
  content.
- Radix Primitives accessibility and Dialog/Alert Dialog behavior. Radix handles focus containment,
  restoration, keyboard navigation, labelling, and expected WAI-ARIA semantics for the few complex
  controls KnownPath needs.
- Current registry and project compatibility for Next.js 16.3.2, Better Auth 1.7.1, and the
  maintained MIT-licensed `radix-ui` 1.6.7 package. Exact versions remain centralized in the pnpm
  catalog and lockfile.

Official references:

- <https://nextjs.org/docs/app/guides/authentication>
- <https://nextjs.org/docs/app/guides/data-security>
- <https://nextjs.org/docs/app/guides/backend-for-frontend>
- <https://nextjs.org/docs/app/getting-started/fetching-data>
- <https://nextjs.org/docs/app/getting-started/route-handlers>
- <https://nextjs.org/docs/app/guides/environment-variables>
- <https://better-auth.com/docs/integrations/next>
- <https://better-auth.com/docs/concepts/client>
- <https://www.w3.org/TR/WCAG22/>
- <https://www.w3.org/WAI/ARIA/apg/>
- <https://www.radix-ui.com/primitives/docs/overview/accessibility>
- <https://www.radix-ui.com/primitives/docs/components/dialog>

## Approaches considered

### 1. Server-first Next.js application with a same-origin API bridge

Use Server Components for initial safe reads and a tightly allowlisted Next.js Route Handler bridge
for interactive browser requests. The bridge forwards only required method, body, origin, request,
and cookie headers to Fastify and returns only the upstream status, safe response body, request ID,
rate-limit metadata, and session cookies. Fastify remains the sole authentication, authorization,
business-logic, and persistence authority.

**Selected.** It avoids fragile cross-origin session-cookie deployment, keeps the API URL server
only and runtime-configurable, preserves the existing Fastify contract, and minimizes client
JavaScript without importing backend packages into Next.js.

### 2. Direct browser-to-Fastify calls

Point the Better Auth React client and dashboard fetches directly at the API origin.

**Rejected as the default.** It couples deployment correctness to cross-origin CORS, cookie domain,
and SameSite behavior, exposes the deployment API URL at build time, and makes local versus hosted
configuration harder to reason about.

### 3. Store an agent API key in the browser

Use a user-created API key for all dashboard calls.

**Rejected.** Agent credentials must not become browser session credentials or be persisted in local
storage. Human dashboard access already has a revocable cookie-session model.

## Architecture and dependency direction

The dashboard uses four explicit layers:

1. **Shared contracts:** versioned Zod request/response schemas in `@knownpath/domain` define safe
   account activity, contribution history, outcome history, and existing knowledge DTOs.
2. **Backend services:** user-activity and account services own authorization-aware aggregation and
   safe projections. They use repository abstractions and return no persistence models.
3. **Fastify routes:** validate, require a session, apply rate policies, delegate, and serialize
   allowlisted response schemas.
4. **Next.js data access:** a `server-only` HTTP client and allowlisted same-origin bridge call the
   existing API. Server Components receive minimal DTOs; small Client Components own forms, dialogs,
   clipboard access, platform detection, and optimistic feedback.

The web workspace must not depend on MongoDB, database repositories, Fastify, BullMQ, Gemini,
search-provider implementations, MCP internals, or admin contracts. It may depend on shared domain
contracts, Better Auth's React client, and Radix Primitives.

## Web runtime and session flow

Add a required server-only `KNOWNPATH_API_URL` for `@knownpath/web`. It is validated as an HTTP(S)
origin at runtime and is never prefixed `NEXT_PUBLIC_`. There is no localhost or production
fallback.

The web app exposes an internal bridge under a KnownPath-owned path. Its upstream route allowlist is
closed to the exact user-dashboard endpoints and supported methods. It does not accept arbitrary
destinations, absolute URLs, hop-by-hop headers, bearer authorization, or unrestricted header
forwarding. Request and response bodies are bounded. API keys, cookies, passwords, and one-time key
plaintext are never logged.

Better Auth's React client points to the same-origin bridge for sign-in, sign-out, session refresh,
password change, and session revocation. The browser stores only the secure, HTTP-only session
cookie returned through the bridge. Server reads forward the incoming cookie directly to Fastify and
use `cache: "no-store"`.

Authenticated layouts may use a cookie-presence redirect only as a navigation optimization. Every
page read and every mutation still receives authoritative Fastify authentication. A 401 clears the
local session view and sends the user to sign-in without exposing upstream details.

## Backend contract additions

All added endpoints require a Better Auth browser session. API keys cannot call user dashboard
history routes.

### Dashboard summary

`GET /api/v1/account/dashboard`

Returns versioned bounded counts and recent timestamps:

- active, revoked, and expired API keys plus the most recent key use;
- searches and selections in the current summary window;
- contribution counts by visibility, status, and processing stage;
- outcome counts by outcome state;
- owned contributions that produced candidates or assessments;
- recent activity entries containing type, safe target ID/title where available, timestamp, and
  status only.

It returns real counts. Missing data produces zeros and an empty activity list, never fabricated
trend percentages.

### Search activity

`GET /api/v1/account/search-activity?cursor=&limit=`

Returns owner-scoped search timestamps, structured filter counts, number of returned results,
whether a result was selected, and selected KnownPath ID/rank. The existing record does not retain
raw query text, so the dashboard must not pretend it can display it.

### Contributions

`GET /api/v1/account/contributions?cursor=&limit=&status=&visibility=`

Returns sanitized owned fields only: ID, kind, generalized problem and solution summaries,
visibility, consent intent/time, sanitization summary, trust state, processing stage/failure code,
status, linked KnownPath/candidate/assessment IDs where safe, and timestamps. Full sanitized detail
continues to use `GET /api/v1/contributions/:id`.

### Outcomes

`GET /api/v1/account/outcomes?cursor=&limit=&outcome=`

Returns the owner's bounded outcome history: ID, KnownPath ID and safe title when accessible,
outcome state, attempted/received time, supplied environment summary, optional owned note, influence
status, and whether a safety review was queued. It never exposes other reporters, installation
identifiers, abuse signals, algorithm inputs, or private aggregate buckets.

### Account profile

`PATCH /api/v1/account/profile` permits only a bounded display-name update. Email and role are
immutable through this route. The service writes an audit event. Password and session operations
continue through the explicit Better Auth routes already exposed.

### Pagination and indexes

History lists use opaque integrity-protected cursors bound to user ID, filters, timestamp, and ID.
Ordering is descending timestamp then ID. Limits default to 20 and cap at 50. Repositories add
owner/time list methods and only the indexes required by the resulting query shapes. No new
collection or denormalized analytics store is introduced.

## Information architecture

### Public routes

- `/`: concise explanation, evidence/trust model, supported agents, privacy posture, open-source
  link, installer command, and sign-in call to action. It does not claim unimplemented features.
- `/sign-in`: email/password sign-in for CLI-provisioned accounts. It clearly states that public
  registration and password recovery are not available yet.

### Authenticated routes

- `/app`: real overview summary and recent activity.
- `/app/explore`: natural-language search with progressive structured context fields.
- `/app/known-paths/[id]`: generalized solution, applicability, trust, freshness, aggregate
  outcomes, alternatives, and safe provenance.
- `/app/api-keys`: list, issue, one-time reveal, rotate, revoke, and last-used metadata.
- `/app/install`: `npx knownpath install`, supported-agent guidance, and client-side-only platform
  hints. Platform information is not sent to the server.
- `/app/contributions`: owned contribution list, filters, processing/trust/sanitization states, and
  safe detail.
- `/app/outcomes`: owned outcome history and real aggregate impact summary.
- `/app/settings`: display name, password, active sessions, contribution mode, and privacy policy.

The authenticated desktop shell uses a left navigation rail and a compact content header. Below
768px it becomes a top bar with a Radix Dialog navigation drawer. The main content remains usable at
320px without horizontal page scrolling.

No admin route, admin navigation entry, admin API client, ingestion control, queue status, candidate
assessment, or review record is bundled into the ordinary dashboard.

## Visual system

The approved identity evolves the existing warm green/cream palette into serious developer
infrastructure rather than replacing it with a generic dark devtool theme.

### Design read and dials

- Product application for developers, evidence reviewers, and technical contributors.
- Trust-first, clean, technical, modern, and restrained.
- Landing surfaces: design variance 6, motion 2, density 4.
- Product surfaces: design variance 4, motion 2, density 6.

### Tokens

- warm cream page background;
- near-white warm elevated surface;
- deep forest green brand/accent;
- near-black green primary text;
- muted olive-gray secondary text and borders;
- amber and red only for semantic warning/error states;
- one light primary theme in Phase 17, expressed through semantic CSS variables so a later dark
  theme does not require component rewrites.

Use Geist Sans and Geist Mono through `next/font`. Controls use an 8px radius; major contained
surfaces use 12px. Shadows are rare and tinted. Dividers and spacing establish most hierarchy.
Semantic status marks may use color plus text/icon; decorative dots, gradients, glass, glows,
oversized typography, playful illustration, excessive pill shapes, and fake precision are absent.

The public landing page uses the actual implemented search/detail component language for its product
visual. It must never render invented success metrics, fabricated KnownPaths, or a div-based fake
screenshot. If no published record exists, the real empty state is shown truthfully.

## Component system

Use semantic native elements for buttons, links, forms, tables, and disclosures. Use `radix-ui` only
where the platform does not provide sufficient accessible behavior:

- Dialog for mobile navigation and one-time key reveal;
- Alert Dialog for key rotation/revocation and session revocation;
- Dropdown Menu where compact row actions genuinely need it;
- Tabs only when they reduce complexity without hiding required content.

Create small KnownPath-owned components around these primitives: button, field, status badge,
notice, dialog shell, copy control, skeleton, empty state, pagination control, score summary, and
provenance item. Components use variant props and semantic tokens, not duplicated page-specific
styles.

## Page behavior

### API keys

Creation and rotation return plaintext once. The reveal dialog disables accidental dismissal until
the user explicitly confirms that the key has been copied or saved. The key is kept only in
component memory, removed when the dialog closes, never written to URL, storage, telemetry, error
messages, or server logs, and never recoverable later. Revoke and rotate require an Alert Dialog.

### Installer onboarding

The primary command is `npx knownpath install`. A client-only component may detect operating system
family solely to choose shell-specific environment examples. It does not collect, persist, or send
device details. The page explains that `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` must be supplied
through the agent-launch environment and never pasted into client configuration files.

### Explore and detail

The search form starts with one required problem field. Error, ecosystem, packages, versions,
platform, and environment fields are progressively disclosed. Results prioritize title, concise
solution, applicability, trust grade, freshness, version fit, aggregate outcome status, caveats, and
match explanations. Selection reporting occurs only after a user opens a returned result and remains
usage metadata, not success.

Detail displays trust as separate evidence, freshness, version-compatibility, conflict, and
aggregate outcome sections. Score explanations and reason codes are readable text; popularity is
never called truth. Provenance uses canonical external links and bounded excerpts. Alternatives are
separate solution variants, not implied universal recommendations.

### Contributions, outcomes, and privacy

Contribution history distinguishes public/private visibility, self-reported trust, sanitization,
processing, moderation, and failure states. Private never appears as a path toward automatic public
publication. The dashboard does not add a general-purpose contribution form in this phase; the
privacy-safe agent/MCP submission contract remains the intended contribution path.

Settings expose only the implemented contribution modes `ask` and `disabled`. They explain that each
submission separately declares public or private visibility, public requires explicit consent, and
private content remains in KnownPath's backend and cannot use the public/unpaid Gemini path. Team
visibility is not advertised.

Outcome history differentiates solved, partial, failed, incompatible, stale, unsafe, and not-used.
The UI never interprets a view or selection as success and never exposes individual users' outcomes
in another user's detail view.

## Loading, empty, error, and mutation states

Each route provides a shape-matched `loading.tsx`, a useful empty state, and contextual retry
action. Expected form errors appear next to the relevant field. Mutation success/failure is
announced with an `aria-live` status region. Destructive operations remain open on failure and
preserve user input.

Stable backend error codes map to plain user messages while the request ID remains copyable for
support. Authentication failure redirects to sign-in. Authorization failure does not imply that a
hidden record exists. Rate limits show the retry window where provided. Network and unavailable
states distinguish retryable service problems from invalid input without exposing upstream stack
traces.

## Accessibility and performance

- semantic landmarks, heading order, labels, descriptions, table captions, and a skip link;
- visible high-contrast `:focus-visible` rings and no focus-outline removal;
- at least 44px primary pointer targets, with compact rows retaining adequate target separation;
- full keyboard access and Radix-managed focus for dialogs and menus;
- error text associated with fields and no placeholder-only labels;
- text plus shape/icon/status wording so color is never the only signal;
- `prefers-reduced-motion` support and no decorative continuous animation;
- responsive reflow without fixed desktop widths or horizontal page scrolling;
- Server Components by default, small Client Component islands, parallel independent fetches, and no
  large charting, animation, or global-state dependency;
- no uncached authenticated response stored in Next.js or browser caches;
- a plausible LCP below 2.5 seconds, INP below 200ms, and CLS below 0.1 on representative pages.

## Security and privacy invariants

- No raw API key exists beyond issue/rotation component memory.
- No browser storage contains session tokens, API keys, passwords, contribution content, or outcome
  notes.
- No public page receives authenticated DTOs through shared caches or static generation.
- The web bridge cannot forward arbitrary URLs, bearer headers, or admin endpoints.
- Every mutation is authorized by Fastify even when the page layout already checked a session.
- Next.js logs method/path/status/request ID only and redacts cookie, authorization, password,
  plaintext, token, and secret fields.
- Safe backend response schemas remain the final serialization allowlist. Client TypeScript types do
  not create a security boundary.
- Private contribution state stays owner scoped. The dashboard never sends it to Gemini, embeddings,
  analytics, or another external provider.
- Client platform detection remains local and coarse. No fingerprinting or telemetry dependency is
  added.

## Documentation and deployment

Add a user-dashboard guide describing local API/web startup, required web API URL, closed account
provisioning, deployment origin settings, dashboard routes, and one-time key handling. Update the
root README, architecture/data-model/API/decision docs where contracts or boundaries change,
`.env.example`, and `progress.md`.

The web deployment remains separate from the API. Production must configure the web runtime API
origin plus add the exact web origin to Fastify CORS and Better Auth trusted origins. This phase
does not choose or provision a hosting vendor unless required for manual verification.

## Verification

No tests are created or run. Verification consists of:

1. install dependencies and run repository typecheck, lint, formatting validation, and build;
2. initialize an isolated development database and run API plus web with real session cookies;
3. provision a temporary normal user only through the masked CLI and sign in through the dashboard;
4. create an API key, confirm one-time reveal, inspect metadata, rotate it, and revoke it;
5. search an isolated real-evidence published verification record, open detail, inspect trust,
   freshness, aggregate outcomes, alternatives, and provenance links, then remove temporary data;
6. change contribution mode and verify persistence after a fresh session read;
7. inspect contribution, outcome, search-activity, and empty states using real persisted development
   records only;
8. inspect desktop and mobile layouts, keyboard navigation, focus restoration, contrast, reduced
   motion, loading, empty, and error states;
9. inspect browser network responses and application logs for raw keys, cookies, password fields,
   internal IDs/objects, embeddings, raw sources, provider metadata, and admin-only data;
10. inspect the production bundle for MongoDB, Gemini, queue, MCP-server, and admin-route imports.

All temporary users, keys, sessions, activities, and verification projections are removed after the
manual round trip. Only literal observed results are recorded in `progress.md`.

## Rollback

The new web application can be undeployed without changing API or agent behavior. New user-list and
summary endpoints are additive. Removing them does not alter source ingestion, MCP, installer,
contribution submission, outcome submission, or worker processing. Schema/index rollback, if ever
needed, removes only the additive owner-history indexes after confirming no later phase depends on
them; product records remain intact.
