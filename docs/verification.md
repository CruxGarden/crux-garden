# First-slice verification — 2026-11-10

The initial monorepo source derives from the verified Home preview at `CruxGarden/app` commit `b5d52d144`. Builder's source and its previous Home preview were not modified. The monorepo now has a remote at `CruxGarden/crux-garden`; there is no release deployment.

Verified locally on macOS Apple Silicon:

- `npm run verify`: TypeScript, reusable-package boundary guard, production UI/runtime build, 31 engine/API/process tests.
- Three Electron native journeys: folder review/preservation/Mood/restart; ZIP original and extracted-file verification; offline guide search/checklist/reference boundaries and narrow layout.
- One browser embedding journey: injected client works without Tauri globals; host Mood remains unchanged.
- Headless process test: loopback API availability, private connection-file permissions, duplicate profile ownership rejection, graceful cleanup and token rotation.
- Packaged Tauri runtime: bundled Node/native SQLite with restricted PATH, zero Cruxes, folder/ZIP/TAR.GZ preservation and restart.

The API test exposed a worker lifecycle race: review reported ready before the worker released ownership. Terminal state now becomes visible after worker exit, so an immediate follow-up operation is valid. The HTTP tests also cover authentication, Origin/Host restrictions, invalid/oversized bodies and unsupported routes. An injected-store test verifies that a host can use its existing persistence owner and that callers cannot mutate internal jobs through returned objects.

The first Electron run hit its five-second inspection assertion during concurrent build/load. The journey waits for review readiness with a 30-second bound. Checklist assertions wait for the asynchronously persisted state before reloading. Runtime staging and final native tests are run against completed builds.

These are synthetic fixtures, not a claim that a user's Dropbox/Google/Apple account was migrated. Direct downloads, automatic stale-lock recovery, broader platform/filesystem/accessibility/performance qualification, signing/notarization and update distribution are not certified by these checks. GitHub CI is configured for push and pull requests; its remote result has not been verified in this session.

A later ZIP journey completed all file/receipt assertions but stalled in Electron application shutdown. The comparison host now exits explicitly after its service closes, instead of re-entering the native quit sequence. The focused ZIP journey then passed in five seconds; the complete desktop suite was rechecked. This change does not alter the Tauri host.

The final Tauri UI was also exercised through actual native folder pickers, review and preservation. Its 68-byte synthetic Dropbox file matched the original and receipt SHA-256; the verified job was visible after quitting and reopening. Service connection/ownership files were removed on graceful shutdown.

## Background lifecycle increment — 2026-11-10

- `npm run verify`: all 31 engine/API/process checks pass with the updated UI and runtime.
- `npm run test:desktop`: all four journeys pass (24.2 seconds). The new journey closes the real Electron window, starts a 512-file copy through its unchanged local API, observes verified completion while hidden, reopens via native activation, quits during another active copy, checks ownership/connection-file cleanup, and restarts/resumes to 512 verified files with matching content. Its fixtures are synthetic and isolated.
- `npm run test:embedding`: host appearance and injected-client boundaries still pass. The lifecycle notice is supplied by the standalone entry, not imposed on embedded hosts.
- Tauri `cargo check` passes with tray support enabled. Native packaged acceptance is recorded in [background lifecycle](background-lifecycle.md).

## Product name — Crux Garden Migrate

Daniel selected **Crux Garden Migrate** for the standalone application, keeping the monorepo `CruxGarden/crux-garden`. Window titles, navigation, native bundle/display names, tray labels, product references in export guidance and the standalone notice now use Migrate. API/package identifiers and storage paths are intentionally stable. The renamed Tauri bundle opened the two previously verified synthetic imports from the same profile, confirming history was retained. The renamed renderer passed all four native journeys (23.9 seconds), the embedding journey, and the 31-test verify gate.

## Dropbox shared-file downloads — 2026-11-10

The verify gate passes 45 engine/API/process tests. Five native desktop journeys cover existing preservation/background behavior plus Downloads preparation and native path authority. Two browser journeys include a streamed network fixture through the real engine/SQLite, pause/reload/resume, handoff to review and final preservation with exact byte comparison. The injected opener is only a programmatic test seam, never a production HTTP/IPC configuration.

A real user-supplied `dos.pdf` downloaded successfully (400,436 bytes) and entered the full review/preserve workflow. PDF header, downloaded-file SHA-256 and preserved bytes agree. The shared link is neither in source nor saved job records. The live server omitted a strong ETag: byte-range resume is tested with controlled responses, and unsupported live responses offer an explicit restart instead. See [download details](dropbox-downloads.md).

A process-test cancellation exposed a startup race: the connection descriptor was written before termination handlers were installed. Handlers now precede advertised readiness. The process test also avoids waiting for an already-signaled child and requires clean exit status.

The final packaged Tauri app also completed the live PDF journey through Downloads, native folder pickers, review and preservation. The UI reported verified; an independent disk check matched both 400,436-byte copies to SHA-256 `17b74e5930324e61dea29d56c8cdb1b4ee63b893599e364b4bd642b75223e797`. Graceful Quit removed service ownership/connection files. The final package check passed bundled Node/native SQLite, zero Cruxes, folder/ZIP/TAR.GZ preservation and restart.

## Selected cloud collections and content inventory — 2026-11-10

The full verify gate passes **60 engine/API/process checks**, including 14 new cloud/inventory checks. **Six native desktop journeys** and **three browser embedding journeys** pass. Tauri formatting, Rust compilation and release packaging pass. The packaged Node/native SQLite checks pass for folder/ZIP/TAR.GZ preservation and restart.

Bluesky, Amazon S3 and Google Drive use the same explicit-selection, discovery, transfer, pause/reconnect and preservation machinery. Controlled cases cover recursive listing/pagination, changed versions, provider checksum failures, unsafe paths, renamed local matches, stale local files, content reuse within and across jobs, ordinary-preservation indexing, OAuth callback state/PKCE and credential exclusion. S3 and Drive real-account acceptance remains pending; no Google desktop client is configured.

A user-authorized public Bluesky records export completed through the production network transport, then through the actual packaged Tauri UI: native destination picker → download → review → separate preservation picker → verified. The original CAR and preserved copy both contain **11,215 bytes**, with matching SHA-256. Its private account identifier, contents, manifest and test paths are kept outside source control. No private messages or account preferences were requested. This proves this records-export path, not CAR signature validation or a complete account migration.

Narrow-window verification exposed overflowing navigation/long fields; wrapping and minimum widths now pass both desktop and embedded journeys. Fixtures use the accessible Service combobox role, preserving native keyboard behavior. The service catalog now contains 32 guides, including Bluesky.

## Service brand icons — 2026-11-10

All 32 service choices render local SVG brand assets; the embedded browser journey verifies every image loads and has nonzero dimensions. Visual inspection confirms the catalog's brand marks and labels. The native desktop journey edits the new `logoSurface` Mood token, verifies it persists after quit/restart and checks the rendered icon backing color. Existing journeys still pass. Original service colors remain artwork; backing and corner styling follow Mood tokens. See [source/license records](service-icons.md).

These remain development previews. Collection recovery restarts unfinished files; completed files are rechecked. Transfer deduplication saves network requests, while exports remain independent copies. Hard-kill/stale-lock recovery, broader platform/filesystem/performance qualification, signed releases and update distribution remain open. Remote CI status is unverified.

A final real-profile reopen found an older Dropbox completion-recovery race: a missing temporary-file stat could reject while an awaited path check was still constructing the `Promise.all` inputs. Probe sequentially so the existing missing-file handler catches it. A subprocess regression with completed nested output and no temporary file fails on the old code and passes on the fix; the full gate now passes 60 checks. Existing export bytes are untouched. The test profile's stale service lock was retained in private debug output only after its owner exited; automatic hard-kill recovery remains future work.

The corrected final Tauri bundle reopened the same saved profile successfully, displaying the verified live Bluesky import and earlier Dropbox history. Its service icons were visually checked in the native webview. Final packaged runtime checks pass again.

Daniel requested consistent grid alignment: service buttons now use a fixed leading inset and left-aligned content. The embedded journey and a fresh visual check confirm aligned icon columns and unchanged accessible labels.
