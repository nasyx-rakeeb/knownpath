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
