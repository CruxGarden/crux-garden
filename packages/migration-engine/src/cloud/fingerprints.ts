import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import type { CloudItem, CloudJob } from "@cruxgarden/migration-contracts";
export interface Fingerprint {
  path: string;
  bytes: number;
  sha256: string;
  md5: string;
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
): Promise<Fingerprint> {
  const file = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile()) throw new Error("Not a regular file");
    const sha = createHash("sha256"),
      md5 = createHash("md5");
    let bytes = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      signal.throwIfAborted();
      sha.update(chunk);
      md5.update(chunk);
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
    return {
      path,
      bytes,
      sha256: sha.digest("hex"),
      md5: md5.digest("hex"),
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
  if (!store) return undefined;
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
