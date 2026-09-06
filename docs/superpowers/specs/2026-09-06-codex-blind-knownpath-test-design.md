# Codex blind KnownPath activation test

## Purpose

Verify the installed KnownPath integration from a normal Codex user's perspective without telling
Codex to invoke KnownPath. The test must distinguish automatic skill/MCP activation from an explicit
instruction to use the product.

## Fixture

Create a sibling project at `/Users/nasyxrakeeb/Development/knownpath-codex-test` with the current
official Next.js App Router TypeScript scaffold. Introduce one version-specific misuse of an async
request API that causes the production build to fail. The fixture must otherwise remain clean and
must include no comments, filenames, or instructions mentioning KnownPath or revealing the fix.

Confirm the failure with the project's normal build command, record the observed error, and leave
the bug unresolved for Codex.

## KnownPath setup

Verify the npm `latest` version before installation. Reconcile the global Codex MCP entry and Agent
Skill using that exact release through the existing zero-config credential flow. Do not print or
copy credentials into the fixture, agent configuration, prompt, or report.

## Blind Codex prompt

Run Codex from the fixture with only this task:

> Diagnose why `pnpm build` fails, apply the smallest correct fix, and verify it.

The prompt must not mention KnownPath, MCP, shared knowledge, contribution, or expected root cause.

## Acceptance evidence

Preserve the Codex transcript and report only behavior that was directly observed:

1. whether the KnownPath skill activated without prompting;
2. whether `knownpath_search` was called;
3. whether an empty result allowed ordinary debugging to continue;
4. whether Codex found and applied the correct minimal repair;
5. whether the build passed afterward;
6. whether Codex performed the required post-success duplicate search;
7. whether it offered a privacy-minimized contribution preview and requested explicit consent;
8. whether it avoided submitting anything before consent.

Do not grant contribution consent during the first run. The purpose is to validate activation and
the offer boundary before intentionally exercising production contribution state.

## Safety and cleanup

The fixture contains no real secrets or proprietary code. Do not seed a fake production KnownPath.
Keep the fixture after the run so the user can inspect the exact before/after Git diff and
transcript.
