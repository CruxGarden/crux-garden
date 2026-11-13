import * as fs from "node:fs/promises";
import type { LocalComparison } from "@cruxgarden/migration-contracts";
import { checkedPath, portablePathSet } from "./files";
import { fingerprint, type Fingerprint } from "./cloud/fingerprints";

export const COMPARISON_LIMITS = Object.freeze({
  files: 500,
  fileBytes: 16 * 2 ** 30,
  readBytes: 64 * 2 ** 30,
  candidates: 20,
  preview: 50,
});
class BudgetError extends Error {}
/** Pure workflow: the API owns catalog queries; this module has no SQLite access. */
export async function compareLocalFiles(
  source: string,
  selected: string[],
  lookup: (sha256: string, bytes: number) => Promise<Fingerprint[]>,
  signal: AbortSignal,
  progress: (checked: number) => void,
  limits = COMPARISON_LIMITS,
): Promise<LocalComparison> {
  if (!selected.length || selected.length > limits.files)
    throw new Error("Select 1–500 files.");
  const add = portablePathSet("selected file");
  const paths: string[] = [];
  for (const name of selected) {
    signal.throwIfAborted();
    if (name.includes("/")) throw new Error("Select files from one folder.");
    add(name, true);
    paths.push(await checkedPath(source, name));
  }
  const snapshot = async () => {
    const values = [];
    for (const path of paths) {
      signal.throwIfAborted();
      const s = await fs.lstat(path);
      if (!s.isFile() || (await fs.realpath(path)) !== path)
        throw new Error("A selected file moved or became a link.");
      if (s.size > limits.fileBytes)
        throw new BudgetError("A file exceeds the 16 GiB comparison limit.");
      values.push([s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs]);
    }
    return JSON.stringify(values);
  };
  const before = await snapshot();
  let bytesRead = 0;
  const read = async (path: string) => {
    const stat = await fs.lstat(path);
    if (stat.size > limits.fileBytes)
      throw new BudgetError("A file exceeds the 16 GiB comparison limit.");
    let fileBytes = 0;
    return fingerprint(path, signal, {
      strictPath: true,
      onBytes(bytes) {
        fileBytes += bytes;
        bytesRead += bytes;
        if (fileBytes > limits.fileBytes || bytesRead > limits.readBytes)
          throw new BudgetError(
            "Comparison read budget exceeded. Select a smaller batch.",
          );
      },
    });
  };
  const counts = {
    matched: 0,
    notFound: 0,
    unavailableCandidates: 0,
    candidatesChecked: 0,
  };
  const preview: NonNullable<LocalComparison["preview"]> = [];
  for (let i = 0; i < paths.length; i++) {
    signal.throwIfAborted();
    const path = paths[i]!;
    const actual = await read(path); // A failed source invalidates the whole observation.
    const candidates = (await lookup(actual.sha256, actual.bytes)).slice(
      0,
      limits.candidates,
    );
    let match: string | undefined;
    for (const candidate of candidates) {
      signal.throwIfAborted();
      if (candidate.path === path) continue;
      counts.candidatesChecked++;
      try {
        const current = await read(candidate.path);
        if (
          current.sha256 === candidate.sha256 &&
          current.bytes === candidate.bytes &&
          current.sha256 === actual.sha256 &&
          current.bytes === actual.bytes
        ) {
          match = candidate.path;
          break;
        }
        counts.unavailableCandidates++;
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof BudgetError) throw error;
        counts.unavailableCandidates++;
      }
    }
    if (match) counts.matched++;
    else counts.notFound++;
    if (preview.length < limits.preview)
      preview.push({ path: selected[i]!, ...(match ? { match } : {}) });
    progress(i + 1);
  }
  if ((await snapshot()) !== before)
    throw new Error(
      "Selected files changed during comparison. Check them again.",
    );
  return {
    state: "complete",
    checked: paths.length,
    total: paths.length,
    checkedAt: new Date().toISOString(),
    bytesRead,
    counts,
    preview,
  };
}
