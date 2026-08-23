# `@knownpath/agent-adapters`

Framework-independent detection, configuration, ownership-state, backup, status, doctor, update, and
uninstall logic for supported coding agents.

The package currently supports OpenAI Codex CLI, Claude Code, Cursor, Gemini CLI, and OpenCode. It
installs the canonical `skills/knownpath` artifact and configures the thin stdio bridge. It never
receives or persists a credential value: client configuration contains only references to
`KNOWNPATH_API_URL` and `KNOWNPATH_API_KEY`.

Agent-specific filesystem/configuration behavior stays here. Prompting, terminal rendering, and the
`knownpath` executable live in `apps/cli`; MCP contracts and business behavior do not.
