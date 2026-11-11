# Dropbox shared-file downloads

Migrate's first network connector downloads one existing Dropbox shared-file link that permits downloading without sign-in. It accepts `/s/.../filename` and `/scl/fi/.../filename` links, preserves existing link parameters, normalizes `dl=1`, and follows at most five HTTPS redirects within Dropbox-owned hosts. A dedicated connector module owns link normalization and network restrictions; the download manager owns durable state and file publication.

Use **Downloads** → paste a link → **Prepare download** → choose a folder → **Start download**. Each job receives its own `Migrate Download <id>` subfolder. The original filename is kept after validation; existing files are never overwritten. **Pause download** stops network activity. Closing the application window leaves the service running; explicit Quit pauses it. After reopening, paste the same link to resume.

Links can grant access to private files. The service only retains the normalized link's SHA-256 fingerprint, not its URL or query values. The original and redirected URLs remain in memory and are omitted from error messages and saved job records. A changed link must start a new download. No provider token, account credential or cookie is requested or stored. Only use an existing link appropriate for this task; creating public links or changing sharing permissions is not required. The normal local-export route remains available.

## Checkpoints and limits

A partial file is created exclusively with mode 0600. Its filesystem identity is recorded; replaced files, symlinks and unexpected hard links are refused. At approximately every 4 MiB, bytes are synced before the offset and prefix SHA-256 are committed through the existing SQLite owner. A restart may redownload the unsynced tail. Resume first rehashes the saved prefix, then requests a byte range with a strong ETag through `If-Range`. Status, range boundaries, total length and ETag must agree. Weak/missing validators, changed files, ignored ranges and malformed responses never append incompatible bytes. When the server provides no strong validator, the UI explains the limitation and offers **Restart download** after a checkpointed interruption; that explicit action discards the owned partial and requests the complete file again. Changed or malformed range responses require a new download. No two versions are concatenated.

The completed file is read back and hashed before exclusive hard-link publication. Recovery recognizes the same already-published inode if interrupted during publication; a different destination file is refused. A completion record is persisted before temporary-link cleanup; startup safely removes a leftover temporary hard link to the same completed file. Downloading does not overwrite a file, expand an archive, or execute content.

The implementation streams bounded chunks, uses a separate asynchronous transfer task outside React, and permits one active download plus the existing single preservation worker. DNS and stalled sockets have a 30-second timeout; there is no 30-second limit on a progressing transfer. Initial transport uses public IPv4 addresses pinned for each request, retaining TLS hostname verification. Redirects are checked before contacting the next host. Arbitrary hosts, local/private address ranges, credentials in URLs and custom ports are refused. IPv6-only networks and proxy configuration are not yet qualified.

The server must return attachment content with a known length. Downloads are limited to 1 TiB with a free-space check and a 64 MiB reserve. Disk availability can still change during a transfer; failures retain the last checkpoint. HTTP 429/503 is reported for a later manual retry; automatic retries, scheduling and rate-limit timers are not implemented. Folder links, password/sign-in protected links, account browsing, OAuth, account completeness and Dropbox metadata/content-hash reconciliation remain outside this slice.

**Downloaded** means the received file is on disk with a local SHA-256 fingerprint. It does not assert a provider-certified checksum or a complete export. **Review downloaded file** creates an ordinary preservation job: archives enter archive review; an ordinary file enters review via its single-file download folder. The user chooses a separate preservation destination and explicitly starts verification.

## Local API and embedding

The same per-run authentication and Origin/Host rules protect:

- `GET /v1/downloads`
- `POST /v1/downloads` with `{ "link": "..." }`
- `POST /v1/downloads/:id/destination` with `{ "path": "/absolute/folder" }`
- `POST /v1/downloads/:id/start` with the same link
- `POST /v1/downloads/:id/restart` with the same link (explicitly restart the owned partial)
- `POST /v1/downloads/:id/pause` with `{}`
- `POST /v1/downloads/:id/import` with `{}`

Native renderer destination changes still require the host's folder picker. The reusable UI only shows Downloads when `info.capabilities.sharedFileDownloads` is true. A host's optional `loadDownloads`/`saveDownload` storage methods use its existing database owner. The injectable network opener is a programmatic test seam; it is not exposed over HTTP, IPC, environment variables or renderer input.

## Evidence and remaining qualification

**Interpretation correction (2026-11-10):** the live response lacked the strong ETag required by our current resume implementation. We did not establish that the link rejects byte ranges, that all shared links lack resume, or that Dropbox cannot resume. Dropbox documents range requests for its content-download API endpoints, including `/files/download` and `/sharing/get_shared_link_file`. These API routes differ from the direct website link tested here. Prefer the best qualified method for the migration and expose useful alternatives; see [method selection](architecture.md#choosing-migration-methods). [Official endpoint-format reference](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/request-response-formats).

Controlled HTTP fixtures exercise restart/resume, connection loss, changed/weak ETags, ignored/malformed ranges, redirects, throttling, HTML responses, partial-file modifications, hard-link replacement and destination collisions. A browser journey uses the real SQLite engine and a streamed network fixture to download → pause → reload → resume → review → preserve, with exact byte comparison. Native desktop coverage checks the actual host/picker boundary and link exclusion from returned records.

A live user-supplied test PDF was downloaded on November 10, 2026: 400,436 bytes, confirmed PDF, then reviewed and preserved byte-for-byte with SHA-256 `17b74e5930324e61dea29d56c8cdb1b4ee63b893599e364b4bd642b75223e797`. Its link and contents are not in this repository. The live response did not supply a strong resume validator, so range-resume remains fixture-qualified rather than claimed for that link. Fixtures prove additional recovery mechanics, not every behavior of Dropbox's live edge servers. Force-killed service ownership still uses the existing manual stale-lock recovery procedure; no claim of automatic recovery from an OS/app crash is made.

Provider reference, reviewed November 10, 2026: [Dropbox's shared-link download instructions](https://help.dropbox.com/share/force-download). Full-account authorization will use the separate [Dropbox OAuth guidance](https://developers.dropbox.com/oauth-guide).

## Account-method preparation

The shared collection engine and local fingerprint catalog now support Dropbox block content hashes. That foundation is fixture-tested and does not change the shared-link behavior described above. Selected account OAuth, browsing and revision-bound downloads are now separately implemented and fixture-qualified; see [account method, registration prerequisites and acceptance](dropbox-account-method.md).
