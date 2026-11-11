# Photo export metadata review

Migrate can review preserved **Flickr full-data exports**. Request and download Your Flickr Data in Flickr first, then select the downloaded metadata and media parts together in Migrate. Review files, preserve them, and choose **Review photo metadata**. A downloaded folder works too; review stays within that import's recorded files.

The result is a separate `photo-review-<id>.json` beside the original preservation receipt. Open files and report to read it. Each run creates a new report; existing reports, archives, sidecars and media are never replaced. The UI shows counts and up to 50 records, with problems first. Full records and candidate paths remain in the report.

## First adapter

- `photo_<ID>.json`: its string `id` must agree with the filename. Preview fields are `name`, `description` and `date_taken`.
- `albums.json`: an `albums` array with string IDs and `photos` lists. Album references retain their order, including missing members. Album folders are not created.
- Candidate media uses observed `<ID>_<hex-secret>_o.ext` and `<title>_<ID>_o.ext` patterns. Supported extensions include common image formats and MP4/MOV/AVI/M4V. Titles themselves are never identity keys. Numeric names that could encode two IDs are ambiguous.
- Duplicate sidecars or multiple candidate media paths stay ambiguous, even when bytes agree. A missing candidate stays unmatched; malformed, oversized, changed or linked sidecars are shown as unreadable/unrecognized. Unassociated recognized media and all uninterpreted files are listed separately in the report.

Matching by ID is an association suggestion, **not** proof of media identity, account completeness or successful backup. Media SHA-256 values come from the preservation receipt. This review checks sidecar bytes against that receipt but does not read entire media files again; use **Verify again** for current file integrity. Missing or changed media can therefore still appear as candidates in an older receipt. Files in a separate local directory are not compared by this metadata operation; the existing cloud comparison/reuse workflow remains distinct.

Dates retain exported text with no guessed timezone. Text previews stop at 4096 characters. Other fields—including comments, tags, people, locations, permissions and URLs—remain in preserved JSON; this first adapter does not normalize them or fetch URLs. No EXIF, file dates, filenames or media bytes are rewritten.

## Bounds and lifecycle

The shared review runs off the API thread and can be paused. Restarting an interrupted review starts it afresh; it does not resume within a JSON file. Preservation state remains independent. The canonical API saves only a bounded summary in the existing SQLite job; the complete derived report stays on disk.

Only receipt-listed files are considered: up to 20,000 files, a 32 MiB receipt, 8 MiB per sidecar, 64 MiB total sidecars, 30,000 derived records, 100,000 relationships, 100 candidate paths per ID and a 64 MiB report. A separate worker has a 256 MiB old-generation heap limit. Oversized individual sidecars are reported; aggregate limits stop the review. Links and unsafe receipt paths are rejected. These limits qualify bounded selections, not an arbitrary-size photo library.

Local API clients use authenticated `POST /v1/jobs/<id>/photoReview` and poll the existing jobs endpoint. Pause uses the ordinary job pause operation. The caller supplies an existing verified Flickr job ID, not a filesystem path or download URL. Electron and Tauri expose the same command to the reusable React area.

## Evidence and limits

Official [Flickr downloading guidance](https://www.flickrhelp.com/hc/en-us/articles/4404079675156-Downloading-content-from-Flickr) establishes full Your Flickr Data as the preservation baseline and describes separate JSON for later changes. It does not publish a versioned JSON schema.

Observed filename patterns are documented by a firsthand export-tool author in the [Flickr help forum](https://www.flickr.com/help/forum/en-us/72157711435626268/). Field shapes are corroborated by the maintainer's [flickr2html model and fixtures](https://github.com/NicholasWMRitchie/flickr2html/blob/master/src/model.rs). These are implementation observations, not provider guarantees. Our implementation and synthetic fixtures are independent; no third-party executable or transformation script is used.

Fixture checks cover both filename forms, numeric ambiguities, duplicate sidecars, missing album members, invalid and changed JSON, links, bounds, pause/retry, restart, authenticated API, browser embedding and native host dispatch. **Daniel's real Flickr export is not yet qualified.** This feature does not automate Flickr export requests, readiness polling or archive downloads.

Google's [Takeout guidance](https://support.google.com/photos/answer/3024190) confirms separate JSON for additional photo metadata, but that alone does not qualify matching rules. Google Photos interpretation is pending representative format fixtures, especially supplemental-metadata suffixes, truncated names, edits, duplicate names across albums/years, split parts and timestamp/location semantics. Preserve all originals while that adapter is developed.
