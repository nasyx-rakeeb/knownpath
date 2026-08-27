# Private and workspace knowledge

Phase 19 extends KnownPath's shared domain structures with explicit personal and workspace tenant
scope. MongoDB remains one shared database, but every non-public access is constrained by a
server-derived owner or workspace predicate. A caller-supplied workspace ID is never authorization.

## Scope model

- `public`: shared records. Normal callers receive only `published` records.
- `private`: owned by exactly one `ownerUserId`. Only that user may search or read it.
- `team`: owned by exactly one `workspaceId`. Only active members of an active workspace may search
  or read it.

Search accepts `public`, `personal`, `workspace`, or `workspace_and_public`. Combined retrieval runs
separate public and tenant-filtered branches, then deterministically reranks the union. Non-public
branches disable public Gemini embeddings and Atlas semantic query generation: exact normalized
errors and bounded lexical retrieval remain available without sending tenant query text to an
unapproved provider. Public outcome aggregates and search projections never include private/team
outcomes.

Direct ID reads, alternatives, search, selection, contribution inspection, outcome reporting, MCP,
and dashboard navigation all carry the same authorized scope. Missing or unauthorized tenant objects
return an unavailable/not-found response rather than confirming existence.

## Workspaces and roles

`owner`, `admin`, and `member` are intentionally small:

- owners can change member roles and perform every administrator action;
- administrators can invite/remove ordinary members and manage workspace API keys;
- members can retrieve team knowledge and participate through appropriately scoped agent keys.

Owner membership cannot be removed or demoted through ordinary member routes. Removed members remain
in history and all active workspace-bound keys they own are revoked. Archived workspaces fail closed
at authorization time.

## Existing-user invitations

Registration remains closed. An owner/admin supplies an email already attached to an active
KnownPath user. No delivery service is used: the pending invitation appears in that user's
dashboard. The record contains inviter, invitee, normalized invited email, workspace, role, state,
creation/expiry, response times, and audit metadata.

Only the exact active invitee whose current normalized email still matches may accept or reject.
Membership is created only after explicit acceptance. Duplicate pending invitations, existing
members, conflicting transitions, expired invitations, and self-invites fail explicitly. Creation,
acceptance, rejection, revocation, and expiry each create an audit event. The model can later add a
delivery channel/token without changing membership identity or acceptance semantics.

## Workspace API keys and installer profiles

A workspace key remains user-owned but has immutable binding `{ kind: "workspace", workspaceId }`.
Authentication rechecks the active workspace and live membership; removing a member therefore stops
access even before key cleanup. Workspace keys cannot switch tenants, retrieve personal knowledge,
or submit public/private contributions. The full key is returned only once; persistence contains
only its secure hash and non-secret prefix.

The installer accepts a non-secret `--profile` label and optional `--workspace-id`. It still writes
only references to `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` into agent configuration. `doctor`
calls safe MCP status and verifies that the environment-provided key is bound to the expected
workspace. No profile stores or prints the key itself.

## Contributions, outcomes, and public sharing

Team contributions require explicit consent and a matching workspace-bound key. Their sanitized
source, candidate, assessments, canonical record, and deterministic similarity comparisons retain
workspace scope. Public/free generalizers and embedding providers reject private/team data;
deterministic processing can continue, while a future `approved_private` provider can be configured
through the existing provider boundary.

Workspace outcomes are immutable private overlays and do not modify public outcome assessment
pointers, public rank, or public safety state. An agent using a workspace key may report a private
workspace outcome for a public result without leaking that observation into the public aggregate.

Public promotion is not a visibility flip. An authorized user reviews a new generalized payload,
explicitly consents, and runs sanitization again. KnownPath stores an immutable private share
request linking the source and creates a distinct low-trust public contribution. The proprietary
source record remains unchanged even when the public request is quarantined or accepted for
processing.

## Index and operational notes

Tenant-aware indexes place `visibility.scope` and `ownerUserId`/`workspaceId` before lifecycle or
ranking fields. Atlas search/vector definitions include those values as filter fields. Local text
retrieval applies the ordinary MongoDB tenant predicate before scoring. This shared-collection model
fits the current scale; a future physical-isolation tier can reuse the same domain scope without
changing API contracts.

Relevant official guidance:

- [MongoDB multi-tenant architecture](https://www.mongodb.com/docs/atlas/build-multi-tenant-arch/)
- [MongoDB Vector Search multi-tenancy](https://www.mongodb.com/docs/atlas/atlas-vector-search/multi-tenant-architecture/)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP API1 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
