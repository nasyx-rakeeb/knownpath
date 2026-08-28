# `@knownpath/observability`

Provider-neutral, privacy-bounded OpenTelemetry traces and metrics for KnownPath. The package uses
manual instrumentation and a fixed low-cardinality attribute vocabulary; it never accepts request
text, tenant identifiers, credentials, URLs, or raw provider errors.

See [`docs/OBSERVABILITY.md`](../../docs/OBSERVABILITY.md) for configuration and operating guidance.
