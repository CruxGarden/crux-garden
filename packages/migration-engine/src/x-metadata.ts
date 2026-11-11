import type { PhotoRecord, PreservedFile } from "./photo-metadata";
import { exportReferences } from "./export-references";
import { jsonArrayStream } from "./json-array-stream";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) =>
  typeof v === "string" ? v.slice(0, 4096) : undefined;
const script = /^((?:.*\/)?)data\/(tweets|tweet)(?:-part([1-9]\d{0,5}))?\.js$/;
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[1-9]\d{0,29}$/.test(v);
export function xMetadata(files: PreservedFile[], sourceKind: unknown) {
  const refs = exportReferences(files, sourceKind);
  const mediaFiles: PreservedFile[] = [];
  const accepts = (path: string) => script.test(refs.logical(path));
  const adapter = {
    version: "x-archive-media-reference-v2",
    accepts,
    mediaFiles,
    stream(file: PreservedFile, emit: (records: PhotoRecord[]) => void) {
      const match = script.exec(refs.logical(file.path))!;
      let references = 0;
      return jsonArrayStream(
        `window.YTD.${match[2]}.part${match[3] || "0"} =`,
        (value, index) => {
          const records = adapter.parse(file, [value], index);
          if ((references += records.length) > 30000)
            throw new Error("Too many media records in one archive part.");
          emit(records);
        },
      );
    },
    parse(file: PreservedFile, value: unknown, offset = 0): PhotoRecord[] {
      const base = {
        path: file.path,
        sha256: file.sha256,
        candidates: [] as string[],
      };
      const invalid = (issue: string): PhotoRecord => ({
        ...base,
        kind: "unrecognized",
        status: "invalid",
        issue,
      });
      if (!Array.isArray(value) || value.length > 10000)
        return [
          invalid("Expected an archive array of at most 10,000 post entries."),
        ];
      const match = script.exec(refs.logical(file.path))!;
      const root = match[1]!;
      const folder = `data/${match[2]}_media/`;
      const records: PhotoRecord[] = [];
      let references = 0;
      for (const [postIndex, entry] of value.entries()) {
        if (!object(entry) || !object(entry.tweet) || !id(entry.tweet.id_str)) {
          records.push(
            invalid(
              `Entry ${postIndex + offset + 1}: missing string post ID or tweet wrapper.`,
            ),
          );
          continue;
        }
        const post = entry.tweet;
        const entity =
          post.extended_entities === undefined
            ? post.entities
            : post.extended_entities;
        if (entity === undefined) continue;
        if (!object(entity)) {
          records.push(
            invalid(`Post ${post.id_str}: unrecognized media container.`),
          );
          continue;
        }
        if (entity.media === undefined) continue;
        if (!Array.isArray(entity.media)) {
          records.push(
            invalid(`Post ${post.id_str}: unrecognized media list.`),
          );
          continue;
        }
        if ((references += entity.media.length) > 30000)
          throw new Error("Too many media entries in one archive part.");
        for (const [mediaIndex, media] of entity.media.entries()) {
          if (!object(media)) {
            records.push(invalid(`Post ${post.id_str}: invalid media entry.`));
            continue;
          }
          // Exact observed CDN photo form; never normalize or fetch this URL.
          const uri = media.media_url_https;
          const photo =
            typeof uri === "string"
              ? /^https:\/\/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]{1,200}\.(?:jpg|jpeg|png|gif|webp))$/.exec(
                  uri,
                )
              : null;
          const record: PhotoRecord = {
            ...base,
            kind: "media-reference",
            id: `${file.path}#${postIndex + offset}/${mediaIndex}`,
            title: text(post.full_text) || `Post ${post.id_str}`,
            reference: text(uri),
            description: text(post.created_at),
            status: "invalid",
            issue:
              "Unsupported media type or URL form; original retained and no URL fetched.",
          };
          if (media.type === "photo" && photo) {
            const result = refs.resolve(
              root,
              folder + post.id_str + "-" + photo[1],
            );
            record.candidates = result.candidates;
            record.status =
              result.candidates.length > 1
                ? "ambiguous"
                : result.candidates.length
                  ? "matched"
                  : "unmatched";
            record.issue = result.issue;
          }
          if (media.type === "video" || media.type === "animated_gif") {
            const variants = object(media.video_info)
              ? media.video_info.variants
              : undefined;
            if (
              !Array.isArray(variants) ||
              !variants.length ||
              variants.length > 32
            ) {
              record.mediaRole = "playback";
              record.issue =
                "Missing, unrecognized or oversized playback variant list; poster is not playback.";
            } else {
              for (const [variantIndex, variant] of variants.entries()) {
                const url = object(variant) ? variant.url : undefined;
                // A narrow observed MP4 grammar, not URL normalization or basename search.
                const token =
                  typeof url === "string" && url.length <= 2048
                    ? /^https:\/\/video\.twimg\.com\/(?:tweet_video\/|(?:ext_tw_video|amplify_video)\/[1-9]\d{0,29}\/p[ur]\/vid\/(?:avc1\/)?[1-9]\d{0,4}x[1-9]\d{0,4}\/)([A-Za-z0-9_-]{1,200}\.mp4)$/.exec(
                        url,
                      )
                    : null;
                const playback: PhotoRecord = {
                  ...record,
                  id: `${record.id}/variant/${variantIndex}`,
                  mediaRole: "playback",
                  reference: text(url),
                  issue:
                    "Unsupported playback variant; no poster substitution or URL request occurs.",
                };
                if (
                  object(variant) &&
                  variant.content_type === "video/mp4" &&
                  token
                ) {
                  const result = refs.resolve(
                    root,
                    folder + post.id_str + "-" + token[1],
                  );
                  playback.candidates = result.candidates;
                  playback.status =
                    result.candidates.length > 1
                      ? "ambiguous"
                      : result.candidates.length
                        ? "matched"
                        : "unmatched";
                  playback.issue = result.issue;
                }
                records.push(playback);
              }
              continue;
            }
          } else if (media.type === "photo") record.mediaRole = "photo";
          records.push(record);
        }
      }
      return records;
    },
    finalize(records: PhotoRecord[]) {
      const referenced = new Set(records.flatMap((r) => r.candidates));
      mediaFiles.push(...files.filter((f) => referenced.has(f.path)));
    },
    limitations: [
      "Only data/tweets.js or data/tweet.js and numbered -partN.js files with matching literal window.YTD family/part assignments are parsed as JSON. No archive code is executed.",
      "Media candidates use exact post ID plus the observed photo or video.twimg.com MP4 filename within the corresponding data/tweets_media or data/tweet_media folder. No basename search, URL normalization, decoding or network request occurs.",
      "Photo and observed MP4 playback references are separate. Each video/animated-GIF variant is reported; no highest-bitrate preference, thumbnail substitution or playback/completeness claim. Posters, HLS, query-style CDN URLs, quoted/retweet source reconstruction and other archive categories remain uninterpreted.",
      "extended_entities is used when present, otherwise entities. Text-only posts are excluded from reference counts; repeated entries are not merged. Full text and created_at are bounded raw previews, never inferred capture dates.",
      "Missing parts and full account completeness cannot be established. Split archive copies remain separate; ambiguous candidates do not replace content fingerprints or current integrity checks.",
    ],
  };
  return adapter;
}
