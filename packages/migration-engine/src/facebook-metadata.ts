import type { PhotoRecord, PreservedFile } from "./photo-metadata";
import { jsonArrayStream } from "./json-array-stream";
import { exportReferences } from "./export-references";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) =>
  typeof v === "string" ? v.slice(0, 4096) : undefined;
// The older posts/your_posts_N.json layout has firsthand schema evidence.
// A modern path ending in posts/ is not automatically the same export root.
const numbered = /^((?:.*\/)?)posts\/your_posts_[1-9]\d*\.json$/;
const modern = /(?:^|\/)your_activity_across_facebook\//;
export function facebookMetadata(files: PreservedFile[], sourceKind: unknown) {
  const refs = exportReferences(files, sourceKind);
  const accepts = (path: string) => {
    const logical = refs.logical(path);
    return !modern.test(logical) && numbered.test(logical);
  };
  const mediaFiles: PreservedFile[] = [];
  const adapter = {
    version: "facebook-numbered-post-media-v2",
    accepts,
    mediaFiles,
    stream(file: PreservedFile, emit: (records: PhotoRecord[]) => void) {
      // Counts all visited attachments, including ignored non-media entries,
      // across the complete file rather than resetting for each streamed post.
      const budget = { visited: 0 };
      return jsonArrayStream(null, (value, index) =>
        emit(adapter.parse(file, [value], index, budget)),
      );
    },
    parse(
      file: PreservedFile,
      value: unknown,
      offset = 0,
      budget = { visited: 0 },
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
        return [
          invalid(
            "Expected a numbered Facebook posts array of at most 10,000 entries.",
          ),
        ];
      const root = numbered.exec(refs.logical(file.path))![1]!;
      const records: PhotoRecord[] = [];
      for (const [postIndex, post] of value.entries()) {
        if (!object(post)) {
          records.push(
            invalid(`Post ${postIndex + offset + 1}: invalid entry.`),
          );
          continue;
        }
        if ("label_values" in post) {
          records.push(
            invalid(
              `Post ${postIndex + offset + 1}: label_values layout is not supported; original retained.`,
            ),
          );
          continue;
        }
        // No attachment list, or an empty list, is not missing media.
        if (post.attachments === undefined) continue;
        if (!Array.isArray(post.attachments)) {
          records.push(
            invalid(
              `Post ${postIndex + offset + 1}: unrecognized attachments.`,
            ),
          );
          continue;
        }
        for (const [
          attachmentIndex,
          attachment,
        ] of post.attachments.entries()) {
          if (++budget.visited > 30000)
            throw new Error("Too many attachment entries for one review.");
          if (!object(attachment) || !Array.isArray(attachment.data)) {
            records.push(
              invalid(
                `Post ${postIndex + offset + 1}: unrecognized attachment data.`,
              ),
            );
            continue;
          }
          for (const [dataIndex, item] of attachment.data.entries()) {
            if (++budget.visited > 30000)
              throw new Error("Too many attachment entries for one review.");
            if (!object(item)) {
              records.push(
                invalid(
                  `Post ${postIndex + offset + 1}: invalid attachment entry.`,
                ),
              );
              continue;
            }
            // External links, places and other non-media items remain in raw JSON.
            if (item.media === undefined) continue;
            if (!object(item.media)) {
              records.push(
                invalid(
                  `Post ${postIndex + offset + 1}: unrecognized media object.`,
                ),
              );
              continue;
            }
            const media = item.media;
            const result = refs.resolve(root, media.uri);
            const stamp = media.creation_timestamp;
            records.push({
              ...base,
              kind: "media-reference",
              id: `${file.path}#${postIndex + offset}/${attachmentIndex}/${dataIndex}`,
              title:
                text(media.title) ||
                text(post.title) ||
                `Post ${postIndex + offset + 1}, media ${dataIndex + 1}`,
              description: text(media.description),
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
      "Only the observed older posts/your_posts_N.json array with attachments[].data[].media objects is interpreted. Text-only posts and non-media attachment fields are retained in raw JSON and excluded from media-reference counts.",
      "Wrapper roots must agree across selected parts. Literal local references resolve only against the receipt; remote URLs, traversal and encoded paths are never followed.",
      "Post title and media description are bounded previews; media creation_timestamp remains raw. Parent post timestamps, locations, tags, comments, links and other fields stay in original JSON without reconstruction.",
      "Newer your_activity_across_facebook layouts, label_values, unnumbered status_updates, albums, messages and other exports remain uninterpreted. This does not establish post, album, account or export completeness.",
    ],
  };
  return adapter;
}
