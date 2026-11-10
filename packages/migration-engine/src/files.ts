import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

export function safeName(name: string): string {
  const parts = name.split("/");
  if (
    !name ||
    name.length > 1024 ||
    parts.length > 32 ||
    parts.some(
      (p) =>
        !p ||
        p === "." ||
        p === ".." ||
        /[\\:<>"|?*]/.test(p) ||
        [...p].some((c) => c.charCodeAt(0) < 32) ||
        /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p),
    )
  ) {
    throw new Error(
      `This filename cannot be safely preserved: ${name.slice(0, 160)}`,
    );
  }
  return name;
}

export async function checkedPath(
  root: string,
  name: string,
  create = false,
): Promise<string> {
  const stat = await fs.lstat(root);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (await fs.realpath(root)) !== root
  )
    throw new Error("A selected folder moved or became a link.");
  let current = root;
  for (const part of safeName(name).split("/").slice(0, -1)) {
    current = join(current, part);
    if (create)
      await fs.mkdir(current).catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
    const s = await fs.lstat(current);
    if (!s.isDirectory() || s.isSymbolicLink())
      throw new Error("Links inside folders are not supported.");
  }
  return join(root, ...name.split("/"));
}

export interface FileEntry {
  path: string;
  size: number;
  modified: number;
}
/** Reject ambiguous portable paths even when a ZIP/TAR omits directory entries. */
export function portablePathSet(label: string) {
  const names = new Map<string, "file" | "directory">();
  const parents = new Set<string>();
  const spellings = new Map<string, string>();
  return (name: string, file: boolean) => {
    const key = safeName(name).normalize("NFC").toLowerCase();
    if (name.includes("\uFFFD"))
      throw new Error(`Unreadable ${label} filename.`);
    const segments = name.split("/");
    for (let i = 1; i <= segments.length; i++) {
      const spelling = segments.slice(0, i).join("/");
      const normalized = spelling.normalize("NFC").toLowerCase();
      if (spellings.has(normalized) && spellings.get(normalized) !== spelling)
        throw new Error(`Colliding ${label} path spelling: ${name}`);
      spellings.set(normalized, spelling);
      if (i < segments.length) {
        if (names.get(normalized) === "file")
          throw new Error(`${label} file/directory collision: ${name}`);
        parents.add(normalized);
      }
    }
    if (names.has(key))
      throw new Error(`Colliding ${label} filenames: ${name}`);
    if (file && parents.has(key))
      throw new Error(`${label} file/directory collision: ${name}`);
    names.set(key, file ? "file" : "directory");
    if (names.size > 20_000)
      throw new Error(
        "Split exports larger than 20,000 entries into smaller batches.",
      );
  };
}
export const inventoryDigest = (entries: FileEntry[]) =>
  createHash("sha256").update(JSON.stringify(entries)).digest("hex");

/** A killed process cannot leave a partial checkpoint under its final name. */
export async function exclusiveJson(
  root: string,
  name: string,
  value: unknown,
) {
  const target = await checkedPath(root, name);
  const temp = join(root, `.home-${randomUUID()}.partial`);
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2), {
      flag: "wx",
      mode: 0o600,
      flush: true,
    });
    try {
      await fs.link(temp, target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    const file = await fs.open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      if (!(await file.stat()).isFile())
        throw new Error("Expected a regular checkpoint file.");
      return JSON.parse(await file.readFile("utf8")) as unknown;
    } finally {
      await file.close();
    }
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}
export async function inventory(
  root: string,
  stop: () => void,
): Promise<FileEntry[]> {
  const result: FileEntry[] = [];
  const names = new Set<string>();
  let bytes = 0;
  async function walk(prefix: string) {
    for await (const entry of await fs.opendir(join(root, prefix))) {
      stop();
      const name = safeName(prefix + entry.name);
      const key = name.normalize("NFC").toLowerCase();
      if (names.has(key)) throw new Error(`Colliding filenames: ${name}`);
      names.add(key);
      if (names.size > 20_000)
        throw new Error(
          "Split exports larger than 20,000 entries into smaller batches.",
        );
      const path = await checkedPath(root, name);
      const stat = await fs.lstat(path);
      if (stat.isSymbolicLink())
        throw new Error(`Links are not supported: ${name}`);
      if (stat.isDirectory()) await walk(name + "/");
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 1024 ** 4)
          throw new Error(
            "Split exports larger than 1 TiB into smaller batches.",
          );
        result.push({ path: name, size: stat.size, modified: stat.mtimeMs });
      } else throw new Error(`Unsupported file: ${name}`);
    }
  }
  await walk("");
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export async function hashFile(
  path: string,
  stop: () => void,
): Promise<string> {
  const file = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile())
      throw new Error("Expected a regular file.");
    const hash = createHash("sha256");
    for await (const data of file.createReadStream({ autoClose: false })) {
      stop();
      hash.update(data);
    }
    return hash.digest("hex");
  } finally {
    await file.close();
  }
}

/** Both folder and archive reads commit through the same no-overwrite writer. */
export async function preserveStream(
  destination: string,
  entry: FileEntry,
  stream: AsyncIterable<Buffer>,
  stop: () => void,
  validate: (digest: string) => Promise<void>,
) {
  const target = await checkedPath(destination, entry.path, true);
  const temp = join(dirname(target), `.home-${randomUUID()}.partial`);
  let output: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    output = await fs.open(temp, "wx", 0o600);
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of stream) {
      stop();
      bytes += chunk.length;
      if (bytes > entry.size)
        throw new Error(
          `Source grew or archive size is invalid: ${entry.path}`,
        );
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length)
        offset += (await output.write(chunk, offset)).bytesWritten;
    }
    if (bytes !== entry.size)
      throw new Error(`Source size changed: ${entry.path}`);
    await output.sync();
    await output.close();
    output = undefined;
    const digest = hash.digest("hex");
    await validate(digest);
    if ((await hashFile(temp, stop)) !== digest)
      throw new Error(`Copy verification failed: ${entry.path}`);
    await fs.utimes(temp, new Date(), new Date(entry.modified));
    await checkedPath(destination, entry.path);
    try {
      await fs.link(temp, target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST")
        throw new Error(
          "This preview needs a destination supporting hard links (such as APFS or NTFS). Choose another drive.",
        );
      if ((await hashFile(target, stop)) !== digest)
        throw new Error(
          `Destination conflict or corruption: ${entry.path}. Nothing was replaced.`,
        );
    }
    if ((await hashFile(target, stop)) !== digest)
      throw new Error(`Verification failed: ${entry.path}`);
    return { ...entry, sha256: digest };
  } finally {
    await output?.close().catch(() => {});
    await fs.unlink(temp).catch(() => {});
  }
}

export async function preserve(
  root: string,
  destination: string,
  entry: FileEntry,
  stop: () => void,
) {
  const source = await checkedPath(root, entry.path);
  const input = await fs.open(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await input.stat();
    if (
      !stat.isFile() ||
      stat.size !== entry.size ||
      stat.mtimeMs !== entry.modified
    )
      throw new Error(`Source changed: ${entry.path}`);
    return await preserveStream(
      destination,
      entry,
      input.createReadStream({ autoClose: false }),
      stop,
      async (digest) => {
        const after = await input.stat();
        if (
          after.size !== entry.size ||
          after.mtimeMs !== entry.modified ||
          (await hashFile(source, stop)) !== digest
        )
          throw new Error(`Source changed during copying: ${entry.path}`);
      },
    );
  } finally {
    await input.close();
  }
}
