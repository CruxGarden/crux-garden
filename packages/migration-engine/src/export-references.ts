import type { PreservedFile } from "./photo-metadata";

// Resolve literal archive-relative references against receipt entries only.
// Never decode URLs, normalize traversal, probe the disk or guess basenames.
export function exportReferences(files: PreservedFile[], sourceKind: unknown) {
  const logical = (path: string) =>
    sourceKind === "archive-set" ? path.split("/").slice(1).join("/") : path;
  const entries = new Map<string, string[]>();
  for (const file of files) {
    const key = logical(file.path);
    const paths = entries.get(key) || [];
    paths.push(file.path);
    if (paths.length > 100)
      throw new Error("Too many export parts contain the same path.");
    entries.set(key, paths);
  }
  return {
    logical,
    resolve(
      root: string,
      uri: unknown,
    ): { candidates: string[]; issue?: string; invalid?: boolean } {
      if (
        typeof uri !== "string" ||
        !uri ||
        uri.length > 4096 ||
        /[\\:%?#\x00-\x1f\x7f]/.test(uri) ||
        uri.split("/").some((p) => !p || p === "." || p === "..")
      )
        return {
          candidates: [],
          invalid: true,
          issue:
            "Unsafe or non-local media reference; never opened or fetched.",
        };
      const candidates = entries.get(root + uri) || [];
      return {
        candidates,
        issue:
          candidates.length > 1
            ? "Multiple selected export parts contain this path; no copy was preferred."
            : candidates.length
              ? undefined
              : "Referenced file is absent from the selected preservation receipt.",
      };
    },
  };
}
