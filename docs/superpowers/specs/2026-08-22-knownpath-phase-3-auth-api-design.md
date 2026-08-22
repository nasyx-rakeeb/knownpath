# KnownPath Phase 3 Authentication and API Foundation Design

**Date:** 2026-08-22

**Status:** Approved for implementation

**Scope:** Phase 3 only

## Goal

Establish a secure, reusable HTTP authentication and authorization foundation for future KnownPath
web, CLI, MCP, contribution, and private/team knowledge clients. Phase 3 provides
closed-registration human identity and sessions, machine API keys, authorization policies,
operational endpoints, API contracts, and audit primitives. It does not expose public registration
or implement knowledge search, ingestion, contribution, MCP, or dashboard behavior.

## Constraints

- Registration remains closed. Users and administrators are created only through a safe repository
  CLI.
- Public signup, email verification, password reset, OAuth, and user-facing account recovery are
  deferred.
- Human authentication uses a maintained open-source library rather than a custom password/session
  framework.
- API key plaintext is returned only at creation or rotation and is never stored or logged.
- MongoDB remains the only persistent database.
- Existing Phase 2 repositories remain the persistence boundary for KnownPath-owned records.
- No automated tests are added in this phase.

## Research Basis

The design is based on current official documentation consulted on 2026-08-22:

- [Fastify documentation](https://fastify.dev/docs/latest/) for server configuration, validation,
  request IDs, logging, and lifecycle.
- [Fastify logging reference](https://fastify.dev/docs/latest/Reference/Logging/) for Pino redaction
  and request logging.
- [Fastify server reference](https://fastify.dev/docs/latest/Reference/Server/) for explicit proxy
  trust.
- [Better Auth installation](https://www.better-auth.com/docs/installation),
  [options](https://better-auth.com/docs/reference/options),
  [sessions](https://better-auth.com/docs/concepts/session-management),
  [Fastify integration](https://better-auth.com/docs/integrations/fastify), and
  [MongoDB adapter](https://better-auth.com/docs/adapters/mongo).
- [Better Auth database schema](https://better-auth.com/docs/concepts/database),
  [admin plugin](https://better-auth.com/docs/plugins/admin), and
  [CLI](https://better-auth.com/docs/concepts/cli) for durable user creation and role support.
- Official Fastify plugins for [CORS](https://github.com/fastify/fastify-cors),
  [security headers](https://github.com/fastify/fastify-helmet),
  [rate limiting](https://github.com/fastify/fastify-rate-limit),
  [OpenAPI generation](https://github.com/fastify/fastify-swagger), and Swagger UI.
- [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html),
  [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
  and
  [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- [Node.js `crypto` documentation](https://nodejs.org/docs/latest-v24.x/api/crypto.html) for
  cryptographically secure random values, HMAC, and constant-time comparison primitives.

Package versions will be selected from the official npm registry at implementation time and pinned
through the workspace catalog. The rate limiter must be at least `11.2.0`, which contains the
official IPv6 normalization security fix.

## Selected Approach

Use Better Auth for password credentials and database-backed browser sessions, with its official
MongoDB adapter. Integrate it with a single KnownPath user identity rather than maintaining separate
auth and domain users. Better Auth's email/password signup is disabled, and the Fastify bridge
exposes only an explicit allowlist of session endpoints. Better Auth's documented default scrypt
password hashing is retained; it is memory-hard, supported natively by Node.js, and matches OWASP's
recommended fallback when Argon2id is unavailable.

Better Auth's API-key plugin is not selected. Phase 2 already established a KnownPath-specific
`api_keys` aggregate whose lifecycle, scopes, audit data, and future agent/MCP semantics belong to
the KnownPath domain. Replacing it with a second plugin-owned API-key model would duplicate the
source of truth.

Rejected approaches:

- Separate Better Auth and KnownPath user collections: reduces initial schema changes but creates
  duplicate identity records and synchronization failure modes.
- Custom password and session implementation: unnecessarily expands the security-critical code
  surface and conflicts with the mature-library requirement.
- JWT browser sessions: complicates revocation and is unnecessary for the current same-service
  architecture.

## Package and Dependency Boundaries

### `@knownpath/domain`

Owns versioned runtime schemas and TypeScript types for users, roles, API-key scopes, audit events,
principals, and public API request/response contracts that are independent of Fastify and MongoDB.

### `@knownpath/database`

Owns MongoDB collections, validators, indexes, connection lifecycle, and repositories. It exposes a
deliberately scoped Better Auth adapter factory backed by the same managed MongoDB connection; raw
`Db` and `MongoClient` values do not escape to applications.

Repository additions include user lifecycle operations, API-key listing and last-use updates, and
append-only audit-event creation/query primitives.

### `@knownpath/auth`

New reusable package owning:

- Better Auth configuration and server instance construction.
- API-key generation, hashing, verification, rotation, and revocation services.
- Authentication principal resolution for sessions and bearer API keys.
- Authorization policies for public, authenticated, scoped, and administrative access.
- Rate-limit policy declarations independent of the concrete Fastify limiter.
- Audit-event service calls for sensitive actions.

This package does not depend on Fastify, keeping it reusable by MCP and future non-HTTP clients.

### `@knownpath/api`

Owns HTTP transport concerns only: Fastify composition, routes, Zod type provider, OpenAPI, CORS,
security headers, request IDs, structured logging, rate-limit adapter, error mapping, and shutdown.

## User and Session Model

The Phase 2 user aggregate will be deliberately evolved while retaining stable UUID identifiers and
normalized email identity. Better Auth-required fields and KnownPath authorization fields become one
stored user document:

- `_id`: UUID generated by the configured auth ID generator.
- `schemaVersion`: persisted schema version.
- `email` and `normalizedEmail`: unique case-normalized identity.
- `emailVerified`: retained for future flows but false for ordinary CLI users unless deliberately
  set by an administrative flow.
- `displayName`: mapped from Better Auth's logical `name` field.
- `image`: optional future profile image.
- `role`: `user` or `admin` in Phase 3.
- `status`: `active`, `suspended`, or `deleted`.
- root creation/update timestamps required by Better Auth plus KnownPath audit metadata where the
  adapter can populate it consistently.

The implementation will use Better Auth schema field mappings and server-owned additional fields.
Database hooks normalize email and initialize KnownPath fields. MongoDB validation and indexes will
be updated idempotently. Since Phase 2 contains no production data and its verification record was
removed, this is an intentional schema evolution rather than a dual-write migration.

Better Auth owns separate `auth_sessions`, `auth_accounts`, and `auth_verifications` collections
because those records have independent lifecycle and security semantics. Sessions are
database-backed and revocable. Cookie names are framework-generated with secure production
attributes, `HttpOnly`, and an explicit SameSite policy.

## Closed Registration and CLI Provisioning

Email/password authentication is enabled only for existing users. `disableSignUp` is set, and no
OAuth, password-reset sender, magic link, email verification endpoint, or social provider is
configured.

The repository command `pnpm auth:user:create` prompts for email, display name, role, and a masked
password when not supplied safely. Passwords are never accepted through a committed file or logged.
The command invokes the same Better Auth server-side user-creation path used by normal framework
operations, so password hashing, schema hooks, uniqueness rules, and auditing remain consistent. It
supports creating both users and the initial administrator.

The HTTP Better Auth bridge uses an explicit allowed-path set for email sign-in, sign-out,
current-session retrieval, password change, active-session listing, and self-service session
revocation. Signup, password reset, email verification, email change, account deletion, and
administrative user-management endpoints are not exposed even if the underlying library supplies
them for trusted server-side use.

## API Keys

API keys use an identifiable, parseable structure with independent secret material:

`kp_<public identifier>_<random secret>`

- The identifier permits efficient record lookup and safe display.
- The secret is generated from at least 32 cryptographically secure random bytes.
- The full key is returned once after issue or rotation.
- MongoDB stores the public prefix/fingerprint and a deterministic HMAC-SHA-256 digest keyed by a
  required `API_KEY_PEPPER` environment secret.
- The hash version is stored to permit future rotation or algorithm migration.
- Verification checks status and expiration and uses constant-time comparison where secret-derived
  values are compared in process.

The initial scope vocabulary is closed and versioned:

- `account:read`
- `api-keys:read`
- `api-keys:write`
- `knowledge:read`
- `knowledge:contribute`

The last two reserve stable capabilities for later MCP and contribution phases but grant no routes
in Phase 3. Admin status is a user role, not an API-key scope. Keys cannot elevate beyond their
owning user's active status. Key listing returns metadata only. Rotation creates a new secret and
invalidates the replaced credential atomically from the service's perspective. Revocation is
irreversible. Last-used timestamps are updated on a bounded interval rather than on every request.

## Authentication and Authorization

The reusable principal model is a discriminated union:

- anonymous principal;
- session principal containing user identity and role;
- API-key principal containing user identity, key ID, and granted scopes.

Authorization policies are explicit functions:

- public: no principal requirement;
- authenticated: active user via session or API key;
- session-only: human session required for browser account/key management mutations;
- scope-required: API key or session with the named capability under the defined policy;
- admin: active session user with `admin` role.

Suspended or deleted users fail authentication regardless of credential validity. Team/workspace
context can be added to the principal later without changing route-layer authentication mechanics.

## HTTP Surface

Business API routes use `/api/v1`. Operational endpoints remain unversioned.

Initial endpoints:

- `GET /health/live`: process liveness without dependency details.
- `GET /health/ready`: MongoDB/auth readiness with only component status and no secrets.
- `GET /api/v1/openapi.json`: OpenAPI contract.
- `GET /docs`: Swagger UI in development and explicitly configurable deployments.
- Better Auth session routes under `/api/v1/auth/*`, constrained by the allowlist.
- `GET /api/v1/account/me`: authenticated account/principal summary.
- `GET /api/v1/api-keys`: key metadata for the session user.
- `POST /api/v1/api-keys`: issue a key and return plaintext once.
- `POST /api/v1/api-keys/:id/rotate`: replace a key and return the new plaintext once.
- `POST /api/v1/api-keys/:id/revoke`: revoke a key.

Key-management mutations are session-only to prevent a leaked agent key from minting replacement
credentials. The account endpoint accepts either a session or a key with `account:read`, providing
the required protected machine-client verification path.

## Validation, Errors, and OpenAPI

Zod remains the runtime schema authority. `fastify-type-provider-zod` supplies current Fastify
5-compatible validation, serialization, and OpenAPI transformation.

Errors use one stable envelope:

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "Safe human-readable message",
    "details": []
  },
  "requestId": "server-generated-id"
}
```

Validation, authentication, authorization, not-found, conflict, rate-limit, and unexpected failures
are mapped centrally. Unexpected errors are logged with the request ID while responses omit internal
details.

OpenAPI 3 documents the bearer API-key scheme, cookie-session behavior, request/response schemas,
stable error envelope, and route authorization requirements. Better Auth's internal implementation
routes are documented only where they are intentionally exposed.

## Logging and Request Correlation

Fastify generates request IDs server-side and returns `x-request-id`. Arbitrary caller values are
not trusted as the server identifier. A valid inbound correlation value may be recorded separately
after length and character validation.

Pino redaction covers at least:

- `authorization` and `proxy-authorization` headers;
- cookies and `set-cookie`;
- API-key-specific headers if later introduced;
- password, token, secret, session, and key fields in logged objects.

Request bodies and response bodies are not logged. Route logging records method, route pattern,
status, duration, request ID, and safely resolved client address. Better Auth telemetry remains
disabled.

## Network and Cookie Security

- CORS is disabled unless an explicit origin allowlist is configured. Credentialed CORS never uses a
  wildcard origin.
- Proxy trust defaults to false and accepts only explicit hop counts or trusted proxy
  addresses/networks.
- Better Auth receives a required explicit base URL and trusted origins rather than inferring
  security-sensitive values from forwarded headers.
- Production requires HTTPS-facing configuration and secure cookies. Development permits non-secure
  localhost cookies only under an explicit development environment.
- Security headers are applied through the official Fastify Helmet plugin.
- Session-bearing responses use appropriate cache prevention headers.

## Rate Limiting

`@knownpath/auth` defines named policies such as sign-in, authenticated API, and API-key mutation.
The API adapts those policies to `@fastify/rate-limit` using its in-memory store for the Phase 3
single-process development foundation. It uses the patched IPv6-normalizing release and returns the
standard KnownPath error envelope.

The interface permits a distributed implementation later without changing routes. No Redis/Valkey
service is introduced in Phase 3, and documentation states that limits are per-process until
distributed infrastructure is deliberately selected.

## Audit Events

An append-only `audit_events` collection records sensitive actions without credentials:

- CLI user/admin creation;
- successful and failed sign-in categories where safely observable;
- session revocation;
- API-key issue, rotate, revoke, and authentication rejection categories;
- administrative authorization decisions where appropriate.

Events contain a stable ID, schema version, event type, occurred timestamp, actor kind/user/key IDs,
target kind/ID, request ID, sanitized network context, outcome, and bounded metadata. No password,
session token, full API key, hash, Authorization header, or cookie is allowed in metadata. Indexes
support actor/time, target/time, event type/time, and request ID lookup. Retention is documented but
no deletion job is added in this phase.

## Configuration

Phase 3 adds validated configuration for:

- `NODE_ENV` or an equivalent explicit runtime mode;
- public API/auth base URL;
- Better Auth secret with minimum strength and no default;
- API-key pepper with minimum strength and no default;
- CORS and Better Auth trusted-origin allowlists;
- cookie security/SameSite settings where configurable;
- explicit proxy trust;
- rate-limit policy values;
- OpenAPI UI exposure;
- last-used write interval.

`.env.example` contains descriptions and generation commands but no real secrets. Production startup
fails closed for missing or unsafe secrets and contradictory cookie/origin configuration.

## Lifecycle and Failure Behavior

API startup loads and validates configuration, opens MongoDB, constructs repositories/auth services,
registers framework plugins and routes, and then listens. Readiness remains false until MongoDB and
auth construction succeed. Shutdown stops accepting requests, closes Fastify, and closes MongoDB
exactly once.

Authentication dependency failures fail protected requests closed. Liveness remains available while
readiness reports unavailable. Neither endpoint returns connection strings, database names, secret
status, user counts, or stack traces.

## Verification Plan

Without adding tests:

1. Install dependencies and run format validation, lint, typecheck, and build.
2. Start local MongoDB and run database initialization twice.
3. Inspect auth/audit collections and named indexes directly.
4. Create a temporary administrator through the masked CLI flow.
5. Boot the API and inspect liveness, readiness, OpenAPI JSON, and Swagger UI.
6. Sign in, inspect the account endpoint, issue an API key, and save the one-time plaintext only in
   a temporary shell variable.
7. Use the key on `/api/v1/account/me`; verify malformed and random keys fail.
8. Rotate the key, verify the old key fails and the new key works, then revoke it and verify it
   fails.
9. Inspect key metadata, last-used behavior, audit events, and application logs for credential
   leakage.
10. Remove the temporary key and user/account/session records through bounded repository/CLI
    cleanup, then inspect generated artifacts and git status.

## Deferred Work

- Public signup and user-facing onboarding.
- Email verification, password reset, recovery, and transactional email.
- OAuth, passkeys, magic links, and other passwordless flows.
- Team/workspace membership and role policies.
- Distributed rate limiting.
- Search, ingestion, contribution, MCP, Agent Skill, installer, and dashboard behavior.
- Automated tests, per the phase constraint.
