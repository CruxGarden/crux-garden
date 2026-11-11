# Dropbox selected account migration

Implemented November 10, 2026; qualified with controlled provider fixtures. Live Dropbox account authorization and downloads still await an application registration and account acceptance. The existing shared-file and downloaded-export workflows remain available.

## Connect once per app session

1. Create a **scoped app** with **Full Dropbox** access in the [Dropbox developer console](https://www.dropbox.com/developers/apps). App-folder access cannot browse your existing personal files.
2. Enable only `files.metadata.read`, `files.content.read` and `account_info.read`. These support [listing](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/list-folder), [downloads](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/download) and [stable account identity](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/users/get-current-account). No write or sharing-change permission is requested.
3. Under OAuth settings, register exactly `http://127.0.0.1:53683/callback/dropbox`. The host, port and path must match. Unlike Google's desktop callback, this port is fixed. If occupied, Migrate asks you to finish/disconnect another pending Dropbox connection or close the app using it; it does not choose an unregistered port.
4. In Migrate, open **Cloud services**, select **Dropbox**, enter the public **app key**, and choose **Connect Dropbox**. No app secret is needed. Consent happens in your normal browser, using PKCE S256/state. Return to Migrate and choose **Browse source** when connected. [Dropbox authorization reference](https://docs.dropboxapi.com/dropbox-api/docs/get-started/authorization).
5. Select individual files or open a folder and select **this entire folder**. **Load more files** continues a listing. **Prepare selected migration** creates a job and asks for a destination. Optionally compare a local folder, then start. After downloading, **Review cloud export** feeds the ordinary preservation workflow.

The registration belongs to you during this preview; there is no bundled production app key. Public distribution requires its own registration and applicable provider approval. [OAuth guidance](https://docs.dropboxapi.com/dropbox-api/docs/oauth).

Access and refresh tokens stay in the local service's memory. Refresh happens within the session; reconnect after Quit. The app key field is cleared after sign-in starts. Tokens, authorization codes and callback URLs are absent from saved jobs, exports and the file catalog. Closing the window keeps the service running; explicit Quit pauses transfers. Disconnect closes the pending callback and releases the port.

## Scope and verification

This version supports current ordinary files in your **Dropbox home namespace**, including mounted shared folders reachable there. It does not enumerate team-space roots, unmounted shares, historical revisions, comments, permissions, deleted items or all account data. Folder listings happen over time, not as an atomic snapshot. Non-downloadable cloud documents stop the job with instructions to export them separately using Dropbox's tools; they are not silently skipped.

Selected folders are paginated recursively before downloads. Stable file IDs, revisions, names, source paths, sizes, available hashes and modification timestamps enter the manifest. Unsafe/colliding local paths fail before content transfer. Names and folder structure are preserved when representable by the shared safe-path policy. The existing 20,000-entry / 1 TiB limits apply. Empty folders are not preserved.

File identity, revision, size and available content hash are checked against the reviewed plan before transfer or local reuse. Download requests pin the file ID and revision; response metadata and byte count must agree. The shared worker checks the provider hash, calculates local SHA-256, reads back the file and only then publishes it. A further source-version check rejects changes during transfer. The [download API](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/download) supplies the content and metadata; [request formats](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/request-response-formats) distinguish RPC JSON from header-encoded content arguments.

Dropbox's content hash differs from ordinary SHA-256: hash each 4,194,304-byte block, then hash the concatenated binary digests. Empty files have no block. The shared fingerprint catalog computes it with SHA-256 and MD5 during explicit local scans and collection verification, without another file read. Earlier catalog rows acquire it when rescanned; matching names and sizes are never proof. [Content-hash specification](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/content-hash).

Matching local files are rehashed and copied with verification. This saves transfers and retains independent export files; it does not delete duplicates or save disk space. If Dropbox omits its optional content hash, a previously verified stable source/version identity can support reuse; otherwise a first transfer is necessary. Shared-link downloads do not receive a provider-certified hash.

Recovery is **per file**: completed files are rechecked; an interrupted file restarts after reconnecting the same account/home namespace. No account-connector byte-range checkpoint implementation is claimed. Dropbox's documented range support and the separate shared-link resume implementation do not change that boundary.

## Architecture and evidence

Google and Dropbox share the loopback PKCE lifecycle. Provider configuration chooses the callback and authorization endpoint; neither is supplied by renderer URLs. Native hosts open only the constructed provider authorization addresses. Callback method, host, origin, path, state and one-use code are checked; responses forbid caching and close connections. Timeout, cancellation and occupied-port handling are explicit.

The existing public-IP-pinned HTTPS transport now accepts internal POST options. Dropbox RPC, token and content calls use fixed official origins, bounded JSON metadata and generic redacted failures. Transient failures use bounded shared retries; longer rate limits ask the user to retry later. There is no generic renderer-provided POST endpoint.

Ten engine cases cover PKCE/state/exact callback and busy-port recovery, scoped token refresh, paginated selection, Unicode names, source-version changes, invalid response metadata, checksum failures, unsupported/unsafe inputs, repeated cursors, local reuse across restart and interrupted transfer recovery. Electron exercises actual host URL construction and disconnect without visiting Dropbox; browser embedding exercises the real engine against fixtures through download and preservation. This is fixture evidence, not a live account migration. Current complete verification is in [verification](verification.md).

Next: qualify a real selected Dropbox account when registration exists; independently add photo-export metadata reconciliation while preserving original archives. Automatic stale-lock recovery and production signing/update distribution remain separate work.
