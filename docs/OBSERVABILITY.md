# Observability

`@knownpath/observability` is the provider-neutral OpenTelemetry boundary. It uses explicit manual
spans and metrics so KnownPath controls attribute cardinality and prevents accidental content
capture. Traces and metrics are stable in OpenTelemetry JavaScript; Pino remains the log pipeline
because OpenTelemetry JavaScript logs are still under development.

Automatic resource detection and automatic framework/database instrumentation are disabled. This
prevents host IDs, process arguments, local paths, database statements, and request URLs from being
captured outside KnownPath's explicit attribute allowlist.

## Configure

Telemetry is disabled by default:

```dotenv
OTEL_ENABLED=false
OTEL_EXPORTER=none
```

For local inspection, use `OTEL_ENABLED=true` and `OTEL_EXPORTER=console`. For an operator-owned
collector, use `OTEL_EXPORTER=otlp` and set `OTEL_EXPORTER_OTLP_ENDPOINT` to its HTTP origin/base
path. KnownPath sends traces to `/v1/traces` and metrics to `/v1/metrics`. Standard exporter header
environment variables may be managed by the runtime; never commit them.

The collector/exporter is optional. Its outage does not affect product writes, auth, tenant
enforcement, or retrieval. OpenTelemetry export should be routed through a collector in production.

## Instruments

- HTTP request counts/duration/error status by route template, method, and status class;
- MCP calls/duration by the six stable tool names and success/error;
- search count, empty/non-empty result class, result count, backend, and coarse scope;
- dependency checks for MongoDB, queue, production rate limiter, and telemetry;
- queue depth snapshots by fixed queue/state;
- GitHub/official ingestion transitions;
- GitHub/Gemini rate-limit, quota, authentication, and transient-failure classes;
- contribution state/visibility and bounded outcome classifications;
- security denials by surface and reason class.

HTTP spans nest MCP tool spans and a manual MongoDB knowledge-search span. Pino request logs bind
the request ID and active trace/span IDs. `traceparent` is returned for diagnostic correlation.

## Privacy contract

Telemetry must never contain queries, code, prompts, source text, contribution/outcome notes, raw
errors, URLs, authorization/cookies, IPs, emails, user/workspace/API-key IDs, KnownPath/source IDs,
or arbitrary strings. New instruments require a bounded attribute vocabulary and a security review.
This restriction applies even to private operator-controlled collectors.

## References

- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [OpenTelemetry exporters](https://opentelemetry.io/docs/languages/js/exporters/)
- [OTLP exporter specification](https://opentelemetry.io/docs/specs/otel/protocol/exporter/)
- [Handling sensitive data](https://opentelemetry.io/docs/security/handling-sensitive-data/)
