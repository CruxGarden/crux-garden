# Google Photos Takeout review

For preserving an existing Google Photos library, use Google Takeout, select the intended Google Photos albums/groups, and download all intended parts. Preserve the selected archives together in Migrate, then choose **Review photo metadata**. This workflow runs locally after download; requesting, waiting for and downloading the export remain manual. It needs no Google OAuth registration.

This method choice follows Google's [Takeout guidance](https://support.google.com/photos/answer/3024190) and [API changes](https://developers.google.com/photos/support/updates): broad Library API access to existing account media was removed in March 2025. The [Picker API](https://developers.google.com/photos/picker/guides/get-started-picker) is a possible future alternative for user-selected items, not an implemented whole-library export in Migrate. The existing Google Drive connector is separate from Google Photos.

## Supported review

The adapter shares Flickr's bounded worker, hash-checked sidecar reads, immutable derived reports, pause/retry and API-owned job summary. Native hosts and embedded clients discover supported providers from `info.capabilities.photoMetadataProviders`.

- Recognizes photo JSON by its title and `photoTakenTime.timestamp`, rather than treating every JSON document as a photo.
- Generates observed sidecar filename candidates from each media filename: legacy `.json`, `.supplemental-metadata.json`, duplicate indices before the media extension or after the sidecar stem, and the observed 46-character clipped stem variants. The JSON title must agree with the candidate's name or its unindexed base name. Names remain case-sensitive; there is no fuzzy, normalized, substring or date-based identity match.
- Matching stays within the same exported logical folder. For a selected archive set, only Migrate's own first-level part namespace is removed during comparison, allowing a sidecar and media to live in different selected ZIPs. Paths on disk remain separate. Year-folder and album-folder copies are not merged.
- Multiple candidate paths remain ambiguous even if bytes match. Multiple sidecars pointing at one candidate also remain ambiguous. Unknown naming and edited/live-photo counterparts are not guessed; their files remain preserved.
- Recognizes explicitly wrapped `albumData` and flat English `metadata.json` album descriptions. Files in that folder are listed only as possible membership; these album records stay ambiguous because folder contents cannot prove membership, order, completeness or missing parts. Localized flat album metadata names remain unqualified.
- Retains `photoTakenTime.timestamp` and its formatted text separately as exported; the UI labels Unix seconds without converting them to a local date. `creationTime` and filesystem dates are not used as fallback capture dates. A zero timestamp is explicitly flagged. Separate numeric fields from `geoData` and `geoDataExif` remain separate; zero coordinates, timezone, coordinate validity and precedence are not inferred. Full source JSON retains every field.

The JSON report includes original sidecar hashes, candidate paths, unmatched media, uninterpreted files and limitations. It never fetches a JSON URL, changes EXIF, renames media, reconstructs album folders or deletes duplicates. Content fingerprint/local comparison remains separate; media hashes in the report describe preservation, not a new media integrity check. Use Verify again to check current bytes.

Shared bounds remain: 20,000 receipt files, 32 MiB receipt, 8 MiB per sidecar, 64 MiB aggregate sidecars/report, 30,000 records, 100,000 relationships and 100 candidate paths per metadata key. Larger libraries must be preserved in bounded selections; this first preview does not qualify an unlimited whole-library import. Partial selections can naturally produce missing relationships.

## Format evidence

Google documents additional metadata in separate JSON, but does not provide a stable schema for these matching rules. Primary implementation observations consulted November 10, 2026:

- Ente's maintainer-reviewed [Takeout filename change and clipping analysis, PR 4956](https://github.com/ente/ente/pull/4956), merged February 2025.
- A firsthand [asymmetric duplicate-index report](https://github.com/immich-app/immich/issues/30319), July 2026.
- Immich-Go's [metadata model](https://github.com/simulot/immich-go/blob/bc54ad2485b3e9c9b7c751445a28083950ffec60/adapters/googlePhotos/json.go) and [schema fixtures](https://github.com/simulot/immich-go/blob/bc54ad2485b3e9c9b7c751445a28083950ffec60/adapters/googlePhotos/json_test.go), including older wrapped and newer album descriptions.
- Maintainer [edited-pair regression](https://github.com/simulot/immich-go/blob/bc54ad2485b3e9c9b7c751445a28083950ffec60/internal/e2e/client/fromGooglePhotosEdited_test.go) demonstrates one sidecar can accompany both an original and its edited counterpart. Migrate deliberately leaves the counterpart unassociated unless it has its own qualified name pair.

These are observed formats, not a provider schema guarantee. The adapter and synthetic fixtures are independently written; no external conversion tool is bundled or run. Unicode clipping/counting variants and unusual device names require further real-export qualification. Unknown records are preserved and surfaced.

## Acceptance status

Controlled fixtures cover legacy/new names, title agreement, clipped stems, duplicate indexing, repeated sidecars, album/year scope, split selected archives, unselected parts, duplicate media candidates, edited variants, invalid titles/dates and raw time/location values. The shared preservation, pause, corruption/path checks and restart cases remain passing. Browser and native host journeys exercise the real engine.

**Daniel's real Takeout export has not been inspected or imported.** Real Google Photos account completeness and format coverage are pending. Direct Picker downloads, export scheduling/polling, bulk download automation, metadata rewriting and album restoration are not implemented by this review.
