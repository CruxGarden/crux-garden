import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { DownloadJob } from "@cruxgarden/migration-contracts";
import { checkedPath } from "./files";
import {
  dropboxLink,
  downloadResponse,
  type DownloadOpen,
} from "./connectors/dropbox-shared-file";
export type { DownloadOpen } from "./connectors/dropbox-shared-file";

const MAX_BYTES = 1024 ** 4;
const emptyHash = createHash("sha256").digest("hex");
export interface DownloadStore {
  loadDownloads(): Promise<DownloadJob[]>;
  saveDownload(job: DownloadJob): Promise<void>;
}
export async function createDownloads(
  store: DownloadStore,
  open?: DownloadOpen,
) {
  const jobs = new Map((await store.loadDownloads()).map((j) => [j.id, j]));
  for (const j of jobs.values()) {
    if (j.state === "downloading") j.state = "paused";
    if (j.state === "downloaded" && j.folder) {
      // Recover a crash after recording completion but before removing the temp link.
      try {
        const partial = await checkedPath(j.folder, "download.partial");
        const [a, b] = await Promise.all([
          fs.lstat(partial),
          fs.lstat(await checkedPath(j.folder, j.filename)),
        ]);
        if (
          a.isFile() &&
          !a.isSymbolicLink() &&
          b.isFile() &&
          !b.isSymbolicLink() &&
          a.ino === b.ino &&
          a.dev === b.dev
        )
          await fs.unlink(partial);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          j.error =
            "The download folder needs attention. Check that its drive is connected.";
      }
    }
  }
  let active:
    | { id: string; controller: AbortController; done: Promise<void> }
    | undefined;
  const save = (job: DownloadJob) => store.saveDownload(structuredClone(job));
  const snapshot = (job: DownloadJob): DownloadJob => ({
    ...structuredClone(job),
    state: active?.id === job.id ? "downloading" : job.state,
  });
  const find = (id: unknown) => {
    const job = typeof id === "string" && jobs.get(id);
    if (!job) throw new Error("Download not found.");
    return job;
  };
  async function transfer(job: DownloadJob, url: URL, signal: AbortSignal) {
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    let response: IncomingMessage | undefined;
    try {
      const partial = await checkedPath(job.folder!, "download.partial");
      file = await fs.open(partial, constants.O_RDWR | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size < job.bytes ||
        String(stat.dev) !== job.partialIdentity?.device ||
        String(stat.ino) !== job.partialIdentity?.inode ||
        (stat.nlink !== 1 && !job.bodyComplete)
      )
        throw new Error("The partial download changed. Start a new download.");
      const hash = createHash("sha256");
      const buffer = Buffer.alloc(1024 * 1024);
      for (let at = 0; at < job.bytes; ) {
        if (signal.aborted) throw new Error("Download paused.");
        const { bytesRead } = await file.read(
          buffer,
          0,
          Math.min(buffer.length, job.bytes - at),
          at,
        );
        if (!bytesRead) throw new Error("The partial download is incomplete.");
        hash.update(buffer.subarray(0, bytesRead));
        at += bytesRead;
      }
      if (hash.copy().digest("hex") !== job.partialHash)
        throw new Error("The partial download changed. Start a new download.");
      // Discard only bytes beyond the last synced, persisted checkpoint.
      await file.truncate(job.bytes);
      let position = job.bytes;
      if (!job.bodyComplete) {
        if (position && !job.etag)
          throw new Error(
            "Dropbox did not provide a resumable file identity. Start a new download.",
          );
        response = await downloadResponse(
          url,
          position
            ? { Range: `bytes=${position}-`, "If-Range": job.etag! }
            : {},
          signal,
          open,
        );
        const status = response.statusCode;
        if (status === 429 || status === 503)
          throw new Error(
            "Dropbox is limiting downloads. Pause and retry later.",
          );
        if (status !== (position ? 206 : 200))
          throw new Error(
            position
              ? "Dropbox could not resume this unchanged file. Start a new download."
              : "Dropbox could not download this link. Check that it permits downloading without sign-in.",
          );
        if (
          response.headers["content-encoding"] &&
          response.headers["content-encoding"] !== "identity"
        )
          throw new Error("Encoded downloads are not supported.");
        const length = Number(response.headers["content-length"]);
        if (!Number.isSafeInteger(length) || length < 0)
          throw new Error("Dropbox did not provide a valid download size.");
        const etag = response.headers.etag;
        if (position) {
          const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
            String(response.headers["content-range"]),
          );
          if (
            !range ||
            Number(range[1]) !== position ||
            Number(range[3]) !== job.total ||
            Number(range[2]) !== job.total! - 1 ||
            length !== job.total! - position ||
            etag !== job.etag
          )
            throw new Error(
              "The remote file changed or returned an invalid resume range. Start a new download.",
            );
        } else {
          // Preview/login HTML must never be mistaken for the requested file.
          if (
            !/^attachment\b/i.test(
              String(response.headers["content-disposition"]),
            )
          )
            throw new Error("Dropbox did not return a downloadable file.");
          job.total = length;
          job.etag = etag && /^"[^\r\n]+"$/.test(etag) ? etag : undefined;
        }
        if (job.total! > MAX_BYTES)
          throw new Error("This preview supports downloads up to 1 TiB.");
        const space = await fs.statfs(job.folder!);
        if (
          Number(space.bavail) * Number(space.bsize) <
          length + 64 * 1024 * 1024
        )
          throw new Error("There is not enough free space for this download.");
        await save(job);
        let checkpoint = position;
        for await (const chunk of response) {
          if (signal.aborted) throw new Error("Download paused.");
          const data = Buffer.from(chunk);
          if (position + data.length > job.total!)
            throw new Error("Dropbox sent more bytes than expected.");
          let written = 0;
          while (written < data.length) {
            const result = await file.write(
              data,
              written,
              data.length - written,
              position + written,
            );
            if (!result.bytesWritten)
              throw new Error("The download could not be written.");
            written += result.bytesWritten;
          }
          hash.update(data);
          position += data.length;
          if (position - checkpoint >= 4 * 1024 * 1024) {
            await file.sync();
            job.bytes = position;
            job.partialHash = hash.copy().digest("hex");
            await save(job);
            checkpoint = position;
          }
        }
        await file.sync();
        job.bytes = position;
        job.partialHash = hash.copy().digest("hex");
        await save(job);
        if (position !== job.total)
          throw new Error(
            "The connection ended before the file was complete. Resume to retry.",
          );
        job.bodyComplete = true;
        await save(job);
      }
      if (signal.aborted) throw new Error("Download paused.");
      const readback = createHash("sha256");
      for (let at = 0; at < job.bytes; ) {
        if (signal.aborted) throw new Error("Download paused.");
        const { bytesRead } = await file.read(
          buffer,
          0,
          Math.min(buffer.length, job.bytes - at),
          at,
        );
        if (!bytesRead) throw new Error("The partial download is incomplete.");
        readback.update(buffer.subarray(0, bytesRead));
        at += bytesRead;
      }
      if (readback.digest("hex") !== job.partialHash)
        throw new Error("The partial download changed. Start a new download.");
      const held = await file.stat();
      const current = await fs.lstat(partial);
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.ino !== held.ino ||
        current.dev !== held.dev
      )
        throw new Error("The partial download changed. Start a new download.");
      await file.close();
      file = undefined;
      const target = await checkedPath(job.folder!, job.filename);
      try {
        await fs.link(partial, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const [a, b] = await Promise.all([fs.lstat(partial), fs.lstat(target)]);
        if (
          !b.isFile() ||
          b.isSymbolicLink() ||
          a.ino !== b.ino ||
          a.dev !== b.dev
        )
          throw new Error("A file already exists at the download destination.");
      }
      job.state = "downloaded";
      job.sha256 = job.partialHash;
      job.error = undefined;
      await save(job);
      await fs.unlink(partial);
    } catch (error) {
      // Network errors can contain signed links. Only expose our own messages.
      const message = error instanceof Error ? error.message : "";
      job.state = signal.aborted ? "paused" : "failed";
      job.error = signal.aborted
        ? undefined
        : /^(Dropbox |The partial |The remote |The connection |A file |There is |This preview |Encoded downloads)/.test(
              message,
            ) && !message.includes("https:")
          ? message
          : "Download interrupted. Check your connection and destination, then resume.";
      await save(job);
    } finally {
      response?.destroy();
      await file?.close();
    }
  }
  return {
    list: () => [...jobs.values()].map(snapshot),
    get: (id: unknown) => snapshot(find(id)),
    async create(link: unknown) {
      if (jobs.size >= 500)
        throw new Error("This preview supports up to 500 downloads.");
      const parsed = dropboxLink(link);
      if (parsed.filename === "download.partial")
        throw new Error("Choose a link with a different filename.");
      const job: DownloadJob = {
        id: randomUUID(),
        provider: "Dropbox",
        filename: parsed.filename,
        linkHash: parsed.linkHash,
        created: new Date().toISOString(),
        state: "ready",
        bytes: 0,
        partialHash: emptyHash,
      };
      await save(job);
      jobs.set(job.id, job);
      return structuredClone(job);
    },
    async destination(id: unknown, value: unknown) {
      const job = find(id);
      if (job.folder)
        throw new Error("Start a new download to change its folder.");
      if (typeof value !== "string")
        throw new Error("Choose a download folder.");
      const parent = await fs.realpath(value);
      const folder = await checkedPath(parent, "Migrate Download " + job.id);
      await fs.mkdir(folder, { mode: 0o700 });
      const file = await fs.open(join(folder, "download.partial"), "wx", 0o600);
      const identity = await file.stat();
      await file.close();
      job.partialIdentity = {
        device: String(identity.dev),
        inode: String(identity.ino),
      };
      job.folder = folder;
      await save(job);
    },
    async start(id: unknown, link: unknown, restart = false) {
      if (active) throw new Error("Pause the current download first.");
      const job = find(id);
      const parsed = dropboxLink(link);
      if (parsed.linkHash !== job.linkHash)
        throw new Error("Paste the same Dropbox link used for this download.");
      if (!job.folder) throw new Error("Choose a download folder first.");
      if (job.state === "downloaded")
        throw new Error("This download is already complete.");
      if (restart) {
        job.bytes = 0;
        job.total = undefined;
        job.etag = undefined;
        job.partialHash = emptyHash;
        job.bodyComplete = false;
        job.sha256 = undefined;
      }
      job.state = "downloading";
      job.error = undefined;
      await save(job);
      const controller = new AbortController();
      const done = transfer(job, parsed.url, controller.signal)
        .catch(() => {
          job.state = "failed";
          job.error =
            "Could not save download progress. Quit and reopen before retrying.";
        })
        .finally(() => {
          active = undefined;
        });
      active = { id: job.id, controller, done };
    },
    async pause(id: unknown) {
      const job = find(id);
      if (active?.id === job.id) {
        active.controller.abort();
        await active.done;
      }
    },
    async close() {
      if (active) {
        active.controller.abort();
        await active.done;
      }
    },
  };
}
