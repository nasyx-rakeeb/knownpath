# KnownPath operational progress

## Post-Phase 22 — Production corpus reset and contribution behavior audit

- Reset reason: the hosted network is moving from broad public-source seeding toward genuine,
  consented agent experience as its primary growth model.
- Deleted production corpus state: 10 source registries, 1,010 source snapshots, 58 source states,
  54 ingestion runs, 215 extraction attempts, 11 candidates, 22 assessments, 1 embedding, 11
  similarity profiles, 10 memberships, 50 canonicalization events, 10 revisions, 17 search
  projections, 10 KnownPaths, the one zero-weight `not_used` outcome and 3 outcome assessments, and
  101 pipeline runs with 311 steps. Empty pair/safety collections remained empty.
- Preserved production state: all users, Better Auth accounts/sessions/device state, API and machine
  credentials, account preferences, workspaces/memberships/invitations, audit events, security
  state, historical search events, contribution/share collections, and rate-limit infrastructure.
- Rollback: a permission-restricted, count-verified, checksummed `mongodump` exists at
  `~/.knownpath/backups/corpus-reset-20260905-QuKNkV`; it is intentionally outside Git.
- Scheduling: broad GitHub/docs source schedules are now separately gated by
  `QUEUE_SOURCE_SCHEDULES_ENABLED=false`. Maintenance schedules and scheduled queue drains remain
  available for contribution/outcome processing.
- Final corpus target: zero source items, candidates, canonical KnownPaths, review records,
  published records, projections, embeddings, and obsolete durable corpus jobs.
- Contribution trigger: the Agent Skill may offer a generalized contribution after observable
  success, but every submission requires explicit user consent. There is no silent runtime trigger
  or deterministic generalizability classifier.
- Confirmed gap: contribution approval does not automatically resume canonicalization. The defect
  was documented but intentionally not fixed here; no proactive-contribution redesign was started.

## Post-Phase 22 — Agent-experience-first knowledge growth

- Product model: real, observably verified coding-agent experience is now the primary knowledge
  source. Broad GitHub/docs crawling remains disabled; those adapters and Gemini extraction remain
  optional operator tools for targeted corroboration, gap filling, ecosystem refresh, contradiction,
  and safety research.
- Agent behavior: Skill 1.4.0 performs one post-success cross-project reuse reflection, suppresses
  trivial/local suggestions, requires a final duplicate search, previews privacy-minimized content,
  and obtains explicit per-submission consent. Repository content is untrusted for publication
  decisions.
- Contract: contribution contract version 2 adds explicit applicability/environment/verification,
  optional evidence-supported root cause, duplicate-search provenance, and
  novel/corroboration/variant/extension/correction/conflict routing while retaining version-1 input
  compatibility.
- Quality/privacy: an immutable version-1 deterministic quality assessment rejects obvious noise,
  flags incomplete or risky lessons for review, records reason codes, and makes no Gemini call.
  Sanitizer version 2 also removes internal hosts/private IPs and repository URLs. Per-account and
  machine-credential durable limits supplement distributed route limits.
- Processing: approval now creates a durable idempotent canonicalization step. Repeated approval,
  already-canonicalized candidates, dispatch outages, worker failures, and maintenance
  reconciliation have explicit retry-safe states. Novel contributions use conservative discovery;
  corroboration and extensions support existing records; variants add alternatives;
  corrections/conflicts attach conflicting evidence. All resulting public records remain
  review-state until manual publication.
- Trust: an originating contributor's outcome is stored as `originator_non_independent` and excluded
  from independent outcome confidence. The original success remains weak self-reported evidence and
  the existing score cap remains intact.
- Moderation/telemetry: contribution details expose sanitized publication preview, applicability,
  verification, quality reasons, similarity context, relationship, and processing state. Approval
  and rejection retain fresh-auth, exact-confirmation, reason, and audit controls. Telemetry adds
  only bounded quality/relationship/moderation classes and no user, workspace, query, or content
  labels.
- Focused tests: 13 Node test assertions cover consent/contract requirements, quality eligibility
  and trivial rejection, privacy redaction, relationship routing, failure recovery keys, approval
  scheduling/idempotency, and originator independence. Broader automated coverage remains deferred.
- Manual verification: isolated local MongoDB and Redis/BullMQ processing produced an eligible
  contribution, admin approval durably resumed canonicalization, a review-state KnownPath was
  created, and originator/independent outcomes were classified separately with no Gemini call.
  Database initialization ran twice with 35 collections and unchanged indexes on the second run. The
  hosted stdio bridge advertised all six MCP tools and returned a successful empty search after the
  free-host cold start completed; the new contribution contract still requires deployment before
  hosted end-to-end verification.
- Intentionally deferred: automatic publication, bulk moderation, sophisticated reputation/Sybil
  analysis, AI moderation, broad source scraping, and additional MCP tools.
