import { PHOTO_REVIEW_PROVIDERS } from "./photo-adapters";
import type { Fingerprint } from "./cloud/fingerprints";
import { createCloudJobs, type CloudOptions } from "./cloud/jobs";
import { message as cloudMessage } from "./cloud/common";
import * as fs from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { MigrationJob } from "@cruxgarden/migration-contracts";
import { findGuide } from "@cruxgarden/migration-providers";
import { createDownloads, type DownloadOpen } from "./download";
import { checkedPath, inside, portablePathSet } from "./files";
import { openMigrationStore, type MigrationStore } from "./store";

export async function createMigrationRuntime(
  profile: string,
  options: {
    store?: MigrationStore;
    downloadOpen?: DownloadOpen;
    cloud?: CloudOptions;
  } = {},
) {
  const store = options.store ?? (await openMigrationStore(profile));
  const cloud =
    store.loadCloudJobs && store.saveCloudJob
      ? await createCloudJobs(
          {
            loadCloudJobs: () => store.loadCloudJobs!(),
            saveCloudJob: (job) => store.saveCloudJob!(job),
            fingerprints:
              store.putFingerprint && store.findFingerprints
                ? {
                    putFingerprint: (f) => store.putFingerprint!(f),
                    findFingerprints: (...args) =>
                      store.findFingerprints!(...args),
                  }
                : undefined,
          },
          options.cloud,
        )
      : undefined;
  const downloads =
    store.loadDownloads && store.saveDownload
      ? await createDownloads(
          {
            loadDownloads: () => store.loadDownloads!(),
            saveDownload: (job) => store.saveDownload!(job),
            putFingerprint: store.putFingerprint
              ? (file) => store.putFingerprint!(file)
              : undefined,
          },
          options.downloadOpen,
        )
      : undefined;
  const jobs = new Map<string, MigrationJob>();
  for (const job of await store.loadJobs()) {
    if (job.photoReview?.state === "running")
      job.photoReview = {
        state: "paused",
        error: "Review interrupted. Run it again when ready.",
      };
    if (job.state === "running" || job.state === "inspecting")
      job.state = "paused";
    jobs.set(job.id, job);
  }
  let worker: Worker | undefined;
  let activeId: string | undefined;
  let writes = Promise.resolve();
  const save = (job: MigrationJob) => {
    const value = JSON.stringify(job);
    writes = writes
      .catch(() => {})
      .then(() => store.saveJob(JSON.parse(value)));
    return writes;
  };
  const get = (id: unknown) => {
    const job = typeof id === "string" && jobs.get(id);
    if (!job) throw new Error("Import not found.");
    return job;
  };
  const idle = (job: MigrationJob) => {
    if (job.photoReview?.state === "running")
      throw new Error("Pause the photo review before changing this import.");
    if (job.state === "running" || job.state === "inspecting")
      throw new Error("Pause this import before changing it.");
  };
  async function request(command: string, args: Record<string, unknown> = {}) {
    if (command.startsWith("cloud")) {
      await writes;
      if (!cloud)
        throw new Error("This host does not provide cloud job storage.");
      try {
        if (command === "cloudJobs") return cloud.list();
        if (command === "cloudStatus") return cloud.status();
        if (command === "cloudConnect" || command === "cloudAuthorize")
          return await cloud.connect(args, command === "cloudAuthorize");
        if (command === "cloudBrowse")
          return await cloud.browse(args.connection, args.parent, args.cursor);
        if (command === "cloudCreate")
          return await cloud.create(args.connection, args.selected);
        if (command === "cloudDestination")
          return await cloud.destination(args.id, args.path);
        if (command === "cloudScanDirectory") {
          if (typeof args.path !== "string")
            throw new Error("Choose a local folder.");
          return await cloud.start(
            args.id,
            args.connection,
            await fs.realpath(args.path),
          );
        }
        if (command === "cloudStart")
          return await cloud.start(args.id, args.connection);
        if (command === "cloudPause") return await cloud.pause(args.id);
        if (command === "cloudDisconnect")
          return await cloud.disconnect(args.connection);
        if (command === "cloudImport") {
          const exported = cloud.get(args.id);
          if (exported.state !== "downloaded" || !exported.folder)
            throw new Error("Finish this download first.");
          const job = (await request("create", {
            provider: exported.provider,
          })) as MigrationJob;
          await request("source", { id: job.id, path: exported.folder });
          return job;
        }
        throw new Error("Unknown cloud operation.");
      } catch (e) {
        throw new Error(cloudMessage(e));
      }
    }
    if (command.startsWith("download")) {
      if (!downloads)
        throw new Error("This host does not provide download storage.");
      if (command === "downloads") return downloads.list();
      if (command === "downloadCreate") return downloads.create(args.link);
      if (command === "downloadDestination")
        return downloads.destination(args.id, args.path);
      if (command === "downloadStart")
        return downloads.start(args.id, args.link);
      if (command === "downloadRestart")
        return downloads.start(args.id, args.link, true);
      if (command === "downloadPause") return downloads.pause(args.id);
      if (command === "downloadImport") {
        const download = downloads.get(args.id);
        if (download.state !== "downloaded" || !download.folder)
          throw new Error("Finish the download first.");
        if (
          (await fs.readdir(download.folder)).some(
            (name) => name !== download.filename,
          )
        )
          throw new Error(
            "The download folder contains other files. Select the intended source manually.",
          );
        const job = (await request("create", {
          provider: download.provider,
        })) as MigrationJob;
        const file = join(download.folder, download.filename);
        // Archives enter interpretation; ordinary files enter as a one-file folder.
        await request("source", {
          id: job.id,
          path: /\.(zip|tar|tgz|tar\.gz)$/i.test(file) ? file : download.folder,
        });
        return job;
      }
      throw new Error("Unknown download operation.");
    }
    if (command === "info")
      return {
        product: "migration",
        runtime: process.version,
        cruxCount: await store.cruxCount(),
        mood: await store.getMood(),
        capabilities: {
          sharedFileDownloads: !!downloads,
          cloudCollections: !!cloud,
          photoMetadata: true,
          localFileSelection: true,
          photoMetadataProviders: PHOTO_REVIEW_PROVIDERS,
        },
      };
    if (command === "mood") {
      if (
        !args.tokens ||
        typeof args.tokens !== "object" ||
        Array.isArray(args.tokens)
      )
        throw new Error("Invalid Mood.");
      const value = JSON.stringify(args.tokens);
      if (
        value.length > 100_000 ||
        Object.values(args.tokens).some(
          (v) => typeof v !== "string" || v.length > 1024,
        )
      )
        throw new Error("Invalid Mood tokens.");
      await store.setMood(JSON.parse(value));
      return null;
    }
    if (command === "guideLink") {
      const guide =
        typeof args.provider === "string" && findGuide(args.provider);
      const index = args.index;
      if (
        !guide ||
        typeof index !== "number" ||
        !Number.isInteger(index) ||
        !guide.sources[index]
      )
        throw new Error("Unknown guide reference.");
      return guide.sources[index].url;
    }
    if (command === "list")
      return [...jobs.values()].sort(
        (a, b) =>
          b.created.localeCompare(a.created) || b.id.localeCompare(a.id),
      );
    if (command === "create") {
      if (jobs.size >= 500)
        throw new Error("This preview supports up to 500 imports.");
      const provider = args.provider;
      if (typeof provider !== "string" || !findGuide(provider))
        throw new Error("Choose a provider.");
      const job: MigrationJob = {
        id: randomUUID(),
        provider,
        state: "ready",
        created: new Date().toISOString(),
        files: 0,
        bytes: 0,
      };
      jobs.set(job.id, job);
      await save(job);
      return job;
    }
    const job = get(args.id);
    if (command === "photoReview") {
      idle(job);
      if (worker) throw new Error("Pause the current operation first.");
      if (
        !PHOTO_REVIEW_PROVIDERS.includes(job.provider) ||
        job.state !== "verified" ||
        !job.output
      )
        throw new Error("Preserve and verify a supported photo export first.");
      job.photoReview = { state: "running", checked: 0 };
      await save(job);
      activeId = job.id;
      worker = new Worker(join(__dirname, "photo-review-worker.cjs"), {
        workerData: { id: job.id, provider: job.provider, output: job.output },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      let result: MigrationJob["photoReview"];
      worker.on(
        "message",
        (update: NonNullable<MigrationJob["photoReview"]>) => {
          if (update.state === "running") job.photoReview = update;
          else result = update;
        },
      );
      worker.on("error", () => {
        result = {
          state: "failed",
          error:
            "Photo review stopped. The selected metadata may exceed the review limits.",
        };
      });
      worker.on("exit", () => {
        job.photoReview = result || {
          state: "failed",
          error: "Photo review stopped. You can retry.",
        };
        worker = undefined;
        activeId = undefined;
        void save(job).catch(console.error);
      });
      return null;
    }
    if (command === "checklist") {
      if (
        typeof args.step !== "string" ||
        !findGuide(job.provider)?.steps.some((s) => s.id === args.step) ||
        typeof args.checked !== "boolean"
      )
        throw new Error("Unknown checklist step.");
      job.checklist = { ...job.checklist, [args.step]: args.checked };
      await save(job);
      return null;
    }
    if (command === "archiveSet" || command === "fileSet") {
      const filesOnly = command === "fileSet";
      idle(job);
      if (job.output)
        throw new Error(
          "Start a new import to change selected files or export parts.",
        );
      if (
        !Array.isArray(args.paths) ||
        !args.paths.length ||
        args.paths.length > 500
      )
        throw new Error("Choose between 1 and 500 files from one folder.");
      const add = portablePathSet(filesOnly ? "selected file" : "export part");
      let source: string | undefined;
      const names: string[] = [];
      for (const path of args.paths) {
        if (typeof path !== "string" || !isAbsolute(path))
          throw new Error("Select files using absolute paths.");
        if ((await fs.lstat(path)).isSymbolicLink())
          throw new Error("Select regular files, not links.");
        const file = await fs.realpath(path);
        if (
          !(await fs.stat(file)).isFile() ||
          (!filesOnly && !/\.(zip|tar|tar\.gz|tgz)$/i.test(file))
        )
          throw new Error(
            filesOnly
              ? "Select regular downloaded files."
              : "Choose ZIP, TAR or TAR.GZ export parts.",
          );
        if (source && dirname(file) !== source)
          throw new Error("Choose files from the same folder.");
        source = dirname(file);
        const name = basename(file);
        add(name, true);
        names.push(name);
      }
      if (job.destination && inside(source!, job.destination))
        throw new Error("Choose a destination outside the source folder.");
      job.source = source;
      job.sourceKind = filesOnly ? "file-set" : "archive-set";
      job.sourceArchives = filesOnly ? undefined : names.sort();
      job.sourceFiles = filesOnly ? names.sort() : undefined;
      job.inspection = undefined;
      await save(job);
      return null;
    }
    if (command === "source" || command === "destination") {
      idle(job);
      if (job.output)
        throw new Error(
          "Start a new import to change a source or destination after copying began.",
        );
      if (typeof args.path !== "string") throw new Error("Select a folder.");
      const folder = await fs.realpath(args.path);
      const stat = await fs.stat(folder);
      if (
        !stat.isDirectory() &&
        !(
          command === "source" &&
          stat.isFile() &&
          /\.(zip|tar|tar\.gz|tgz)$/i.test(folder)
        )
      )
        throw new Error("Select a folder, ZIP, TAR or TAR.GZ export.");
      if (command === "source") {
        job.sourceArchives = undefined;
        job.sourceFiles = undefined;
        job.source = folder;
        job.sourceKind = stat.isDirectory()
          ? "folder"
          : /\.zip$/i.test(folder)
            ? "zip"
            : "tar";
      } else job.destination = folder;
      job.inspection = undefined;
      if (
        job.source &&
        job.destination &&
        inside(job.source, job.destination)
      ) {
        if (command === "source") job.source = undefined;
        else job.destination = undefined;
        throw new Error("Choose a destination outside the source folder.");
      }
      await save(job);
      return null;
    }
    if (command === "reportPath") {
      if (!job.output) throw new Error("This import has no output yet.");
      await checkedPath(job.output, "report.json");
      return job.output;
    }
    if (command === "pause") {
      if (activeId === job.id) worker?.postMessage("pause");
      return null;
    }
    if (command === "start" || command === "inspect") {
      if (worker)
        throw new Error("Wait for the current import to finish or pause.");
      if (!job.source || !job.destination)
        throw new Error("Choose a source and destination first.");
      if (
        (await fs.realpath(job.source)) !== job.source ||
        (await fs.realpath(job.destination)) !== job.destination
      )
        throw new Error("A selected folder moved. Start a new import.");
      if (inside(job.source, job.destination))
        throw new Error("Choose a destination outside the source folder.");
      const inspecting = command === "inspect";
      if (inspecting && job.output)
        throw new Error(
          "This import already began. Resume or start a new import.",
        );
      if (!inspecting && !job.inspection)
        throw new Error("Review the files before starting your import.");
      if (!inspecting && !job.output) {
        const output = join(job.destination, "Crux Migration " + job.id);
        await fs.mkdir(output, { mode: 0o700 });
        job.output = output;
      }
      if (inspecting) job.inspection = undefined;
      job.state = inspecting ? "inspecting" : "running";
      job.error = undefined;
      job.files = 0;
      job.bytes = 0;
      await save(job);
      activeId = job.id;
      worker = new Worker(join(__dirname, "worker.cjs"), {
        workerData: { ...job, mode: inspecting ? "inspect" : "preserve" },
      });
      let terminalUpdate: Partial<MigrationJob> | undefined;
      worker.on(
        "message",
        (payload: Partial<MigrationJob> & { fingerprints?: Fingerprint[] }) => {
          const { fingerprints, ...update } = payload;
          if (fingerprints && store.putFingerprint) {
            const batch = structuredClone(fingerprints);
            writes = writes.then(async () => {
              for (const file of batch) await store.putFingerprint!(file);
            });
          }
          // A terminal result is actionable only after the worker releases ownership.
          if (
            update.state &&
            update.state !== "running" &&
            update.state !== "inspecting"
          ) {
            terminalUpdate = update;
          } else Object.assign(job, update);
        },
      );
      worker.on("error", (error) => {
        terminalUpdate = {
          state: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      });
      worker.on("exit", () => {
        if (terminalUpdate) Object.assign(job, terminalUpdate);
        if (job.state === "running" || job.state === "inspecting") {
          job.state = "failed";
          job.error = "The copy worker stopped. You can retry.";
        }
        worker = undefined;
        activeId = undefined;
        void save(job).catch(console.error);
      });
      return null;
    }
    throw new Error("This operation is not available in Migration.");
  }
  async function close() {
    await cloud?.close();
    await downloads?.close();
    if (worker) {
      const w = worker;
      w.postMessage("pause");
      await new Promise<void>((res) => w.once("exit", () => res()));
    }
    await writes;
    await store.close();
  }
  let queue = Promise.resolve();
  let closing = false;
  return {
    request(command: string, args: Record<string, unknown> = {}) {
      if (closing)
        return Promise.reject(new Error("Migration is shutting down."));
      const task = queue.then(async () => {
        if (!args || typeof args !== "object" || Array.isArray(args))
          throw new Error("Invalid arguments.");
        return structuredClone(await request(command, args));
      });
      queue = task.then(
        () => {},
        () => {},
      );
      return task;
    },
    async close() {
      closing = true;
      await queue;
      await close();
    },
  };
}
