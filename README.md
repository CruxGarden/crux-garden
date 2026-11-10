# Crux Garden monorepo

Migrate is the first application here: a standalone desktop tool for bringing personal cloud exports onto storage you control. Its React interface and headless engine can later be hosted in Home, Lab, or Builder.

The first vertical slice is a small Dropbox export: guide → select an existing folder or ZIP → choose destination → review → preserve and verify → reopen and inspect the saved result. The inherited preview also supports TAR/TAR.GZ and includes 31 offline provider guides; these are guidance, not automated cloud connectors.

## Run

Use Node 22.19.x. From this repository:

```sh
npm run setup
npm run verify
npm start
```

`npm start` uses the Electron comparison host for development and automated native tests. `npm run package:tauri` builds the preferred Tauri app (Rust and platform prerequisites required). Tauri packaging is currently qualified only on macOS Apple Silicon. Neither shell includes Cruxes, authoring tools, models, or user data. Builds are local unsigned previews.

`npm run test:desktop` exercises the native UI. API/runtime tests run as part of `verify`. See [architecture](docs/architecture.md) and [local API](docs/local-api.md).

## Boundaries

- `apps/migration`: Tauri host, Electron comparison host, standalone renderer entry. Owns native dialogs and application lifecycle.
- `packages/migration-ui`: React interface accepting an injected `MigrationClient`. Embedded mode leaves global Mood and Plasma ownership with its host.
- `packages/migration-contracts`: host-neutral job and client types.
- `packages/migration-providers`: offline provider catalog and export guidance; no account credentials or network activity.
- `packages/migration-engine`: headless jobs, workers, local HTTP adapter, SQLite storage adapter, folder/archive verification. Production dependencies are installed separately to keep the native runtime free of UI/build dependencies.
- `packages/garden-ui`: extracted shared UI primitives, Mood tokens, Plasma integration, fonts and licenses. Provenance is recorded in `docs/source-provenance.json`; this does not yet switch Builder to consume this package.

## Direct downloads

The first connector accepts an existing Dropbox shared-file link. Downloads have saved checkpoints and pause/resume, then feed the usual review-and-preserve flow. Link contents stay in memory; after restarting, paste the same link to resume. Full-account sign-in and folder downloading are future work. See [Dropbox downloads](docs/dropbox-downloads.md) for supported links, integrity boundaries and validation limits.

## Background operation

Closing the desktop window hides it while preservation work and the local API continue. Use the Migrate menu-bar/tray icon → **Open Migrate** to return, or **Pause work and quit** to stop gracefully. On macOS the Dock also reopens the window. Quit does not leave a detached service running; unfinished work is paused and can be resumed after reopening. This does not prevent computer sleep or start at login.

See [background lifecycle](docs/background-lifecycle.md) for the boundaries and verification.

Personal account inventories and real exports do not belong in this source repository.

## Naming and saved state

The standalone product is **Crux Garden Migrate**. The repository remains **CruxGarden/crux-garden** for the wider product family. Internal `migration-*` packages, transport names and application identifiers remain stable; they describe the migration domain. In particular, renaming the display name does not move the profile, reset history, change the local API contract, or rename already preserved output folders.
