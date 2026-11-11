# Crux Garden monorepo

Migrate is the first application here: a standalone desktop tool for bringing personal cloud exports onto storage you control. Its React interface and headless engine can later be hosted in Home, Lab, or Builder.

The first vertical slice is a small Dropbox export: guide → select an existing folder or ZIP → choose destination → review → preserve and verify → reopen and inspect the saved result. The inherited preview also supports TAR/TAR.GZ and includes 32 offline provider guides; these are guidance, not automated cloud connectors.

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

The first connector accepts an existing Dropbox shared-file link. Downloads have saved checkpoints and pause/resume, then feed the usual review-and-preserve flow. Link contents stay in memory; after restarting, paste the same link to resume. Selected Dropbox account files/folders are available separately under Cloud services with your own scoped app registration. See [Dropbox downloads](docs/dropbox-downloads.md) for supported links, integrity boundaries and validation limits.

## Selected cloud migrations and local comparison

**Cloud services** adds Bluesky public records/media, Amazon S3 bucket objects, Google Drive files/folders, and selected Dropbox account downloads. Browse and select the desired scope; nothing is selected by default. Google uses a user-configured Desktop OAuth client and read-only browser authorization. S3 accepts explicit read credentials, including temporary credentials. Connections stay in memory; jobs survive restart.

Choose **Compare with local folder** before starting to fingerprint a local directory against the selected remote inventory. An indexed fingerprint catalog lives in the existing API-owned SQLite database. Verified local matches avoid repeat network transfers, including identical content under different names. Export copies are independent; this does not delete existing duplicates or deduplicate disk storage. Unsupported remote checksum evidence is reported as uncertain, not inferred from names/sizes.

See [cloud methods, setup and limits](docs/cloud-services.md). Current account evidence: one live Bluesky public-record download; S3, Google Drive and Dropbox account downloads are fixture-qualified pending user account setup. See [Dropbox registration and scope](docs/dropbox-account-method.md).

## Background operation

Closing the desktop window hides it while preservation work and the local API continue. Use the Migrate menu-bar/tray icon → **Open Migrate** to return, or **Pause work and quit** to stop gracefully. On macOS the Dock also reopens the window. Quit does not leave a detached service running; unfinished work is paused and can be resumed after reopening. This does not prevent computer sleep or start at login.

See [background lifecycle](docs/background-lifecycle.md) for the boundaries and verification.

Personal account inventories and real exports do not belong in this source repository.

## Naming and saved state

The standalone product is **Crux Garden Migrate**. The repository remains **CruxGarden/crux-garden** for the wider product family. Internal `migration-*` packages, transport names and application identifiers remain stable; they describe the migration domain. In particular, renaming the display name does not move the profile, reset history, change the local API contract, or rename already preserved output folders.

Service choices use bundled SVG brand artwork for all 32 catalog services. See [icon sources and licenses](docs/service-icons.md).


Flickr full-data exports now support a separate photo/album metadata review after preservation. It shows candidate matches, ambiguous IDs, missing records and unreadable sidecars while retaining originals. See [photo metadata scope, evidence and limits](docs/photo-export-metadata.md). This does not automate Flickr's export request/download or modify photo metadata.
