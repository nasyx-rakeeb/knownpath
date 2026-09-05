# knownpath

## 0.6.0

### Minor Changes

- d7cf7b9: Teach installed agents the agent-experience-first contribution flow: reflect after
  verified success, reject trivial or project-local lessons, check for existing KnownPaths, preview
  generalized content, and require explicit consent before submitting contribution contract
  version 2.

## 0.5.0

### Minor Changes

- 7ee6fef: Add zero-config hosted installation with browser device authorization, native OS
  credential storage, secret-free agent configuration, explicit login/logout/whoami commands, and
  self-hosted overrides.

## 0.4.2

### Patch Changes

- 30c996e: Fix uninstall cleanup when the last managed agent removes the regular installer-state
  file.

## 0.4.1

### Patch Changes

- Publish through pnpm so workspace/catalog dependency specifications are rewritten for npm
  consumers and the Apache-2.0 license file is included in the archive.

## 0.4.0

### Minor Changes

- a58804f: Prepare the KnownPath installer, MCP bridge, and Agent Skill for reproducible open-source
  releases with validated package metadata and artifacts.
