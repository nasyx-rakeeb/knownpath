# KnownPath zero-config hosted onboarding design

**Date:** 2026-09-04

**Status:** Approved for implementation

## Goal

Make `npx knownpath install` the complete normal-user onboarding path. The CLI selects the official
hosted API, opens a browser for signup or sign-in, obtains explicit device authorization, stores a
dedicated machine credential in the operating system credential store, installs the MCP bridge and
Agent Skill, and verifies the connection. Agent configuration contains only the command
`npx -y knownpath mcp`; it contains no KnownPath URL or credential.

Self-hosting remains an explicit advanced path. Existing `KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`
installations remain supported as environment-based overrides.

## Research basis

The design was checked against current primary documentation on 2026-09-03 and 2026-09-04:

- [OAuth 2.0 Device Authorization Grant (RFC 8628)](https://www.rfc-editor.org/rfc/rfc8628)
- [Better Auth Device Authorization](https://better-auth.com/docs/plugins/device-authorization) and
  [OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider)
- [OpenAI Codex MCP configuration](https://developers.openai.com/codex/mcp)
- [Claude Code MCP configuration](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Cursor MCP configuration](https://cursor.com/docs/context/mcp)
- [Gemini CLI MCP servers](https://geminicli.com/docs/tools/mcp-server/)
- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/)
- [`@napi-rs/keyring`](https://github.com/Brooooooklyn/keyring-node), which delegates to macOS
  Keychain, Windows Credential Manager, and Linux Secret Service through maintained native bindings.

The repository currently uses Better Auth 1.7.1; the device authorization plugin is exported by the
current 1.7.2 release. The implementation will update Better Auth and its MongoDB adapter together
after verifying their peer compatibility.

## Selected architecture

Use Better Auth's maintained Device Authorization plugin for code creation, browser claiming,
approval, denial, polling intervals, expiry, and one-time device-code redemption. Do not introduce a
second long-lived OAuth credential model.

The approved device grant returns a short-lived Better Auth session token. The CLI uses that token
exactly once at a KnownPath credential-exchange endpoint. The endpoint atomically revokes the
temporary session before issuing a normal KnownPath API key. This reuses the existing API-key
hashing, prefix, scope, expiry, last-used, revocation, dashboard, and audit behavior. A second
exchange with the same device session fails, so concurrent or replayed exchanges cannot mint
additional credentials.

Rejected alternatives:

- Better Auth OAuth Provider access tokens would be standards-compliant but would duplicate the
  existing API-key principal, scope, storage, rotation, and dashboard lifecycle.
- A custom device-code collection and polling protocol would connect directly to API-key issuance
  but would unnecessarily reimplement RFC 8628 security behavior already supplied by Better Auth.

## Registration modes

Add a validated registration mode with values `open` and `closed`.

- The official hosted deployment explicitly uses `open`.
- Self-hosted deployments default to `closed` and may opt into `open`.
- In open mode, the dashboard exposes Better Auth email/password signup and sign-in.
- In closed mode, signup remains disabled; existing or operator-provisioned users can still approve
  devices.

Registration, browser authentication, device authorization, and machine-credential issuance remain
separate operations. Successful signup does not create a machine credential until the user reviews
and approves the pending device request.

## Hosted origin and configuration precedence

Define the official hosted API origin once in the published CLI configuration module. The candidate
origin is `https://knownpath-api.onrender.com`, but it is committed as the default only after a live
health check confirms that deployment. No other runtime module duplicates the literal.

The effective API origin and credential source follow this order:

1. explicit CLI `--api-url` and authentication choice;
2. complete legacy `KNOWNPATH_API_URL` plus `KNOWNPATH_API_KEY` overrides;
3. the selected stored KnownPath profile and its keychain credential;
4. the official hosted API origin with browser authentication when needed.

Partial legacy configuration fails clearly. There is no localhost fallback. A self-hosted origin may
use the same browser/device flow or the explicit legacy API-key mode.

The API receives a separate validated public dashboard origin. Better Auth returns a verification
URL on that origin. The Render blueprint adds a deployable web service and wires the API and web
origins through service configuration; users never need the web origin in CLI configuration.

## Device authorization flow

1. The CLI requests a device code for the fixed public client `knownpath-cli` and the standard
   machine scopes.
2. Better Auth validates the client and exact scope set, generates high-entropy device and
   human-friendly user codes, stores them in MongoDB, returns a short expiry and polling interval,
   and supplies the configured dashboard verification URL.
3. The CLI opens the verification URL using a maintained cross-platform browser launcher. If that
   fails, it prints the URL and user code without including the device bearer secret.
4. The dashboard requires signup/sign-in, claims the user code through Better Auth, shows the client
   label and requested scopes, and requires explicit approve or deny action.
5. The CLI polls no faster than the returned interval, honors `authorization_pending`, adds five
   seconds for `slow_down`, backs off after network failures, stops on denial/expiry, and supports
   cancellation.
6. After approval, the CLI receives the temporary Better Auth session token over HTTPS and sends it
   in an Authorization header to the one-time machine-credential exchange endpoint.
7. The backend authenticates that temporary session, revokes it atomically, issues one existing
   KnownPath API key, and returns the plaintext once with safe credential metadata.
8. The CLI stores the plaintext in the native credential store, writes only non-secret profile
   metadata, verifies `/api/v1/mcp/status`, and continues the existing installer plan.

Better Auth device-code state is durable MongoDB state. Distributed Fastify/Valkey limits cover code
creation, polling, approval/denial, and exchange. Audit events contain client and credential
identifiers but never device codes, user codes, session tokens, or API-key plaintext.

## Machine credential policy

The standard personal installation receives a dedicated API key with:

- `knowledge:read`
- `knowledge:contribute`
- `knowledge:outcome`

The browser approval screen lists these scopes before approval. Possessing `knowledge:contribute`
does not constitute publication consent: public contributions still require the existing explicit
per-submission consent and sanitization rules, and user contribution mode remains `ask` by default.

The key name is a bounded, non-sensitive client label such as `KnownPath CLI on macOS`, optionally
followed by a short installation identifier. The credential has a documented finite lifetime, is
independently revocable, exposes only prefix/metadata after issuance, and is visible in existing
account key management. Workspace-bound credentials continue to require server-authorized workspace
membership; a local workspace ID can never grant access by itself.

## Credential storage and profiles

Add a small CLI credential-store interface with a real `@napi-rs/keyring` implementation:

- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service

The credential value is never written to installer state, profile JSON, agent configuration,
backups, shell profiles, command arguments, logs, or telemetry. The implementation does not silently
fall back to a plaintext or custom-encrypted file. If the native store is unavailable, interactive
hosted login fails with platform-specific setup guidance; users may deliberately choose the legacy
environment path for headless/self-hosted use.

A versioned per-user profile document stores only API origin, keychain account reference, safe key
metadata, profile name, optional authorized workspace binding, and timestamps. The default profile
is selected when no `--profile` is supplied. Agent configurations for a non-default profile append
`--profile <name>` to the stdio bridge command but still contain no secret.

## CLI behavior

Add `login`, `logout`, and `whoami` because each owns a distinct credential lifecycle:

- `login` authenticates or reuses a valid keychain credential for a selected origin/profile.
- `logout` revokes the selected server credential when reachable, removes it from the keychain, and
  removes only the corresponding non-secret profile metadata. It does not uninstall MCP or skills.
- `whoami` resolves the effective profile and calls the authenticated account endpoint without
  printing secrets.

`install` resolves authentication before applying installer changes. A valid existing stored
credential is reused. A revoked or expired credential triggers a fresh browser flow rather than
creating duplicate keys on every install. `update` migrates installer-owned environment-forwarding
entries to the secret-free stdio command. `uninstall` removes MCP/skill ownership only and does not
log out or revoke credentials.

`--dry-run` never opens a browser, polls, stores, issues, or revokes credentials. It reports the
selected origin, credential source, whether authentication would be required, agents detected, and
planned file/configuration changes. JSON output contains stable auth status codes and only safe
metadata.

## MCP bridge and adapters

The stdio bridge resolves API origin and credential at process startup, holds the credential only in
memory, and forwards it in an HTTPS Authorization header. Stdout remains MCP protocol traffic and
stderr errors contain stable redacted categories.

The desired hosted configuration for Codex, Claude Code, Cursor, Gemini CLI, and OpenCode is the
same command shape:

```text
npx -y knownpath mcp
```

No TOML, JSON, JSONC, skill file, environment block, or command argument contains the credential.
Legacy environment-reference entries remain recognized so `update` can migrate an installer-owned
entry safely. Direct configuration writes retain the existing symlink checks, atomic writes,
backups, merge behavior, ownership tracking, and conflict handling.

## Dashboard changes

Add:

- `/sign-up` for open registration mode;
- `/device` for authenticated device-code verification and explicit approval/denial;
- a return-to-device path through sign-in/signup without accepting arbitrary external redirects;
- a machine-credential section based on existing safe API-key metadata, with client label, prefix,
  scopes, created/last-used/expiry timestamps, and revocation.

The dashboard never receives or displays machine credential plaintext. It displays the device client
and scopes from server-validated pending authorization state. Approval and denial are
server-enforced and session-bound.

## API, rate limits, and audit

Expose only the Better Auth device endpoints required for code creation, verification, polling,
approval, and denial, plus a versioned KnownPath exchange endpoint. Add strict runtime schemas,
small body limits, `no-store` headers, stable errors, request IDs, safe logging, and explicit
OpenAPI descriptions.

Add distinct distributed policies for device-code creation, polling, approval/denial, failed code
verification, and credential exchange. Production requires Valkey as it does for other security
limits. Better Auth and MongoDB enforce unique device/user codes and consumed status; session
revocation makes exchange one-time.

Add audit event types for authorization initiation, approval, denial/expiry, machine credential
issuance, and CLI logout. Audit metadata is low-cardinality and excludes raw codes and credentials.

## Security boundaries

- Device and user codes expire quickly; device codes are high entropy and user codes use a bounded,
  unambiguous alphabet.
- Browser approval requires an authenticated active user and same-session claim.
- Signup, sign-in, code verification, polling, approval, and exchange are separately rate-limited.
- Polling obeys RFC 8628 interval and `slow_down` semantics.
- Device redemption and credential exchange are each one-time and replay-resistant.
- Browser mutations retain Better Auth/Fastify origin and CSRF protections.
- Redirect targets are internal allowlisted paths, not caller-controlled URLs.
- API-key plaintext exists only in backend response memory, CLI process memory, and the OS
  credential store.
- Logs, errors, JSON output, backups, and OpenTelemetry exclude codes, tokens, headers, user IDs,
  workspace IDs, and other sensitive/high-cardinality values.

## Verification strategy

Do not create a broad automated test project. Perform bounded integration verification with an
isolated home/config root and development MongoDB/Valkey:

- fresh open-registration signup, device approval, key exchange, keychain persistence, install,
  doctor, and real MCP status/search;
- repeated install without browser launch, duplicate key, duplicate MCP entry, or duplicate skill;
- revoked credential detection and reauthentication;
- logout revocation/removal without uninstalling, and uninstall without logging out;
- closed-registration rejection and existing-account approval;
- self-hosted browser flow and legacy environment-key override;
- all five adapter dry-runs, locally available real clients, and isolated configuration fixtures for
  unavailable clients;
- credential scans across tracked files, installer state, profiles, agent configs, backups, logs,
  telemetry, and process arguments;
- install from the packed CLI and final format, typecheck, lint, build, package, audit, and diff
  checks.

Live hosted verification requires a reachable hosted API, a deployed dashboard origin, current
production environment values, and the updated npm package. External deployment and publication are
not implicit in this implementation task.

## Documentation and release boundary

Update the public README, CLI package README, installation, installer, MCP, API, dashboard,
deployment, security, privacy, decision, environment, and progress documentation to lead with the
one-command hosted flow while retaining explicit self-hosted and legacy sections.

Do not create a numbered product phase. Do not publish npm, create a GitHub release, or deploy
external services without separate explicit authorization.
