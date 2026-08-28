# Security operations

## Report a vulnerability

Do not open a public issue containing an exploitable vulnerability, credential, private record, or
tenant identifier. Use the repository's GitHub **Security > Report a vulnerability** private
advisory flow. Include the affected version/commit, minimal reproduction, impact, and safe contact
details. Do not test against data or accounts you do not own.

## Initial incident response

1. Preserve timestamps, request IDs, trace IDs, audit events, deployment revision, and affected
   provider status. Do not copy private source bodies into an incident chat or ticket.
2. Contain the path: revoke a key/session, suspend an account, pause a queue, disable a source, or
   restrict a record through the existing reversible operation. Avoid hard deletion.
3. Rotate the smallest affected credential set using the order below.
4. Inspect MongoDB audit/history records and Valkey queue/limit health. Treat logs/telemetry as
   supporting evidence, not the source of product truth.
5. Patch and verify in a bounded environment. Use request/tenant isolation checks before restoring.
6. Record impact, timeline, evidence, actions, and follow-up without including secrets/private text.

## Credential rotation

Never paste secrets into issues, commits, shell history, agent prompts, or logs.

### KnownPath API key

Issue a replacement through the authenticated API/dashboard, update the launching shell's
`KNOWNPATH_API_KEY`, verify `knownpath doctor`, then revoke the old key. Agent configurations
contain only the environment-variable reference and need no rewrite.

### `BETTER_AUTH_SECRET`

Generate a new independent 32-byte-or-greater value and update every API instance together. Existing
sessions may be invalidated; require users to sign in again. Never reuse `API_KEY_PEPPER`.

### `API_KEY_PEPPER`

Changing the pepper invalidates every stored API-key digest. Announce the maintenance window, rotate
the deployed value atomically across API/worker environments, issue replacement keys through a
trusted session/CLI flow, verify them, and revoke obsolete metadata. It must differ from the auth
secret.

### MongoDB

Create a least-privileged replacement database user/credential, deploy the new `MONGODB_URI`, verify
readiness and a bounded repository operation, then revoke the old credential. Review Atlas network
allowlists and access logs. Never place the URI in telemetry.

### Valkey

Rotate the provider credential/URL in the API and scheduled worker together. Production API startup
must prove `PING` before serving. MongoDB durable intent permits job reconciliation if ephemeral
queue state is lost, but operators must inspect incomplete pipeline steps before retrying.

### GitHub and Gemini

Revoke the old provider token/key first when compromise is suspected. Configure the replacement only
in the relevant worker/provider environment. GitHub tokens should retain only required public-data
capabilities. Gemini remains public-only unless an architecture decision approves private handling.

### OTLP exporter

Rotate collector headers at the collector/deployment secret layer. KnownPath does not parse or log
`OTEL_EXPORTER_OTLP_HEADERS`. Ensure the collector uses TLS and removes sensitive attributes again
as defense in depth.

## Routine operator checks

- Keep Dependabot alerts/security updates and CodeQL enabled for the public repository.
- Run `pnpm security:audit`, typecheck, lint, formatting validation, and build before a release.
- Review repeated private-content reveals, admin mutations, safety reports, and rate-limit spikes.
- Monitor MongoDB readiness, Valkey rate-limiter/queue state, queue depth/failures, provider quota
  events, empty-search rate, and recent outcome trends without content-bearing metric labels.
- Revalidate official-source origins, DNS behavior, paths, robots policy, attribution, and licenses
  before enabling a new source.
