# Changelog

Notable released changes to the public `knownpath` package and operator-facing platform are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changesets create version-specific entries during the maintainer release flow. Unreleased work is
represented by committed files in `.changeset/`; this file is not a substitute for those release
intents.

## [Unreleased]

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

[Unreleased]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/nasyx-rakeeb/knownpath/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nasyx-rakeeb/knownpath/releases/tag/v0.3.0
