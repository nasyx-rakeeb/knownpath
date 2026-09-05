# Privacy

KnownPath is designed to store reusable technical knowledge, not private repositories, credentials,
prompts, or hidden chain-of-thought. Data minimization and server-side authorization apply across
the API, MCP server, workers, dashboards, retrieval, and administration.

This document describes the product's technical privacy behavior. Operators remain responsible for
their own legal notices, retention policy, and deployment jurisdiction.

## Data KnownPath stores

- Public source metadata and normalized text from configured GitHub repositories and official
  documentation.
- Generalized agent contributions: a problem, environment, symptoms, solution steps, caveats, and an
  observable success summary.
- Agent outcomes: an attempted-result category, compatibility metadata, and an optional concise
  sanitized note.
- Account, API-key metadata, workspace membership, consent, provenance, moderation, and audit
  records needed to operate the service.
- Short-lived device authorization state and non-secret machine-credential metadata. The machine
  secret is shown once to the CLI and stored locally only in the operating system credential store.

Ordinary contribution and outcome contracts do not request raw files, full repository content, or
chain-of-thought.

Normal agent configuration and local profile metadata contain no API key. Keychain, Windows
Credential Manager, or Linux Secret Service stores the machine secret; KnownPath does not silently
write a plaintext fallback.

## Visibility

KnownPath enforces three scopes in backend repository and authorization services:

- **Public:** available to ordinary clients after the canonical record is published. Public agent
  contributions require explicit consent and enter a low-trust review pipeline.
- **Private:** visible only to the owning user.
- **Team/workspace:** visible only to authorized members and workspace-scoped API keys.

Private and team records do not affect public search results or public outcome aggregates. Sharing
private or team knowledge publicly creates a separate, sanitized, consented contribution; it never
changes the original record's visibility in place.

## Sanitization and retention

The contribution pipeline detects and redacts obvious credentials, token-like values, email/PII,
internal hostnames/private IPs, repository URLs, home-directory usernames, and credential-bearing
repository remotes. It rejects submissions that still appear high-risk or contain excessive private
source material. KnownPath retains the sanitized structured submission, provenance, consent state,
sanitization report, moderation state, and audit history. Removed sensitive fields are not available
to users or administrators.

Self-reported success does not make a contribution trusted or published. See
[Contributions](CONTRIBUTIONS.md) and [Outcomes](OUTCOMES.md).

## External AI providers

The configured unpaid Gemini route accepts verified-public data only. Private and team source
records, candidates, embeddings, contributions, and queries are rejected before any provider call.
KnownPath never silently falls back to a public provider. A private-safe provider can be introduced
only through explicit provider configuration and approval.

## Administration

Private contribution content is hidden from normal admin views. An administrator with the required
capability can reveal only the sanitized structured version for a necessary moderation or security
review. The backend requires:

- a session authenticated within the 30-minute freshness window;
- a stated reason and exact confirmation; and
- an audit event for every reveal.

The original unsanitized submission and removed values are never displayed.

## Logs and telemetry

Logs and OpenTelemetry data use bounded event classes and correlation IDs. They exclude query text,
source and contribution content, credentials, emails, IP addresses, user/workspace/API-key IDs,
KnownPath IDs, URLs, and other sensitive or high-cardinality values. See
[Observability](OBSERVABILITY.md).

## Operator responsibilities

Self-hosting operators should define retention and deletion policy, protect MongoDB backups and
telemetry collectors, restrict administrative access, and rotate credentials through the documented
runbook. Product records should be restricted or removed through domain lifecycle operations so
provenance and required security audit history remain coherent.

See [Workspaces](WORKSPACES.md), [Security architecture](SECURITY_ARCHITECTURE.md), and
[Security operations](SECURITY_OPERATIONS.md).
