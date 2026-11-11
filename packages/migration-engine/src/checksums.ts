import { createHash } from "node:crypto";

export type ChecksumAlgorithm = "sha256" | "md5" | "dropbox";

/** Dropbox hashes the binary SHA-256 digests of consecutive 4 MiB blocks.
 * Stream chunk boundaries have no bearing on provider block boundaries.
 * https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/content-hash
 */
export class DropboxContentHash {
  private outer = createHash("sha256");
  private block = createHash("sha256");
  private used = 0;
  private finished = false;

  update(data: Uint8Array) {
    if (this.finished) throw new Error("Checksum already finalized.");
    let offset = 0;
    while (offset < data.length) {
      const length = Math.min(
        4 * 1024 * 1024 - this.used,
        data.length - offset,
      );
      this.block.update(data.subarray(offset, offset + length));
      offset += length;
      this.used += length;
      if (this.used === 4 * 1024 * 1024) {
        this.outer.update(this.block.digest());
        this.block = createHash("sha256");
        this.used = 0;
      }
    }
    return this;
  }

  digest(_encoding: "hex"): string {
    if (this.finished) throw new Error("Checksum already finalized.");
    this.finished = true;
    // Empty files, and exact block multiples, must not acquire an extra block.
    if (this.used) this.outer.update(this.block.digest());
    return this.outer.digest("hex");
  }
}

export function contentHasher(algorithm: ChecksumAlgorithm) {
  if (algorithm === "dropbox") return new DropboxContentHash();
  if (algorithm === "sha256" || algorithm === "md5")
    return createHash(algorithm);
  throw new Error("Unsupported checksum algorithm.");
}
