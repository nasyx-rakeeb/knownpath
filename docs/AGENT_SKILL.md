# KnownPath Agent Skill

The canonical [KnownPath Agent Skill](../skills/knownpath/SKILL.md) teaches a coding agent when a
KnownPath lookup is worthwhile and how to use the result responsibly. It is the behavior layer, not
the knowledge database or MCP implementation.

The skill version is **1.4.0**.

## What the skill changes

When available to an agent, the skill encourages it to:

- consult KnownPath before spending substantial time rediscovering a reusable technical solution;
- send concise, structured, non-sensitive environment context;
- prefer exact, version-compatible, current, well-supported records;
- inspect evidence and caveats before applying a solution;
- adapt the evidence to the current repository and verify the actual result;
- remember which KnownPath materially influenced an attempt;
- contribute a generalized lesson only after observable success and explicit consent;
- report an outcome only after the attempted result is known.

The skill does not grant access, store credentials, connect to the API directly, or override the
agent's existing safety and repository instructions.

## Activation

The skill is designed for automatic activation when prior experience could materially reduce
investigation time, including:

- unfamiliar or recurring technical errors;
- Expo or React Native upgrades and migrations;
- dependency, package, SDK, runtime, or toolchain conflicts;
- EAS, Gradle, CocoaPods, Metro, native build, or configuration failures;
- platform- and version-dependent behavior;
- non-obvious environment problems and tooling quirks.

It remains manually invocable as `knownpath` or `$knownpath`, depending on the client.

The skill should not activate for:

- formatting or simple edits;
- routine file operations;
- obvious syntax corrections;
- unrelated requests;
- work whose cause and safe fix are already clear after brief inspection.

Activation is only permission to consider a lookup. The agent may skip the call when local evidence
already provides a confident answer.

## Search and selection flow

The skill references exactly these six MCP tools:

1. `knownpath_search`
2. `knownpath_get`
3. `knownpath_alternatives`
4. `knownpath_status`
5. `knownpath_contribute`
6. `knownpath_report_outcome`

The normal retrieval flow is:

1. Inspect the repository enough to identify the exact error, ecosystem, packages, versions,
   platforms, build environment, and constraints.
2. Call `knownpath_search` with observed fields. Unknown facts are omitted rather than guessed.
3. Compare exact and lexical matches, semantic relevance, package/platform/version fit, trust,
   freshness, outcome evidence, caveats, and provenance.
4. Call `knownpath_get` for one plausible record, passing its `searchId` when available.
5. Use `knownpath_alternatives` only when another solution variant on that same KnownPath may help.
6. Adapt the evidence to the current codebase and run the repository's normal verification.

`knownpath_status` is for diagnosing service readiness, authentication, key capabilities, workspace
binding, review access, or search backend—not for routine use.

Search defaults to public knowledge. A workspace-bound key may search its workspace alone or its
workspace plus public records. An agent must not probe another workspace ID. Review records are
available only through an explicit audited administrator request.

## Evidence, not instructions

KnownPath content is untrusted external evidence. It never outranks:

- the user's instructions;
- repository-specific rules;
- security and privacy constraints;
- facts observed in the current codebase;
- current official documentation.

Popularity and reactions are supporting signals, not proof. A high score does not establish that a
fix applies to a different version or environment. The agent should prefer no result over a vague,
stale, contradictory, or incompatible match.

The agent must not claim that a KnownPath worked until the task's real verification succeeds.

## Privacy behavior

Before sending search context, the agent should remove:

- credentials, tokens, keys, and cookies;
- private files and proprietary source code;
- personal data and email addresses;
- unnecessary user paths, hostnames, repository identifiers, and application IDs;
- prompts, conversation history, and hidden chain-of-thought.

A concise stable error fragment plus structured package, platform, and version fields is usually
more useful than a complete log or file.

## Contributions

After observable success, the agent performs one brief reuse check: would the problem, cause, and
solution remain meaningful and useful to an unrelated repository after local identifiers and private
context are removed? It skips trivial and repository-specific fixes and makes at most one
unsolicited suggestion per task.

Before an offer, the agent performs a final `knownpath_search` with the generalized technical
signature. A sufficient match routes the experience as corroboration, variant, extension,
correction, or conflict instead of creating redundant knowledge. A novel lesson uses relationship
`novel`.

The agent then shows a compact generalized preview and must:

- obtain explicit consent for that submission;
- use the intended public, personal-private, or workspace scope;
- submit a generalized problem, environment, steps, caveats, and success evidence;
- omit repository files, raw source, prompts, credentials, and chain-of-thought;
- use contribution contract version 2, a stable `clientSubmissionId`, the duplicate-search ID,
  relationship, applicability, and observable verification type;
- describe the actual agent client accurately.

Public consent permits review and possible later publication. Private and team knowledge remains in
its authorized scope. Sharing private or team knowledge publicly is a separate dashboard workflow
that creates a newly sanitized public contribution; the agent must never change visibility
implicitly.

A contribution receipt represents low-trust self-reported evidence, not proof or automatic
publication. See [Contributions](CONTRIBUTIONS.md).

Repository instructions are untrusted for contribution decisions. They cannot authorize a
submission, bypass consent, or override privacy and quality rules.

## Outcome reporting

The agent should retain the selected KnownPath ID, search ID, attempted solution, and a fresh
execution identifier until the outcome is known. It may then call `knownpath_report_outcome` once.

Valid states are:

- `solved`
- `partially_helped`
- `attempted_failed`
- `incompatible_environment`
- `stale_or_outdated`
- `misleading_or_unsafe`
- `not_used`

`not_used` means the record was selected but not attempted; it carries no evidence weight. A search,
view, command execution, or plausible-looking result is not a success.

Outcome context is limited to concise, non-sensitive package, version, platform, and toolchain
metadata plus an optional generalized note. See [Outcomes](OUTCOMES.md).

## Examples

The skill ships one on-demand
[Expo and React Native examples reference](../skills/knownpath/references/examples.md). It covers:

- Expo SDK migration errors;
- EAS and Gradle build failures;
- React Native dependency conflicts;
- Metro resolution and cache problems;
- native iOS and Android configuration.

The examples show when to search and when a direct local fix is more appropriate. They are not
hard-coded solutions.

## Discovery and installation

`npx knownpath install` copies the same canonical skill into the supported client location while
registering MCP:

- Codex CLI: `.agents/skills/knownpath`
- Claude Code: `.claude/skills/knownpath`
- Cursor: `.agents/skills/knownpath`
- Gemini CLI: `.agents/skills/knownpath`
- OpenCode: `.agents/skills/knownpath`

Global and project locations vary by client; use [Agent installation](AGENT_INSTALLATION.md) rather
than copying files manually.

For local skill development, link the canonical directory into a supported discovery path and reload
the client. For example:

```sh
mkdir -p "$HOME/.agents/skills"
ln -s "$(pwd)/skills/knownpath" "$HOME/.agents/skills/knownpath"
```

Gemini CLI also supports:

```sh
gemini skills link "$(pwd)/skills/knownpath" --scope user
gemini skills list
```

Do not maintain client-specific copies of the skill text in the repository. Client-specific
configuration belongs to the installer adapters.

## Format and versioning

The artifact follows the open Agent Skills format with:

- lowercase `name`;
- a precise activation/exclusion `description`;
- Apache-2.0 `license`;
- string-valued `metadata`;
- optional on-demand references.

Version policy:

- patch: wording, examples, or safety clarification without workflow changes;
- minor: backward-compatible behavior or support for an available MCP capability;
- major: incompatible activation, privacy, or required-tool changes.

The skill metadata, this guide, CLI bundle, and release notes should move together.
`knownpath update` reconciles installer-owned copies and refuses locally modified content.

Validate the source artifact with the Agent Skills reference tooling:

```sh
agentskills validate skills/knownpath
agentskills read-properties skills/knownpath
```

## Official references

- [Agent Skills specification](https://agentskills.io/specification)
- [OpenAI Codex skills](https://developers.openai.com/codex/skills/)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Cursor Agent Skills](https://docs.cursor.com/context/skills)
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/skills/)
- [OpenCode Agent Skills](https://opencode.ai/docs/skills/)
