# `@knownpath/ai`

Provider-neutral extraction contracts plus the Phase 6 Gemini implementation. This package owns
public-only privacy enforcement, deterministic context assembly, versioned prompts, structured
output/evidence validation, retry and budget controls, extraction-attempt orchestration, candidate
construction, CLI parsing, and inspection formatting.

Applications compose it with `@knownpath/database`; source ingestion never calls Gemini directly.
See [`docs/AI_EXTRACTION.md`](../../docs/AI_EXTRACTION.md).
