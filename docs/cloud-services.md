# Selected cloud migrations

This increment starts with three services from Daniel's inventory, easiest to hardest: public Bluesky export, authenticated S3 object download, and Google Drive OAuth/file export. These exercise reusable method workflows rather than copied transfer engines. Flickr and the larger photo/mail/social export services follow; they are not yet automated by this increment.

## What is automated

| Service      | Selection and transfer                                                                                                                                                                              | Important limits                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bluesky      | Resolve a handle or did:plc identity, find its PDS, select repository CAR and/or public media, paginate blob CIDs, download and verify SHA-256 blob CIDs                                            | Public records/media only; no private messages, preferences or identity/server migration. CAR remains an archive, not a readable post viewer. Captured over time, not an atomic account snapshot. Other DID methods are not supported yet.                               |
| Amazon S3    | Connect a commercial-region ordinary bucket, browse prefixes/files, recursively list selected prefixes with pagination, conditional download, retry transient SDK failures, preserve basic metadata | Current objects only; no historical versions/delete markers, policies, ACLs or tags. Archive-tier objects must already be restored. AWS request/egress costs can apply. No S3-compatible custom endpoints, directory buckets or automatic AWS-profile discovery.         |
| Google Drive | Desktop OAuth with PKCE/state/loopback callback, read-only account access, browse My Drive, select files/folders, paginate recursively, download binary files, export Docs/Sheets/Slides/Drawings   | Basic metadata/current content; no comments/permissions/history. Shortcuts, restricted content, unsupported Google types or failed/oversized exports stop the job rather than silently disappearing. Shared-drive roots and Shared with me browsing are not implemented. |

Google local names carry stable ID suffixes so duplicate Drive names remain distinct. Original names and parent IDs remain in the manifest. Native document exports use DOCX, XLSX, PPTX and SVG. Provider version is checked before and after each download. S3 ETags are conditional source validators, not assumed MD5 hashes; only an explicitly full-object SHA-256 checksum is used as content evidence. Bluesky media CIDs must use the supported raw/SHA-256 format. CAR receives local byte verification, not repository-signature or reference-closure certification.

## Use the app

1. Open **Cloud services**, choose a service and connect.
2. **Browse source**. Select individual files or folders; folder selection includes every descendant, including pages not currently displayed. **Load more files** continues a listing. Review the selected list; nothing starts automatically.
3. **Prepare selected migration**, then use the native picker to select a destination. The app creates a private `Migrate Collection <id>` directory.
4. Optionally choose **Compare with local folder**. The app inventories the selected remote scope and hashes files in the selected local folder. It reports matches, items needing download and uncertain matches. This step does not download remote file content.
5. **Start selected migration**. Progress survives app restart. Reconnect the same account/bucket before resuming. **Review cloud export** then feeds the complete files and manifest into ordinary review/preservation for another verified copy.

Closing the window keeps work running. Explicit Quit pauses it. This method has per-file recovery: completed files are rehashed and retained; interrupted files restart from the beginning. Cross-restart byte-range resume for these collection methods is not implemented. The existing Dropbox shared-link range implementation remains unchanged.

## Fingerprints and reuse

The `migrate_fingerprints` table is owned by the existing local API/SQLite adapter. It records SHA-256, available MD5, byte count, verified path, timestamp and optional provider/source/version identity. Indexes make repeated lookups independent of a full directory rescan. Newly completed downloads and preservation outputs register automatically; scan a folder to include pre-existing files.

A candidate must have matching provider checksum evidence, or a previously recorded source identity and stable version. The app rehashes the local file before reuse and checks its bytes while copying. Missing, moved, modified or unreadable files are not reusable. Names and sizes alone are never proof. Provider MD5 matches retain that algorithm's limits; local SHA-256 is also recorded. When no supported checksum or prior version-matched copy exists, comparison reports uncertainty instead of claiming a duplicate.

Reuse avoids network transfers across runs, filenames and services when comparable fingerprints exist. It also avoids downloading identical content twice within one selection. Each export keeps independent local copies plus a manifest, so editing one export cannot mutate another through a hard link. This is transfer deduplication, not disk-storage deduplication or automatic deletion of existing files.

The scan is bounded to 20,000 entries and 1 TiB, refuses links/unsafe paths, and can be paused. The collection reserves manifest space under the same entry limit. Discovery runs again if interrupted before its complete plan is saved; once saved, the plan is fixed. Changed remote versions require a new selection. Empty folders are not preserved. Unsupported/colliding S3 names fail before downloads; nothing is silently overwritten. Output publication requires a filesystem supporting hard links, such as APFS or NTFS.

## Google one-time setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and enable **Google Drive API** in APIs & Services.
2. Configure **Google Auth Platform** with the application's name, support/contact details and audience. While using a testing app, add the Google account you intend to connect as a test user.
3. Under Clients/Credentials, create an **OAuth client ID** of application type **Desktop app**. This is an installed app using an ephemeral localhost callback; do not substitute a web-app client.
4. Copy its client ID and desktop client secret into Migrate's Google fields. Select **Connect Google Drive**, review the read-only Drive permission in your normal browser, and return to Migrate.
5. Select the connected source and browse. No client registration is bundled in this preview. A public distribution needs its own registration, required verification and consent policy work.

Access/refresh tokens and client configuration stay in service memory. Refresh is automatic within the current session when Google supplies a refresh token. Reconnect after quitting. Credentials are cleared from the input fields after connection initiation and are never written into jobs, the fingerprint catalog, manifests or exports. The desktop client secret is public-client configuration, not a way to secure a distributed desktop binary.

## S3 setup

Use the exact bucket region and credentials authorized for `s3:ListBucket` on the bucket and `s3:GetObject` on the intended object prefix. Temporary credentials additionally need their session token and must still be valid when used. KMS-encrypted objects/checksum access can require the corresponding KMS permission. This preview does not create keys, change sharing, read shell/AWS profiles, or grant permissions. Prefer a dedicated read-only identity scoped to the intended data. Connection initially checks root listing; prefix-only listing policies may need a future prefix-scoped connection option. Supply the chosen bucket explicitly; the app does not enumerate every bucket in an account.

## Evidence

Real-account evidence is limited to a user-authorized Bluesky public-record export: 11,215 bytes, verified through production HTTPS and the packaged Tauri download/review/preservation flow, with matching SHA-256 recorded in private test output. Its handle and contents are excluded from repository fixtures. S3 and Google account behavior is covered by controlled fixtures; actual account verification awaits credentials/client setup.

Fixtures exercise pagination, explicit selection, unsafe/colliding paths, source version changes, pause/restart/reconnect, local directory comparison, renamed-file matches, content deduplication, stale local copies, provider checksum failures, Google PKCE/state callback, credential exclusion, local API authentication and preservation handoff. UI/native verification results are recorded in `verification.md` after completion. Do not treat fixture coverage as certification of every provider edge case.

## Provider references

Reviewed November 10, 2026:

- [AT Protocol account migration and repository/blob export](https://atproto.com/guides/account-migration)
- [Bluesky public blob-list lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/sync/listBlobs.json)
- [S3 ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html)
- [S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html)
- [Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Drive downloads and exports](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
