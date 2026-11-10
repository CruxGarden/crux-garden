# Migration architecture and first slice

Migration is the product being developed. Home, Lab and Builder are future hosts, not prerequisites for releasing it. One repository contains app and shared packages; existing Crux Garden repositories remain intact during the staged monorepo transition.

## Dependencies

The desktop entry constructs a client and renders `MigrationApp`. The UI imports contracts, provider guidance, and Garden UI only. It cannot import filesystem/database code or access Tauri directly. A build boundary check enforces that restriction. Embedded hosts pass their own client and own Mood/Plasma; standalone entry applies the default Mood.

Native hosts use private process messages to the engine. Local integrations use versioned HTTP endpoints. Both call the same serialized service commands and observe the same jobs. One SQLite adapter persists metadata through the pinned existing Crux Garden local API. Original files and verified copies remain ordinary files, not database blobs. An embedded host can supply `MigrationStore` backed by its existing database owner rather than opening a second owner.

The engine schedules one worker at a time. Workers stream bytes, preserve original archives, enforce path/size/expansion rules, verify hashes and publish immutable first-completion receipts. Job mutations and storage writes are serialized; readers receive snapshots, not mutable engine-owned objects. Node worker threads keep work outside the renderer.

## First acceptance slice

Use a small synthetic Dropbox folder or ZIP first, then a user-selected real export. Review is required before copying. Originals remain unchanged, output is verified, unfinished work can be paused and resumed, and job history/checklists survive restart. The HTTP integration must see the same state as the desktop UI. No personal account login or account deletion is required.

31 existing guides and ZIP/TAR support are retained from the working preview. They do not expand the first acceptance target to 31 cloud integrations.

## Extension points

Add a provider's guidance in the catalog without adding UI conditionals. Direct connectors will require a provider contract covering export/download capabilities, source identity, pagination, credentials, retry/rate-limit behavior and durable checkpoints. Define that contract with the first actual connector, rather than pretending every provider exports alike. Keep download jobs separate from archive interpretation and copy verification.

A future download worker must stream to partial files, persist resumable checkpoints, validate remote identities before resuming, and clearly restart when a provider cannot resume. The service should eventually outlive window closure through a tray/background lifecycle. The current native hosts gracefully pause and stop their service when quitting; headless mode already runs without a UI. This is not yet an OS-installed background service.

## Deliberate limits

- No direct cloud downloads, OAuth, scheduling, connector credential storage, album/mail/message interpretation or account completeness reconciliation yet.
- No public plugin loader or arbitrary execution endpoints.
- Local HTTP token grants full migration operations for its profile; scoped per-client tokens and consent UI remain future work. Tokens are rotated on service restart, never embedded in renderer assets.
- A process ownership file prevents two service entrypoints opening the same profile. After an unclean kill, verify that the PID in `service.lock` is gone before removing that stale lock. Automatic stale-lock recovery remains open.
- Verification is byte preservation, not backup, synchronization, or proof of complete remote-account export.
- Space review is conservative. The target filesystem must support the current exclusive hard-link publication strategy. Archive originals plus extracted data need more room than provider-reported cloud usage.
- Current platform evidence is macOS Apple Silicon; signing, updates and Windows/Linux qualification remain open.

## Next slice

After the small Dropbox infrastructure proof, exercise a modest Drive export. Then implement one real download connector end to end, including interruption/recovery, using an explicit provider choice and a small selected test dataset. Broader personal photo libraries follow once those behaviors are proven.
