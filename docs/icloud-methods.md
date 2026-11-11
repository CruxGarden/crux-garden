# iCloud migration methods

Reviewed November 10, 2026. Current implementation preserves **selected already-downloaded files**, complete export folders or selected archive parts. It does not sign into Apple, request a privacy export, operate Photos, hydrate placeholders, reconstruct a Photos library or infer Live Photo pairings.

## Photos: reliable path available now

On a Mac, select a representative batch in Photos and export unmodified originals. Enable the IPTC-as-XMP option when useful. Keep every exported component: Apple documents that a Live Photo yields both a still and a video. If the visible edited version matters, export that separately into another folder; it is not interchangeable with the original. Apple's [Photos export guide](https://support.apple.com/en-eg/guide/photos/pht6e157c5f/mac) describes the choices.

Use a dedicated folder outside cloud sync as the export staging area. In Migrate, choose iCloud Photos, start an import, then **Choose files** for a small selection or **Choose source** for the complete exported folder. Choose a separate preservation destination, review, preserve, then open representative copies offline. The file picker selects 1–500 ordinary files from one folder. Include sidecars and video companions explicitly; Migrate never silently selects siblings. XMP stays unchanged and is not yet interpreted.

This is portable-file preservation, not a backup of the Photos application database. Do not point this workflow into a `.photoslibrary` package. A filename match does not prove a Live Photo relationship. RAW/JPEG variants, adjustments, albums, dates changed within Photos and Shared Library ownership need separate qualification; do not promise them from file counts alone. Ordinary exports cannot be assumed to preserve app editing behavior.

For a whole library, Apple's [download instructions](https://support.apple.com/en-us/111762) offer Download Originals to this Mac. The browser alternative supports at most 1,000 selected items per batch and offers original or converted download choices. Prefer original-format downloads for preservation. At the user's reported 12,067 photos plus 771 videos, that means at least 13 web batches, and likely more physical files than library items. This is a planning estimate, not an account inventory. The app's 20,000-entry folder/archive bound includes sidecars and directories; split large exports before that limit. The reported 201.9 GB is not a promise of required disk space: originals, edited copies, staged exports and preserved copies can coexist. Use the app's measured destination estimate after export.

Shared Albums are a distinct source: Apple notes copies can have reduced resolution and omit reactions. Keep that limitation visible rather than treating them as original-library equivalents. See [Apple's archive guidance](https://support.apple.com/en-us/108306).

## Drive: selected local copies

Use Finder's iCloud Drive view to select the intended files or folders. Download Now requests offline content; Keep Downloaded prevents normal optimization from evicting selected items. Check Finder's status and wait for downloads to finish. See [working with iCloud Drive](https://support.apple.com/en-euro/guide/mac-help/mchl1a02d711/27/mac/27) and [status indicators](https://support.apple.com/en-ke/guide/mac-help/mchlc994344b/27/mac/27).

Copy the intended selection to a dedicated staging directory outside cloud sync, then select those files or the staged folder in Migrate. Use Copy/Paste, not a move. Apple's archive guidance above says optimized files download before the copy and sharing access does not accompany the copy. App-specific data may require its application's export. Migrate verifies the supplied local bytes; it cannot establish that Finder downloaded every account item or that an optimized placeholder is fully hydrated on every supported OS. It has no provider download progress or resumable iCloud checkpoint yet.

The user's 70.4 GB document estimate suggests staged folder batches. Packages, links, permissions, extended attributes and app databases are outside the ordinary-file preservation promise. Check representative documents in their originating app; a successful SHA-256 check proves byte equality, not document usability or account completeness.

## Native PhotoKit bridge foundation (not enabled)

Apple documents a supported route worth implementing next, rather than treating the absence of a general web connector as proof that automation is impossible:

- [PHAssetResourceManager.writeData](https://developer.apple.com/documentation/photos/phassetresourcemanager/writedata(for:tofile:options:completionhandler:)) writes an asset resource asynchronously to a file.
- [Network access options](https://developer.apple.com/documentation/photos/phassetresourcerequestoptions/isnetworkaccessallowed) allow iCloud retrieval, with progress callbacks. Access is off by default. Apple staff confirm there is [no separate resource-local-availability API](https://developer.apple.com/forums/thread/833066); handle the documented request result rather than reading private flags.
- [Resource types](https://developer.apple.com/documentation/photos/phassetresourcetype) distinguish originals, modified versions, alternate photos, adjustments and original/current paired video. Preserve these roles explicitly; never choose one arbitrary resource per asset.

Proposed next vertical slice: qualify a small native macOS helper with a bounded protocol for authorization status, paginated asset/album discovery and explicit selected resource export. The native host owns system permission presentation and resource requests. The Node API continues to own durable jobs, SQLite, fingerprints, manifests and final validation; React uses an injected capability. Reads must be implemented without Photos change requests. Platform authorization terminology may expose read/write access even though Migrate performs only reads; explain that accurately before requesting permission. Denial, limited access, cancelled requests, partial output, changed assets, duplicate original filenames and restart behavior need tests before the capability is exposed as usable.

Use local fixture protocol responses until actual permission/account acceptance is available. Do not inspect the user's photo library just to test readiness. Do not embed Apple credentials, scrape sign-in, read private Photos databases or advertise library-wide completeness from a partial selection. A separate native helper needs a recorded architecture decision and packaging evidence before it ships. The internal bridge is now compiled and fixture-tested; its [protocol, bounds and remaining integration](photokit-bridge.md) are documented separately. It is not exposed through the app or local API, and has not accessed a real library.

Other alternatives remain user-managed iCloud.com downloads and provider data-export requests. Neither is automatically requested or polled by the current app. A service-specific login scraper is not a prerequisite for the supported-native investigation.

## Shared file selection behavior

`POST /v1/jobs/:id/fileSet` accepts `{ "paths": ["/absolute/staging/photo.HEIC", "/absolute/staging/photo.MOV"] }` through the authenticated local API. Native renderers gain this authority only through the host's **Choose files** picker. Embedded hosts implement the same picker contract. Files must be regular, safely named, distinct and in one resolved parent directory. Direct symlink selections are rejected.

The saved job stores `sourceKind: file-set`, a common source and explicit `sourceFiles`; its receipt stores `selectedFiles`. Review and copy inventory only those names. Unselected siblings are not traversed, hashed or copied. Selection is atomic, cannot change after copying begins and is retained across restart. Source changes invalidate review; destination corruption is not overwritten. Selected archives stay opaque files; **Choose export parts** remains the route for preserving and extracting archives. Existing content fingerprints and current-byte verification apply; no database owner or identity mechanism is added.

Controlled tests cover these contracts. Live iCloud account downloads, real Photos exports, hydration behavior and large-library performance remain pending. Existing Google/Dropbox account registration is unrelated to this local method and is not required for it.
