# Dropbox account migration: method and implementation status

Reviewed November 10, 2026. The account connector is the next implementation slice. **It is not yet available in the app.** Dropbox currently offers the existing shared-file download and local export-preservation workflows.

## Implemented foundation

The shared fingerprint engine now computes Dropbox's content hash alongside SHA-256 and MD5 when scanning local files or verifying collection outputs. It streams consecutive 4,194,304-byte blocks, hashes each with SHA-256, and hashes their concatenated binary digests. Empty files have no block. This requires no extra file read and retains only hash state, but adds hashing CPU work. It is a separate algorithm, never mislabeled ordinary SHA-256. [Dropbox content-hash specification](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/content-hash).

The existing API-owned SQLite catalog gains a nullable indexed hash column. Previously saved history, Mood, file locations and source identities are retained. Old entries remain usable for their existing algorithms; explicitly scan their folder to add the new hash. An update with identical SHA-256 retains a previously calculated Dropbox hash; changed bytes invalidate it. No background scan of unselected folders occurs.

The shared collection worker can verify this checksum before publishing a downloaded file and recognize a renamed local copy by its content. Local candidates are rehashed before use, then copied and verified; each export keeps independent files. A wrong checksum fails the transfer without publishing it. These paths are tested with controlled adapters, not a live Dropbox account. Existing shared-link downloads still have no provider-supplied content hash and make no new integrity or resume claims.

## Planned preferred method

Use a scoped account API connection for selected files and folders. Dropbox's API download response supplies file identity, revision, size and content hash; these can bind a reviewed selection to the bytes actually received. Preserve returned source metadata in a manifest. Keep shared links for individual downloads and local exports for already downloaded data. [Download endpoint](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/download).

Use system-browser authorization with PKCE S256 and state, short-lived access tokens and session refresh. The callback must exactly match a registered URI; do not assume Google's ephemeral-port exception applies. No client secret belongs in a public desktop client. The first implementation should keep credentials in service memory and require reconnect after Quit, as the Google connector does. [Dropbox authorization reference](https://docs.dropboxapi.com/dropbox-api/docs/get-started/authorization).

Registration prerequisites for that future connector:

1. Create a scoped Dropbox application in the [developer console](https://www.dropbox.com/developers/apps). Account migration needs access to existing user files, not an isolated app folder.
2. Select read-only scopes appropriate to listing, file content and stable account identity (`files.metadata.read`, `files.content.read`, `account_info.read`); do not request write or sharing-change scopes. See [listing scope](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/list-folder), the download endpoint above, and [account scope](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/users/get-current-account).
3. Register the exact loopback callback chosen by the implementation. Its host, port and path are still to be finalized and tested; there is no usable callback to register in this preview.
4. Use the public app key in the eventual connection UI. Complete consent in the normal browser. A distributed app needs its own registration and applicable Dropbox production approval; development credentials are not a shipped account connector. [OAuth guide](https://docs.dropboxapi.com/dropbox-api/docs/oauth).

## Acceptance required for the connector

- Paginated browsing and recursive discovery only within explicit selected roots; selected-file and folder tests must cover non-ASCII names, repeated pages, path collisions and unavailable files.
- Fixed provider endpoints, bounded metadata and rate-limit retry. Content-download arguments belong in `Dropbox-API-Arg` with its documented header encoding; RPC calls have a different transport shape. [Request/response formats](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/request-response-formats).
- Revision-bound downloads and response identity/size/hash checks. Cloud-native or non-downloadable files need an explicit export policy; unsupported content must not silently vanish.
- Personal-root and team-namespace behavior must be explicitly scoped. No whole-account completeness claim without validating all supported roots and export types.
- Provider range support does not establish implementation resume. First reuse the existing collection file-boundary recovery; add checkpointed ranges only after proving revision identity and hash continuity. Test pause, refresh, reconnect, changed revisions, stale local matches and final readback.
- Add fixtures and native/browser journeys before live selected-account acceptance. Document fixture and live evidence separately. Do not log tokens, authorization codes, URLs containing secrets or user file contents.

Photo sidecar reconciliation remains a separate follow-on workflow. Preserve downloaded originals first, then derive album/media relationships without rewriting source files or claiming account-side export automation.
