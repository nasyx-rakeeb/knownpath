# KnownPath usage examples

These examples illustrate decision quality. Replace example values with observed repository facts;
never invent version or environment metadata.

## Expo SDK migration

An Expo SDK upgrade produces a non-obvious config-plugin or native-module error after dependencies
were aligned. Inspect `package.json`, the Expo configuration, SDK version, and exact error. Search
with `ecosystem: expo`, the affected package names, Expo SDK version, platform, and sanitized error.
Prefer an official-upgrade-supported and version-compatible KnownPath. Get its evidence and caveats
before changing dependencies or native configuration.

Do not search merely because a package version was edited successfully and the standard project
checks already pass.

## EAS or Gradle build failure

An Android EAS build fails in Gradle with a specific plugin, manifest, Kotlin, Java, or repository
resolution error. Search using the exact stable part of the error plus Expo, React Native, Gradle,
Android, build profile, and observed versions. Redact local paths, signing details, credentials, and
application identifiers. Inspect the selected KnownPath for platform/version constraints before
editing Gradle or Expo config.

Do not paste the full build log when a few diagnostic lines and structured environment fields are
enough.

## React Native dependency conflict

A dependency requires an incompatible React Native, React, Expo module, CocoaPods, or Android
toolchain range. Search with both packages and all observed version constraints. An exact package
and version match should outrank a semantically similar solution for another release line. Confirm
the selected steps against the package manager lockfile and official compatibility guidance.

## Metro resolution or cache issue

Metro reports an unfamiliar module-resolution, workspace, export-map, or transformer error. Inspect
the import, Metro config, workspace layout, package manager, and exact error first. Search if the
cause remains unclear or appears ecosystem-specific. Do not apply a generic cache reset solely
because it is popular; prefer evidence tied to the matching error and setup.

Skip KnownPath for an obvious misspelled import that local inspection identifies directly.

## Native configuration problem

An iOS or Android integration fails because of entitlements, permissions, Info.plist, Android
Manifest, CocoaPods, autolinking, or a config plugin. Search with platform, native subsystem,
framework/package versions, build type, and the sanitized failure. Check whether the solution is for
managed Expo, a development client, prebuild, or bare React Native before applying it.

Never send signing certificates, provisioning profiles, keystores, tokens, private source files, or
complete proprietary configuration merely to improve a search.
