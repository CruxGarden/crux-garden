# First-slice verification — 2026-11-10

The initial monorepo source derives from the verified Home preview at `CruxGarden/app` commit `b5d52d144`. Builder's source and its previous Home preview were not modified. There is no monorepo remote or release deployment yet.

Verified locally on macOS Apple Silicon:

- `npm run verify`: TypeScript, reusable-package boundary guard, production UI/runtime build, 31 engine/API/process tests.
- Three Electron native journeys: folder review/preservation/Mood/restart; ZIP original and extracted-file verification; offline guide search/checklist/reference boundaries and narrow layout.
- One browser embedding journey: injected client works without Tauri globals; host Mood remains unchanged.
- Headless process test: loopback API availability, private connection-file permissions, duplicate profile ownership rejection, graceful cleanup and token rotation.
- Packaged Tauri runtime: bundled Node/native SQLite with restricted PATH, zero Cruxes, folder/ZIP/TAR.GZ preservation and restart.

The API test exposed a worker lifecycle race: review reported ready before the worker released ownership. Terminal state now becomes visible after worker exit, so an immediate follow-up operation is valid. The HTTP tests also cover authentication, Origin/Host restrictions, invalid/oversized bodies and unsupported routes. An injected-store test verifies that a host can use its existing persistence owner and that callers cannot mutate internal jobs through returned objects.

The first Electron run hit its five-second inspection assertion during concurrent build/load. The journey waits for review readiness with a 30-second bound. Checklist assertions wait for the asynchronously persisted state before reloading. Runtime staging and final native tests are run against completed builds.

These are synthetic fixtures, not a claim that a user's Dropbox/Google/Apple account was migrated. Direct downloads, automatic stale-lock recovery, tray lifetime, broader platform/filesystem/accessibility/performance qualification, signing/notarization and update distribution are not certified by these checks. GitHub CI is configured but has not run remotely.

A later ZIP journey completed all file/receipt assertions but stalled in Electron application shutdown. The comparison host now exits explicitly after its service closes, instead of re-entering the native quit sequence. The focused ZIP journey then passed in five seconds; the complete desktop suite was rechecked. This change does not alter the Tauri host.

The final Tauri UI was also exercised through actual native folder pickers, review and preservation. Its 68-byte synthetic Dropbox file matched the original and receipt SHA-256; the verified job was visible after quitting and reopening. Service connection/ownership files were removed on graceful shutdown.
