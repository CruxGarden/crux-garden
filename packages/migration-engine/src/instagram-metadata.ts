import type { PhotoRecord, PreservedFile } from "./photo-metadata";
import { jsonArrayStream } from "./json-array-stream";
import { exportReferences } from "./export-references";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) =>
  typeof v === "string" ? v.slice(0, 4096) : undefined;
const numbered =
  /^((?:.*\/)?)your_instagram_activity\/media\/posts_[1-9]\d*\.json$/;

export function instagramMetadata(files: PreservedFile[], sourceKind: unknown) {
  const refs = exportReferences(files, sourceKind);
  const accepts = (path: string) => numbered.test(refs.logical(path));
  // Extensionless videos are valid: recognition comes from a reference, not a suffix.
  const mediaFiles: PreservedFile[] = [];
  const adapter = {
    version: "instagram-numbered-post-media-v2",
    accepts,
    mediaFiles,
    stream(file: PreservedFile, emit: (records: PhotoRecord[]) => void) {
      return jsonArrayStream(null, (value, index) =>
        emit(adapter.parse(file, [value], index)),
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
          invalid("Expected a numbered posts array of at most 10,000 entries."),
        ];
      const root = numbered.exec(refs.logical(file.path))![1]!;
      const records: PhotoRecord[] = [];
      for (const [postIndex, post] of value.entries()) {
        if (!object(post) || !Array.isArray(post.media) || !post.media.length) {
          records.push(
            invalid(
              `Post ${postIndex + offset + 1}: unrecognized or empty media list; original retained.`,
            ),
          );
          continue;
        }
        if (records.length + post.media.length > 30000)
          throw new Error("Too many media references in one metadata file.");
        for (const [mediaIndex, media] of post.media.entries()) {
          if (!object(media)) {
            records.push(invalid("Invalid media entry."));
            continue;
          }
          const result = refs.resolve(root, media.uri);
          const stamp = media.creation_timestamp;
          records.push({
            ...base,
            kind: "media-reference",
            id: `${file.path}#${postIndex + offset}/${mediaIndex}`,
            title: text(media.title) || text(post.title),
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
      return records;
    },
    finalize(records: PhotoRecord[]) {
      const referenced = new Set(records.flatMap((r) => r.candidates));
      mediaFiles.push(...files.filter((f) => referenced.has(f.path)));
    },
    limitations: [
      "Only your_instagram_activity/media/posts_N.json arrays and their media[].uri references are interpreted. Counts are media references, not posts, and do not certify account completeness.",
      "Literal paths are scoped to the export root; only Migrate archive-part namespaces are removed. Wrapped roots must agree. No basename guessing, percent decoding, URL fetching or filesystem probing occurs.",
      "Captions are previews. Per-media creation_timestamp is retained as a raw exported value, not asserted to be capture or publication time. No fallback or date repair is inferred.",
      "Newer posts.json label_values, reels, stories, messages, Facebook and other layouts remain uninterpreted. Multiple references to one file are not content duplicates; no media is merged or rewritten.",
    ],
  };
  return adapter;
}
