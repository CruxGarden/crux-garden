import { parentPort, workerData } from "node:worker_threads";
import * as fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  checkedPath,
  exclusiveJson,
  hashFile,
  inventory,
  inventoryDigest,
  preserve,
  type FileEntry,
} from "./files";
import { preserveZip, zipInventory, type ZipEntry } from "./zip";
import { preserveTar, tarInventory } from "./tar";

let paused = false;
parentPort!.on("message", () => {
  paused = true;
});
const stop = () => {
  if (paused) throw new Error("Paused");
};
async function run() {
  const {
    source,
    sourceKind,
    destination,
    output,
    id,
    provider,
    created,
    inspection,
    mode,
  } = workerData;
  const kind = sourceKind || "folder";
  const isArchive = kind !== "folder";
  let archive: { size: number; modified: number; sha256: string } | undefined;
  if (isArchive) {
    const before = await fs.stat(source);
    if (before.size > 1024 ** 4) throw new Error("This archive exceeds 1 TiB.");
    archive = {
      size: before.size,
      modified: before.mtimeMs,
      sha256: await hashFile(source, stop),
    };
  }
  const entries =
    kind === "zip"
      ? await zipInventory(source, stop)
      : kind === "tar"
        ? await tarInventory(source, stop)
        : await inventory(source, stop);
  if (archive) {
    const after = await fs.stat(source);
    if (after.size !== archive.size || after.mtimeMs !== archive.modified)
      throw new Error("Archive source changed during review.");
  }
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  const disk = await fs.statfs(destination);
  const availableBytes = disk.bavail * disk.bsize;
  // Conservative: allow a full copy plus one temporary file when rechecking.
  const requiredBytes =
    totalBytes +
    (archive?.size || 0) +
    Math.max(archive?.size || 0, ...entries.map((e) => e.size)) +
    1024 ** 2;
  if (mode === "inspect") {
    parentPort!.postMessage({
      state: "ready",
      inspection: {
        files: entries.length,
        bytes: totalBytes,
        availableBytes,
        requiredBytes,
        checkedAt: new Date().toISOString(),
        digest: inventoryDigest(entries),
        archive,
      },
      current: undefined,
      error: undefined,
    });
    return;
  }
  if (
    !inspection ||
    inventoryDigest(entries) !== inspection.digest ||
    JSON.stringify(archive) !== JSON.stringify(inspection.archive)
  )
    throw new Error(
      "The source changed since your review. Review it again or start a new import.",
    );
  if (requiredBytes > availableBytes)
    throw new Error(
      "The destination needs more free space. Free space and retry; your originals are unchanged.",
    );
  const filesRoot = join(output, "files");
  await checkedPath(output, "files");
  await fs.mkdir(filesRoot).catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
  const plan = JSON.stringify(entries);
  const savedPlan = await exclusiveJson(output, "source-plan.json", entries);
  if (JSON.stringify(savedPlan) !== plan)
    throw new Error(
      "The source changed since this import began. Start a new import.",
    );
  let report: Array<FileEntry & { sha256: string }> = [];
  let originalArchive: (FileEntry & { sha256: string }) | undefined;
  const progress = (files: number, bytes: number, current: string) =>
    parentPort!.postMessage({ files, bytes, current });
  if (isArchive && archive) {
    const originals = await checkedPath(output, "original");
    await fs.mkdir(originals).catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
    originalArchive = await preserve(
      dirname(source),
      originals,
      {
        path: basename(source),
        size: archive.size,
        modified: archive.modified,
      },
      stop,
    );
    if (originalArchive.sha256 !== archive.sha256)
      throw new Error("Archive source changed. Start a new import.");
    const savedArchive = join(originals, originalArchive.path);
    report =
      kind === "zip"
        ? await preserveZip(
            savedArchive,
            filesRoot,
            entries as ZipEntry[],
            stop,
            progress,
          )
        : await preserveTar(savedArchive, filesRoot, entries, stop, progress);
    if (
      (await hashFile(savedArchive, stop)) !== archive.sha256 ||
      (await hashFile(source, stop)) !== archive.sha256
    )
      throw new Error("Archive changed during preservation.");
  } else {
    let copiedBytes = 0;
    for (const entry of entries) {
      stop();
      progress(report.length, copiedBytes, entry.path);
      report.push(await preserve(source, filesRoot, entry, stop));
      copiedBytes += entry.size;
    }
    if (JSON.stringify(await inventory(source, stop)) !== plan)
      throw new Error("The source changed during import. Start a new import.");
  }
  const bytes = report.reduce((sum, entry) => sum + entry.size, 0);
  const receipt = {
    version: 1,
    id,
    provider,
    created,
    verifiedAt: new Date().toISOString(),
    source,
    output,
    status: "verified",
    sourceKind: kind,
    originalArchive,
    preserved: true,
    interpreted: false,
    backedUp: false,
    limitations: [
      "Preview: folders/ZIP/TAR; empty folders, extended attributes and permissions are not copied.",
    ],
    files: report,
  };
  // Reports are exclusively created too. Reverification checks files without replacing the first receipt.
  const original = (await exclusiveJson(
    output,
    "report.json",
    receipt,
  )) as typeof receipt;
  if (
    original.id !== id ||
    JSON.stringify(original.files) !== JSON.stringify(report) ||
    JSON.stringify(original.originalArchive) !== JSON.stringify(originalArchive)
  )
    throw new Error(
      "The saved report does not match these files. Keep the report and start a new import.",
    );
  parentPort!.postMessage({
    fingerprints: report.map((entry) => ({
      path: join(filesRoot, entry.path),
      bytes: entry.size,
      sha256: entry.sha256,
      md5: "",
      checkedAt: receipt.verifiedAt,
    })),
    files: report.length,
    bytes,
    state: "verified",
    current: undefined,
  });
}
run()
  .catch((e) =>
    parentPort!.postMessage({
      state: paused ? "paused" : "failed",
      error: paused ? undefined : e.message,
    }),
  )
  .finally(() => parentPort!.close());
