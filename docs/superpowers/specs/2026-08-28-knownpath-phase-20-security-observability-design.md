# Phase 20 security and observability design

Approved on 2026-08-28. KnownPath uses the existing Valkey deployment for distributed production
request limiting and keeps MongoDB as product truth. Local memory limiting is explicit only.
Official-source fetching adds exact network/path policy and DNS-pinned public-IP validation.
Provider-neutral observability uses a dedicated package, manual OpenTelemetry traces/metrics, and
Pino correlation with an allowlisted low-cardinality vocabulary.

The API fails closed for critical MongoDB/rate-limiter loss and reports optional queue/exporter
degradation. Security controls stay centralized at API/domain/provider boundaries. Installer writes
reject symlink/path redirection. GitHub-native dependency review, CodeQL, Dependabot, and locked
audits protect the open-source supply chain. See `docs/SECURITY_ARCHITECTURE.md` for the complete
threat model and enforcement details.
