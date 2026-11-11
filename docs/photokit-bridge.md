# macOS Photos bridge foundation

Reviewed November 10, 2026. This is an internal native transport foundation, **not an available Photos connector**. React, the desktop command router and the local HTTP API do not expose it. There is no authorization request operation and no app-startup library query. Existing selected downloaded-file and archive methods remain the usable iCloud routes.

## Ownership and native boundary

The separately compiled Swift helper uses documented PhotoKit resource APIs. Node launches it with private inherited pipes, a minimal environment and no shell arguments. The helper has no destination paths, listener, credentials, database or durable jobs. The Node API remains the sole durable job, SQLite, manifest and fingerprint owner. A future provider adapter must connect this transport to that shared worker before enabling a host-injected React capability. The architecture decision is workspace ADR0099, mirrored by this tracked contract.

Production contains `PhotoSource`; a separate test build substitutes an in-memory `FixtureSource` at compile time. There is no environment variable or command that activates fixtures in a production binary. Both builds explicitly link Photos and target macOS 13 or later. Current build evidence is arm64 with Swift 6.4.2 in Swift 5 language mode, SDK 27 on macOS 27.0.1; this is not runtime qualification on macOS 13 or Intel. The fixture initially exposed a framework-linking crash in an optimized build; explicit framework linkage and the same deployment target are now verified.

## Protocol and bounds

One command at a time, NDJSON with positive request IDs. Input is capped at 64 KiB, output frames at 512 KiB. Raw resource chunks are at most 48 KiB, base64 encoded. Calls have a 30-second idle timeout and two-hour overall deadline by default. The idle timer measures waiting for the next native frame, not time the consumer spends processing a yielded chunk. The overall deadline still runs. Local limits may be reduced by the internal caller.

| Command | Contract |
| --- | --- |
| `hello` | Pure protocol/version/bounds response. No PhotoKit call. Reports production/fixture build and `authorizationRequests: false`. |
| `status` | Modern read/write-level authorization query only. Returns notDetermined, restricted, denied, authorized, limited or unknown. Tests exercise only fixture status. |
| `open` | Requires authorized/limited status before any fetch. Creates a session snapshot, at most 20,000 visible assets; larger fetches fail explicitly. Returns first 20 assets. |
| `page` | Session-bound cursor, 20 assets per page. Fresh discovery invalidates previous cursors and handles. At most 100,000 resource handles and 32 resources per asset. |
| `read` | Explicit opaque resource key plus required boolean `networkAllowed`. Refreshes revision before and after streaming; rechecks authorization. Emits terminal byte count/SHA-256 only after successful native completion. |

Filename metadata is bounded to 4,096 UTF-8 bytes and UTI to 1,024. Native filenames are metadata, never destination paths. Duplicate filenames retain distinct resource keys. The discovery scope excludes hidden assets and does not fetch every burst member; albums, Shared Library completeness and account-wide completeness are not promised.

Original still/video/audio, alternate photo, current still/video, adjustment data/base resources and original/current paired videos retain distinct roles. Unknown resource types remain `unknown` with their numeric type, never silently promoted to an original. No selection automatically includes a companion resource yet; a future selection UI must explain the roles and allow explicit choices.

Sizes are unknown in this baseline. No private KVC file-size access is used. Apple's newer SDK offers nullable size metadata, which can remain unknown until downloading; the deployment baseline cannot depend on it. Streams are capped at 64 GiB per resource. Metadata revision is only a stale-selection check, **not content identity**. Stream SHA-256 is independently recomputed in Node, but a successful transport alone does not prove an on-disk copy or complete account migration.

Cancellation, abandoned iteration, malformed replies, oversized messages, invalid base64, wrong IDs, missing terminal frames or failed integrity close the helper. Partial chunks must remain provisional. Native completion failure or a revision change after all chunks still makes the operation fail. Valid provider errors may leave a session available for a fresh selection/retry. Restart cannot reuse opaque handles.

## Apple evidence

- [PHPhotoLibrary](https://developer.apple.com/documentation/photos/phphotolibrary) and [enhanced privacy guidance](https://developer.apple.com/documentation/PhotoKit/delivering-an-enhanced-privacy-experience-in-your-photos-app): use modern access-level status. Fetching while undetermined can trigger implicit authorization, so fetches are gated first. Apple calls the level read/write even though this implementation only reads.
- [Resource streaming](https://developer.apple.com/documentation/photos/phassetresourcemanager/requestdata(for:options:datareceivedhandler:completionhandler:)): chunks arrive on an arbitrary serial queue and must be concatenated; completion errors invalidate the transfer, including after data callbacks.
- [Cancellation](https://developer.apple.com/documentation/photos/phassetresourcemanager/canceldatarequest(_:)) and [network opt-in](https://developer.apple.com/documentation/photos/phassetresourcerequestoptions/isnetworkaccessallowed): cancel the native request on processing failure, and never enable network implicitly.
- [Resource types](https://developer.apple.com/documentation/photos/phassetresourcetype): preserve original/current/alternate/paired distinctions.

Installed public SDK headers were also checked for access-level availability, nullable size metadata and resource type values. No private Photos database or login interface was used.

## Qualification and next slice

Tests use a separately compiled synthetic library: authorization states, two-page discovery, duplicate names, original/edited/RAW-like/paired roles, stale handles, changed assets, explicit network opt-in, successful selected byte streams, partial failure, byte bounds, cancellation and timeouts. Deliberately malformed process fixtures exercise the Node boundary. Production/package checks send only `hello` or reject unknown commands; no real library status, fetch, permission request or resource download is used for readiness.

Next integrate unknown-length resources into Node-owned durable jobs: provisional destination writes, counted limits/free-space failures, independent final-file verification, atomic publication, fingerprints, explicit resource selection, pause/retry and restart reconciliation with rediscovery. Never persist transient handles as recoverable identity. Existing collection code assumes known file sizes; do not invent zero sizes to fit that contract. Decide stable asset/resource receipt identity and whether content-based reuse can be proven before transfer.

Then qualify authorization presentation and helper identity in the packaged app, with a clear user action and accurate permission explanation. Do not add a usage-description string or permission request merely to make readiness tests pass. Album discovery, progress during iCloud hydration, minimum-OS/runtime validation, signing and real-account acceptance remain open. The 20,000-asset bound fits Daniel's reported 12,838 photo/video items only as a planning estimate; it is not a scan of his library or a scale qualification.
