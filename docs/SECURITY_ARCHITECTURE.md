# Security architecture

KnownPath protects account credentials, tenant knowledge, provider secrets, source evidence, and
ranking integrity at API and domain boundaries. Dashboard navigation and Agent Skill instructions
are usability controls, not authorization controls.

## Trust boundaries

```text
browser / CLI / MCP host
           │ untrusted input
           ▼
Fastify API ── authorization, validation, limits, safe DTOs
   │       │
   │       └── Valkey: queues, leases, schedules, distributed limits
   ▼
MongoDB: durable product state and tenant-scoped records
   │
   ├── workers ── allowlisted GitHub/docs fetches
   └── public-only provider gate ── Gemini
```

- Browsers, API clients, and MCP hosts are untrusted callers.
- The local stdio MCP server is a thin HTTP bridge. It has no MongoDB, Valkey, GitHub, or Gemini
  credentials.
- MongoDB is the durable source of truth. Private and team reads require an owner/workspace
  predicate derived from authenticated server state, including direct-ID lookups.
- Valkey stores ephemeral queue, coordination, and rate-limit state only.
- GitHub, documentation pages, agent contributions, and model output are untrusted evidence.
- Gemini is an external processor. The unpaid configuration is public-only and fails closed for
  private or team data.
- Administrative authority is constrained by capabilities, recent authentication, confirmation,
  reasons, reversible actions, and audit events.

## Authentication and authorization

Web sessions use secure, HttpOnly cookies in production. Cookie-authenticated mutations require an
exact trusted `Origin`; CORS uses an explicit origin allowlist. API keys are shown once, stored as a
keyed digest plus non-secret identification metadata, and authorized by scopes. Authorization,
cookies, keys, tokens, and response cookies are centrally redacted from logs.

CLI login uses short-lived, rate-limited device and user codes. Browser approval requires an active
session and matching claimed request; polling respects server intervals, approved grants are
consumed once, and exchange issues a separate expiring `cli_device` API key rather than reusing the
browser cookie. Device lifecycle actions are audited without raw codes. The CLI saves the key only
through native OS credential storage and writes no secret to agent config or profile metadata.

Workspace access is resolved from current membership and role state. Workspace-bound keys cannot
escape their workspace. Inaccessible private identifiers are handled like nonexistent records to
avoid revealing their existence.

## Request and MCP controls

Fastify applies bounded body, parameter, request, connection, and keep-alive limits. Routes tighten
limits for search, contributions, outcomes, workspaces, and administration. The remote MCP endpoint
validates authentication, `Host`, `Origin`, JSON-RPC size, tool input, and transport policy. MCP
mutations have stricter per-key limits, and results are compact, sanitized, and labeled as untrusted
evidence.

Production requires a reachable Valkey-backed distributed limiter. In-memory limiting is available
only through explicit local-development configuration; there is no automatic fallback. Policies
distinguish sign-in/signup, device creation/polling/approval/exchange, MCP mutations,
provider-backed retrieval, contributions, outcomes, admin mutations, search, and reads. BullMQ
separately controls provider/source concurrency.

## Source ingestion and SSRF

Official-source requests require an exact HTTPS origin and allowed path, a standard port, and a
globally routable DNS result. The fetcher validates A and AAAA records, pins the resolved
connection, disables automatic redirects, and repeats URL and DNS validation at every redirect. New
source origins require an explicit registry change and operator review.

## Prompt injection and data poisoning

Source and contributed text is delimited as quoted, untrusted evidence. Extraction asks for
versioned structured output, never hidden reasoning. Runtime schemas reject or quarantine malformed
output. Model claims cannot create deterministic source-authority signals or a production trust
score. Contributions are sanitized, begin as self-reported evidence, and pass through candidate,
verification, and conservative canonicalization workflows before publication.

Outcome manipulation is constrained through idempotency keys, account/installation throttles,
effective sample limits, version/time weighting, and independent-account aggregation. A single
`misleading_or_unsafe` report queues review but does not directly penalize ranking or automatically
delist a record.

## Administration

Admin authorization is enforced by the backend. High-impact operations—including merge/split,
quarantine/reject, queue pause/retry, user suspension, and sanitized private-content reveal—require
a session authenticated within 30 minutes plus exact confirmation. Sensitive actions record actor,
reason, target, request context, and result in the audit log. Lifecycle states are preferred over
hard deletion.

## Logging and observability

Pino logs carry request IDs and active trace/span IDs. OpenTelemetry uses manual instrumentation and
a fixed low-cardinality vocabulary. Neither path records queries, source bodies, prompts, code,
notes, credentials, IP addresses, emails, tenant/account IDs, URLs, database statements, or raw
provider errors. Automatic resource detection and broad automatic instrumentation are disabled.

## Installer and supply chain

The installer derives supported locations through platform APIs, rejects symlinks and unsafe paths,
uses exclusive temporary files and restrictive permissions, backs up user-owned files, preserves
unknown config, and removes only KnownPath-owned entries. It writes environment-variable references,
never API-key values.

The repository uses a frozen lockfile, a minimum dependency-release age, `pnpm audit`, Dependabot,
dependency review, CodeQL, and commit-SHA-pinned GitHub Actions. Operators must still review
advisories and update dependencies deliberately.

## Dependency failure behavior

| Dependency                        | Behavior                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| MongoDB                           | Readiness fails; product operations cannot continue safely.                                                 |
| Production Valkey limiter         | Startup or readiness fails; no memory fallback.                                                             |
| Queue path with a healthy limiter | Readiness reports degradation; MongoDB writes remain authoritative and reconciliation can enqueue later.    |
| Gemini                            | Public AI work fails explicitly or retries; deterministic local retrieval remains available where selected. |
| OTLP collector                    | Product traffic continues; telemetry follows exporter retry/drop behavior.                                  |

## Residual risks

Sanitizers and content classifiers cannot recognize every secret or poisoning attempt. Public source
metadata can be misleading, maintainer status can change, semantic models can drift, and self-hosted
operators control deployment and retention choices. KnownPath mitigates these risks with minimum
data contracts, provenance, conservative ranking, review queues, reprocessing, audit trails, and
explicit provider/tenant boundaries rather than treating any single signal as truth.

## References

- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
- [OWASP RAG Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html)
- [OWASP prompt injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OpenTelemetry guidance for sensitive data](https://opentelemetry.io/docs/security/handling-sensitive-data/)
- [MCP security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)
