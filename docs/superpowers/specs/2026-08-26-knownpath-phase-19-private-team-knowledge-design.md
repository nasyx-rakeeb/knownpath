# KnownPath Phase 19 Private and Team Knowledge Design

**Status:** Approved on 2026-08-26

## Purpose and phase boundary

Phase 19 extends the existing shared-memory system with personal private knowledge and organization
workspaces. Public, private, and workspace knowledge continue to use the same source, candidate,
assessment, canonical, retrieval, contribution, and outcome structures. Scope and ownership become
mandatory authorization inputs at every data boundary rather than UI filters.

This phase keeps registration closed. Workspace invitations target existing KnownPath users and are
accepted inside the dashboard. It does not add outbound email, public registration, a private AI
provider, billing, enterprise identity federation, hard deletion, or tests.

## Current-state findings

- Better Auth provides closed-registration browser sessions, while KnownPath owns persisted users,
  API keys, scopes, and authorization helpers.
- The shared visibility schema already names `public`, `private`, and `team`, but `team` is only a
  placeholder and no workspace or membership entity exists.
- API keys are user-owned and scope-limited, but cannot be bound to a workspace.
- Public API/MCP knowledge access always projects `queryVisibility: public`; review access is a
  separate audited administrator mode.
- search projections contain visibility, owner, and team fields, but candidate-generation queries
  filter only by visibility. Owner/workspace predicates are therefore not yet safe enough for tenant
  retrieval.
- public-only Gemini extraction and embedding providers already reject non-public records. This
  privacy boundary must remain hard.
- private contributions are owner-scoped and team contributions are explicitly rejected. The
  existing contribution pipeline already projects visibility into source and candidate records.
- raw outcome reports are private to their reporter, while one current global assessment pointer is
  stored on a KnownPath. Workspace-private aggregation requires separate scoped assessments and
  pointers so it cannot change public ranking.
- canonicalization already preserves candidates and audit history, but all deterministic blocking,
  pair discovery, merge, and rebuild paths need scope-aware invariants.
- the stdio MCP server is a thin HTTP bridge and the installer stores environment-variable
  references rather than credentials. This remains the correct client boundary.
- the Phase 18 admin console hides private content by default and requires fresh authentication,
  reason, confirmation, and auditing for the narrow sanitized-contribution reveal capability.

## Research basis

Current official guidance was reviewed on 2026-08-26:

- MongoDB's
  [multi-tenant architecture guidance](https://www.mongodb.com/docs/atlas/build-multi-tenant-arch/)
  supports shared collections with a tenant identifier when every query enforces tenant scope, and
  warns that logical isolation is the application's responsibility.
- MongoDB Vector Search's
  [multi-tenant architecture](https://www.mongodb.com/docs/vector-search/deployment/multi-tenant-architecture/)
  requires a tenant field on each document and tenant prefiltering so vector candidates cannot cross
  the tenant boundary.
- Better Auth's [Organization plugin](https://better-auth.com/docs/plugins/organization) documents
  organization, member, role, invitation, hook, and access-control patterns. Its organization data
  model is not selected as KnownPath's product-domain authority, but its lifecycle and authorization
  guidance informs the design.
- Better Auth's [API Key plugin](https://better-auth.com/docs/plugins/api-key) documents
  organization-bound keys and permission checks. KnownPath retains its existing hashed-key service
  and adds an immutable workspace binding rather than introducing a second key system.
- The MCP
  [authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
  requires bearer authentication on protected requests, least-privilege scopes, and clear 401/403
  handling. Stdio clients continue to obtain credentials from their environment.
- OWASP's
  [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
  recommends deny-by-default authorization, validating permission on every request, and using
  relationship/attribute-aware controls for multi-organization access.
- OWASP API Security's
  [Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
  guidance requires authorization checks on every endpoint that accepts an object identifier.
- OWASP's
  [Multi-Tenant Security guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
  recommends deriving tenant context from verified identity, including tenant scope in every query
  and cache key, avoiding client-trusted tenant headers, and auditing cross-tenant attempts.

## Approaches considered

### 1. Better Auth organizations as the workspace database

Use the Better Auth Organization plugin as the source of truth for workspaces, membership, roles,
and invitations.

**Rejected for Phase 19.** The plugin is mature, but KnownPath already owns users, keys, audit,
visibility, contribution policy, and MongoDB repositories. Using plugin-owned organization records
would split product authorization across two domain models and still require a KnownPath access
context for every source, candidate, outcome, and search query.

### 2. KnownPath workspace domain integrated with existing identity

Add workspace, membership, and invitation entities to the KnownPath domain. Better Auth continues to
authenticate browser sessions; the existing API-key service continues to authenticate agents. A
central workspace service derives authorization from persisted membership.

**Selected.** This keeps one product authorization model, reuses existing identity, auditing, and
repository conventions, and does not duplicate extraction, scoring, canonicalization, or retrieval
logic.

### 3. Client-supplied workspace IDs with route-level checks

Accept a workspace ID in each API/MCP request and let route handlers filter results.

**Rejected.** It makes object-level authorization inconsistent, trusts caller-selected context too
early, and permits pre-filter retrieval or provenance lookups to leak another tenant's existence.

## Domain model

### Workspaces

A `workspace` is an independently owned organization boundary with:

- stable UUID, schema version, name, normalized unique slug, and lifecycle `active | archived`;
- creator and current owner user IDs;
- default contribution scope `private | team`;
- optional bounded description;
- audit timestamps and actors.

Archival is reversible and prevents new contributions, keys, invitations, and mutations while
retaining history. Phase 19 does not hard-delete workspaces.

### Memberships and roles

Membership is a separate entity because it has an independent lifecycle, authorization use, and
indexing requirements. One user has at most one current membership per workspace.

Roles are deliberately small:

- `owner`: manage workspace lifecycle, members, invitations, scoped keys, settings, and knowledge;
- `admin`: manage members below owner, invitations, scoped keys, settings, and workspace knowledge;
- `member`: search, inspect, contribute, and report outcomes within the workspace.

Membership status is `active | removed`. A workspace must always have exactly one active owner.
Owner transfer is an explicit audited operation; removing or demoting the final owner is rejected.
Authorization resolves the current membership on every sensitive request, so removing a member
immediately invalidates that user's workspace access and bound keys.

### Existing-user invitations

An invitation stores workspace, inviter user, invitee user, normalized invited email, proposed role,
status, creation time, expiry, response/revocation time, and audit metadata. Status is
`pending | accepted | rejected | revoked | expired`.

- creation resolves the normalized email to an existing active KnownPath user;
- registration remains closed and no email is sent;
- only owner/admin may invite, and an admin cannot grant `owner`;
- existing membership, self-invite, and duplicate/conflicting pending invitations are rejected;
- a partial unique index permits at most one pending invitation for a workspace/invitee pair;
- acceptance requires the invitee's browser session, exact persisted invitee identity, pending
  status, and unexpired timestamp;
- acceptance creates membership only after an atomic expected-state transition;
- rejection is invitee-only; revocation is owner/admin-only;
- reads lazily mark expired invitations, while a maintenance command performs bounded expiry sweeps;
- creation, acceptance, rejection, revocation, expiry, and denied/conflicting attempts are audited.

The model stores an invitation identity independently from delivery. A later phase can attach an
opaque delivery token and email transport without changing membership semantics.

## Central authorization model

Authentication produces a principal; authorization derives an immutable request access context:

- user ID and principal kind;
- optional API-key ID;
- personal-owner capability;
- optional key-bound workspace ID;
- verified active workspace membership and role;
- requested search scope normalized against those grants;
- administrator review mode kept separate from tenant access.

Clients may request a scope, but cannot assert membership or ownership. A workspace-bound API key
cannot switch workspaces. A browser session may select only an active workspace membership. Missing
or inaccessible records return the same not-found response as nonexistent records to avoid object
enumeration.

Central helpers own `requireWorkspaceRole`, `authorizeKnowledgeScope`, `authorizeContributionScope`,
`authorizeOutcomeScope`, and workspace-key management. Fastify, MCP, the dashboard, and workers call
these services rather than recreating predicates.

## API keys and installer profiles

Existing keys migrate conceptually to `binding: personal`. New keys may bind immutably to one
workspace. They remain user-owned for provenance and are usable only while both the user and
membership are active. Workspace owners/admins may list safe workspace-key metadata and revoke a
bound key; plaintext remains visible only once at issuance/rotation.

Scopes remain capability-based (`knowledge:read`, `knowledge:contribute`, and `knowledge:outcome`).
Workspace binding narrows those scopes; it never broadens them. Key status and MCP status responses
expose safe workspace ID/name/role metadata, never hashes or secrets.

Installer support adds a non-secret profile label and expected workspace binding. Agent
configuration continues to reference only `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`. The API key's
server-side binding selects the workspace; no caller-controlled workspace secret or copied key is
stored in configuration. `doctor` verifies that the authenticated key matches the selected profile.

## Visibility and data-access invariants

The visibility structure is tightened into valid exclusive shapes:

- public: `{ scope: "public" }`;
- personal: `{ scope: "private", ownerUserId }`;
- workspace: `{ scope: "team", workspaceId }`.

Legacy `teamId` data is absent at Phase 19 start and is replaced by the explicit `workspaceId`
terminology. Schema refinements reject extraneous owner/workspace fields.

All externally reachable repository operations accept an access selector and include it in the
MongoDB predicate. Access is never established by retrieving a record with raw `findById` and then
checking in a route. Trusted internal pipeline repositories may retain raw methods, but transport
services must use access-aware methods and carry the record's immutable scope through every stage.

Scope is included in source identity, candidate idempotency keys, scoring inputs, similarity blocks,
canonical keys, revisions, search projections, outcome aggregates, and job idempotency. Records from
different owners/workspaces cannot become candidate pairs, merge, share outcome assessments, or
replace each other's projections.

## Retrieval and indexes

Search supports:

- `public`: published public records only;
- `personal`: the authenticated user's private records only;
- `workspace`: one authorized workspace only;
- `workspace_and_public`: independent public and workspace candidate retrieval followed by a common
  transparent rerank;
- browser-only combined permitted views may include personal data through separately scoped query
  branches, never an unbounded tenant `$or`.

Exact, local text, Atlas Search, and Vector Search calls receive a complete scope selector. Search
projection indexes include `visibilityScope`, `ownerUserId`, and `workspaceId`. Atlas lexical and
vector definitions index these fields as filters. Vector/search prefilters run before candidate
return; post-filtering is defense in depth only.

Public-only Gemini may embed public records and genuinely public-only queries. Any personal,
workspace, or combined query may contain proprietary context and therefore cannot be sent through
the unpaid/public provider. It uses deterministic and lexical retrieval unless an explicitly
configured `approved_private` provider supports both query and record embeddings. Failure is clear;
there is no silent provider downgrade. No private/team content is added to public embedding,
telemetry, cache, or logs.

Each result includes a safe scope label so agents can distinguish public evidence from personal or
workspace memory. Private provenance is projected only inside the same authorized scope and never
returns raw source dumps.

## Contributions, canonicalization, and public sharing

Team contribution requests require a workspace-bound key, an active membership, explicit consent,
and `team` visibility. Private requests remain personal-owner scoped. Public requests retain the
existing explicit publication consent. The complete contribution/source/candidate chain carries the
same visibility selector.

Deduplication occurs only within one exact visibility/owner/workspace boundary. Semantic-only merge
remains forbidden. A private or workspace candidate cannot converge into a public KnownPath through
automatic canonicalization.

`share publicly` is a new explicit workflow, not a visibility update:

1. an authorized owner/member selects a private/team lesson and supplies explicit public consent;
2. the backend reads it through tenant-aware authorization;
3. sanitization and content-risk checks run again under the current policy;
4. the user reviews/accepts the bounded generalized public payload;
5. KnownPath creates a new public contribution with its own provenance, candidate, assessment, and
   moderation lifecycle;
6. a private audit link records the origin without exposing the private record ID or existence in
   public responses.

The original record remains unchanged. If safe generalization requires an AI provider and no
`approved_private` provider is configured, the workflow uses deterministic sanitization plus
user-supplied generalized fields or fails actionably; it never calls unpaid Gemini.

## Outcome isolation and ranking

Outcome reports carry an explicit aggregation audience derived from the accessed record and
principal:

- personal knowledge outcomes aggregate only for that owner;
- workspace knowledge outcomes aggregate only inside that workspace;
- outcomes submitted in workspace context for public knowledge create a workspace-private overlay,
  not public-network evidence;
- existing personal/public-network outcome behavior remains explicit and separately keyed.

Immutable outcome assessments include the aggregation scope and owner/workspace ID in their
idempotency keys. KnownPaths use scoped latest-assessment pointers rather than one pointer shared by
all audiences. Workspace search combines public source confidence with only that workspace's private
outcome overlay. Public search never reads workspace outcome records, counts, timestamps, safety
events, or trend signals.

A workspace safety report can queue a workspace review without publicly flagging or delisting a
public KnownPath. The existing corroboration and abuse protections remain scoped to independent
accounts/keys inside the same aggregation audience.

## HTTP, MCP, dashboard, and administration

Strict versioned contracts add workspace CRUD, membership, invitation, scoped-key, settings, and
public-sharing endpoints. All identifier endpoints use access-aware services. MCP keeps the existing
small tool surface: search/get/contribute/outcome schemas gain explicit scope context, while the
authenticated key binding supplies the workspace authority.

The user dashboard adds:

- workspace creation and switching;
- member list and owner/admin role controls;
- invite-existing-user creation and pending invitation acceptance/rejection;
- scoped API-key management with one-time reveal;
- workspace contribution default and privacy explanations;
- scope-aware search, contributions, outcomes, and public-share review.

The existing warm cream/deep-green system remains unchanged. Scope badges use text plus color and
all member/invitation actions have accessible confirmation and status feedback.

Administrators see workspace identity, lifecycle, membership counts, key metadata, and operational
health only. Tenant content is hidden by default. Phase 19 does not introduce a general team-content
reveal. The existing narrowly controlled sanitized private-contribution reveal remains governed by
fresh authentication, stated reason, confirmation, capability checks, and per-access audit.

## Failure and concurrency behavior

- unauthorized cross-tenant ID access returns 404 without revealing existence;
- invalid workspace scope returns a stable 403 before retrieval/provider work;
- workspace-bound keys fail authentication/authorization immediately after membership removal;
- invitation acceptance uses pending-status and expiry predicates so concurrent accepts cannot
  duplicate membership;
- duplicate active invitations return a stable conflict without creating another record;
- private-provider absence disables semantic retrieval/generalization while deterministic local
  behavior remains available;
- queue dispatch failure never loses the authoritative MongoDB contribution/share record;
- audit failures prevent sensitive membership, invitation, key, or sharing mutations from being
  represented as successful.

## Verification plan

No automated tests are added by explicit requirement. Verification must record literal observed
results for:

1. workspace creation, existing-user invite, dashboard acceptance, role checks, rejection,
   revocation, expiry, and duplicate conflict;
2. personal and workspace-scoped API-key issuance, one-time reveal, authentication, revocation, and
   membership-removal invalidation;
3. two users and two workspaces with private/team KnownPaths, source provenance, candidates, and
   outcomes;
4. allowed personal/workspace/public/combined searches through API, MCP, and dashboard;
5. cross-workspace denial by direct ID, search, provenance, contribution, outcome, MCP, and
   dashboard route;
6. unchanged public search results and aggregates before and after workspace-private activity;
7. deterministic/lexical private retrieval with unpaid Gemini blocked before any provider call;
8. Atlas index definitions and tenant prefilters for lexical/vector paths;
9. public sharing from safe synthetic team data creating a distinct sanitized public contribution
   while leaving the original team record unchanged;
10. installer profile dry-run/status/doctor behavior without storing or printing credentials;
11. audit events for workspace, membership, invitation, scoped-key, access-denial, and sharing
    operations; and
12. root typecheck, lint, formatting validation, and build.

Phase 19 ends after documentation, `progress.md`, verification evidence, and the implementation
commit. Phase 20 does not begin.
