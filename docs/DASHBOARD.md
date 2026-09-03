# User dashboard

The KnownPath dashboard is the developer-facing interface for account management, agent setup,
knowledge exploration, contributions, outcomes, and workspaces. Platform ingestion and moderation
live in the separate admin console.

## Access

Registration is closed. Operators provision users through the masked `pnpm auth:user:create`
command. The dashboard provides:

- email/password sign-in;
- password change;
- session listing and revocation;
- profile display-name changes.

It does not expose signup, password reset, email verification, OAuth, or email-address changes.

## Routes

| Route                   | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `/`                     | Product overview                                                 |
| `/sign-in`              | Closed-registration sign-in                                      |
| `/app`                  | 30-day private activity summary                                  |
| `/app/explore`          | Search public, personal, or authorized workspace knowledge       |
| `/app/known-paths/[id]` | Inspect solution, applicability, trust, outcomes, and provenance |
| `/app/api-keys`         | Create, list, rotate, and revoke API keys                        |
| `/app/install`          | Installer onboarding for supported coding agents                 |
| `/app/contributions`    | Owned sanitized contributions and processing state               |
| `/app/outcomes`         | Owned outcome history and aggregate influence                    |
| `/app/workspaces`       | Workspaces, invitations, members, keys, and defaults             |
| `/app/settings`         | Profile, privacy mode, password, and sessions                    |

## Knowledge exploration

Explore accepts natural-language problems, exact errors, ecosystem, packages, versions, platform,
and semantic preference. Search defaults to published public knowledge. Personal and workspace
scopes are explicit and authorized by the backend.

Result cards explain:

- why the record matched;
- version and platform applicability;
- source/evidence trust;
- freshness;
- aggregate outcome state;
- important caveats;
- provenance links.

Detail pages progressively reveal ordered steps and bounded evidence. The interface presents
KnownPaths as evidence, not guaranteed instructions.

Review records are not available through the ordinary user dashboard.

## API-key management

Users can issue keys with explicit scopes, inspect non-secret metadata, rotate, and revoke. The full
key is displayed only once after creation or rotation.

Plaintext remains only in transient browser component state. It is not written to:

- HTML rendered by a Server Component;
- URLs;
- local storage;
- server logs;
- subsequent list responses.

The reveal dialog requires acknowledgement before it closes. Revocation takes effect at the backend;
agent config need not change when it references an environment variable.

## Installer onboarding

The install page presents the real `npx knownpath install` flow and supported clients. Broad OS
detection happens only in the browser and is not sent to KnownPath.

Current setup still requires `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY` in the agent's launch
environment. See [Agent installation](AGENT_INSTALLATION.md).

## Contributions and privacy

Contribution history shows only the current user's sanitized records and their status, trust, and
processing stage.

Settings support:

- `ask` — agents may request explicit consent;
- `disabled` — contribution submissions fail.

There is no silent sharing mode. Public, private, and workspace scope is selected per submission and
enforced server-side. See [Contributions](CONTRIBUTIONS.md).

## Outcomes

Outcome history is private to the current user. It shows the reported classification, target,
timestamp, influence state, and safe aggregate context without exposing other reporters or notes.
Search/view activity is separate from actual attempted outcomes.

## Workspaces

Users can:

- create a workspace;
- invite an existing KnownPath user by email;
- accept or reject invitations;
- update roles or remove members according to their role;
- issue and revoke workspace-bound keys;
- choose a default private/team contribution scope;
- submit a separately sanitized public share request.

Workspace authorization is performed by the API, not by route visibility. See
[Workspaces](WORKSPACES.md).

## Browser security boundary

- Server Components fetch runtime-validated DTOs from Fastify and forward only the incoming session
  cookie.
- Responses are not cached.
- Browser mutations pass through the same-origin `/api/knownpath/*` bridge.
- The bridge has an explicit route allowlist, a 64 KiB body ceiling, and supports only GET, POST,
  and PATCH.
- The bridge cannot proxy arbitrary or admin endpoints.
- Authorization headers and API-key values are not forwarded.
- Session lists use non-secret IDs; Better Auth tokens never appear in dashboard responses.

## Accessibility and visual system

The primary design uses warm cream and deep green with restrained amber/red status surfaces.
Evidence and lifecycle hierarchy use text, labels, borders, and spacing rather than color alone.

Interactive controls have visible keyboard focus. Dialogs provide managed focus and Escape behavior,
mobile navigation uses a modal dialog, and nonessential motion respects `prefers-reduced-motion`.

## Local development

Set the server-side API origin explicitly:

```sh
export KNOWNPATH_API_URL="http://127.0.0.1:3001"
pnpm --filter @knownpath/web dev
```

The dashboard has no API-origin fallback. Start the API with its normal MongoDB/auth configuration
and include the dashboard origin in the trusted-origin settings.
