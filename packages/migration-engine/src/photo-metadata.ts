import { basename } from "node:path";

export interface PreservedFile {
  path: string;
  size: number;
  sha256: string;
}
export interface PhotoRecord {
  kind: "photo" | "album" | "unrecognized";
  path: string;
  sha256: string;
  id?: string;
  title?: string;
  dateTaken?: string;
  description?: string;
  exportedTime?: { timestamp: string; formatted?: string };
  exportedLocation?: {
    geoData?: Record<string, number>;
    geoDataExif?: Record<string, number>;
  };
  status: "matched" | "ambiguous" | "unmatched" | "invalid";
  candidates: string[];
  members?: Array<{ id: string; candidates: string[] }>;
  issue?: string;
}
// A provider adapter interprets records; the shared review owns IO and limits.
// Only observed Flickr export ID patterns qualify. Titles are never match keys.
export const flickrMetadata = {
  accepts(path: string) {
    return /^(photo_\d+|albums)\.json$/i.test(basename(path));
  },
  mediaIds(path: string): string[] {
    const name = basename(path);
    if (
      !/\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp|mp4|mov|avi|m4v)$/i.test(name)
    )
      return [];
    return [
      ...new Set(
        [
          /^(\d{1,30})_[a-f\d]+_o\.[^.]+$/i.exec(name)?.[1],
          /^.+_(\d{1,30})_o\.[^.]+$/i.exec(name)?.[1],
        ].filter((id): id is string => !!id),
      ),
    ];
  },
  parse(
    file: PreservedFile,
    value: unknown,
    media: Map<string, string[]>,
    ambiguousPaths: Set<string>,
  ): PhotoRecord[] {
    const base = {
      path: file.path,
      sha256: file.sha256,
      candidates: [] as string[],
    };
    const invalid = (issue: string): PhotoRecord[] => [
      { ...base, kind: "unrecognized", status: "invalid", issue },
    ];
    if (!value || typeof value !== "object" || Array.isArray(value))
      return invalid("Expected a JSON object.");
    const data = value as Record<string, unknown>;
    const text = (v: unknown): string | undefined =>
      typeof v === "string" ? v.slice(0, 4096) : undefined;
    const id = (v: unknown): v is string =>
      typeof v === "string" && /^\d{1,30}$/.test(v);
    const photoId = /^photo_(\d+)\.json$/i.exec(basename(file.path))?.[1];
    if (photoId) {
      if (!id(data.id) || data.id !== photoId)
        return invalid(
          "Photo ID is missing or disagrees with its sidecar filename.",
        );
      const candidates = media.get(photoId) || [];
      return [
        {
          ...base,
          kind: "photo",
          id: photoId,
          title: text(data.name),
          description: text(data.description),
          dateTaken: text(data.date_taken),
          candidates,
          issue: candidates.some((p) => ambiguousPaths.has(p))
            ? "Media filename can represent more than one Flickr ID."
            : undefined,
          status:
            candidates.length === 1 &&
            !candidates.some((p) => ambiguousPaths.has(p))
              ? "matched"
              : candidates.length
                ? "ambiguous"
                : "unmatched",
        },
      ];
    }
    if (!Array.isArray(data.albums) || data.albums.length > 10000)
      return invalid("Unrecognized or oversized album list.");
    let references = 0;
    return data.albums.map((entry: unknown): PhotoRecord => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return invalid("Invalid album record.")[0]!;
      const album = entry as Record<string, unknown>;
      if (
        !id(album.id) ||
        !Array.isArray(album.photos) ||
        !album.photos.every(id) ||
        (references += album.photos.reduce(
          (sum: number, id: string) =>
            sum + Math.max(1, media.get(id)?.length || 0),
          0,
        )) > 100000
      )
        return invalid("Invalid album IDs or too many album references.")[0]!;
      const members = album.photos.map((id: string) => ({
        id,
        candidates: media.get(id) || [],
      }));
      return {
        ...base,
        kind: "album",
        id: album.id,
        title: text(album.title),
        description: text(album.description),
        members,
        status: members.some(
          (m) =>
            m.candidates.length > 1 ||
            m.candidates.some((p) => ambiguousPaths.has(p)),
        )
          ? "ambiguous"
          : members.some((m) => !m.candidates.length)
            ? "unmatched"
            : "matched",
      };
    });
  },
};
