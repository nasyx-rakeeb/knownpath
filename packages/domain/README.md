# `@knownpath/domain`

Framework-independent, versioned Zod contracts and inferred TypeScript types for KnownPath. This
package owns entity IDs, lifecycle values, authentication roles/scopes/audit events, embedded
knowledge structures, and deterministic canonicalization/fingerprint helpers. It does not import
persistence, HTTP, UI, MCP, or provider SDKs.

Source contracts include provider-neutral document types, structured blocks, deterministic authority
metadata, attribution/license metadata, and synchronization lifecycle state.
