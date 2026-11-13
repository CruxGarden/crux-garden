# ADR 0096 — Preserve selected export parts with explicit namespaces

Accepted 2026-11-10 under Daniel's authorization to implement reusable migration methods, explicit selection and best available source quality.

Flickr's full-data export is the baseline preservation method. Its API restricts original/large photo downloads from Free accounts; Camera Roll/album bulk downloads exclude videos. An authenticated selective API remains a future alternative when originals are available. The application currently guides the request/download, then automates local intake; do not claim account-side automation or live Flickr acceptance. Official sources and current limits are linked in monorepo `docs/cloud-services.md`.

Add `sourceKind: archive-set` to the existing preservation contract. A native multi-file picker or authenticated local API selects independent archives from a single canonical parent directory. The job records only explicit basenames. Reuse the existing review/worker/archive readers/no-overwrite writer/SQLite owner. Apply combined bounds and bind each part's SHA-256 to the review; changes invalidate that plan. Keep originals under `original/<part-name>` and extracted content under `files/<part-name>/`, with one immutable receipt for the selection. Index both original archives and extracted files in the existing fingerprint catalog.

Reject silently flattening or merging archive roots: repeated filenames can represent different photos or metadata. Namespacing preserves provenance without guessing ownership or replacing content. Future provider interpreters can reconcile metadata/media across parts as a derived view while retaining originals. Do not equate byte verification with account completeness, album reconstruction or backup. Independent multipart ZIP volumes are unsupported; each selected ZIP/TAR/TAR.GZ must open on its own.

This is a shared intake method usable by Flickr, Takeout and other downloaded export archives; no provider-specific extraction engine or second database is introduced. File-level recovery rechecks completed copies and restarts interrupted files. Export request polling, account download automation, metadata interpretation and disk deduplication remain separate work.


## Explicit downloaded files — November 10, 2026

Extend the same native-grant/selected-basename contract with `file-set`: 1–500 regular downloaded files from one canonical folder. Unlike archive-set, each selected file is preserved as opaque bytes under its basename; no extraction or companion discovery occurs. The shared inventory accepts a bounded selection and never traverses siblings. Jobs/receipts retain selection, source-change checks and original no-overwrite behavior; API-owned fingerprints remain unchanged. This supports chosen local iCloud documents/photo components and every other downloaded provider export. It is not an iCloud network connector. Whole-folder and archive modes remain available.

Official Apple evidence supports a future native PhotoKit resource-download bridge, including originals/current/paired resources and explicit network permission. That bridge is not implemented by file selection and needs a separate decision/qualification. See docs/icloud-methods.md for current manual paths, scale limits and the exact next investigation.

## Manual Messages copies — November 10, 2026

A dedicated iCloud Messages catalog guide reuses file-set preservation for selected readable PDFs, independently saved attachments and optional user-authored collection notes. Add an optional guide scope paragraph shown before import and outside the collapsed preparation guide on saved jobs. This is presentation metadata, not a permission, connector capability or new durable job field. Keep manual-only/completeness limitations visible beside file-verification status. No message parsing, private database access, account download or inferred attachment relationships. Existing picker grants, Node-owned SQLite/fingerprints, selection and restart are unchanged. Evidence and qualification limits: docs/icloud-methods.md.
