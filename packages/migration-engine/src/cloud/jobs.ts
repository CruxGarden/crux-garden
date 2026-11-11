import {
  existingCopy,
  fingerprint,
  sourceKey,
  type FingerprintStore,
} from "./fingerprints";
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { contentHasher } from "../checksums";
import type {
  CloudConnection,
  CloudEntry,
  CloudJob,
  CloudJobSummary,
} from "@cruxgarden/migration-contracts";
import {
  checkedPath,
  exclusiveJson,
  hashFile,
  portablePathSet,
  inventory,
} from "../files";
import { CloudError, message, type CloudAdapter } from "./common";
import { bluesky } from "./bluesky";
import { s3, type S3Factory } from "./s3";
import { beginDropbox } from "./dropbox";
import { beginGoogle } from "./google-drive";
import type { TokenExchange } from "./oauth";
import type { DownloadOpen } from "../network";
export interface CloudOptions {
  // Trusted host injection only. Production hosts do not register Photos yet.
  photosFactory?: (signal: AbortSignal) => Promise<CloudAdapter>;
  open?: DownloadOpen;
  s3Factory?: S3Factory;
  tokenExchange?: TokenExchange;
  dropboxTokenExchange?: TokenExchange;
  // Host-owned fixture seam, never settable over IPC/HTTP or environment.
  adapterFactory?: (
    input: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<CloudAdapter>;
}
export interface CloudStore {
  fingerprints?: FingerprintStore;
  loadCloudJobs(): Promise<CloudJob[]>;
  saveCloudJob(job: CloudJob): Promise<void>;
}
export async function createCloudJobs(
  store: CloudStore,
  options: CloudOptions = {},
) {
  const jobs = new Map(
    (await store.loadCloudJobs()).map((j) => {
      if (
        j.state === "downloading" ||
        j.state === "discovering" ||
        j.state === "scanning"
      )
        j.state = "paused";
      return [j.id, j];
    }),
  );
  type Connection = {
    view: CloudConnection;
    adapter?: CloudAdapter;
    entries: Map<string, CloudEntry>;
    cancel?: () => void;
  };
  const connections = new Map<string, Connection>();
  let active:
    | {
        id: string;
        connection: string;
        controller: AbortController;
        done: Promise<void>;
      }
    | undefined;
  const save = (job: CloudJob) => store.saveCloudJob(structuredClone(job));
  const summary = (j: CloudJob): CloudJobSummary => {
    const { items, folderIdentity: _identity, ...rest } = structuredClone(j);
    return {
      ...rest,
      state:
        active?.id === j.id &&
        !["discovering", "scanning", "downloading"].includes(j.state)
          ? "downloading"
          : j.state,
      totalFiles: items.length,
      knownBytes: items.reduce(
        (n, v) => n + (v.completed?.bytes ?? v.size ?? 0),
        0,
      ),
      unknownFiles: items.filter((v) => v.size === undefined && !v.completed)
        .length,
    };
  };
  const jobFor = (id: unknown) => {
    const j = typeof id === "string" && jobs.get(id);
    if (!j) throw new CloudError("Migration job not found.");
    return j;
  };
  const connectionFor = (id: unknown) => {
    const c = typeof id === "string" ? connections.get(id) : undefined;
    if (!c?.adapter) throw new CloudError("Connect this account first.");
    return c as Connection & { adapter: CloudAdapter };
  };
  async function folderCheck(j: CloudJob) {
    if (!j.folder || !j.folderIdentity)
      throw new CloudError("Choose a destination first.");
    const stat = await fs.lstat(j.folder);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      String(stat.ino) !== j.folderIdentity.inode ||
      String(stat.dev) !== j.folderIdentity.device ||
      (await fs.realpath(j.folder)) !== j.folder
    )
      throw new CloudError(
        "The selected destination moved or changed. Start a new job.",
      );
  }
  async function run(
    j: CloudJob,
    adapter: CloudAdapter,
    signal: AbortSignal,
    scanFolder?: string,
  ) {
    let body: import("node:stream").Readable | undefined;
    try {
      await folderCheck(j);
      if (!j.planned) {
        j.state = "discovering";
        j.items = [];
        await save(j);
        const names = portablePathSet("cloud export");
        const ids = new Set<string>();
        let total = 0;
        for await (const item of adapter.discover(j.selection, signal)) {
          signal.throwIfAborted();
          if (ids.has(item.id)) continue;
          if (j.items.length >= 19998)
            throw new CloudError("Select fewer than 20,000 files per job.");
          try {
            names(item.path, true);
          } catch {
            throw new CloudError(
              "This selection contains unsafe or colliding local filenames. Select smaller groups or use an export archive.",
            );
          }
          if (
            item.size !== undefined &&
            (!Number.isSafeInteger(item.size) || item.size < 0)
          )
            throw new CloudError("Invalid remote file size.");
          total += item.size ?? 0;
          if (total > 1024 ** 4)
            throw new CloudError("Select at most 1 TiB per job.");
          ids.add(item.id);
          j.items.push(item);
          j.current = `Found ${j.items.length} files`;
        }
        j.planned = true;
        await save(j);
      }
      if (scanFolder) {
        if (!store.fingerprints)
          throw new CloudError(
            "This host does not provide a fingerprint inventory.",
          );
        j.state = "scanning";
        j.current = "Scanning local files";
        await save(j);
        const local = await inventory(scanFolder, () =>
          signal.throwIfAborted(),
        );
        let scanned = 0,
          matching = 0,
          uncertain = 0;
        for (const entry of local) {
          signal.throwIfAborted();
          j.current = `Fingerprinting local file ${scanned + 1} of ${local.length}`;
          const path = await checkedPath(scanFolder, entry.path);
          await store.fingerprints.putFingerprint(
            await fingerprint(path, signal),
          );
          scanned++;
        }
        for (const item of j.items) {
          signal.throwIfAborted();
          j.current = `Comparing ${item.path}`;
          await adapter.checksum?.(item, signal);
          if (await existingCopy(store.fingerprints, j, item, signal))
            matching++;
          else if (!item.checksum) uncertain++;
        }
        j.comparison = {
          folder: scanFolder,
          scanned,
          matching,
          uncertain,
          needsDownload: j.items.length - matching - uncertain,
          checkedAt: new Date().toISOString(),
        };
        j.state = "ready";
        j.current = undefined;
        await save(j);
        return;
      }
      const space = await fs.statfs(j.folder!);
      const needed = j.items.reduce(
        (n, v) => n + (v.completed ? 0 : (v.size ?? 0)),
        0,
      );
      if (
        Number(space.bavail) * Number(space.bsize) <
        needed + 64 * 1024 * 1024
      )
        throw new CloudError(
          "There is not enough free space for this selection.",
        );
      j.state = "downloading";
      j.files = 0;
      j.bytes = 0;
      j.reusedFiles = 0;
      await save(j);
      for (const item of j.items) {
        signal.throwIfAborted();
        await folderCheck(j);
        const target = await checkedPath(j.folder!, `files/${item.path}`, true);
        j.current = item.path;
        if (item.completed) {
          if (
            (await hashFile(target, () => signal.throwIfAborted())) !==
            item.completed.sha256
          )
            throw new CloudError(
              "A completed local file changed. Nothing was overwritten; start a new job.",
            );
          j.files++;
          j.bytes += item.completed.bytes;
          if (item.completed.reused) j.reusedFiles!++;
          continue;
        }
        await adapter.checksum?.(item, signal);
        const existing = await existingCopy(
          store.fingerprints,
          j,
          item,
          signal,
        );
        let localHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
        if (existing) {
          localHandle = await fs.open(
            existing.path,
            constants.O_RDONLY | constants.O_NOFOLLOW,
          );
          if (!(await localHandle.stat()).isFile()) {
            await localHandle.close();
            throw new CloudError(
              "A reusable local file changed. Retry to recheck it.",
            );
          }
        }
        const res = localHandle
          ? {
              body: localHandle.createReadStream({ autoClose: true }),
              size: existing!.bytes,
            }
          : await adapter.read(item, signal);
        body = res.body;
        if (
          item.size !== undefined &&
          res.size !== undefined &&
          res.size !== item.size
        )
          throw new CloudError(
            "A remote file changed size. Create a new selection.",
          );
        const expected = item.size ?? res.size;
        const temp = await checkedPath(
          j.folder!,
          `.transfer-${randomUUID()}.partial`,
        );
        const file = await fs.open(temp, "wx", 0o600);
        const sha = createHash("sha256");
        const providerHash = item.checksum
          ? contentHasher(item.checksum.algorithm)
          : undefined;
        let bytes = 0;
        try {
          for await (const chunk of body) {
            signal.throwIfAborted();
            const data = Buffer.from(chunk);
            bytes += data.length;
            if (
              j.bytes + bytes > 1024 ** 4 ||
              (expected !== undefined && bytes > expected)
            )
              throw new CloudError("The transfer exceeded its expected size.");
            // Check growing/unknown streams, not only provider estimates.
            if (
              bytes === data.length ||
              Math.floor(bytes / (16 * 1024 * 1024)) !==
                Math.floor((bytes - data.length) / (16 * 1024 * 1024))
            ) {
              const available = await fs.statfs(j.folder!);
              if (
                Number(available.bavail) * Number(available.bsize) <
                data.length + 64 * 1024 * 1024
              )
                throw new CloudError(
                  "Free space is running low. Choose a larger destination.",
                );
            }
            let offset = 0;
            while (offset < data.length) {
              const written = await file.write(
                data,
                offset,
                data.length - offset,
              );
              if (!written.bytesWritten)
                throw new CloudError("The destination could not be written.");
              offset += written.bytesWritten;
            }
            sha.update(data);
            providerHash?.update(data);
            j.current = `${item.path} · ${(bytes / 1024 / 1024).toFixed(1)} MB`;
          }
          if (expected !== undefined && bytes !== expected)
            throw new CloudError(
              "The connection ended before this file was complete. Retry to download the unfinished file again.",
            );
          if (
            providerHash &&
            providerHash.digest("hex") !== item.checksum!.hex.toLowerCase()
          )
            throw new CloudError(
              "The provider checksum did not match. Retry this transfer.",
            );
          await file.sync();
          await file.close();
          body.destroy();
          body = undefined;
          await adapter.afterRead?.(item, signal);
          const digest = sha.digest("hex");
          if (existing && digest !== existing.sha256)
            throw new CloudError(
              "A reusable local file changed during copying. Retry to recheck it.",
            );
          if ((await hashFile(temp, () => signal.throwIfAborted())) !== digest)
            throw new CloudError(
              "Downloaded bytes did not pass read-back verification.",
            );
          await folderCheck(j);
          await checkedPath(j.folder!, `files/${item.path}`);
          try {
            await fs.link(temp, target);
          } catch (e) {
            if (
              (e as NodeJS.ErrnoException).code !== "EEXIST" ||
              (await hashFile(target, () => signal.throwIfAborted())) !== digest
            )
              throw new CloudError(
                "A destination file already exists or this drive does not support hard links. Nothing was overwritten.",
              );
          }
          const fd = await fs.open(
            target,
            constants.O_RDONLY | constants.O_NOFOLLOW,
          );
          try {
            if (!(await fd.stat()).isFile())
              throw new CloudError("Destination is not a regular file.");
          } finally {
            await fd.close();
          }
          if (
            (await hashFile(target, () => signal.throwIfAborted())) !== digest
          )
            throw new CloudError("The final file did not pass verification.");
          if (store.fingerprints)
            await store.fingerprints.putFingerprint({
              ...(await fingerprint(target, signal)),
              sourceKey: sourceKey(j, item),
              revision: item.revision,
            });
          item.completed = { bytes, sha256: digest, reused: !!existing };
          j.files++;
          j.bytes += bytes;
          if (existing) j.reusedFiles!++;
          await save(j);
        } finally {
          await file.close().catch(() => {});
          await fs.unlink(temp).catch(() => {});
          body?.destroy();
          body = undefined;
        }
      }
      signal.throwIfAborted();
      await folderCheck(j);
      const receipt = {
        schema: 1,
        jobId: j.id,
        provider: j.provider,
        identity: j.identity,
        selected: j.selection,
        created: j.created,
        captured: new Date().toISOString(),
        notes: j.notes,
        files: j.items,
      };
      const existing = (await exclusiveJson(
        j.folder!,
        "migration-manifest.json",
        receipt,
      )) as typeof receipt;
      if (
        existing.jobId !== j.id ||
        JSON.stringify(existing.files) !== JSON.stringify(j.items)
      )
        throw new CloudError(
          "The export manifest conflicts with this job. Nothing was overwritten.",
        );
      j.state = "downloaded";
      j.current = undefined;
      j.error = undefined;
      await save(j);
    } catch (e) {
      j.state = signal.aborted ? "paused" : "failed";
      j.error = signal.aborted ? undefined : message(e);
      await save(j);
    } finally {
      body?.destroy();
    }
  }
  return {
    list: () => [...jobs.values()].map(summary),
    get: (id: unknown) => structuredClone(jobFor(id)),
    status: () => [...connections.values()].map((c) => structuredClone(c.view)),
    async connect(input: Record<string, unknown>, authorize = false) {
      if (connections.size >= 10)
        throw new CloudError(
          "Disconnect an unused account before adding another.",
        );
      const provider = input.provider;
      if (
        !(provider === "iCloud Photos" && options.photosFactory) &&
        !["Bluesky", "Amazon S3", "Google Drive", "Dropbox"].includes(
          String(provider),
        )
      )
        throw new CloudError("Choose a supported service.");
      const c: Connection = {
        view: {
          id: randomUUID(),
          provider: provider as CloudConnection["provider"],
          label: String(provider),
          state: "connecting",
        },
        entries: new Map(),
      };
      const connected = (adapter: CloudAdapter) => {
        c.adapter = adapter;
        c.view.label = adapter.label;
        c.view.state = "connected";
      };
      connections.set(c.view.id, c);
      try {
        if (provider === "iCloud Photos") {
          const adapter = await options.photosFactory!(
            AbortSignal.timeout(60_000),
          );
          if (adapter.provider !== "iCloud Photos") {
            await adapter.close?.();
            throw new CloudError("Invalid Photos host adapter.");
          }
          connected(adapter);
          return structuredClone(c.view);
        }
        if (
          (provider === "Google Drive" || provider === "Dropbox") &&
          !options.adapterFactory
        ) {
          if (!authorize)
            throw new CloudError(
              `Use Connect ${provider} to authorize in your browser.`,
            );
          const auth = await (
            provider === "Dropbox" ? beginDropbox : beginGoogle
          )(
            input,
            connected,
            (e) => {
              c.view.state = "failed";
              c.view.error = message(e);
            },
            options.open,
            provider === "Dropbox"
              ? options.dropboxTokenExchange
              : options.tokenExchange,
          );
          c.cancel = auth.close;
          return { ...c.view, authorizationUrl: auth.url };
        }
        const signal = AbortSignal.timeout(30000);
        connected(
          await (options.adapterFactory
            ? options.adapterFactory(input, signal)
            : provider === "Bluesky"
              ? bluesky(input, signal, options.open)
              : s3(input, signal, options.s3Factory)),
        );
        return structuredClone(c.view);
      } catch (e) {
        connections.delete(c.view.id);
        throw new CloudError(message(e));
      }
    },
    async browse(id: unknown, parent: unknown = "", cursor?: unknown) {
      const c = connectionFor(id);
      if (
        typeof parent !== "string" ||
        parent.length > 2048 ||
        (parent && c.entries.get(parent)?.kind !== "folder")
      )
        throw new CloudError("Choose a listed folder.");
      if (
        cursor !== undefined &&
        (typeof cursor !== "string" || cursor.length > 8192)
      )
        throw new CloudError("Invalid listing cursor.");
      const result = await c.adapter.browse(
        parent,
        cursor as string | undefined,
        AbortSignal.timeout(60000),
      );
      const folder: CloudEntry | undefined = parent
        ? c.entries.get(parent)
        : c.adapter.provider === "Google Drive"
          ? { id: "root", name: "My Drive", kind: "folder" }
          : c.adapter.provider === "Amazon S3"
            ? {
                id: "folder:",
                name: "All objects in this bucket",
                kind: "folder",
              }
            : undefined;
      for (const entry of [...result.entries, ...(folder ? [folder] : [])]) {
        if (c.entries.size >= 20000)
          throw new CloudError(
            "Browse smaller selections in a new connection.",
          );
        c.entries.set(entry.id, structuredClone(entry));
      }
      return { ...result, folder, notes: c.adapter.notes };
    },
    async create(id: unknown, selected: unknown) {
      const c = connectionFor(id);
      if (
        !Array.isArray(selected) ||
        !selected.length ||
        selected.length > 1000 ||
        selected.some((v) => typeof v !== "string" || !c.entries.has(v))
      )
        throw new CloudError(
          "Select listed files or folders first (up to 1,000 selections).",
        );
      if (jobs.size >= 200)
        throw new CloudError("This preview supports up to 200 cloud jobs.");
      const j: CloudJob = {
        id: randomUUID(),
        provider: c.adapter.provider,
        identity: c.adapter.identity,
        label: c.adapter.label,
        selection: [...new Set(selected)].map((v) =>
          structuredClone(c.entries.get(v)!),
        ),
        created: new Date().toISOString(),
        state: "ready",
        planned: false,
        items: [],
        files: 0,
        bytes: 0,
        notes: [
          ...c.adapter.notes,
          "Completed files are rehashed on retry. An interrupted file restarts from its beginning; cross-restart byte-range resume is not implemented for this method.",
        ],
      };
      await save(j);
      jobs.set(j.id, j);
      return summary(j);
    },
    async destination(id: unknown, path: unknown) {
      const j = jobFor(id);
      if (j.folder || typeof path !== "string")
        throw new CloudError("Choose a destination for a new job.");
      const parent = await fs.realpath(path);
      const folder = await checkedPath(parent, "Migrate Collection " + j.id);
      await fs.mkdir(folder, { mode: 0o700 });
      const stat = await fs.lstat(folder);
      j.folder = folder;
      j.folderIdentity = { inode: String(stat.ino), device: String(stat.dev) };
      await save(j);
    },
    async start(id: unknown, connection: unknown, scanFolder?: string) {
      if (active) throw new CloudError("Pause the active cloud job first.");
      const j = jobFor(id);
      const c = connectionFor(connection);
      if (
        j.identity !== c.adapter.identity ||
        j.provider !== c.adapter.provider
      )
        throw new CloudError(
          "Reconnect the same source account or bucket for this job.",
        );
      if (j.state === "downloaded")
        throw new CloudError("This export is already complete.");
      await folderCheck(j);
      j.error = undefined;
      j.state = j.planned ? "downloading" : "discovering";
      await save(j);
      const controller = new AbortController();
      const done = run(j, c.adapter, controller.signal, scanFolder)
        .catch(() => {
          j.state = "failed";
          j.error = "Could not save progress. Quit and reopen before retrying.";
        })
        .finally(() => {
          active = undefined;
        });
      active = { id: j.id, connection: c.view.id, controller, done };
    },
    async pause(id: unknown) {
      jobFor(id);
      if (active && active.id === id) {
        active.controller.abort();
        await active.done;
      }
    },
    async disconnect(id: unknown) {
      if (active?.connection === id)
        throw new CloudError("Pause the active job before disconnecting.");
      const c = typeof id === "string" && connections.get(id);
      if (c) {
        c.cancel?.();
        await c.adapter?.close?.();
        connections.delete(c.view.id);
      }
    },
    async close() {
      if (active) {
        active.controller.abort();
        await active.done;
      }
      for (const c of connections.values()) {
        c.cancel?.();
        await c.adapter?.close?.();
      }
      connections.clear();
    },
  };
}
