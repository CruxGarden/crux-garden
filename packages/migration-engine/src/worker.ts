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
  portablePathSet,
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
    sourceArchives,
    sourceFiles,
    destination,
    output,
    id,
    provider,
    created,
    inspection,
    mode,
  } = workerData;
  const kind = sourceKind || "folder";
  const isArchive = kind !== "folder" && kind !== "file-set";
  if (kind === "file-set" && !Array.isArray(sourceFiles))
    throw new Error("Select files before reviewing.");
  const selectedFiles = kind === "file-set" ? sourceFiles : undefined;
  const multiple = kind === "archive-set";
  type Part = FileEntry & {
    sha256: string;
    entries: FileEntry[];
    source: string;
    zip: boolean;
  };
  const parts: Part[] = [];
  let entries: FileEntry[] = [];
  if (isArchive) {
    if (
      multiple &&
      (!Array.isArray(sourceArchives) ||
        !sourceArchives.length ||
        sourceArchives.length > 500)
    )
      throw new Error("Select export parts before reviewing.");
    const add = portablePathSet("combined export");
    const names = multiple ? sourceArchives : [basename(source)];
    let expanded = 0,
      compressed = 0;
    for (const name of names) {
      stop();
      if (multiple && (typeof name !== "string" || basename(name) !== name))
        throw new Error("Invalid export part name.");
      const file = multiple ? await checkedPath(source, name) : source;
      const before = await fs.lstat(file);
      if (!before.isFile() || before.isSymbolicLink())
        throw new Error("Export parts must be regular files, not links.");
      compressed += before.size;
      if (compressed > 1024 ** 4)
        throw new Error(
          "Selected archives exceed 1 TiB. Choose a smaller batch.",
        );
      const sha256 = await hashFile(file, stop);
      const zip = /\.zip$/i.test(file);
      const partEntries = zip
        ? await zipInventory(file, stop)
        : await tarInventory(file, stop);
      const after = await fs.lstat(file);
      if (
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ino !== before.ino ||
        after.dev !== before.dev
      )
        throw new Error("Archive source changed during review.");
      if (multiple) add(name, false);
      for (const entry of partEntries) {
        const path = multiple ? `${name}/${entry.path}` : entry.path;
        add(path, true);
        expanded += entry.size;
        if (expanded > 1024 ** 4)
          throw new Error(
            "Combined archive expansion exceeds 1 TiB. Choose a smaller batch.",
          );
        entries.push({ ...entry, path });
      }
      parts.push({
        path: name,
        source: file,
        zip,
        entries: partEntries,
        size: before.size,
        modified: before.mtimeMs,
        sha256,
      });
    }
  } else {
    entries = await inventory(source, stop, selectedFiles);
  }
  const identities = parts.map(({ path, size, modified, sha256 }) => ({
    path,
    size,
    modified,
    sha256,
  }));
  const archive =
    !multiple && parts[0]
      ? {
          size: parts[0].size,
          modified: parts[0].modified,
          sha256: parts[0].sha256,
        }
      : undefined;
  const archives = multiple ? identities : undefined;
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  const disk = await fs.statfs(destination);
  const availableBytes = disk.bavail * disk.bsize;
  // Conservative: allow a full copy plus one temporary file when rechecking.
  const requiredBytes =
    totalBytes +
    parts.reduce((sum, part) => sum + part.size, 0) +
    Math.max(0, ...parts.map((p) => p.size), ...entries.map((e) => e.size)) +
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
        archives,
      },
      current: undefined,
      error: undefined,
    });
    return;
  }
  if (
    !inspection ||
    inventoryDigest(entries) !== inspection.digest ||
    JSON.stringify(archive) !== JSON.stringify(inspection.archive) ||
    JSON.stringify(archives) !== JSON.stringify(inspection.archives)
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
  const originalArchives: Array<FileEntry & { sha256: string }> = [];
  const progress = (files: number, bytes: number, current: string) =>
    parentPort!.postMessage({ files, bytes, current });
  if (isArchive) {
    const originals = await checkedPath(output, "original");
    await fs.mkdir(originals).catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
    for (const part of parts) {
      stop();
      progress(
        report.length,
        report.reduce((sum, entry) => sum + entry.size, 0),
        `Original: ${part.path}`,
      );
      const originalArchive = await preserve(
        dirname(part.source),
        originals,
        {
          path: part.path,
          size: part.size,
          modified: part.modified,
        },
        stop,
      );
      if (originalArchive.sha256 !== part.sha256)
        throw new Error("Archive source changed. Start a new import.");
      const savedArchive = join(originals, originalArchive.path);
      originalArchives.push(originalArchive);
      const partRoot = multiple
        ? await checkedPath(filesRoot, part.path)
        : filesRoot;
      if (multiple)
        await fs.mkdir(partRoot).catch((e) => {
          if (e.code !== "EEXIST") throw e;
        });
      const offsetFiles = report.length;
      const offsetBytes = report.reduce((sum, entry) => sum + entry.size, 0);
      const partProgress = (files: number, bytes: number, current: string) =>
        progress(
          offsetFiles + files,
          offsetBytes + bytes,
          multiple ? `${part.path}/${current}` : current,
        );
      const extracted = part.zip
        ? await preserveZip(
            savedArchive,
            partRoot,
            part.entries as ZipEntry[],
            stop,
            partProgress,
          )
        : await preserveTar(
            savedArchive,
            partRoot,
            part.entries,
            stop,
            partProgress,
          );
      report.push(
        ...extracted.map((entry) => ({
          ...entry,
          path: multiple ? `${part.path}/${entry.path}` : entry.path,
        })),
      );
    }
    for (const part of parts) {
      if (
        (await hashFile(join(originals, part.path), stop)) !== part.sha256 ||
        (await hashFile(part.source, stop)) !== part.sha256
      )
        throw new Error("Archive changed during preservation.");
    }
  } else {
    let copiedBytes = 0;
    for (const entry of entries) {
      stop();
      progress(report.length, copiedBytes, entry.path);
      report.push(await preserve(source, filesRoot, entry, stop));
      copiedBytes += entry.size;
    }
    if (JSON.stringify(await inventory(source, stop, selectedFiles)) !== plan)
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
    selectedFiles,
    originalArchive: multiple ? undefined : originalArchives[0],
    originalArchives: multiple ? originalArchives : undefined,
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
    JSON.stringify(original.originalArchive) !==
      JSON.stringify(receipt.originalArchive) ||
    JSON.stringify(original.originalArchives) !==
      JSON.stringify(receipt.originalArchives)
  )
    throw new Error(
      "The saved report does not match these files. Keep the report and start a new import.",
    );
  parentPort!.postMessage({
    fingerprints: [
      ...report.map((entry) => ({
        path: join(filesRoot, entry.path),
        bytes: entry.size,
        sha256: entry.sha256,
        md5: "",
        checkedAt: receipt.verifiedAt,
      })),
      ...originalArchives.map((entry) => ({
        path: join(output, "original", entry.path),
        bytes: entry.size,
        sha256: entry.sha256,
        md5: "",
        checkedAt: receipt.verifiedAt,
      })),
    ],
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
