# `@knownpath/database`

This package owns MongoDB connection lifecycle, collection access, named repositories, critical
envelope validators, index declarations, and idempotent initialization. It also supplies a narrowly
scoped Better Auth MongoDB adapter factory over the managed connection. Raw databases and
collections remain inside this package.

From the repository root with MongoDB and `.env` configured:

```sh
pnpm db:init
pnpm db:inspect
pnpm db:verify
```

The verification command creates and removes a uniquely marked source-registry record through the
repository layer; it does not seed production knowledge.
