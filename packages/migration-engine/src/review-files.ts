import { createHash } from "node:crypto";
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

// Consumer state must remain provisional until this promise resolves. Fixed-size
// buffers, full receipt hash and same-file checks bound IO without loading files.
export async function visitReviewFile(
  root: string,
  file: PreservedFile,
  limit: number,
  stop: () => void,
  consume: (bytes: Buffer) => void,
) {
  if (file.size > limit)
    throw new Error("Metadata exceeds the streaming review limit.");
  const name = await checkedPath(root, file.path);
  const before = await fs.lstat(name);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== file.size)
    throw new Error(
      "Sidecar differs from the preservation receipt or is not a regular file.",
    );
  const handle = await fs.open(
    name,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const initial = await handle.stat();
    if (
      !initial.isFile() ||
      initial.ino !== before.ino ||
      initial.dev !== before.dev ||
      initial.size !== file.size
    )
      throw new Error("Metadata file changed while opening.");
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(64 * 1024);
    let used = 0;
    while (used < file.size) {
      stop();
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, file.size - used),
        null,
      );
      if (!bytesRead)
        throw new Error("Metadata ended before its recorded size.");
      const bytes = buffer.subarray(0, bytesRead);
      hash.update(bytes);
      consume(bytes);
      used += bytesRead;
    }
    stop();
    const after = await handle.stat(),
      current = await fs.lstat(name);
    if (
      after.size !== initial.size ||
      after.mtimeMs !== initial.mtimeMs ||
      after.ctimeMs !== initial.ctimeMs ||
      current.ino !== initial.ino ||
      current.dev !== initial.dev ||
      current.isSymbolicLink() ||
      hash.digest("hex") !== file.sha256
    )
      throw new Error(
        "Sidecar changed or differs from its preservation fingerprint. Verify the import again.",
      );
  } finally {
    await handle.close();
  }
}
