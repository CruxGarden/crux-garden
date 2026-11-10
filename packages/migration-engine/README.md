# Migration engine

`src/service.ts` is the application service. It owns commands, job transitions and worker scheduling. `src/store.ts` is the only SQLite adapter, using the existing pinned Crux Garden local API. `src/worker.ts` and folder/ZIP/TAR modules preserve and verify bytes. `src/backend.ts` supplies process lifecycle and private desktop protocol; `src/http.ts` supplies the local HTTP transport.

`createMigrationRuntime(profile, { store })` can accept an existing host's `MigrationStore`, preventing competing database ownership. The caller owns shutdown. Results are snapshots; all commands are serialized, and terminal worker states become visible only after worker ownership is released.

Engine production dependencies use their own lockfile/install, intentionally separate from UI/build dependencies. Run root `npm run setup` and `npm run verify`. The pinned API archive and source provenance are included; the repository does not depend on a sibling checkout's node_modules or absolute development path.
