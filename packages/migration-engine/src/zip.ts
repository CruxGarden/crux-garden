import { open, close, constants, stat as statCallback } from "node:fs";
import { promisify } from "node:util";
import { crc32 } from "node:zlib";
import * as yauzl from "yauzl";
import {
  safeName,
  portablePathSet,
  preserveStream,
  type FileEntry,
} from "./files";

export interface ZipEntry extends FileEntry {
  crc32: number;
}
async function withZip<T>(
  source: string,
  fn: (zip: yauzl.ZipFile) => Promise<T>,
): Promise<T> {
  const fd = await promisify(open)(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromFdPromise(fd, {
      autoClose: false,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
  } catch (e) {
    await promisify(close)(fd);
    throw e;
  }
  // Each iterator/read promise propagates its error; this also covers close errors.
  zip.on("error", () => {});
  try {
    return await fn(zip);
  } finally {
    zip.close();
  }
}

function entryInfo(entry: yauzl.Entry): ZipEntry | undefined {
  if (entry.isEncrypted())
    throw new Error(
      "Encrypted ZIPs are not supported. Export an unencrypted copy locally.",
    );
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  const directory = entry.fileName.endsWith("/");
  const name = safeName(
    directory ? entry.fileName.slice(0, -1) : entry.fileName,
  );
  if (mode && mode !== 0o100000 && mode !== 0o040000)
    throw new Error(`ZIP links and special files are not supported: ${name}`);
  if (mode === 0o040000 && !directory)
    throw new Error(`Invalid ZIP directory: ${name}`);
  if (![0, 8].includes(entry.compressionMethod))
    throw new Error("This ZIP uses an unsupported compression method.");
  if (directory) {
    if (entry.uncompressedSize !== 0)
      throw new Error(`ZIP directory contains data: ${name}`);
    return undefined;
  }
  if (
    entry.uncompressedSize > 1024 ** 4 ||
    entry.uncompressedSize > Math.max(1, entry.compressedSize) * 1000
  )
    throw new Error(
      "ZIP expansion exceeds this preview’s 1 TiB or 1,000:1 limit. Split or unpack the export first.",
    );
  const modified = entry.getLastModDate().getTime();
  if (!Number.isFinite(modified))
    throw new Error(`Invalid ZIP modification date: ${name}`);
  return {
    path: name,
    size: entry.uncompressedSize,
    modified,
    crc32: entry.crc32,
  };
}

export async function zipInventory(
  source: string,
  stop: () => void,
): Promise<ZipEntry[]> {
  if ((await promisify(statCallback)(source)).size > 1024 ** 4)
    throw new Error("This ZIP exceeds 1 TiB.");
  return withZip(source, async (zip) => {
    const result: ZipEntry[] = [];
    const addPath = portablePathSet("ZIP");
    let bytes = 0;
    for await (const entry of zip.eachEntry()) {
      stop();
      const file = entryInfo(entry);
      addPath(entry.fileName.replace(/\/$/, ""), !!file);
      if (file) {
        bytes += file.size;
        result.push(file);
      }
      if (bytes > 1024 ** 4)
        throw new Error("ZIP expanded size exceeds 1 TiB.");
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  });
}

export async function preserveZip(
  source: string,
  destination: string,
  entries: ZipEntry[],
  stop: () => void,
  progress: (files: number, bytes: number, current: string) => void,
) {
  return withZip(source, async (zip) => {
    const expected = new Map(entries.map((entry) => [entry.path, entry]));
    const report: Array<ZipEntry & { sha256: string }> = [];
    let bytes = 0;
    for await (const entry of zip.eachEntry()) {
      stop();
      const file = entryInfo(entry);
      if (!file) continue;
      if (JSON.stringify(expected.get(file.path)) !== JSON.stringify(file))
        throw new Error("ZIP contents changed after review.");
      expected.delete(file.path);
      progress(report.length, bytes, file.path);
      const stream = await zip.openReadStreamPromise(entry);
      let checksum = 0;
      async function* checkedStream() {
        for await (const chunk of stream) {
          stop();
          checksum = crc32(chunk as Buffer, checksum);
          yield chunk as Buffer;
        }
      }
      try {
        const saved = await preserveStream(
          destination,
          file,
          checkedStream(),
          stop,
          async () => {
            if (checksum !== file.crc32)
              throw new Error(`ZIP checksum failed: ${file.path}`);
          },
        );
        report.push({ ...file, sha256: saved.sha256 });
        bytes += file.size;
      } finally {
        stream.destroy();
      }
    }
    if (expected.size) throw new Error("ZIP contents are incomplete.");
    return report.sort((a, b) => a.path.localeCompare(b.path));
  });
}
