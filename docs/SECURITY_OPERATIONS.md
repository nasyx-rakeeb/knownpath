# Security operations

This runbook is for operators responding to credential exposure, account abuse, ingestion attacks,
or infrastructure compromise. For design boundaries, see
[Security architecture](SECURITY_ARCHITECTURE.md).

## Report a vulnerability

Use the repository's GitHub **Security → Report a vulnerability** private advisory flow. Do not put
exploitable details, credentials, private records, or tenant identifiers in a public issue. Include
the affected version or commit, impact, a minimal safe reproduction, and contact details. Test only
against systems and data you own or are authorized to assess.

## Incident response

1. Preserve timestamps, deployment revision, request/trace IDs, and relevant audit events without
   copying private source content into incident tooling.
2. Contain the smallest affected path: revoke a key/session, suspend an account, pause a queue,
   disable a source, or apply a reversible moderation state.
3. Rotate the affected credentials and redeploy all consumers atomically where required.
4. Inspect MongoDB audit/history records and Valkey queue/limit health. Logs and telemetry are
   supporting evidence, not product truth.
5. Patch and verify the affected boundary with bounded tenant, authentication, and provider checks.
6. Record impact, timeline, actions, and follow-up without retaining credentials or private text.

## Credential rotation

Never put secrets in issues, commits, shell history, agent prompts, or logs.

### KnownPath API key

For a CLI-device credential, revoke it in the dashboard or run `knownpath logout`, then run
`knownpath login` or `knownpath install` to authorize a replacement and save it in the native OS
credential store. Agent configuration does not need rewriting and contains no secret.

For an advanced manual/environment key, create a replacement through the dashboard/API, update both
the secure environment source and all consumers, run `knownpath doctor`, then revoke the old key.

### Session and API-key secrets

- **`BETTER_AUTH_SECRET`:** replace it on every API instance together. Existing sessions may become
  invalid and users should sign in again.
- **`API_KEY_PEPPER`:** changing it invalidates every existing API-key digest. Plan a maintenance
  window, deploy the new value atomically, issue replacements through a trusted flow, verify them,
  and revoke obsolete metadata.

The two values must be independent and at least 32 bytes.

### MongoDB

Create a least-privileged replacement database credential, deploy the new `MONGODB_URI`, verify
readiness and a bounded repository operation, then revoke the old credential. Review network
allowlists and access records. Never expose the URI in telemetry.

### Valkey

Rotate `QUEUE_REDIS_URL` for API and worker deployments together. Production API startup must prove
the limiter connection before serving. MongoDB retains durable pipeline intent, but if queue state
was lost, reconcile and inspect incomplete steps before retrying.

### GitHub, Gemini, and OTLP

Revoke a compromised provider credential, install its replacement only in the workers or service
that needs it, and verify a bounded operation. GitHub credentials should have only necessary public
read access. Gemini remains public-only unless an explicitly approved private-safe provider is
configured. Rotate OTLP headers at the deployment/collector secret layer and require TLS.

## Common incidents

### Compromised user or workspace key

Revoke the key, inspect key usage and audit events, invalidate relevant sessions if account control
is uncertain, and review workspace membership. Do not disclose inaccessible resource existence in
support responses.

### Suspicious contribution or safety report

Use moderation states and safety review queues; preserve provenance. A single safety report should
trigger review, not an automatic ranking penalty or delisting. Check independent reporters,
sanitization results, related outcomes, source evidence, and repeated-account behavior before taking
broader action.

### Ingestion abuse or SSRF denial

Keep the source disabled while reviewing its registry origin/path, DNS answers, redirect chain,
robots policy, attribution, and ownership. Do not bypass the SSRF guard to make a source sync pass.
Quarantine poison items individually so one item does not block a run.

### Queue outage or poison job

Confirm MongoDB durable state first. Restore Valkey, inspect failed/stalled jobs and retry counts,
then use targeted reconciliation or retry commands. Do not replay an unbounded pipeline until the
idempotency key and failure cause are understood.

### Vulnerable dependency

Review Dependabot, CodeQL, dependency-review, and `pnpm security:audit` findings. Confirm
reachability and exploitability, upgrade through the lockfile, run repository verification gates,
and document any time-bounded exception. Do not suppress an advisory solely to make CI green.

## Routine checks

- Review repeated private-content reveals, sensitive admin mutations, account suspensions, safety
  reports, and rate-limit spikes.
- Monitor MongoDB readiness, Valkey limiter/queue health, queue depth/failures, provider quota
  events, empty-search rate, and outcome trends without content-bearing labels.
- Revalidate official-source origins, paths, DNS behavior, robots policy, attribution, and license
  before enabling a source.
- Run `pnpm security:audit`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build`
  before release.
- Test backup restoration and the first-admin recovery flow in an isolated environment.
