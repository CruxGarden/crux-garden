import {
  flickrMetadata,
  type PhotoRecord,
  type PreservedFile,
} from "./photo-metadata";
import { googlePhotoMetadata } from "./google-photo-metadata";

import { facebookMetadata } from "./facebook-metadata";
import { instagramMetadata } from "./instagram-metadata";

export const PHOTO_REVIEW_PROVIDERS = [
  "Flickr",
  "Google Photos",
  "Instagram",
  "Facebook",
];
export function photoAdapter(
  provider: string,
  files: PreservedFile[],
  sourceKind: unknown,
) {
  if (provider === "Facebook") return facebookMetadata(files, sourceKind);
  if (provider === "Instagram") return instagramMetadata(files, sourceKind);
  if (provider === "Google Photos")
    return googlePhotoMetadata(files, sourceKind);
  if (provider !== "Flickr")
    throw new Error("Photo review is unavailable for this service.");
  const media = new Map<string, string[]>();
  const mediaFiles = files.filter(
    (f) => flickrMetadata.mediaIds(f.path).length,
  );
  const ambiguousPaths = new Set(
    mediaFiles
      .filter((f) => flickrMetadata.mediaIds(f.path).length > 1)
      .map((f) => f.path),
  );
  for (const file of mediaFiles)
    for (const id of flickrMetadata.mediaIds(file.path)) {
      const list = media.get(id) || [];
      list.push(file.path);
      media.set(id, list);
      if (list.length > 100)
        throw new Error(
          "Too many candidate files share one Flickr ID. Review a smaller import.",
        );
    }
  return {
    version: "flickr-export-v1",
    mediaFiles,
    accepts: flickrMetadata.accepts,
    parse: (file: PreservedFile, value: unknown) =>
      flickrMetadata.parse(file, value, media, ambiguousPaths),
    finalize: (_records: PhotoRecord[]) => {},
    limitations: [
      "Flickr association uses photo_<ID>.json, albums.json and observed ID_secret_o or title_ID_o media names. Other formats remain preserved.",
    ],
  };
}
