# Facebook and Instagram preservation methods

Reviewed November 10, 2026. Migrate preserves explicitly selected downloaded folders, files and multiple archive parts for both services. Export requests, readiness checks and downloads remain manual. The Instagram and observed older Facebook reviews are bounded local reference checks, not connections to accounts or complete social-media importers.

## Choose the preservation baseline

Request an information export for the intended profile through Accounts Center or Meta Account. Meta's [information-controls announcement](https://about.fb.com/news/2023/10/manage-your-information-across-apps/) confirms Facebook and Instagram information downloads in Accounts Center, including combined downloads. Its [2026 announcement](https://about.fb.com/news/2026/04/meta-account/) describes the gradual move from Accounts Center to Meta Account. The exact controls can differ during rollout.

For a broad personal archive, select all desired categories and the widest date range offered; choose JSON and the highest available media quality. Record those choices and the profile. Download every part before links expire according to the account's displayed deadline. Keep the original packages; a separate HTML export can aid browsing. Migrate does not claim that these choices include every deleted item, expired story, licensed audio track, other person's content or encrypted conversation. Inspect known examples and any account-specific messaging export requirements.

Use Migrate's export-part picker to select the relevant packages together, then review and preserve the files. Selection is explicit; unselected siblings are excluded. Keep original layout when using an extracted folder. Combining exports from different accounts or dates can create ambiguous path associations; preserve them as separate imports instead.

## APIs are distinct alternatives

Meta's [official Instagram API collection](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api) describes professional Business and Creator account management, with an app and authorization. That is not evidence of complete personal-account preservation. Public content, professional publishing/insights and personal archives are separate scopes. Migrate has no Meta API connector and does not ask a personal user to convert their account.

The [Instagram platform documentation](https://developers.facebook.com/docs/instagram-platform/) and [Facebook user posts reference](https://developers.facebook.com/docs/graph-api/reference/user/posts/) returned HTTP 429 during this review. Facebook permission/access-review details and full personal archive automation are therefore not qualified here. Do not assume a public or Page API includes private messages, settings or every personal post. A future connector needs primary scope evidence, authorized account fixtures and separate preservation of provider metadata. No private login endpoint, cookie collection or scraping is used.

## Implemented Instagram reference review

After preservation, choose **Review export media**. The existing background metadata worker checks sidecar hashes against the preservation receipt and writes a new `photo-review-<id>.json`. The inherited API command is `photoReview`; no additional database, API service, download transport or worker lifecycle is introduced. The React UI is host-injected and uses existing Mood styles.

The adapter recognizes `your_instagram_activity/media/posts_N.json`, with a positive numbered suffix, at the export root or beneath a consistent wrapper directory. It expects an array of posts with `media` arrays. Every `media[].uri` becomes a separate `media-reference` record, retaining post/media positions, a bounded caption and the raw per-media integer `creation_timestamp`, if present. Counts refer to references, not posts. It does not infer a capture/publication date from a parent timestamp or repair encoding.

A shared pure reference resolver compares literal relative paths with the selected receipt. It removes only Migrate's known archive-part namespace, retains the export root and never guesses by basename. An extensionless video can match. A missing selected file remains unmatched; multiple selected parts with the same logical path remain ambiguous even if their bytes agree. Repeated references to one file remain separate records, not duplicate content. URLs, traversal, absolute paths, backslashes, percent escapes, query/fragment syntax and control characters are invalid and never opened or fetched. There is no filesystem discovery outside the receipt.

The source schema evidence is firsthand: an [export owner's published example](https://github.com/pixelfed/pixelfed/issues/4477) shows extensionless video URIs inside media arrays; a [separate firsthand export investigation](https://gist.github.com/JoeGermuska/5e0f91b6bee8fb2ee943b141214b9582) identifies the numbered path and distinguishes per-media timestamps from newer `posts.json`. These are observed formats, not a versioned Meta guarantee. Synthetic fixtures are independently authored; no third-party parser or date-repair script is executed.

## Bounds and explicit limits

Shared limits: 20,000 receipt files, 32 MiB receipt, 8 MiB per sidecar, 64 MiB aggregate sidecars/report, 30,000 derived records and 100,000 relationships; worker heap 256 MiB. This adapter permits at most 10,000 posts per JSON file and 30,000 media references per file, and at most 100 receipt entries per logical path. Text previews are limited to 4096 characters; the UI displays up to 50 records and 10 candidates each. Oversized or unrecognized files are reported; aggregate limits stop review. Pause/retry and saved summaries reuse the existing lifecycle.

Only sidecar bytes are rehashed during this review. A candidate refers to a preserved receipt entry, not proof that the current media bytes are intact or playable. Use **Verify again** for current integrity. Original archives, JSON, media and previous reports remain unchanged. Content fingerprints and existing local comparison retain ownership of deduplication.

Other layouts—including older `content/` paths, newer `posts.json`/`label_values`, reels, stories, messages and newer Facebook post structures—remain preserved but uninterpreted. All files outside supported sidecars/referenced entries are enumerated as uninterpreted in the report; this is not a complete media inventory. No album restoration, EXIF rewriting, URL fetching or completeness assertion is performed.

## Qualification and next steps

Engine fixtures cover unsafe references, missing files, extensionless videos, wrapper isolation, multiple references, selected split parts, ambiguity, malformed/oversized lists, changed metadata and restart. Browser/native-host/package acceptance is recorded in [verification](verification.md). No real Instagram or Facebook account/export has been inspected in this slice.

An observed older Facebook layout is now supported as described below. Current Facebook formats and real-account qualification remain pending; do not assume that evidence for the older layout establishes current completeness. Twitter/X export qualification follows by method fit. Google/Dropbox registration and real Flickr/Takeout acceptance remain independent outstanding work; production Photos stays disabled.


## Facebook numbered-post media references

The [fb-json2table author’s firsthand account](https://github.com/numbersprotocol/fb-json2table#why-facebook-json-is-not-friendly-to-analyze) distinguishes earlier `status_updates` objects from later `posts/your_posts_1.json` arrays. Their [published sample](https://github.com/numbersprotocol/fb-json2table/blob/master/example/example_json_content.json) shows `attachments[].data[].media` objects containing relative `uri`, `creation_timestamp`, title and description. It also includes empty attachment lists. This establishes one observed older export layout, not a current Meta schema guarantee. The upstream repository is archived; no upstream parser is installed or executed. Our fixtures use independently authored synthetic content.

Migrate recognizes `posts/your_posts_N.json` with a positive numbered suffix, optionally under a consistent wrapper. It deliberately excludes paths under `your_activity_across_facebook`, whose modern root and schema are not qualified by this sample. Numbered files must contain arrays. Each nested media object becomes a candidate reference through the same receipt-only resolver as Instagram. Media description/title and parent title are bounded previews; only per-media `creation_timestamp` is retained as a raw timestamp. Parent post timestamps are not substituted or interpreted as photo dates.

Posts without attachments, empty lists and non-media attachment fields (such as external links) do not generate missing-file findings. Their content remains in the original JSON and is excluded from reference counts. Malformed attachment/data/media structures are explicitly reported as unsupported entries. Counts therefore cover media references plus diagnostics, not all posts. Non-media fields, comments, text, locations, tags, albums and messages are not reconstructed. Unsupported layouts remain in the report’s uninterpreted file list.

This adapter shares all receipt/hash/worker/report bounds above, permits at most 10,000 posts per file, and stops after 30,000 visited attachment containers/data entries per file. That bound includes non-media entries and prevents unbounded nested-list traversal. It retains extensionless files by exact path, leaves split-part collisions ambiguous and never fetches external links or media URLs. Original archives/JSON/media stay unchanged. Repeated references remain separate; existing fingerprints retain responsibility for content identity.

Seven engine cases exercise preservation/restart, wrappers, unsafe references, malformed/oversized lists, sidecar changes, split-part selection/collisions, text-only/link posts and excessive attachment fanout. Desktop, browser and package acceptance are recorded in [verification](verification.md). Daniel’s real Facebook export has not been inspected. Export requests/downloads remain manual; modern Facebook layout qualification is still outstanding.
