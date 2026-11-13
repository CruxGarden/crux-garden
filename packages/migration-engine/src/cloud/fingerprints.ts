import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { DropboxContentHash } from "../checksums";
import type { CloudItem, CloudJob } from "@cruxgarden/migration-contracts";
export interface Fingerprint {
  path: string;
  bytes: number;
  sha256: string;
  md5: string;
  dropbox?: string;
  checkedAt: string;
  sourceKey?: string;
  revision?: string;
}
export interface FingerprintStore {
  putFingerprint(file: Fingerprint): Promise<void>;
  findFingerprints(
    sourceKey: string,
    revision?: string,
    checksum?: CloudItem["checksum"],
    size?: number,
  ): Promise<Fingerprint[]>;
}
export const sourceKey = (job: CloudJob, item: CloudItem) =>
  JSON.stringify([job.provider, job.identity, item.id]);
/** Read actual bytes; filesystem names/timestamps are not content identities. */
export async function fingerprint(
  path: string,
  signal: AbortSignal,
  options?: { strictPath?: boolean; onBytes?: (bytes: number) => void },
): Promise<Fingerprint> {
  signal.throwIfAborted();
  const initial = options?.strictPath ? await fs.lstat(path) : undefined;
  if (initial && (!initial.isFile() || (await fs.realpath(path)) !== path))
    throw new Error("Expected a canonical regular file");
  const file = await fs.open(
    path,
    constants.O_RDONLY |
      constants.O_NOFOLLOW |
      (options?.strictPath ? constants.O_NONBLOCK : 0),
  );
  try {
    const before = await file.stat();
    if (!before.isFile()) throw new Error("Not a regular file");
    if (initial && (initial.dev !== before.dev || initial.ino !== before.ino))
      throw new Error("File replaced before scanning");
    const sha = createHash("sha256"),
      md5 = createHash("md5");
    const dropbox = new DropboxContentHash();
    let bytes = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      signal.throwIfAborted();
      options?.onBytes?.(chunk.length);
      sha.update(chunk);
      md5.update(chunk);
      dropbox.update(chunk);
      bytes += chunk.length;
    }
    const after = await file.stat();
    if (
      bytes !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new Error("File changed while scanning");
    if (initial) {
      const current = await fs.lstat(path);
      if (
        (await fs.realpath(path)) !== path ||
        !current.isFile() ||
        current.dev !== before.dev ||
        current.ino !== before.ino ||
        current.size !== before.size ||
        current.mtimeMs !== before.mtimeMs ||
        current.ctimeMs !== before.ctimeMs
      )
        throw new Error("File path changed while scanning");
    }
    signal.throwIfAborted();
    return {
      path,
      bytes,
      sha256: sha.digest("hex"),
      md5: md5.digest("hex"),
      dropbox: dropbox.digest("hex"),
      checkedAt: new Date().toISOString(),
    };
  } finally {
    await file.close();
  }
}
export async function existingCopy(
  store: FingerprintStore | undefined,
  job: CloudJob,
  item: CloudItem,
  signal: AbortSignal,
) {
  if (!store || (item.reusePolicy === "checksum-only" && !item.checksum))
    return undefined;
  const candidates = await store.findFingerprints(
    sourceKey(job, item),
    item.revision,
    item.checksum,
    item.size,
  );
  for (const entry of candidates) {
    signal.throwIfAborted();
    try {
      const actual = await fingerprint(entry.path, signal);
      if (
        actual.sha256 !== entry.sha256 ||
        actual.bytes !== entry.bytes ||
        (item.size !== undefined && actual.bytes !== item.size)
      )
        continue;
      if (
        item.checksum &&
        actual[item.checksum.algorithm] !== item.checksum.hex.toLowerCase()
      )
        continue;
      return actual;
    } catch {
      signal.throwIfAborted(); /* Missing/moved/modified files are not reusable. */
    }
  }
  return undefined;
}
