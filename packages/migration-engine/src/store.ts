import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  MigrationJob,
  DownloadJob,
} from "@cruxgarden/migration-contracts";

/** The service owns jobs; the host may supply its existing database owner. */
export interface MigrationStore {
  loadJobs(): Promise<MigrationJob[]>;
  saveJob(job: MigrationJob): Promise<void>;
  getMood(): Promise<Record<string, string>>;
  setMood(tokens: Record<string, string>): Promise<void>;
  cruxCount(): Promise<number>;
  loadDownloads?(): Promise<DownloadJob[]>;
  saveDownload?(job: DownloadJob): Promise<void>;
  close(): Promise<void>;
}
export async function openMigrationStore(
  profile: string,
): Promise<MigrationStore> {
  await fs.mkdir(profile, { recursive: true });
  const { LocalGraphRuntime } =
    require("@cruxgarden/local-api") as typeof import("@cruxgarden/local-api");
  const file = join(profile, "migration.db");
  const api = await (existsSync(file)
    ? LocalGraphRuntime.open(file)
    : LocalGraphRuntime.create(file));
  return {
    async loadDownloads() {
      return (await api.listSettings())
        .filter((s) => s.key.startsWith("migration:download:"))
        .map((s) => JSON.parse(s.value));
    },
    async saveDownload(job) {
      await api.putSetting("migration:download:" + job.id, JSON.stringify(job));
    },
    async loadJobs() {
      return (await api.listSettings())
        .filter((s) => s.key.startsWith("migration:job:"))
        .map((s) => JSON.parse(s.value));
    },
    async saveJob(job) {
      await api.putSetting("migration:job:" + job.id, JSON.stringify(job));
    },
    async getMood() {
      return JSON.parse(
        (await api.listSettings()).find((s) => s.key === "migration:mood")
          ?.value ?? "{}",
      );
    },
    async setMood(tokens) {
      await api.putSetting("migration:mood", JSON.stringify(tokens));
    },
    async cruxCount() {
      return (
        (
          await api.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM cruxes",
          )
        )?.count ?? 0
      );
    },
    async close() {
      await api.close();
    },
  };
}
