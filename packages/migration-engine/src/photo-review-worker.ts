import { parentPort, workerData } from "node:worker_threads";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { checkedPath, exclusiveJson, safeName, portablePathSet } from "./files";
import {
  flickrMetadata,
  type PhotoRecord,
  type PreservedFile,
} from "./photo-metadata";

let paused = false;
parentPort!.on("message", () => {
  paused = true;
});
const stop = () => {
  if (paused) throw new Error("Review paused. Run it again when ready.");
};
// Bounded reads also reject final-component symlinks, devices, and growth races.
async function read(root: string, path: string, limit: number) {
  const name = await checkedPath(root, path);
  const before = await fs.lstat(name);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit)
    throw new Error(
      "Metadata file is not a regular file or exceeds the review limit.",
    );
  const handle = await fs.open(
    name,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.size > limit ||
      info.ino !== before.ino ||
      info.dev !== before.dev
    )
      throw new Error("Metadata file changed while opening.");
    const buffer = Buffer.alloc(info.size + 1);
    let used = 0;
    while (used < buffer.length) {
      stop();
      const { bytesRead } = await handle.read(
        buffer,
        used,
        buffer.length - used,
        null,
      );
      if (!bytesRead) break;
      used += bytesRead;
    }
    const after = await handle.stat();
    if (
      used !== info.size ||
      after.size !== info.size ||
      after.mtimeMs !== info.mtimeMs
    )
      throw new Error("Metadata file changed during review.");
    return buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
}
async function run() {
  const { id, output, provider } = workerData;
  if (provider !== "Flickr")
    throw new Error(
      "Photo metadata review is currently available for Flickr exports.",
    );
  const receiptBytes = await read(output, "report.json", 32 * 1024 ** 2);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  if (
    receipt.id !== id ||
    receipt.provider !== provider ||
    receipt.status !== "verified" ||
    !Array.isArray(receipt.files) ||
    receipt.files.length > 20000
  )
    throw new Error("This import has no recognized preservation receipt.");
  const add = portablePathSet("receipt file");
  const files: PreservedFile[] = receipt.files.map((entry: PreservedFile) => {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error("Invalid preservation receipt.");
    safeName(entry.path);
    add(entry.path, true);
    return entry;
  });
  const media = new Map<string, string[]>();
  const mediaFiles = files.filter(
    (f) => flickrMetadata.mediaIds(f.path).length,
  );
  const ambiguousPaths = new Set(
    mediaFiles
      .filter((f) => flickrMetadata.mediaIds(f.path).length > 1)
      .map((f) => f.path),
  );
  for (const f of mediaFiles) {
    for (const key of flickrMetadata.mediaIds(f.path)) {
      const list = media.get(key) || [];
      list.push(f.path);
      media.set(key, list);
      if (list.length > 100)
        throw new Error(
          "Too many candidate files share one Flickr ID. Review a smaller import.",
        );
    }
  }
  const sidecars = files.filter((f) => flickrMetadata.accepts(f.path));
  const records: PhotoRecord[] = [];
  let total = 0;
  let relationships = 0;
  for (const [index, file] of sidecars.entries()) {
    stop();
    if ((total += file.size) > 64 * 1024 ** 2)
      throw new Error(
        "Selected metadata exceeds the 64 MB review limit. Preserve a smaller selection as a new import.",
      );
    parentPort!.postMessage({
      state: "running",
      checked: index,
      total: sidecars.length,
    });
    try {
      const bytes = await read(join(output, "files"), file.path, 8 * 1024 ** 2);
      if (
        bytes.length !== file.size ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256
      )
        throw new Error(
          "Sidecar differs from the preservation receipt. Verify this import before reviewing again.",
        );
      const parsed = flickrMetadata.parse(
        file,
        JSON.parse(bytes.toString("utf8")),
        media,
        ambiguousPaths,
      );
      relationships += parsed.reduce(
        (sum, r) =>
          sum +
          r.candidates.length +
          (r.members?.reduce(
            (n, m) => n + Math.max(1, m.candidates.length),
            0,
          ) || 0),
        0,
      );
      records.push(...parsed);
    } catch (e) {
      stop();
      records.push({
        kind: "unrecognized",
        path: file.path,
        sha256: file.sha256,
        candidates: [],
        status: "invalid",
        issue:
          e instanceof SyntaxError
            ? "Invalid JSON."
            : e instanceof Error
              ? e.message
              : "Could not read metadata.",
      });
    }
    if (records.length > 30000)
      throw new Error("Too many metadata records for one review.");
    if (relationships > 100000)
      throw new Error("Too many metadata relationships for one review.");
  }
  // Duplicate sidecars are not silently preferred, even if their bytes agree.
  const groups = new Map<string, PhotoRecord[]>();
  for (const r of records)
    if (r.id) {
      const key = `${r.kind}:${r.id}`;
      const group = groups.get(key) || [];
      group.push(r);
      groups.set(key, group);
    }
  for (const group of groups.values())
    if (group.length > 1)
      for (const r of group) {
        r.status = "ambiguous";
        r.issue = "Multiple metadata records have this ID.";
      }
  const photoIds = new Set(
    records.filter((r) => r.kind === "photo").map((r) => r.id),
  );
  const unassociatedMedia = mediaFiles.filter(
    (f) => !flickrMetadata.mediaIds(f.path).some((id) => photoIds.has(id)),
  );
  const counts = { matched: 0, ambiguous: 0, unmatched: 0, invalid: 0 };
  for (const r of records) counts[r.status]++;
  const name = `photo-review-${randomUUID()}.json`;
  const report = {
    version: 1,
    adapter: "flickr-export-v1",
    importId: id,
    created: new Date().toISOString(),
    receiptSha256: createHash("sha256").update(receiptBytes).digest("hex"),
    counts,
    sidecars: sidecars.length,
    records,
    unassociatedMedia,
    mediaFiles,
    uninterpretedFiles: files.filter(
      (f) =>
        !flickrMetadata.accepts(f.path) &&
        !flickrMetadata.mediaIds(f.path).length,
    ),
    limitations: [
      "Matches are candidate associations by Flickr ID, not proof of media identity or export completeness.",
      "Media bytes are not rehashed by this review. SHA-256 values describe the preservation receipt; use Verify again for current integrity.",
      "Dates retain the exported text without timezone interpretation. Text previews are limited to 4096 characters; originals retain every field.",
      "Only recognized photo_<ID>.json, albums.json and ID_secret_o or title_ID_o media names are interpreted. Other formats remain preserved.",
      "This report does not fetch missing files, rewrite EXIF, reconstruct albums, compare a separate directory, or request/download a provider export.",
    ],
  };
  const encoded = JSON.stringify(report);
  if (Buffer.byteLength(encoded) > 64 * 1024 ** 2)
    throw new Error("Derived report exceeds the 64 MB review limit.");
  stop();
  await exclusiveJson(output, name, report);
  parentPort!.postMessage({
    state: "complete",
    checked: sidecars.length,
    total: sidecars.length,
    counts,
    report: name,
    unassociatedMedia: unassociatedMedia.length,
    preview: [
      ...records.filter((r) => r.status !== "matched"),
      ...records.filter((r) => r.status === "matched"),
    ]
      .slice(0, 50)
      .map(({ members, candidates, ...r }) => ({
        ...r,
        candidates: candidates.slice(0, 10),
        candidateCount: candidates.length,
        memberCount: members?.length,
      })),
  });
}
run()
  .catch((e) =>
    parentPort!.postMessage({
      state: paused ? "paused" : "failed",
      error: e instanceof Error ? e.message : "Photo review failed.",
    }),
  )
  .finally(() => parentPort!.close());
