# Migrate

**State:** implemented standalone application; local-comparison code is included as a checkpoint awaiting final native/package qualification. Display name **Crux Garden Migrate**; package/app paths retain `migration` for stability. Updated November 12, 2026.

## Purpose and boundary

Bring explicitly selected cloud/local content into user-controlled storage. Preserve originals and provenance, verify current bytes, retain progress/history, and offer useful provider methods through reusable workflows. No automatic source deletion or storage deduplication. Home may embed the interface later; standalone use remains first-class.

## Current code and evidence

`apps/migration` contains the Tauri host, Electron comparison host and renderer entry. Shared UI, contracts, provider catalog and engine live in `packages/migration-*`; Garden UI lives in `packages/garden-ui`. Node/local API owns durable jobs, SQLite and fingerprints. The API dependency is vendored in this repository. See [architecture](../../architecture.md), [API](../../local-api.md) and [ADRs](../../adr/README.md).

Committed baseline e4eaaaf includes folder/ZIP/TAR/multiple-part and explicit downloaded-file preservation; selected cloud workflows for Bluesky, S3, Drive, Dropbox and Gmail; provider guides; bounded Flickr/Takeout/Meta/X metadata and Gmail MBOX review; selected Messages-copy guidance; fingerprints/local comparison for cloud collections; saved history and background operation. Scope varies by provider—see the linked provider documents in the root [README](../../../README.md).

A catalog guide is not an automated connector. Provider export requests/downloads remain manual where the actual connector is absent. Live Dropbox shared-file and Bluesky public-record evidence is narrower than complete-account qualification. Production PhotoKit remains disabled despite internal fixture coverage. Account registration, real exports and scale limits remain explicit in [verification](../../verification.md).

## Transferred comparison checkpoint

[Selected local comparison handoff](../../handoffs/migrate-local-comparison.md): ordinary explicit-file imports gain a read-only duplicate summary using existing indexed fingerprints and current-byte checks. The design, implementation and tests are included together in this transfer checkpoint. Engine/browser/Electron checks pass; final Tauri/package and visual acceptance remain pending. Continue under an agreed task scope; no recurring continuation has been enabled.

## Home and Lifecycle integration

The React client remains host-injected and Mood ownership stays with the embedding host. Preserve the standalone entry while evaluating Home composition. Existing [background lifecycle](../../background-lifecycle.md) is owned by the native shell: close hides, explicit Quit pauses and closes the service. That behavior is not an installed always-on OS service and must not silently expand into one.

Future Lifecycle integration must preserve one durable migration owner, explicit shutdown/recovery and existing profile identities. Creating a Home view or a Lifecycle supervisor does not justify a second SQLite owner or moving users' files.

## Completion gates for later slices

Meaningful isolated fixtures, type/boundary/build checks, applicable desktop/browser journeys, platform-specific package/restart acceptance and truthful provider/scale limits. Current macOS evidence does not certify Linux packaging. No automatic account setup, personal-library inspection or release publication.
