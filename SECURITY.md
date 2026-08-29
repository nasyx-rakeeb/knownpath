# Security policy

## Supported versions

KnownPath is under active phased development. Security fixes target the latest published `knownpath`
npm package and current `main` platform release. Older unreleased snapshots and operator-modified
deployments are not maintained as separate support lines.

## Report a vulnerability

Use GitHub's **Security → Report a vulnerability** private reporting flow for this repository. Do
not open a public issue or pull request for an unpatched vulnerability.

Include the affected component/version, preconditions, bounded reproduction, impact, and suggested
mitigation. Do not include real credentials, private knowledge, tenant identifiers, production
database exports, personal data, or destructive proof-of-concept payloads. Use synthetic values and
state whether any live data may have been accessed.

The maintainer will acknowledge a report as availability permits, investigate privately, coordinate
a fix and advisory, and credit the reporter when requested and safe. This policy does not promise a
paid bounty or fixed response SLA.

## Security boundaries

- API keys are stored only as keyed hashes and are revealed once.
- Registration is closed; admin creation uses the masked CLI.
- Tenant/visibility checks are server-side across ID reads, search, MCP, and dashboards.
- Public/unpaid Gemini processing rejects private and workspace data before provider calls.
- Source fetching uses allowlists, DNS/global-IP validation, connection pinning, bounded redirects,
  and response/time limits.
- Production distributed rate limiting requires Valkey and fails closed.
- Logs and telemetry exclude credentials, content-bearing queries, tenant identifiers, and private
  source/contribution bodies.
- High-impact administration requires a fresh session, reason, exact confirmation, and audit event.

The full threat model is in [Security architecture](docs/SECURITY_ARCHITECTURE.md). Operators should
follow [Security operations](docs/SECURITY_OPERATIONS.md) for triage, containment, credential
rotation, recovery, and disclosure.

## Dependency reports

Dependabot, dependency review, CodeQL, and high-severity pnpm audit workflows provide the repository
baseline. Report suspected compromised packages or publishing credentials through the same private
channel.
