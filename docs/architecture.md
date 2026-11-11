# Migration architecture and first slice

Crux Garden Migrate is the product being developed (formerly displayed as Migration). Home, Lab and Builder are future hosts, not prerequisites for releasing it. One repository contains app and shared packages; existing Crux Garden repositories remain intact during the staged monorepo transition.

## Dependencies

The desktop entry constructs a client and renders `MigrationApp`. The UI imports contracts, provider guidance, and Garden UI only. It cannot import filesystem/database code or access Tauri directly. A build boundary check enforces that restriction. Embedded hosts pass their own client and own Mood/Plasma; standalone entry applies the default Mood.

Native hosts use private process messages to the engine. Local integrations use versioned HTTP endpoints. Both call the same serialized service commands and observe the same jobs. One SQLite adapter persists metadata through the pinned existing Crux Garden local API. Original files and verified copies remain ordinary files, not database blobs. An embedded host can supply `MigrationStore` backed by its existing database owner rather than opening a second owner.

The engine schedules one worker at a time. Workers stream bytes, preserve original archives, enforce path/size/expansion rules, verify hashes and publish immutable first-completion receipts. Job mutations and storage writes are serialized; readers receive snapshots, not mutable engine-owned objects. Node worker threads keep work outside the renderer.

## First acceptance slice

Use a small synthetic Dropbox folder or ZIP first, then a user-selected real export. Review is required before copying. Originals remain unchanged, output is verified, unfinished work can be paused and resumed, and job history/checklists survive restart. The HTTP integration must see the same state as the desktop UI. No personal account login or account deletion is required.

The original 31 guides and ZIP/TAR support are retained from the working preview. They do not expand the first acceptance target to 31 cloud integrations.

## Choosing migration methods

Daniel's direction (2026-11-10): build each service's tools around the best available method for the intended migration, not whichever method made the first prototype easiest. Compare official authenticated APIs, provider export archives, shared-file links and supported local sources before choosing the default. Evaluate data/metadata completeness, original quality, stable file revisions, integrity verification, reliable background resume, scale/rate limits and user effort. An API is not automatically best if an export preserves more of the requested data.

When multiple methods have useful strengths, offer them as explicit alternatives with plain-language tradeoffs and a recommended default. Keep provider identity separate from method capabilities; record which method produced a job and its provenance. Reuse transfer, persistence and preservation machinery without forcing every method to use the same remote identity mechanism. Switching methods must not silently reuse partial bytes or broaden access.

State limitations at the narrowest evidenced level: provider, method, response, or current implementation. Missing strong ETag in one shared-link response does not prove absent byte-range support, nor a provider-wide inability to resume. Record documented support separately from fixture-tested and live-tested behavior.

For Dropbox account migration, evaluate the authenticated API with revision-aware downloads and provider content-hash verification next. Retain shared-file downloads and local export import where useful. The existing shared-link slice validates infrastructure; it does not establish the preferred account-migration method. Dropbox documents HTTP range support for content-download endpoints, including the file and shared-link API routes; actual recovery behavior still needs qualification. [Dropbox request/response formats](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/request-response-formats).

### Reuse across services

Daniel's direction (2026-11-10): design components around the small set of migration methods, so a new service supplies an adapter rather than a duplicate workflow. Initial method families are authenticated account/file APIs, shared-file links, provider-prepared export archives, and local folders/files. Treat this as a working taxonomy; add a family only when a real service requires materially different behavior.

- Shared infrastructure owns job lifecycle, scheduling/concurrency, progress, cancellation, persistence, retry policy execution, checkpoint storage, streaming, space checks, safe publication and verification orchestration.
- Method-level workflows own reusable account connection/selection, file listing/pagination, download preparation, export request/wait/download where supported, and archive/local-source intake. Implement these as real connectors require them, not speculative plugin machinery.
- Service adapters own authorization scopes/flows, endpoint and redirect policy, provider pagination cursors, rate-limit/error interpretation, remote revision identity, checksum algorithms and metadata mapping. Credentials remain behind a host-owned credential interface; the UI never owns tokens.
- Provider/method capabilities drive reusable selection, progress, recovery and review components. Express resume requirements explicitly: range transport support and stable version identity are separate capabilities. Strong HTTP ETags and provider revisions may satisfy identity through different adapters; neither should be imposed universally.
- Persist provider, method and source/version provenance with checkpoints. Share the job machinery without treating checkpoints or credentials as interchangeable between methods/services. Adapter-specific checks supplement shared lifecycle and integrity tests.

Extract shared behavior as the second real use case demonstrates it. Keep the current Dropbox transport isolated, then use the next connector to validate reusable contracts. Avoid a giant provider switch, per-service copies of the transfer engine, or a lowest-common-denominator interface that loses provider data.

## Extension points

Add a provider's guidance in the catalog without adding UI conditionals. Direct connectors will require a provider contract covering export/download capabilities, source identity, pagination, credentials, retry/rate-limit behavior and durable checkpoints. Define that contract with the first actual connector, rather than pretending every provider exports alike. Keep download jobs separate from archive interpretation and copy verification.

The first shared-file transfer streams into partial files, persists checkpoints and validates file identity before range-resuming. It offers an explicit restart when the current method/response does not meet its safe-resume requirements. Both native hosts now keep their service alive when the window closes, with a tray/menu-bar action to reopen it. Explicit Quit gracefully pauses and stops the service. Headless mode also runs without a UI. This is not an OS-installed background service; see [background lifecycle](background-lifecycle.md).

## Deliberate limits

- The Dropbox shared-file connector is implemented and covered by network fixtures; one live PDF download/preservation has passed; broader Dropbox response qualification remains. Google Drive now has an in-memory OAuth connection, while Dropbox account OAuth remains future work. No durable credential vault, scheduling, album/mail/message interpretation or completeness reconciliation yet.
- No public plugin loader or arbitrary execution endpoints.
- Local HTTP token grants full migration operations for its profile; scoped per-client tokens and consent UI remain future work. Tokens are rotated on service restart, never embedded in renderer assets.
- A process ownership file prevents two service entrypoints opening the same profile. After an unclean kill, verify that the PID in `service.lock` is gone before removing that stale lock. Automatic stale-lock recovery remains open.
- Verification is byte preservation, not backup, synchronization, or proof of complete remote-account export.
- Space review is conservative. The target filesystem must support the current exclusive hard-link publication strategy. Archive originals plus extracted data need more room than provider-reported cloud usage.
- Current platform evidence is macOS Apple Silicon; signing, updates and Windows/Linux qualification remain open.

## Next slice

Qualify more Dropbox responses and implement account authorization plus selected-file browsing for a full connector. A modest Google Drive export and selected photo services follow. Keep the shared-file download route and preservation workflow independently reusable. Broader personal libraries remain outside the currently verified workload.

## First direct-download connector

See [Dropbox downloads](dropbox-downloads.md). Download jobs have separate records and states from preservation jobs. The provider module owns URL and network policy; the manager owns checkpoint persistence, prefix/readback hashing and exclusive file publication. Both use the same canonical SQLite owner and serialized service commands. Download I/O is asynchronous outside React; it does not require a renderer or a separate database.

## Shared collection jobs and file inventory

`cloud/jobs.ts` implements selection snapshots, recursive discovery, safe paths, durable per-file checkpoints, asynchronous streaming, retries through adapters, and read-back verification. `cloud/{bluesky,s3,google-drive}.ts` implement method-specific identity/listing/download rules. This increment resumes at file boundaries: interrupted files restart, completed files are rehashed. Existing Dropbox range-checkpoint behavior remains separate until a real common range/identity contract is proven.

`cloud/fingerprints.ts` reads actual bytes and consults `migrate_fingerprints` through the existing API database owner. Indexes support SHA-256, MD5/size and source/version lookups. Completed cloud/Dropbox downloads and newly verified ordinary preservation outputs register locations. An explicit local-directory scan registers older files, then compares against remote source/version evidence or provider checksums. Matching names and sizes never establish a match. Missing/changed local copies fall back to download; copied local matches are rehashed again before publication. MD5 is used only where supplied by a provider; reports retain the algorithm. Local SHA-256 is always recorded. Content matches avoid repeat transfers, not independent export files on disk.

No second database owner, filesystem deletions, automatic credential discovery, or arbitrary URL fetching is exposed. The native picker grants comparison-directory authority. In-memory connections require reconnect after Quit; the persisted manifest and job history contain source identities, selections and file fingerprints, never OAuth/AWS credentials. See [cloud service setup](cloud-services.md).
