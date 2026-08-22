# `@knownpath/auth`

Reusable human-session authentication, API-key lifecycle, authorization policy, audit, and
rate-limit boundaries for KnownPath.

Public registration is intentionally disabled. After configuring `.env`, initializing MongoDB, and
starting the local infrastructure, create a user or administrator with:

```bash
pnpm auth:user:create
```

The command may accept `--email`, `--name`, and `--role`, but always reads the password through a
masked prompt.
