# Changelog

Notable released changes to the public `knownpath` package and operator-facing platform are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changesets create version-specific entries during the maintainer release flow. Unreleased work is
represented by committed files in `.changeset/`; this file is not a substitute for those release
intents.

## [Unreleased]

## [0.6.0] - 2026-09-05

### Added

- Make verified agent experience the primary knowledge-growth path with a versioned contribution
  contract, deterministic generalizability assessment, and explicit duplicate relationships.
- Teach installed Agent Skills to reflect after successful non-trivial work, search before
  contributing, show a privacy-minimized preview, and require explicit consent.
- Add focused contribution state-machine recovery, moderator context, originator-outcome separation,
  privacy defenses, and low-cardinality product metrics.

### Fixed

- Resume canonicalization durably and idempotently after a moderator approves a contribution.

## [0.5.0] - 2026-09-04

### Added

- Add one-command hosted installation with browser signup/sign-in and device authorization.
- Store scoped machine credentials in the native OS credential store and keep agent configuration
  secret-free.
- Add CLI login, logout, and identity inspection while preserving explicit self-hosted and legacy
  environment credential paths.

## [0.4.2] - 2026-08-31

### Fixed

- Preserve strict JSON timestamp contracts across repeated HTTP/MCP/domain validation.
- Remove the final installer ownership-state file safely during uninstall.
- Reconcile drifted Atlas Search and Vector Search definitions before reporting readiness.

## [0.4.1] - 2026-08-29

### Fixed

- Publish the installer with npm-compatible dependency ranges and the Apache-2.0 license file.

## [0.4.0] - 2026-08-29

### Added

- Reproducible CLI package validation, MCP registry metadata, production container targets,
  contributor automation, and provider-neutral deployment/release documentation.

## [0.3.0] - 2026-08-24

### Added

- Multi-agent installer for Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode.
- Environment-reference-only KnownPath API URL and key configuration.
- Packaged canonical KnownPath Agent Skill and stdio MCP bridge.

[Unreleased]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nasyx-rakeeb/knownpath/releases/tag/v0.3.0
