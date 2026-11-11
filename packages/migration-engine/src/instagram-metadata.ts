import type { PhotoRecord, PreservedFile } from "./photo-metadata";
import { jsonArrayStream } from "./json-array-stream";
import { exportReferences } from "./export-references";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) =>
  typeof v === "string" ? v.slice(0, 4096) : undefined;
const supported =
  /^((?:.*\/)?)your_instagram_activity\/media\/posts(?:_[1-9]\d*)?\.json$/;

export function instagramMetadata(files: PreservedFile[], sourceKind: unknown) {
  const refs = exportReferences(files, sourceKind);
  const accepts = (path: string) => supported.test(refs.logical(path));
  // Extensionless videos are valid: recognition comes from a reference, not a suffix.
  const mediaFiles: PreservedFile[] = [];
  const adapter = {
    version: "instagram-post-media-v3",
    accepts,
    mediaFiles,
    stream(file: PreservedFile, emit: (records: PhotoRecord[]) => void) {
      const budget = { labels: 0 };
      return jsonArrayStream(null, (value, index) =>
        emit(adapter.parse(file, [value], index, budget)),
      );
    },
    parse(
      file: PreservedFile,
      value: unknown,
      offset = 0,
      budget = { labels: 0 },
    ): PhotoRecord[] {
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
        return [invalid("Expected a posts array of at most 10,000 entries.")];
      const logical = refs.logical(file.path);
      const root = supported.exec(logical)![1]!;
      const labeled = logical.endsWith("/posts.json");
      const records: PhotoRecord[] = [];
      for (const [postIndex, post] of value.entries()) {
        const position = postIndex + offset;
        if (!object(post)) {
          records.push(invalid(`Post ${position + 1}: invalid entry.`));
          continue;
        }
        const lists: { items: unknown[]; key: string }[] = [];
        if (labeled) {
          // Only the firsthand English Media label is qualified. No recursive
          // walking, label translation, top-level fallback or date repair.
          if (!Array.isArray(post.label_values)) {
            records.push(
              invalid(
                `Post ${position + 1}: unrecognized label_values; original retained.`,
              ),
            );
            continue;
          }
          if (
            post.media !== undefined &&
            (!Array.isArray(post.media) || post.media.length)
          )
            records.push(
              invalid(
                `Post ${position + 1}: top-level media in posts.json is not interpreted.`,
              ),
            );
          for (const [labelIndex, entry] of post.label_values.entries()) {
            if (++budget.labels > 30000)
              throw new Error("Too many label entries in one metadata file.");
            if (!object(entry)) {
              records.push(
                invalid(`Post ${position + 1}: invalid label entry.`),
              );
              continue;
            }
            if (entry.label !== "Media") {
              if ("media" in entry)
                records.push(
                  invalid(
                    `Post ${position + 1}: media under an unqualified label is not interpreted.`,
                  ),
                );
              continue;
            }
            if (!Array.isArray(entry.media) || !entry.media.length) {
              records.push(
                invalid(
                  `Post ${position + 1}: unrecognized or empty Media label; original retained.`,
                ),
              );
              continue;
            }
            lists.push({
              items: entry.media,
              key: `${position}/label/${labelIndex}`,
            });
          }
          if (!lists.length)
            records.push(
              invalid(
                `Post ${position + 1}: no qualified Media references; original retained.`,
              ),
            );
        } else {
          if (!Array.isArray(post.media) || !post.media.length) {
            records.push(
              invalid(
                `Post ${position + 1}: unrecognized or empty media list; original retained.`,
              ),
            );
            continue;
          }
          lists.push({ items: post.media, key: String(position) });
        }
        for (const { items, key } of lists) {
          if (records.length + items.length > 30000)
            throw new Error("Too many media references in one metadata file.");
          for (const [mediaIndex, media] of items.entries()) {
            if (!object(media)) {
              records.push(invalid("Invalid media entry."));
              continue;
            }
            const result = refs.resolve(root, media.uri);
            const stamp = media.creation_timestamp;
            records.push({
              ...base,
              kind: "media-reference",
              id: `${file.path}#${key}/${mediaIndex}`,
              title:
                text(media.title) || (labeled ? undefined : text(post.title)),
              reference: text(media.uri),
              exportedTime:
                typeof stamp === "number" && Number.isSafeInteger(stamp)
                  ? { timestamp: String(stamp) }
                  : undefined,
              candidates: result.candidates,
              status: result.invalid
                ? "invalid"
                : result.candidates.length > 1
                  ? "ambiguous"
                  : result.candidates.length
                    ? "matched"
                    : "unmatched",
              issue: result.issue,
            });
          }
        }
      }
      return records;
    },
    finalize(records: PhotoRecord[]) {
      const referenced = new Set(records.flatMap((r) => r.candidates));
      mediaFiles.push(...files.filter((f) => referenced.has(f.path)));
    },
    limitations: [
      "Only your_instagram_activity/media/posts_N.json media arrays and posts.json label_values with the exact Media label are interpreted. Counts are media references, not posts, and do not certify account completeness.",
      "Literal paths are scoped to the export root; only Migrate archive-part namespaces are removed. Wrapped roots must agree. No basename guessing, percent decoding, URL fetching or filesystem probing occurs.",
      "Captions are previews. Per-media creation_timestamp is retained as a raw exported value, not asserted to be capture or publication time. No fallback or date repair is inferred.",
      "Other labels, reels, stories, messages, Facebook and other layouts remain uninterpreted. Keep numbered exports too: posts.json may omit carousel members and has unreliable parent dates. No index alignment, fbid identity or timestamp repair is used. Multiple references to one file are not content duplicates; no media is merged or rewritten.",
    ],
  };
  return adapter;
}
