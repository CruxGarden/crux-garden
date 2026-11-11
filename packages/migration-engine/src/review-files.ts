import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { checkedPath, safeName, portablePathSet } from "./files";
import type { PreservedFile } from "./photo-metadata";
// Bounded reads also reject final-component symlinks, devices, and growth races.
export async function readReviewFile(
  root: string,
  path: string,
  limit: number,
  stop: () => void,
) {
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

export async function readPreservationReceipt(
  output: string,
  id: string,
  provider: string,
  stop: () => void,
) {
  const receiptBytes = await readReviewFile(
    output,
    "report.json",
    32 * 1024 ** 2,
    stop,
  );
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
  return { receiptBytes, receipt, files };
}
