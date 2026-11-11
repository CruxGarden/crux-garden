import type { Fingerprint, FingerprintStore } from "./cloud/fingerprints";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  MigrationJob,
  DownloadJob,
  CloudJob,
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
  putFingerprint?: FingerprintStore["putFingerprint"];
  findFingerprints?: FingerprintStore["findFingerprints"];
  loadCloudJobs?(): Promise<CloudJob[]>;
  saveCloudJob?(job: CloudJob): Promise<void>;
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
  await api.run(
    "CREATE TABLE IF NOT EXISTS migrate_fingerprints (path TEXT PRIMARY KEY, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, md5 TEXT NOT NULL, checked_at TEXT NOT NULL, source_key TEXT, revision TEXT)",
  );
  const columns = await api.all<{ name: string }>(
    "SELECT name FROM pragma_table_info('migrate_fingerprints')",
  );
  if (!columns.some((column) => column.name === "dropbox"))
    await api.run("ALTER TABLE migrate_fingerprints ADD COLUMN dropbox TEXT");
  await api.run(
    "CREATE INDEX IF NOT EXISTS migrate_fingerprints_dropbox ON migrate_fingerprints(dropbox, bytes)",
  );
  await api.run(
    "CREATE INDEX IF NOT EXISTS migrate_fingerprints_sha ON migrate_fingerprints(sha256)",
  );
  await api.run(
    "CREATE INDEX IF NOT EXISTS migrate_fingerprints_md5 ON migrate_fingerprints(md5, bytes)",
  );
  await api.run(
    "CREATE INDEX IF NOT EXISTS migrate_fingerprints_source ON migrate_fingerprints(source_key, revision)",
  );
  return {
    async putFingerprint(file) {
      await api.run(
        "INSERT INTO migrate_fingerprints(path,bytes,sha256,md5,checked_at,source_key,revision,dropbox) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET bytes=excluded.bytes,sha256=excluded.sha256,md5=excluded.md5,checked_at=excluded.checked_at,source_key=CASE WHEN migrate_fingerprints.sha256=excluded.sha256 THEN COALESCE(excluded.source_key,migrate_fingerprints.source_key) ELSE excluded.source_key END,revision=CASE WHEN migrate_fingerprints.sha256=excluded.sha256 THEN COALESCE(excluded.revision,migrate_fingerprints.revision) ELSE excluded.revision END,dropbox=CASE WHEN migrate_fingerprints.sha256=excluded.sha256 THEN COALESCE(excluded.dropbox,migrate_fingerprints.dropbox) ELSE excluded.dropbox END",
        [
          file.path,
          file.bytes,
          file.sha256,
          file.md5,
          file.checkedAt,
          file.sourceKey ?? null,
          file.revision ?? null,
          file.dropbox ?? null,
        ],
      );
    },
    async findFingerprints(sourceKey, revision, checksum, size) {
      return api.all<Fingerprint>(
        "SELECT path,bytes,sha256,md5,dropbox,checked_at AS checkedAt,source_key AS sourceKey,revision FROM migrate_fingerprints WHERE ((? IS NOT NULL AND source_key=? AND revision=?) OR (?='sha256' AND sha256=?) OR (?='md5' AND md5=?) OR (?='dropbox' AND dropbox=?)) AND (? IS NULL OR bytes=?) ORDER BY checked_at DESC LIMIT 20",
        [
          revision ?? null,
          sourceKey,
          revision ?? null,
          checksum?.algorithm ?? null,
          checksum?.hex.toLowerCase() ?? null,
          checksum?.algorithm ?? null,
          checksum?.hex.toLowerCase() ?? null,
          checksum?.algorithm ?? null,
          checksum?.hex.toLowerCase() ?? null,
          size ?? null,
          size ?? null,
        ],
      );
    },
    async loadCloudJobs() {
      return (await api.listSettings())
        .filter((s) => s.key.startsWith("migration:cloud:"))
        .map((s) => JSON.parse(s.value));
    },
    async saveCloudJob(job) {
      await api.putSetting("migration:cloud:" + job.id, JSON.stringify(job));
    },
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
