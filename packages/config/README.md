# `@knownpath/config`

This package is the only place that translates environment variables into typed application
configuration. Callers receive normalized values and fail fast on invalid input.

MongoDB configuration includes the URI/database, application name, pool bounds, and server-selection
timeout. The URI is required and has no committed default.
