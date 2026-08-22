# `@knownpath/github-ingestion`

Reusable Phase 4 GitHub API collection, normalization, cursor, and ingestion-run orchestration.
Applications compose this package; it owns no HTTP routes, scheduler, AI extraction, or search.

Source definitions come from the shared `config/sources/registry.json` manifest. Snapshot authority
is derived deterministically from GitHub author association.
