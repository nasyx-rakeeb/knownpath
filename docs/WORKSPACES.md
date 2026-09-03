# Private and workspace knowledge

KnownPath uses one shared knowledge model with explicit scope and ownership. Public, personal, and
workspace records share the same core lifecycle, but every non-public access is restricted by a
server-derived owner or workspace predicate.

A caller-provided workspace ID is context, never authorization.

## Visibility model

| Stored visibility | Owner             | Who can access it                        |
| ----------------- | ----------------- | ---------------------------------------- |
| `public`          | Shared network    | Published public clients                 |
| `private`         | One `ownerUserId` | That user through a personal session/key |
| `team`            | One `workspaceId` | Active members of the active workspace   |

Retrieval scopes are:

- `public`
- `personal`
- `workspace`
- `workspace_and_public`

Combined retrieval evaluates public and tenant branches separately, then reranks the allowed union.
Direct reads, alternatives, selections, contributions, outcomes, MCP, and dashboard routes enforce
the same scope. Unauthorized records return unavailable/not-found behavior rather than confirming
existence.

## Roles

Workspaces use three roles:

- **owner:** controls the workspace and can perform all workspace administration;
- **admin:** can invite/remove ordinary members and manage workspace API keys;
- **member:** can retrieve and contribute through permitted workspace credentials.

The owner cannot be demoted or removed through ordinary member routes. Removing a member preserves
membership history and revokes that user's active workspace-bound keys. Archived workspaces fail
closed during authorization.

## Invitations

Registration remains closed. Invitations target an existing active KnownPath user by email; there is
no email-delivery service. A pending invitation appears in the invitee's dashboard.

Each invitation records:

- inviter and invitee;
- normalized invited email;
- workspace and proposed role;
- status;
- creation and expiry;
- response/revocation/expiry times;
- audit metadata.

Only the exact active user whose current email matches may accept or reject. Membership is created
only after explicit acceptance. Duplicate active invitations, existing memberships, self-invites,
expired invitations, and conflicting transitions fail explicitly.

Creation, acceptance, rejection, revocation, and expiry are audited. The identity-based model can
later add delivery channels without changing membership semantics.

## Workspace API keys

A workspace key is still owned by one user but has immutable binding:

```json
{ "kind": "workspace", "workspaceId": "uuid" }
```

Authentication rechecks:

- the key and owner are active;
- the workspace is active;
- the user has an active membership;
- the requested workspace matches the key binding.

A workspace key cannot switch tenants, retrieve personal knowledge, or submit public/private
contributions. The full key appears once at creation; MongoDB stores only a secure hash and
non-secret prefix.

The installer can record a non-secret `--profile` and `--workspace-id`. It still stores only
references to `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`; `doctor` verifies the active binding.

## Contributions

Team contributions require explicit consent and a matching workspace key. Their sanitized source,
candidate, assessments, canonical records, and similarity comparisons retain team scope.

Personal-private contributions require a personal key and remain owner-scoped. Workspace keys may
submit only team contributions.

The unpaid/public Gemini extraction and embedding path rejects private and team records before any
provider call. Deterministic processing can continue locally; private semantic processing requires
an explicitly configured `approved_private` provider.

## Outcomes

Personal and workspace outcomes produce private aggregate overlays. They do not update public
outcome pointers, public ranking, or public safety state.

A workspace agent may report its private team outcome for a public KnownPath without exposing that
observation to the public aggregate.

## Sharing publicly

Public sharing is not a visibility update. An authorized user:

1. opens a private/team KnownPath;
2. supplies a newly generalized public payload;
3. explicitly consents;
4. runs sanitization again;
5. creates an immutable share request and a distinct low-trust public contribution.

The proprietary KnownPath remains unchanged whether the public contribution is submitted,
quarantined, or rejected.

## Tenant-safe search

Tenant-aware MongoDB indexes place visibility and owner/workspace fields before lifecycle or ranking
dimensions. Atlas Search and Vector Search definitions include those fields as filters.

Non-public retrieval does not send query text or record content to the public Gemini embedding
provider. Exact normalized-error and bounded lexical retrieval remain available. There is no
cross-tenant semantic fallback.

Public search and aggregates do not include private/team signals, counts, or existence hints.

## Administration and privacy

Platform admins see workspace and membership metadata needed for operations, not unrestricted tenant
content. Sanitized private contribution text is hidden by default and can be revealed only by an
authorized admin with:

- a session authenticated within 30 minutes;
- exact confirmation;
- a stated moderation/security reason;
- an audit event for every reveal.

The original unsanitized submission is never stored or displayed.

## Dashboard and routes

The dashboard supports workspace creation, existing-user invitations, acceptance/rejection, member
roles/removal, workspace-bound keys, default contribution scope, and public sharing.

The HTTP route inventory is in [API](API.md). Agent profile setup is in
[Agent installation](AGENT_INSTALLATION.md).

## Security model

Authorization lives in repositories and services as well as API routes. Every query carries an
explicit scope, and tenant identifiers are checked against the authenticated principal. See
[Security architecture](SECURITY_ARCHITECTURE.md) and [Privacy](PRIVACY.md).
