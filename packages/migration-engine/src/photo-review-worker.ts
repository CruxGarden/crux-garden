import { parentPort, workerData } from "node:worker_threads";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { exclusiveJson } from "./files";
import { readPreservationReceipt, readReviewFile } from "./review-files";
import { type PhotoRecord } from "./photo-metadata";

import { photoAdapter } from "./photo-adapters";

let paused = false;
parentPort!.on("message", () => {
  paused = true;
});
const stop = () => {
  if (paused) throw new Error("Review paused. Run it again when ready.");
};
async function run() {
  const { id, output, provider } = workerData;
  const { receiptBytes, receipt, files } = await readPreservationReceipt(
    output,
    id,
    provider,
    stop,
  );
  const adapter = photoAdapter(provider, files, receipt.sourceKind);
  const mediaFiles = adapter.mediaFiles;
  const sidecars = files.filter((f) => adapter.accepts(f.path));
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
      const bytes = await readReviewFile(
        join(output, "files"),
        file.path,
        8 * 1024 ** 2,
        stop,
      );
      if (
        bytes.length !== file.size ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256
      )
        throw new Error(
          "Sidecar differs from the preservation receipt. Verify this import before reviewing again.",
        );
      const parsed = adapter.parse(file, JSON.parse(bytes.toString("utf8")));
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
  adapter.finalize(records);
  const mediaSet = new Set(mediaFiles);
  const associated = new Set(
    records
      .filter((r) => r.kind === "photo" || r.kind === "media-reference")
      .flatMap((r) => r.candidates),
  );
  const unassociatedMedia = mediaFiles.filter((f) => !associated.has(f.path));
  const counts = { matched: 0, ambiguous: 0, unmatched: 0, invalid: 0 };
  for (const r of records) counts[r.status]++;
  const name = `photo-review-${randomUUID()}.json`;
  const report = {
    version: 1,
    adapter: adapter.version,
    importId: id,
    created: new Date().toISOString(),
    receiptSha256: createHash("sha256").update(receiptBytes).digest("hex"),
    counts,
    sidecars: sidecars.length,
    records,
    unassociatedMedia,
    mediaFiles,
    uninterpretedFiles: files.filter(
      (f) => !adapter.accepts(f.path) && !mediaSet.has(f),
    ),
    limitations: [
      "Matches are candidate associations, not proof of media identity or export completeness.",
      "Media bytes are not rehashed by this review. SHA-256 values describe the preservation receipt; use Verify again for current integrity.",
      "Dates retain the exported text without timezone interpretation. Text previews are limited to 4096 characters; originals retain every field.",
      ...adapter.limitations,
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
      .map(({ members, candidates, exportedLocation: _location, ...r }) => ({
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
