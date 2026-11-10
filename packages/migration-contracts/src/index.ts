export type JobState =
  | "ready"
  | "inspecting"
  | "running"
  | "paused"
  | "failed"
  | "verified";
export interface MigrationJob {
  id: string;
  provider: string;
  source?: string;
  sourceKind?: "folder" | "zip" | "tar";
  destination?: string;
  output?: string;
  state: JobState;
  created: string;
  files: number;
  bytes: number;
  current?: string;
  error?: string;
  checklist?: Record<string, boolean>;
  inspection?: {
    files: number;
    bytes: number;
    availableBytes: number;
    requiredBytes: number;
    checkedAt: string;
    digest: string;
    archive?: { size: number; modified: number; sha256: string };
  };
}
export interface MigrationInfo {
  product: "migration";
  capabilities?: { sharedFileDownloads: boolean };
  cruxCount: number;
  runtime: string;
  mood: Record<string, string>;
}
export type MigrationCommand =
  | "info"
  | "list"
  | "create"
  | "mood"
  | "start"
  | "pause"
  | "inspect"
  | "checklist"
  | "help"
  | "downloads"
  | "downloadCreate"
  | "downloadStart"
  | "downloadRestart"
  | "downloadPause"
  | "downloadImport";
export interface MigrationClient {
  request<T>(
    command: MigrationCommand,
    args?: Record<string, unknown>,
  ): Promise<T>;
  pick(
    id: string,
    kind: "source" | "archive" | "destination" | "downloadDestination",
  ): Promise<void>;
  reveal(id: string): Promise<void>;
}

export interface DownloadJob {
  id: string;
  provider: "Dropbox";
  filename: string;
  linkHash: string;
  created: string;
  state: "ready" | "downloading" | "paused" | "failed" | "downloaded";
  folder?: string;
  bytes: number;
  total?: number;
  etag?: string;
  partialHash: string;
  partialIdentity?: { device: string; inode: string };
  bodyComplete?: boolean;
  sha256?: string;
  error?: string;
}
