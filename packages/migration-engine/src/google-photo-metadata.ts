import { posix } from "node:path";
import type { PhotoRecord, PreservedFile } from "./photo-metadata";

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) =>
  typeof v === "string" ? v.slice(0, 4096) : undefined;
const mediaName = (path: string) =>
  /\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp|dng|cr2|cr3|arw|nef|mp4|mov|avi|m4v|mkv|3gp|mts|m2ts)$/i.test(
    path,
  );
const filename = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 1024 &&
  !/[\/\\\x00-\x1f]/.test(v) &&
  v !== "." &&
  v !== "..";

// Generate observed sidecar names from media names, never invert a clipped name.
// These are association candidates only, not content or account identities.
function sidecarNames(name: string) {
  const indexed = /^(.*)\((\d+)\)(\.[^.]+)$/.exec(name);
  const bases = [{ base: name, suffix: "", title: name }];
  if (indexed)
    bases.push({
      base: indexed[1]! + indexed[3]!,
      suffix: `(${indexed[2]})`,
      title: indexed[1]! + indexed[3]!,
    });
  const forms = new Map<string, Set<string>>();
  for (const { base, suffix, title } of bases) {
    for (const stem of [base, base + ".supplemental-metadata"]) {
      for (const variant of [stem, [...stem].slice(0, 46).join("")]) {
        const key = variant + suffix + ".json";
        const titles = forms.get(key) || new Set<string>();
        titles.add(name);
        titles.add(title);
        forms.set(key, titles);
      }
    }
  }
  return forms;
}

export function googlePhotoMetadata(
  files: PreservedFile[],
  sourceKind: unknown,
) {
  // Strip only Migrate's known archive-part namespace, not arbitrary directories.
  const logical = (path: string) =>
    sourceKind === "archive-set" ? path.split("/").slice(1).join("/") : path;
  const mediaFiles = files.filter((f) => mediaName(f.path));
  const bySidecar = new Map<string, Map<string, Set<string>>>();
  const byFolder = new Map<string, string[]>();
  for (const file of mediaFiles) {
    const folder = posix.dirname(logical(file.path));
    const members = byFolder.get(folder) || [];
    members.push(file.path);
    byFolder.set(folder, members);
    for (const [name, titles] of sidecarNames(posix.basename(file.path))) {
      const key = posix.join(folder, name);
      const candidates = bySidecar.get(key) || new Map<string, Set<string>>();
      candidates.set(file.path, titles);
      bySidecar.set(key, candidates);
      if (candidates.size > 100)
        throw new Error(
          "Too many Takeout candidates share one metadata name. Review a smaller import.",
        );
    }
  }
  return {
    version: "google-photos-takeout-v1",
    mediaFiles,
    accepts: (path: string) => /\.json$/i.test(path),
    parse(file: PreservedFile, value: unknown): PhotoRecord[] {
      const base = {
        path: file.path,
        sha256: file.sha256,
        candidates: [] as string[],
      };
      const invalid = (issue: string): PhotoRecord[] => [
        { ...base, kind: "unrecognized", status: "invalid", issue },
      ];
      if (!object(value)) return invalid("Expected a Takeout JSON object.");
      const folder = posix.dirname(logical(file.path));
      // Wrapped albumData is explicit; flat title-only JSON is only treated as
      // an album description under the observed English metadata.json name.
      const album = object(value.albumData)
        ? value.albumData
        : posix.basename(file.path) === "metadata.json" &&
            !("photoTakenTime" in value)
          ? value
          : undefined;
      if (album) {
        if (
          typeof album.title !== "string" ||
          !album.title ||
          album.title.length > 4096
        )
          return invalid("Unrecognized album description.");
        const members = (byFolder.get(folder) || []).map((path) => ({
          id: logical(path),
          candidates: [path],
        }));
        return [
          {
            ...base,
            kind: "album",
            id: folder,
            title: album.title,
            description: text(album.description),
            members,
            status: "ambiguous",
            issue:
              "Folder contents are possible album members, not a verified membership list. Missing export parts cannot be detected.",
          },
        ];
      }
      if (
        !filename(value.title) ||
        !object(value.photoTakenTime) ||
        typeof value.photoTakenTime.timestamp !== "string" ||
        !/^-?\d{1,16}$/.test(value.photoTakenTime.timestamp)
      )
        return invalid(
          "Unrecognized photo title or photoTakenTime. Kept in the original JSON.",
        );
      const all = bySidecar.get(logical(file.path));
      const candidates = [...(all || [])]
        .filter(([, titles]) => titles.has(value.title as string))
        .map(([path]) => path);
      const timestamp = value.photoTakenTime.timestamp;
      const formatted = text(value.photoTakenTime.formatted);
      const geo = (v: unknown) => {
        if (!object(v)) return undefined;
        const result: Record<string, number> = {};
        for (const key of [
          "latitude",
          "longitude",
          "altitude",
          "latitudeSpan",
          "longitudeSpan",
        ])
          if (typeof v[key] === "number" && Number.isFinite(v[key]))
            result[key] = v[key] as number;
        return result;
      };
      return [
        {
          ...base,
          kind: "photo",
          id: logical(file.path),
          title: value.title,
          description: text(value.description),
          dateTaken: `Unix seconds ${timestamp}${formatted ? `; ${formatted}` : ""}`,
          exportedTime: { timestamp, formatted },
          exportedLocation: {
            geoData: geo(value.geoData),
            geoDataExif: geo(value.geoDataExif),
          },
          candidates,
          status:
            candidates.length === 1
              ? "matched"
              : candidates.length
                ? "ambiguous"
                : "unmatched",
          issue: candidates.length
            ? timestamp === "0"
              ? "Exported timestamp is zero; no capture date is inferred."
              : undefined
            : all?.size
              ? "Sidecar name and exported title disagree; no candidate was chosen."
              : "No supported sidecar/media name pair in this exported folder. Edited variants and unknown naming remain separate.",
        },
      ];
    },
    finalize(records: PhotoRecord[]) {
      const owners = new Map<string, PhotoRecord[]>();
      for (const record of records)
        if (record.kind === "photo")
          for (const path of record.candidates) {
            const list = owners.get(path) || [];
            list.push(record);
            owners.set(path, list);
          }
      for (const list of owners.values())
        if (list.length > 1)
          for (const record of list) {
            record.status = "ambiguous";
            record.issue =
              "More than one sidecar refers to this candidate media file.";
          }
    },
    limitations: [
      "Takeout associations use observed forward filename rules and matching exported titles within the same logical folder. Archive part prefixes are removed only for comparison; files stay separate.",
      "46-character clipped names, supplemental-metadata and indexed duplicates are candidates only. Collisions and multiple sidecars remain ambiguous. Unknown naming and edited/live-photo counterparts are not guessed.",
      "Album folder contents are candidate membership only. Localized flat album metadata names are not qualified. Account completeness, order, sharing and missing parts are not inferred.",
      "photoTakenTime timestamp/formatted and separate geoData/geoDataExif values are preserved as exported. No timezone, zero-location validity or coordinate precedence is inferred.",
    ],
  };
}
