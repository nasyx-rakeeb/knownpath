# Observability

KnownPath uses Pino for structured application logs and `@knownpath/observability` as an explicit,
provider-neutral OpenTelemetry boundary. Manual instrumentation keeps metric and span attributes
bounded and prevents source content, queries, and tenant data from being collected accidentally.

The OTLP exporter is optional. Telemetry failure does not change authentication, writes, tenant
enforcement, or retrieval behavior.

## Configuration

Telemetry is disabled by default:

```dotenv
OTEL_ENABLED=false
OTEL_EXPORTER=none
```

For local inspection:

```dotenv
OTEL_ENABLED=true
OTEL_EXPORTER=console
```

For an operator-owned collector:

```dotenv
OTEL_ENABLED=true
OTEL_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com
OTEL_SERVICE_NAME=knownpath-api
OTEL_SERVICE_VERSION=your-release-version
OTEL_METRIC_EXPORT_INTERVAL_MS=60000
```

KnownPath appends `/v1/traces` and `/v1/metrics` to the configured OTLP HTTP endpoint. Manage
standard exporter headers in the deployment secret store; never commit them. Route production
exports through a collector that uses TLS and applies a second sensitive-attribute filter.

## Signals

The current instruments cover:

- HTTP counts, duration, and status class by route template and method;
- MCP call count/duration by the six registered tool names and result class;
- search count, result count, empty/non-empty class, backend, and coarse visibility scope;
- MongoDB, queue, production limiter, and telemetry dependency checks;
- queue depth by fixed queue and state;
- ingestion item transitions and provider rate-limit/quota/failure classes;
- contribution state/visibility, deterministic quality decision, relationship route, moderation
  action, and bounded outcome classifications; and
- security denials by surface and reason class.

HTTP spans contain MCP tool spans and explicit database/search spans. Pino request logs include the
request ID and active trace/span IDs; responses expose `traceparent` for correlation.

## Privacy and cardinality policy

Telemetry must not contain:

- queries, prompts, source text, code, contributions, or outcome notes;
- credentials, cookies, authorization headers, raw errors, or provider responses;
- URLs, IP addresses, emails, filesystem paths, or database statements; or
- user, workspace, API-key, KnownPath, source, or other record identifiers.

Allowed attributes are fixed low-cardinality values such as method, route template, status class,
tool name, search backend, queue/state, provider event class, visibility, and outcome class. New
instruments require the same bounded vocabulary and a privacy review.

Agent-local reflection, suggestions, and declined consent are intentionally not inferred by the
backend because no request occurs. KnownPath does not add another MCP telemetry tool merely to count
them.

Automatic framework/database instrumentation and Node resource detection are disabled. Exported
resource attributes are limited to configured service name, version, and deployment environment,
avoiding host IDs, process arguments, local paths, and operating-system account names.

## Failure and operating guidance

If a collector is unavailable, OpenTelemetry applies exporter retry/drop behavior while the product
continues to serve. Alert on sustained export failure separately from product readiness. Operators
should also alert on MongoDB readiness, production limiter failure, queue backlog/failures, provider
quota exhaustion, elevated HTTP/MCP error rates, empty-search trends, moderation backlog, and recent
outcome degradation.

Use trace and request IDs to correlate events, then consult MongoDB audit/history records for
durable truth. Never add sensitive content to logs to make an incident easier to debug.

## References

- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [OpenTelemetry exporters](https://opentelemetry.io/docs/languages/js/exporters/)
- [OTLP exporter specification](https://opentelemetry.io/docs/specs/otel/protocol/exporter/)
- [Handling sensitive data](https://opentelemetry.io/docs/security/handling-sensitive-data/)
