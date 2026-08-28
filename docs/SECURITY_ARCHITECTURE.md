# Security architecture

KnownPath treats authentication data, tenant knowledge, private contributions, source evidence,
provider credentials, and integrity signals as protected assets. Security enforcement lives in the
API/domain boundaries, not in dashboard navigation or agent instructions.

## Trust boundaries

1. Browsers, CLI clients, and MCP hosts are untrusted callers. Fastify validates input,
   authenticates credentials, derives authorization from live database state, applies resource
   limits, and returns allowlisted DTOs.
2. The stdio MCP process is an unprivileged HTTP bridge. It receives environment references and has
   no MongoDB, Valkey, GitHub, or Gemini access.
3. MongoDB is the product source of truth. Every private/team read receives a server-derived owner
   or workspace predicate. Direct-ID access uses the same predicate as search.
4. Valkey contains only distributed limits, queues, leases, schedules, and ephemeral coordination.
   It is security-critical for production request limiting but never the only copy of product data.
5. GitHub, official documentation sites, and contributions are untrusted evidence. Their text is
   data, never prompt instructions. Deterministic metadata remains separate from model output.
6. Gemini and any future model provider are external processors. The configured unpaid path accepts
   public records only; private/team records fail closed before provider invocation.
7. Operators and administrators are privileged but not implicitly trusted. Capabilities, recent
   authentication, exact confirmation, stated reasons, and immutable audit events protect sensitive
   actions.
8. OpenTelemetry collectors/exporters are operator-controlled optional dependencies. Telemetry uses
   an allowlist of low-cardinality attributes and contains no request text or tenant identifiers.

## Attacker goals and controls

| Goal                                      | Primary controls                                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steal sessions or API keys                | Secure HttpOnly production cookies, one-time API-key reveal, HMAC digests, distinct secrets, redacted logs, no credentials in MCP/installer config                                     |
| Cross tenant boundaries                   | Live workspace membership, scoped keys, mandatory repository predicates, inaccessible-ID indistinguishability, separated aggregates                                                    |
| Exhaust API/provider capacity             | Valkey-backed distributed policies, per-route cost classes, MCP mutation gate, durable outcome limits, BullMQ provider concurrency/limiters, payload/time bounds                       |
| Reach internal networks through ingestion | Exact HTTPS origin and path allowlists, standard port enforcement, DNS A/AAAA validation, globally routable IP requirement, DNS-pinned Undici connection, manual redirect revalidation |
| Poison extraction or retrieval            | Source provenance, prompt/data separation, structured output validation, quarantine, deterministic evidence scoring, conservative canonicalization, untrusted MCP result marking       |
| Manipulate reputation                     | Idempotency, account/execution caps, time/version-aware aggregation, small-sample priors, separate safety review and ranking state                                                     |
| Abuse administration                      | Server-side capabilities, fresh-session step-up, exact confirmation, reason capture, reversible operations, audit events                                                               |
| Leak data through telemetry               | Fixed metric/span vocabulary, no queries/content/IDs as attributes, error-class-only tracing, Pino request/trace correlation and credential-path redaction                             |
| Modify arbitrary installer paths          | Platform-derived absolute paths, symlink rejection, regular-file/directory checks, exclusive temporary files, restrictive modes, backups, owned-only uninstall                         |
| Introduce vulnerable dependencies         | Frozen pnpm lockfile, minimum release-age policy, `pnpm audit`, Dependabot, dependency review, CodeQL, SHA-pinned workflow actions                                                     |

## HTTP, session, and MCP defenses

- Production starts only with `API_RATE_LIMIT_STORE=valkey`, a reachable `QUEUE_REDIS_URL`, HTTPS
  authentication/trusted origins, production Swagger UI disabled, and distinct auth/key secrets.
- `memory` is an explicit development-only rate-store choice. It is never an automatic fallback.
- Bearer-key limits use a keyed digest as the Valkey subject; plaintext credentials are never stored
  in rate-limit keys. Anonymous/session traffic uses the resolved client IP and explicit proxy
  trust.
- Cookie-authenticated mutations require an exact trusted `Origin`. API-key calls do not use cookie
  CSRF semantics. CORS remains an exact origin allowlist.
- Fastify sets request, connection, keep-alive, parameter, and body limits. Routes lower body limits
  for search, contributions, outcomes, workspaces, and administration.
- Remote MCP requires a scoped API key, validates Host and Origin, limits JSON-RPC bodies, applies a
  transport policy, and separately limits contribution/outcome mutations by key.
- MCP output is bounded and progressively disclosed. Instruction-like markup and invisible control
  characters are neutralized, and returned knowledge is labeled untrusted evidence.

## Rate-policy classes

Policies are deliberately understandable rather than adaptive fingerprints:

- sign-in: 10/minute;
- MCP mutations: 8/minute per API key;
- semantic/provider-backed retrieval: 10/minute per user or API key;
- outcomes: 10/minute plus durable per-key/account protections;
- contributions: 12/minute;
- admin sensitive mutations: 10/minute;
- search: 30/minute;
- admin reads: 60/minute;
- knowledge reads/usage: 120/minute;
- global default: operator configured.

BullMQ separately limits GitHub, official-source, and Gemini workloads. A limit denial never changes
product data. If the production rate store is unavailable, protected requests fail safely and
readiness returns `503`; the process does not silently switch to memory.

## Prompt injection and data poisoning

Extraction prompts delimit source content as quoted untrusted evidence, request no chain of thought,
and accept only versioned structured output. Runtime schemas reject malformed output. Candidate
claims cannot create deterministic GitHub/authority signals. Contributions are sanitized and may be
quarantined; they begin self-reported and unverified. Retrieval preserves provenance and trust
components. MCP consumers are reminded to apply repository/user rules and verify applicability.

## Logging and telemetry privacy

Pino remains the structured application log. Request IDs plus OpenTelemetry trace/span IDs provide
correlation. Authorization, cookies, API keys, passwords, tokens, secrets, plaintext one-time keys,
and response cookies use centralized redaction paths. Unexpected exception messages/stacks are not
logged because arbitrary upstream messages can contain credentials or source text.

Allowed telemetry dimensions are bounded enums: HTTP method/route/status class, MCP tool, search
backend/scope/result class, queue/state, provider/event class, contribution state/visibility,
outcome class, and dependency state. Never add query text, source content, prompts, code, email, IP
address, user ID, workspace ID, API-key ID, KnownPath ID, source ID, URL, error message, or an
unbounded provider response as a label or span attribute.

Automatic Node resource detection is disabled. Exported resource attributes are limited to the
configured service name/version and deployment environment, avoiding host IDs, process arguments,
filesystem paths, and operating-system account names.

## Dependency failure behavior

- MongoDB unavailable: readiness `503`; product operations cannot safely continue.
- Production Valkey/rate limiter unavailable: startup fails or readiness `503`; no memory fallback.
- Queue unavailable while the limiter remains reachable: readiness is `degraded`; durable MongoDB
  writes remain authoritative and reconciliation can enqueue later.
- OTLP collector unavailable: API/product data is unaffected; exporter retries/drops telemetry under
  OpenTelemetry SDK policy. The collector is never a product-data dependency.
- Gemini unavailable: public semantic/extraction work fails explicitly or retries through BullMQ;
  deterministic/local retrieval remains available where requested.

## References

- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
- [OWASP RAG Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html)
- [OWASP prompt injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP secrets management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OpenTelemetry handling sensitive data](https://opentelemetry.io/docs/security/handling-sensitive-data/)
- [MCP security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)
