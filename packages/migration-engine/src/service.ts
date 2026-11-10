import * as fs from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { MigrationJob } from "@cruxgarden/migration-contracts";
import { findGuide } from "@cruxgarden/migration-providers";
import { checkedPath, inside } from "./files";
import { openMigrationStore, type MigrationStore } from "./store";

export async function createMigrationRuntime(
  profile: string,
  options: { store?: MigrationStore } = {},
) {
  const store = options.store ?? (await openMigrationStore(profile));
  const jobs = new Map<string, MigrationJob>();
  for (const job of await store.loadJobs()) {
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
    if (job.state === "running" || job.state === "inspecting")
      throw new Error("Pause this import before changing it.");
  };
  async function request(command: string, args: Record<string, unknown> = {}) {
    if (command === "info")
      return {
        product: "migration",
        runtime: process.version,
        cruxCount: await store.cruxCount(),
        mood: await store.getMood(),
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
      worker.on("message", (update: Partial<MigrationJob>) => {
        // A terminal result is actionable only after the worker releases ownership.
        if (
          update.state &&
          update.state !== "running" &&
          update.state !== "inspecting"
        ) {
          terminalUpdate = update;
        } else Object.assign(job, update);
      });
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
