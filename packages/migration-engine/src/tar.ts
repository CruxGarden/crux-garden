import { constants } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract } from "tar-stream";
import {
  portablePathSet,
  safeName,
  preserveStream,
  type FileEntry,
} from "./files";

async function* buffers(stream: AsyncIterable<unknown>, stop: () => void) {
  for await (const chunk of stream) {
    stop();
    if (!Buffer.isBuffer(chunk)) throw new Error("Unexpected TAR stream data.");
    yield chunk;
  }
}

async function walkTar(
  source: string,
  stop: () => void,
  save?: {
    root: string;
    entries: FileEntry[];
    progress: (files: number, bytes: number, current: string) => void;
  },
) {
  const archiveBytes = (await stat(source)).size;
  const gzip = /\.(tgz|gz)$/i.test(source);
  const parser = extract();
  const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  const input = file.createReadStream({ autoClose: false });
  let expandedBytes = 0;
  let declaredBytes = 0;
  let entryCount = 0;
  const limit = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        stop();
        expandedBytes += chunk.length;
        if (expandedBytes - declaredBytes > 64 * 1024 ** 2)
          throw new Error("TAR metadata exceeds 64 MiB.");
        if (
          expandedBytes > 1024 ** 4 + 64 * 1024 ** 2 ||
          (gzip && expandedBytes > Math.max(archiveBytes, 1024) * 1000)
        )
          throw new Error("TAR expansion exceeds the 1 TiB or 1,000:1 limit.");
        callback(null, chunk);
      } catch (e) {
        callback(e as Error);
      }
    },
  });
  const pumping = gzip
    ? pipeline(input, createGunzip(), limit, parser)
    : pipeline(input, limit, parser);
  // Attach rejection handling immediately while the entry iterator is consuming.
  void pumping.catch(() => {});
  const addPath = portablePathSet("TAR");
  const expected =
    save && new Map(save.entries.map((entry) => [entry.path, entry]));
  const entries: FileEntry[] = [];
  const report: Array<FileEntry & { sha256: string }> = [];
  let bytes = 0;
  try {
    for await (const stream of parser) {
      stop();
      const header = stream.header;
      if (++entryCount > 20_000)
        throw new Error(
          "Split exports larger than 20,000 entries into smaller batches.",
        );
      if (header.type !== "file" && header.type !== "directory")
        throw new Error(
          "TAR links, devices and special entries are not supported.",
        );
      if (
        header.pax &&
        typeof header.pax === "object" &&
        Object.keys(header.pax).some((key) => /sparse/i.test(key))
      )
        throw new Error("Sparse TAR entries are not supported.");
      const name = header.name.replace(/^(\.\/)+/, "").replace(/\/$/, "");
      if (!name && header.type === "directory") {
        for await (const _chunk of stream) stop();
        continue;
      }
      safeName(name);
      addPath(name, header.type === "file");
      if (header.type === "directory") {
        if (header.size) throw new Error("TAR directory contains file data.");
        for await (const _chunk of stream) stop();
        continue;
      }
      const entry = {
        path: name,
        size: header.size,
        modified: header.mtime.getTime(),
      };
      if (
        !Number.isSafeInteger(entry.size) ||
        entry.size < 0 ||
        !Number.isFinite(entry.modified)
      )
        throw new Error("Invalid TAR size or date.");
      bytes += entry.size;
      declaredBytes += entry.size;
      if (bytes > 1024 ** 4) throw new Error("TAR files exceed 1 TiB.");
      entries.push(entry);
      if (save && expected) {
        if (JSON.stringify(expected.get(name)) !== JSON.stringify(entry))
          throw new Error("TAR contents changed after review.");
        expected.delete(name);
        save.progress(report.length, bytes - entry.size, name);
        report.push(
          await preserveStream(
            save.root,
            entry,
            buffers(stream, stop),
            stop,
            async () => {},
          ),
        );
      } else {
        let seen = 0;
        for await (const chunk of buffers(stream, stop)) {
          stop();
          seen += chunk.length;
        }
        if (seen !== entry.size) throw new Error("TAR is incomplete.");
      }
    }
    await pumping;
    if (expected?.size) throw new Error("TAR contents are incomplete.");
    return {
      entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
      report: report.sort((a, b) => a.path.localeCompare(b.path)),
    };
  } finally {
    input.destroy();
    limit.destroy();
    parser.destroy();
    await pumping.catch(() => {});
    await file.close();
  }
}
export const tarInventory = async (source: string, stop: () => void) =>
  (await walkTar(source, stop)).entries;
export const preserveTar = async (
  source: string,
  root: string,
  entries: FileEntry[],
  stop: () => void,
  progress: (files: number, bytes: number, current: string) => void,
) => (await walkTar(source, stop, { root, entries, progress })).report;
