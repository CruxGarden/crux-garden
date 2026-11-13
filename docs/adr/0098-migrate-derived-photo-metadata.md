# ADR 0098 — Derived photo export metadata review

Accepted 2026-11-10 for Migrate's first Flickr interpretation slice.

## Decision

Interpret provider exports only after preservation, using the immutable receipt's bounded selected paths. A separate background worker owns safe reads, limits, pause and derived report writes. The provider adapter maps observed JSON shapes and identity patterns; it does not own IO, credentials or transfers. Save a bounded summary through the existing API-owned SQLite job. Retain each complete derived report separately beside the first receipt.

Flickr is first: full Your Flickr Data remains the baseline. Compare sidecar bytes to preserved SHA-256; match candidate media/album references by stable Flickr ID with explicit ambiguity, missing and invalid states. Do not guess from display titles, overwrite originals, alter EXIF, dereference sidecar URLs or silently choose duplicate records. Media identity remains the existing fingerprint/integrity workflow's responsibility. Dates remain uninterpreted exported strings.

## Consequences

The first review is scoped to already selected imports and cannot prove account completeness, automatically fetch exports, restore album folders, or replace local content comparison. Re-running produces a new report, not destructive updates. Pause/restart reruns a bounded review. Raw JSON retains fields not interpreted by the adapter. Exact bounds, observed format evidence and qualification limitations live in docs/photo-export-metadata.md. Google Photos needs representative format fixtures before reusing this workflow.

## Alternatives

Rewriting EXIF during intake would conflate preservation and interpretation and could destroy evidence. Matching titles or preferring one duplicate could create incorrect associations. A second database owner would violate the existing local API boundary. Crawling the destination instead of using its receipt would silently widen the user's selection.


## Google Photos adapter qualification — November 10, 2026

The second adapter validates the separation: the worker owns IO, bounds, preservation provenance and summaries; provider code owns pure mapping and uncertainty. Takeout uses forward observed filename forms plus title agreement within an exported logical folder; known archive-part namespaces are removed only for comparisons. Repeated paths and sidecars remain ambiguous; album membership inferred from folder contents is always uncertain. Raw capture timestamp/formatted text and separate location fields remain uninterpreted. No creation-time fallback, date rewriting, URL fetching or cross-folder content deduplication. Takeout is the existing-library baseline; Picker remains an unimplemented selected-media alternative. Detailed primary format evidence and limits are in docs/google-photos-takeout.md.

## Mail inventory extension — November 10, 2026

The same preservation-before-interpretation boundary now applies to Gmail Takeout MBOX. Share the safe bounded receipt/file reader and serialized worker lifecycle; keep the streaming MBOX parser separate from JSON photo adapters. Node owns summaries and SQLite; React is capability-driven and host-injected. The mail worker validates every inventoried mailbox against its preserved SHA-256 before publishing derived previews, streams fixed-size buffers and bounds retained headers/previews. Candidate counts and raw label strings are deliberately provisional because MBOX escaping/boundaries vary. Do not extract MIME, rewrite mail, infer threads or deduplicate messages from metadata. A later authenticated Gmail adapter can reuse collection/transfer jobs but must retain provider metadata separately from raw message bytes. Primary evidence and exact bounds: docs/gmail-methods.md. Native Photos remains independently disabled pending permission qualification.

## Social media reference extension — November 10, 2026

Instagram numbered post media arrays reuse the existing bounded metadata worker and durable review summary. Add a pure receipt-only relative-path resolver, reusable for later social adapters. Strip only known archive-part namespaces; retain explicit export roots, flag collisions/missing references, and reject non-local or encoded paths without fetching or disk discovery. Preserve media reference positions and raw timestamps; do not infer post/capture dates or deduplicate content. Existing photoReview transport and report naming remain stable; UI describes media references accurately. Facebook mapping remains unqualified. Evidence and bounds: docs/meta-export-methods.md.

## Facebook observed numbered-post adapter — November 10, 2026

Firsthand exporter examples qualify the older posts/your_posts_N.json array and nested attachments/data/media objects. Reuse the receipt-only resolver and existing review worker without new IO or durable state. Do not infer that modern your_activity_across_facebook exports share root/schema semantics; those remain uninterpreted. Text-only posts and non-media attachments are excluded from reference counts, not marked missing. Bound all visited nested attachment entries, including ignored ones. Raw timestamps remain separate from identity. Evidence/limits in docs/meta-export-methods.md.

## Inert archive envelopes — November 10, 2026

The shared metadata adapter contract gains an optional pure decode hook after receipt hash verification. Ordinary adapters keep JSON.parse. X accepts only literal window.YTD tweet/tweets assignments with matching filename part and a strict JSON body; never evaluate, import or execute archive scripts. Qualified photo references use exact post-ID plus observed media filename within the scoped archive folder. Videos and unsupported formats remain explicit; timelines are not complete account preservation. Bounds and primary observations: docs/x-archive-methods.md.

## Bounded streaming metadata and explicit playback roles — November 10, 2026

Replace X's whole-file decode hook with an optional pure streaming parser in the shared adapter contract. Shared IO visits only preserved receipt paths in 64 KiB buffers, checks file identity/size/timestamps and SHA-256, and accepts results only after both parser finish and complete-file integrity succeed. Parser callbacks are provisional and cannot own IO, writes or durable state; failure discards the entire current file's partial result. A 1 MiB entry buffer/depth128/100k-entry bound and 16 MiB retained record budget prevent simply moving a large whole-file allocation into the worker. X input limits are 256 MiB/script and1 GiB/review; other adapters keep smaller existing limits until qualified. Pause/retry uses the existing lifecycle and rereads files after restart. No new SQLite owner, cache or native access. An entry above the cap remains uninterpreted rather than asking users to edit originals.

X video/animated-GIF playback variants use observed exact MP4 token/post-ID paths and carry an explicit playback role. Report each variant independently, including unsupported HLS or absent files, without preferring bitrate or substituting posters. Candidate associations remain distinct from current content verification and playable/original quality. Shared UI shows the optional role, and existing saved summaries without roles still render. Evidence and exact grammar: docs/x-archive-methods.md. Real exports and maximum-scale performance remain unqualified.

## Meta arrays reuse bounded streaming — November 10, 2026

Instagram numbered media arrays and the qualified older Facebook post arrays opt into the same shared streaming visitor. The framer has an explicit plain-JSON envelope mode; it rejects script assignments, BOMs, comments and semicolons instead of inheriting X's envelope grammar. Parser callbacks still remain provisional until complete-file syntax/hash success. Preserve original entry offsets in derived IDs and keep Facebook's attachment traversal counter across the entire file, including ignored non-media entries. Shared retained-result/input/record budgets apply across callbacks and files. Unknown modern schemas remain uninterpreted; streaming is not evidence of a new schema. No new owner, endpoint, worker or persistence layer. Browser previews stay at 50 records while complete bounded reports remain separate. Real exports and maximum-scale integration remain pending.

## Observed Instagram Media labels — November 10, 2026

Firsthand evidence now qualifies the exact sibling posts.json root array and direct label_values entries labeled Media with media arrays. Reuse the same framer/resolver/worker; count visited labels cumulatively per file, including ignored entries. Distinct label positions yield distinct receipt-reference records, not unique post counts. Keep numbered files alongside; no index-based merging, fbid content identity, date repair, caption-label guessing or recursive media search. Modern Facebook remains separately unqualified. Evidence, exact paths and known omissions: docs/meta-export-methods.md. No new durable owner or native access.
