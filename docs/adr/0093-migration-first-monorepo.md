# ADR 0093 — Migration first, in a staged Crux Garden monorepo

**Status:** accepted by Daniel, 2026-11-10. Supersedes ADR0092's requirement to embed Home inside the full app before continuing. The existing Builder/Electron decision remains unchanged.

## Decision

Start a fresh local monorepo at `CruxGarden/monorepo`, initially containing Migration and the shared packages it needs. Keep the existing app/API/CLI/Plasma repositories and dirty work intact. No remote or public launch is implied. The previous Home preview at app checkpoint `b5d52d144` is the source baseline and stays available.

Develop **Migration** as a standalone React application in Tauri, retaining an Electron comparison host for development/native tests. It includes no Cruxes or authoring payload. Later it can be hosted by **Home**, **Lab**, or **Builder** (the current Crux Garden authoring app). Embedding is an architectural capability, not a release prerequisite for this tool.

Separate host-neutral UI, contracts, provider guidance, shared Garden UI, and the headless migration engine. The React interface receives a client from its host; embedded mode respects that host's Mood/Plasma. The engine accepts a storage adapter so an embedded host can reuse its existing API-owned database. Standalone storage continues through the pinned canonical local API and SQLite. Do not silently introduce a second production content database owner.

Expose a local-only, authenticated, versioned HTTP API for third-party native apps/scripts, over the same serialized service operations used by the desktop UI. Native pickers remain the desktop renderer's filesystem authority. Local integrations holding the per-run token are trusted to choose migration paths. No network binding beyond loopback, CORS, arbitrary SQL, remote execution, or source deletion endpoint.

Start with one vertical slice: a small Dropbox folder/ZIP export, reviewed, preserved, verified and reopened, with matching API behavior. Dropbox is a manageable infrastructure case; this is not a popularity claim. Keep existing guides/archive regression coverage without claiming 31 automated connectors.

## Background work and next slices

The engine runs outside React and can run headlessly. Direct downloading, provider credentials, durable remote checkpoints, rate limits, event subscriptions and a tray/background lifecycle will be designed and verified with the first real connector. Native desktop shutdown currently pauses and closes its service. Headless support does not mean an installed always-on OS service.

After the Dropbox infrastructure test, use a modest Drive export, then photo services. Personal service inventories remain in local chat outputs, outside the source repository. Full-account completeness, album/mail/message interpretation, backup/restore, Windows/Linux qualification, automatic stale-lock recovery, signing and update channels remain separate work.

## Consequences

Shared packages can move and be consumed independently. Builder is not yet switched to them: the initial UI extraction records provenance and preserves Builder's source and behavior. The monorepo transition of other projects is deliberate future work, not a wholesale move of dirty repositories or their history.

## November 10 implementation follow-up

Daniel subsequently authorized committing and pushing and supplied `CruxGarden/crux-garden`. The feature branch now preserves both the local foundation history and the remote initial main commit. No main merge or release is implied. Desktop window closure now hides the UI while the same service continues; an explicit Quit still pauses/stops it. Both hosts provide tray reopen/quit actions; this is not an OS-installed service. See `docs/background-lifecycle.md`.

Daniel subsequently selected **Crux Garden Migrate** as the standalone product display name, retaining the `crux-garden` monorepo name and existing internal domain identifiers/profile locations.
