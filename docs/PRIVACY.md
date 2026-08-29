# Privacy model

KnownPath stores reusable technical experience, not private repositories, credentials, prompts, or
hidden chain-of-thought. Data minimization and server-side scope enforcement apply across HTTP, MCP,
workers, dashboards, retrieval, and administration.

## Visibility

- **Public** contributions require explicit consent and enter low-trust processing; they are not
  published as truth from self-report.
- **Personal private** records remain owner-scoped in MongoDB.
- **Workspace** records remain scoped to live authorized membership and workspace-bound keys.
- Sharing private/workspace knowledge publicly creates a new sanitized, consented contribution. It
  never flips proprietary content to public in place.

Every repository query and direct-ID read receives a server-derived tenant predicate. Public search
and aggregates never reveal the existence or behavior of private/workspace records.

## Provider boundary

The unpaid/public Gemini path is allowed only for verified-public source records, candidates, and
embeddings. Personal-private and workspace content, query text, and records are rejected before a
provider call. A future private-safe provider requires explicit configuration and approval; the
system never silently downgrades to a public provider.

## Contributions and outcomes

Ordinary contributions use generalized structured fields, environment metadata, ordered steps, and
an observable success summary. Raw files and chain-of-thought are outside the contract. The
sanitizer removes obvious secrets, email/PII, user home paths, and credential-bearing remotes, and
rejects remaining high-risk or excessive content. Outcomes capture an attempted-result category and
optional concise sanitized note, not repository contents.

Immutable provenance, consent, sanitization reports, moderation state, and audit history remain
available for accountability. Self-report does not create high trust.

## Administration and telemetry

Private content is hidden from ordinary admin views. An appropriately authorized administrator may
reveal only the sanitized structured version for moderation/security, with fresh authentication, a
stated reason, exact confirmation, and an audit event. Unsanitized originals and removed fields are
not retained for display.

Logs and OpenTelemetry use bounded identifiers and fixed labels. Query text, private content,
credentials, user/workspace identifiers, raw source bodies, and other high-cardinality sensitive
values are excluded. See [Observability](OBSERVABILITY.md) and
[Security architecture](SECURITY_ARCHITECTURE.md).

Operators define account and data-retention policy for their deployment. Queue retention is
diagnostic and ephemeral; MongoDB remains product truth. Removing or restricting data must use
domain lifecycle/moderation operations so provenance and safety audit requirements remain intact.
