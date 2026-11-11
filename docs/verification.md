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

## Multiple export parts — 2026-11-10

The full verify gate passes **67 engine/API/process checks**. Seven desktop journeys pass (25.8 seconds), including native multi-file picker authority, explicit part lists, duplicate names across parts, byte preservation, reload and a narrow window. Three browser embedding journeys pass. Rust formatting/check and release packaging pass; the packaged runtime preserves a mixed ZIP/TAR.GZ selection as well as existing single-source imports and survives restart.

New cases cover unchanged JSON, unselected archives staying excluded, source changes invalidating review, unsafe later parts failing before copy, replacement symlinks, atomic/bounded selection, a combined entry limit, authenticated local-API selection, pause/restart and refusal to overwrite a locally modified result. Actual Tauri native pickers selected two synthetic ZIPs, reviewed and preserved all four extracted files (94 bytes). Independent disk checks matched both original archives and every extracted file to the receipt. The final Tauri package reopened the saved two-part selection and verified history. This is controlled export intake, **not live Flickr-account verification** or account-side export/download automation.

Visual review caught a horizontal flex basis becoming vertical blank space at narrow widths; the column layout now resets that basis and the desktop journey checks label height. The first new desktop test also needed to select Flickr in the catalog before starting its import; that test setup was corrected, and the complete suite passed. Original archive files now join extracted files in the existing fingerprint catalog. Flickr album/metadata reconstruction, missing-part detection, provider-request polling and automatic archive downloading remain open.

The narrow-window capture waits for Plasma’s coalesced drawing-buffer resize before taking a viewport screenshot; an immediate full-page capture had sampled stale surface dimensions. No Plasma engine or Mood defaults changed in this increment.

## Dropbox content-hash foundation — 2026-11-10

`npm run verify` passes TypeScript, package boundaries, production build and all 72 engine/API/process tests. Five new checks cover independently generated empty/block-boundary/multi-block vectors across transport chunk sizes; upgrading an existing API-owned SQLite catalog while retaining history/Mood/source identities; shared transfer checksum verification and reuse across restart with independent output copies; renamed local matches that are invalidated after modification; and wrong-checksum refusal without published files. These use a controlled adapter exercising the shared checksum contract, not a Dropbox account connection.

All seven Electron journeys pass (27.8s), and all three browser-embedding journeys pass (17.6s). The final Tauri release build succeeds; final packaged Node/SQLite checks pass folder, single archive, mixed archive selection and restart preservation. The actual rebuilt native app opens its existing profile with all five saved imports intact, opens the two-part Flickr fixture, and verifies its four files/94 bytes again. No UI or Mood design changes were made.

New scans and collection verification calculate Dropbox hashes without another file read. Existing rows gain a nullable column and retain old fingerprints; they are not automatically rescanned. Metadata-only/SHA-only writes preserve a known Dropbox hash only if content SHA-256 is unchanged. Ordinary preservation and shared-link records do not assert a provider-certified hash.

Account registration, OAuth, selected Dropbox browsing and revision-bound API downloads are still pending. There is no new live Dropbox account evidence and no extension of the existing shared-link range-resume claim. The researched implementation sequence and official sources are in [Dropbox account method](dropbox-account-method.md).

## Selected Dropbox account connector — 2026-11-10

`npm run verify` passes TypeScript, package boundaries, production build and all **82 engine/API/process tests**. Ten new Dropbox cases exercise the real adapter through controlled RPC/content/token responses: exact registered callback, PKCE/state and occupied-port recovery; scope validation and session refresh; selected recursive pagination and Unicode names; source revision changes; wrong response metadata and bytes; repeated cursors, unsafe paths and unsupported cloud documents; verified reuse across restart; and interrupted file recovery after reconnect. Download checks use the previously qualified Dropbox content-hash implementation. Credentials are checked absent from manifests and SQLite. Google PKCE/Drive and existing shared-link cases still pass after authorization/transport reuse.

Eight Electron journeys pass (26.0s), including constructed Dropbox authorization URL opening, cleared app-key input, empty selection, callback release and reconnect. The host browser opener is intercepted for this fixture, so this test does not visit Dropbox. Four browser journeys pass (16.8s); the new Dropbox journey completes fixture PKCE, paginated folder selection, provider-checked download, local byte reuse and preservation through the shared UI.

Narrow-window tests exposed a long callback address overflowing its setup list. Setup text/code now wraps; both browser and Electron checks pass at 420px. The screenshot waits for Plasma's existing resize settling and shows aligned content within the pane. No Mood or rendering-engine changes were made.

Actual final Tauri acceptance found that string command rejections displayed a generic message. The shared cloud UI now accepts the native string error contract as well as Electron Error objects. A focused browser journey reproduces string rejections and passes; rebuilt native acceptance now shows “Enter your Dropbox app key.” for an empty key. The final app opens the setup disclosure, retains all six existing imports including the user's ready import, and leaves account data untouched. No authorization attempt with a fabricated or real app key was made against Dropbox.

Rust format/check and final Tauri release build pass. Final packaged Node/SQLite checks pass ordinary folders, ZIP/TAR.GZ, multiple archive parts and restart. Native account transfer still awaits a real registered Dropbox app; fixtures are not live-account qualification. Scope is home-namespace ordinary current files, per-file recovery and basic metadata, not team roots, cloud-document export, account completeness or byte-range checkpoints. [Setup and scope](dropbox-account-method.md).

## Flickr derived metadata review — November 10, 2026

The final `npm run verify` gate passes TypeScript, boundaries, production builds and **89 engine/API/process checks**. Seven photo cases cover preserved cross-folder IDs, ordered album references, missing and conflicting matches, both observed filenames and numeric ambiguity, malformed/changed/oversized sidecars, symlink/path refusal, pause/retry, SQLite restart and authenticated local API dispatch. The first restart assertion was corrected to compare JSON-persisted optional fields; the API assertion now expects the existing 403 response for unauthenticated requests. Neither correction weakened product checks.

All **eight desktop journeys** pass (31.1s), including native multi-part selection followed by photo review. All **five browser journeys** pass (18.4s). The added photo journey runs the real engine through the reusable UI, verifies escaped HTML-like metadata, problem-first details, 420px layout and saved results after API restart. After final guide wording changed, the focused photo browser journey passed again (5.3s). An inspected screenshot shows no horizontal overflow.

Rust format/check and final Tauri release succeed. Final packaged Node/SQLite checks include a preserved photo fixture, the separately bundled review worker, a matched result and restart retention. Actual Tauri native folder pickers selected a synthetic Flickr export and separate destination; preservation verified four files / 249 bytes. The native metadata result was **1 matched, 0 ambiguous, 2 unmatched, 0 invalid**. Expanded details showed the missing photo and album reference, unchanged date text and expected candidate path. Independent disk checks matched all source/copied SHA-256 values and the derived receipt hash. The final package retained all six prior imports plus this seventh fixture and its review; the prior ready Dropbox view was restored.

This is fixture qualification, not a real Flickr-account import. Provider requests/downloads remain manual. Candidate relationships do not rehash media or establish account completeness; raw fields and originals remain intact. Google Photos interpretation, separate-directory photo comparison, metadata rewriting/album reconstruction and broader library sizes remain open. See [photo metadata scope and primary evidence](photo-export-metadata.md).

## Google Photos Takeout metadata review — November 10, 2026

The final verify gate passes TypeScript, package boundaries, production builds and **94 engine/API/process checks**. Five new Google Photos cases cover legacy/supplemental sidecars, observed clipped filenames, asymmetric duplicate numbering, title disagreement, repeated sidecars, album/year folder isolation, edited counterparts, raw timestamps and separate location fields, unknown JSON, cross-part pairing and explicit exclusion of unselected parts. These are independently written controlled fixtures informed by primary format observations, not Daniel's Takeout data. The existing Flickr cases remain passing after extraction of the shared adapter interface.

All **nine Electron journeys** pass (41.1s), including native-picker authority, preservation, Google Photos review and unchanged JSON. All **six browser journeys** pass (20.5s). The new browser journey checks uncertainty, zero timestamp text, escaped album content and narrow-window layout. A final focused run also passes with the last record scrolled into view and asserted visible. No Mood or Plasma rendering changes were made.

Rust formatting/check and final release packaging pass. Packaged Node/SQLite checks pass existing folder/archive/multiple-part preservation plus Google Photos review and restart. In the actual rebuilt Tauri app, the authenticated local API prepared and preserved a three-file synthetic export (279 bytes); native UI then ran metadata review and displayed one match and one unmatched record. The native record disclosure displayed the exported timestamp and candidate path. Independent byte comparisons confirmed original/source files equal preserved files. Quit/reopen retained that review and all eight saved imports; the previous ready Dropbox view was restored. This does not claim native picker coverage from this manual journey (the Electron suite covers it), live Google account export, automatic Takeout requests/downloads or full-library completeness.

Metadata associations do not change fingerprint identity, deduplicate album/year copies or modify media. Album membership and conflicting candidates remain uncertain. Real Takeout and Flickr export qualification, unusual/localized formats, edited/live-photo reconstruction, missing-part detection and larger-library performance remain open. See [format evidence and limits](google-photos-takeout.md).

## Explicit downloaded-file selection and iCloud method assessment — November 10, 2026

The final verify gate passes **99 engine/API/process checks**, TypeScript, boundaries and production builds. Five added checks cover explicit companion-file preservation with excluded invalid/link siblings, atomic bounded selection, source changes and replacement symlinks, mode switching, Google Photos metadata reuse, authenticated API access, opaque selected archives, restart and modified-output refusal. Selected filenames and hashes are retained in receipts. These use synthetic local files, not an Apple account.

All **ten desktop journeys** pass (35.4s), including the native multi-file grant, direct-renderer path rejection, selected-only output and retained history at narrow width. All **seven browser journeys** pass (19.2s), including an embedded injected picker with Unicode filenames, explicit scope, preserved output and reload. Visual inspection confirms the narrow selection list fits. No Mood/Plasma change was needed.

Rust check/format and release packaging pass. Actual Tauri native pickers selected two synthetic files from a three-file folder, chose a separate destination and completed review/preservation: two files / 49 bytes. The unselected sibling is absent from output. Independent disk checks match both originals and receipt SHA-256 values. This proves native local intake, not iCloud download or Live Photo validity. Guide inspection caught an overlong iCloud check paragraph being clipped by the existing catalog bound; the paragraph was shortened before the final production build.

Official Apple documentation supports the current manual export/staging paths and a future PhotoKit bridge. The method assessment explicitly distinguishes original/current/paired resources, placeholders, missing albums and app-specific metadata. No Apple account/library access or permission request occurred. Current iCloud automation remains local preservation; XMP interpretation, asset pairing, native resource downloads and large-library qualification remain pending. [Methods, evidence and next slice](icloud-methods.md).

The final rebuilt package also passes the packaged selected-files, archive, Flickr/Google Photos review and SQLite restart checks. A focused browser recheck passes after the guide correction. Actual final Tauri reopen retains all nine imports and the two-file selection; the corrected guide's entire check paragraph is visible. The previous ready Dropbox view is restored. Final package checks do not imply live iCloud acceptance.


## PhotoKit bridge foundation — November 10, 2026

The verify gate passes **116 engine/API/process checks**, TypeScript, architecture boundaries and production builds. Seventeen added process checks cover a separate compiled Photos fixture, permissions without prompts, bounded pages, duplicate names and resource roles, stale selections, explicit network choice, byte-for-byte selected streams, partial completion errors, changed assets before/after data, maximum bytes, abandoned iteration, abort/idle/deadline cancellation and malformed subprocess messages. Missing helpers and oversized requests also fail safely. Production receives only inert hello/unknown commands; no real library status or fetch is exercised.

The failure tests caught and corrected buffered short-command blocking, unread-pipe shutdown hanging, an optimized fixture framework-linking failure and a spawn-error event arriving before its iterator consumer. The test build now explicitly links Photos and uses the same macOS 13 target as production. Current SDK/compiler is Swift 6.4.2 with SDK 27 on arm64 macOS 27.0.1; minimum-OS and Intel runtime checks remain pending.

All ten desktop journeys (36.1 seconds) and seven browser embedding journeys (19.9 seconds) pass with the existing shared UI and jobs. This foundation adds no UI or HTTP capability, permission request or database owner. See [bridge contract and next slice](photokit-bridge.md). Native resource transfer and permission behavior against a real library remain unqualified. Manual Tauri window acceptance is pending because the Mac was locked; this is not recorded as a pass.

The final Tauri release build and packaged-runtime check pass. The shipped helper answers protocol 1 with fixtures and authorization requests disabled; no status/library command is sent. The packaged Node API/native SQLite still preserve selected files, folders, ZIP/TAR.GZ and multiple export parts, retain photo-review summaries and reopen synthetic history. The production helper is 139,200 bytes before archive compression. No manual native-window or real Photos acceptance is implied.


## PhotoKit durable selected resources — November 10, 2026

The verify gate passes **127 engine/API/process checks**, TypeScript, boundaries and production builds. All 127 checks also pass after strengthening direct read-only inspection of the synthetic SQLite fingerprint catalog. Eleven new checks cover the trusted-factory gate, selected unknown-length transfers and manifest hashes, pause/restart, new session handles, later-page rediscovery, changed source revisions, modified completed destinations, partial/completion failure, low disk space, metadata-only reuse refusal and malformed/ambiguous native metadata. These use the same API-owned SQLite runtime and shared collection worker as other services, with a separately compiled synthetic Photos helper. Original/paired resources with identical filenames stay separate; only selected resources are transferred. Synthetic bytes do not qualify real Live Photo fidelity.

Saved selections freeze resource descriptors/revisions; no native handle is saved. Unknown lengths remain unknown until completion, then summaries use measured bytes. Read-only inspection confirms persisted fingerprint paths, byte counts, SHA-256, source keys and revisions match the actual files and receipts. Recovery rehashes completed files and restarts only unfinished resources after rediscovery. Cross-job Photos reuse is refused without content-hash evidence, even when a matching metadata revision and local catalog entry exist.

All ten desktop journeys (36.3 seconds) and seven browser journeys (20.0 seconds) pass. The final Tauri release build and packaged Node/SQLite preservation/review/restart checks pass. The actual packaged backend explicitly rejects Photos connection requests, including attempts to pass a factory/network flag over the client protocol. The production helper receives only its inert hello check; no real Photos status, permission or library request is used. Engine build staging now removes obsolete compiled outputs before bundling.

Native permission presentation, source namespace lifecycle, actual Photos fidelity, minimum-OS/Intel runtime checks and manual Tauri window acceptance remain pending. The Mac was locked during the prior attempt; no repeated unlock request or real-library readiness test was made. No production host registers this internal adapter and no Photos Connect action has been added. See [the updated bridge/adapter contract](photokit-bridge.md) and workspace ADR0099.


## Photos host boundary and fixture selection — November 10, 2026

The final verify gate passes TypeScript, package boundaries, production builds and **132 engine/API/process checks**. Five new host cases cover rejected generic requests even with a configured factory, persistent SQLite namespace mapping across restart, per-connection network consent, serialized concurrent host actions, changed-source refusal, invalid saved maps without reset, and snapshots of queued caller intent. Existing selected-resource jobs and fingerprint checks still pass.

All **ten desktop journeys** pass (39.0s) and **nine browser journeys** pass (20.3s). The new embedded Photos journey uses a separately compiled synthetic Swift helper with the real Node runtime, SQLite, worker and React components. It exercises cancellation, denial, limited authorization, default-off network consent, explicit opt-in, connection status, unknown-size local comparison and exporting only a selected original companion video (150,015 bytes). An ordinary client without a host action never offers Photos. After final spacing and active-connection status adjustments, both focused browser cases pass again (6.9s); the 540px screenshot was inspected and horizontal overflow asserted absent. These are fixture checks, not macOS prompt or real-library acceptance.

Final Tauri release packaging and actual packaged Node/SQLite preservation/review/restart checks pass. Packaged generic Photos connection and forged native-action requests are refused; production helper readiness remains inert hello only. No library status, permission request or Photos fetch occurred. Static plist/signature inspection finds absent Photos usage keys and ad-hoc signatures without a TeamIdentifier; it does not qualify the Tauri → Node → Swift permission attribution or update persistence. Manual native-window acceptance remains pending after the earlier locked-Mac attempt.

See [host qualification and Apple evidence](photos-host-qualification.md). Production hosts register neither Photos action nor factory. The durable namespace is a host-binding mapping, not proof of library identity. Signed-host permission handling, source-binding lifecycle and real-account qualification remain open.

## Gmail bounded MBOX inventory — November 10, 2026

Final `npm run verify` passes TypeScript, package boundaries, production builds and **140 engine/API/process checks**. Eight new mail cases exercise raw LF/CRLF and folded headers, MIME-like bytes retained unchanged, encoded subjects without false decoding, repeated Message-ID values without deduplication, escaped/unescaped separators, separators crossing a 64 KiB read boundary, multi-megabyte body lines, oversized/truncated headers, bounded previews across mailboxes, empty/unsupported selections, changed/linked mailbox refusal, malformed receipt paths, cooperative pause/retry, unready-source guards, SQLite restart and authenticated local API dispatch. These are synthetic fixtures, not a real Gmail export or sustained 16 GB throughput measurement.

All **eleven Electron desktop journeys** pass (41.3s), including a Gmail native-picker preservation/review through the actual shared API and unchanged raw message bytes. All **ten browser journeys** pass (19.4s). The new embedded journey verifies that HTML-like subject text is escaped, raw label values remain visible, narrow layout does not overflow and results persist after API restart. After final count wording was improved, the focused desktop journey passed again (5.1s) and browser journey passed again (4.9s). The final narrow screenshot was inspected. No Mood tokens or Plasma rendering changes were needed.

Mail and photo review now share receipt validation/safe bounded reads and the serialized background review lifecycle; existing Flickr/Takeout checks remain green. Native Photos remains disabled and no real-library call or permission request was made. Gmail export requests and downloads are still manual. Mail inventory rehashes selected mailbox files, retains raw originals and writes separate reports; candidate counts are provisional and do not establish account completeness, MIME/attachment validity or message identity. [Methods and exact limits](gmail-methods.md).

Rust formatting and final Tauri release packaging pass. Actual bundled Node/SQLite checks now preserve an explicitly selected synthetic MBOX, run its separately bundled inventory worker, verify unchanged message bytes, and retain its summary after restart alongside existing imports. Production Photos connection commands remain refused; its helper receives only inert protocol negotiation. Manual Tauri-window acceptance remains pending after the previously locked Mac; this run does not claim native-window or real-account acceptance.

## Selected Gmail account connector — November 10, 2026

Final verify passes TypeScript, package boundaries, production build and **149 engine/API/process checks**. Nine Gmail cases exercise the actual adapter through controlled network responses: read-only PKCE scope/state and bounded token form exchange; label/message pagination and explicit all/Spam selection; overlapping labels without duplicate Gmail IDs; unchanged MIME-like EML bytes plus separate internal-date/thread/label metadata; missing/changed metadata; invalid and incorrectly padded base64url; repeated cursors; refused Drive-only authorization; refresh; restart recovery; conservative source-address and changed-label snapshot refusal; disabled metadata-only reuse; refusal to overwrite a changed completed file; a 7 MiB message larger than the ordinary JSON limit; and refusal of an over-limit RAW response. SHA-256 is independently checked against output bytes; credentials are checked absent from manifest and actual SQLite/WAL files. Existing Drive and Dropbox cases still pass after Google's shared authorization/session extraction.

All **twelve desktop journeys** pass (42.4s), including constructed Gmail authorization URLs, read-only scope, cleared client input, callback disconnect and narrow setup. The external browser opener is intercepted; no Google login is visited. All **eleven browser journeys** pass (19.5s). Gmail's new journey uses real Node/SQLite/adapter fixtures through the host-injected React UI, checks empty initial selection and escaped subject text, downloads a selected label, then preserves the raw files and provider manifest through the ordinary workflow. Final focused browser (6.3s) and desktop (2.7s) checks pass after correcting label-group and checksum-reuse descriptions. The final 420px screenshot was visually inspected and overflow is asserted absent.

This is fixture qualification, not real OAuth registration, Google verification approval, live Gmail data, a whole-account snapshot or 16 GB-scale acceptance. Takeout remains the broader settings-preservation method; automated selected downloads retain EML files and a separate collection manifest. New jobs do not reuse mail solely from metadata revisions, and an interrupted message restarts from its beginning. [Exact selection semantics, bounds and registration instructions](gmail-methods.md).

Final Tauri release packaging and packaged Node/SQLite preservation/review/restart checks pass. The packaged backend also rejects Gmail generic connect (authorization is required) and rejects authorization without a desktop client ID, without reaching an account. Full Gmail network journeys remain controlled fixtures. No manual Tauri-window pass is claimed after the earlier locked-Mac attempt, and production Photos remains disabled with no library status/permission request.

## Instagram local media references — November 10, 2026

Final verify passes TypeScript, package boundaries, production builds and **154 engine/API/process checks**. Five new integration cases cover extensionless media and raw timestamp retention, unchanged originals and SQLite restart, unsafe/traversal/URL/encoded references, wrapper isolation, repeated references without content deduplication, malformed/oversized lists, changed sidecar hashes, selected split archives and ambiguous duplicate paths. References resolve only against receipt entries; no URL is fetched or external path opened. Newer/unknown schemas remain listed as uninterpreted files.

All **thirteen Electron desktop journeys** pass (46.7s), including Instagram selection through native-picker authority, preservation, shared background review and byte-for-byte original checks. All **twelve browser journeys** pass (23.9s); the new host-injected React journey checks escaped caption text, missing/invalid records, 420px overflow and persistence after API restart. Its screenshot was visually inspected. No new Mood styling or transport boundary was introduced.

Tauri release packaging passes (35.61s compilation). Packaged Node/SQLite acceptance now also preserves a synthetic Instagram folder, runs the real shared review worker, checks original bytes and retains its summary after restart. Existing Flickr, Takeout, Gmail and selection/package checks pass. Production Photos receives inert helper negotiation only and remains disabled. Manual Tauri-window acceptance is still pending after the earlier locked-Mac attempt.

This is fixture qualification, not live Instagram/Facebook export or account acceptance. Meta export requests/downloads remain manual. Only observed numbered Instagram post media arrays are interpreted; Facebook, stories, reels, messages and newer label_values layouts are not interpreted. Media references are candidates and do not replace fingerprints or current integrity. [Method comparison, primary evidence and exact scope](meta-export-methods.md).
