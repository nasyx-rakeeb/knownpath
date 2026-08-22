# `@knownpath/config`

This package is the only place that translates environment variables into typed application
configuration. Callers receive normalized values and fail fast on invalid input.

MongoDB configuration includes the URI/database, application name, pool bounds, and server-selection
timeout. Phase 3 also validates auth secrets/base URL/trusted origins, API-key pepper, CORS, proxy
trust, docs exposure, and local rate limits. Credentials are required where used and have no
committed defaults.

Source collection configuration includes the shared registry path plus bounded GitHub and official
documentation/feed request settings. Official-source collection requires no credential.
