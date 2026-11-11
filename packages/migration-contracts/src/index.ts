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
  sourceKind?: "folder" | "zip" | "tar" | "archive-set" | "file-set";
  /** Selected archive basenames, relative to source. Originals remain separate. */
  sourceArchives?: string[];
  /** Explicit ordinary file basenames relative to source; no sibling discovery. */
  sourceFiles?: string[];
  destination?: string;
  output?: string;
  state: JobState;
  created: string;
  files: number;
  bytes: number;
  current?: string;
  error?: string;
  checklist?: Record<string, boolean>;
  photoReview?: PhotoReview;
  inspection?: {
    files: number;
    bytes: number;
    availableBytes: number;
    requiredBytes: number;
    checkedAt: string;
    digest: string;
    archive?: { size: number; modified: number; sha256: string };
    archives?: Array<{
      path: string;
      size: number;
      modified: number;
      sha256: string;
    }>;
  };
}
export interface PhotoReview {
  state: "running" | "complete" | "failed" | "paused";
  checked?: number;
  total?: number;
  error?: string;
  report?: string;
  counts?: {
    matched: number;
    ambiguous: number;
    unmatched: number;
    invalid: number;
  };
  unassociatedMedia?: number;
  preview?: Array<{
    kind: string;
    path: string;
    id?: string;
    title?: string;
    dateTaken?: string;
    status: string;
    issue?: string;
    candidates: string[];
    candidateCount: number;
    memberCount?: number;
  }>;
}
export interface MigrationInfo {
  product: "migration";
  capabilities?: {
    sharedFileDownloads: boolean;
    cloudCollections?: boolean;
    localFileSelection?: boolean;
    photoMetadata?: boolean;
    photoMetadataProviders?: string[];
  };
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
  | "photoReview"
  | "checklist"
  | "help"
  | "cloudConnect"
  | "cloudAuthorize"
  | "cloudStatus"
  | "cloudBrowse"
  | "cloudCreate"
  | "cloudStart"
  | "cloudPause"
  | "cloudImport"
  | "cloudJobs"
  | "cloudDisconnect"
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
    kind:
      | "source"
      | "archive"
      | "archiveSet"
      | "fileSet"
      | "destination"
      | "downloadDestination"
      | "cloudDestination"
      | "cloudScanDirectory",
    context?: { connection?: string },
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

export type CloudProvider =
  | "Bluesky"
  | "Amazon S3"
  | "Google Drive"
  | "Dropbox";
export interface CloudEntry {
  id: string;
  name: string;
  kind: "file" | "folder";
  size?: number;
}
export interface CloudConnection {
  id: string;
  provider: CloudProvider;
  label: string;
  state: "connecting" | "connected" | "failed";
  error?: string;
}
export interface CloudItem {
  id: string;
  path: string;
  revision?: string;
  size?: number;
  checksum?: { algorithm: "sha256" | "md5" | "dropbox"; hex: string };
  metadata?: Record<string, unknown>;
  completed?: { bytes: number; sha256: string; reused?: boolean };
}
export interface CloudJob {
  id: string;
  provider: CloudProvider;
  identity: string;
  label: string;
  selection: CloudEntry[];
  created: string;
  state:
    | "ready"
    | "discovering"
    | "scanning"
    | "downloading"
    | "paused"
    | "failed"
    | "downloaded";
  folder?: string;
  folderIdentity?: { device: string; inode: string };
  planned: boolean;
  reusedFiles?: number;
  comparison?: {
    folder: string;
    scanned: number;
    matching: number;
    needsDownload: number;
    uncertain: number;
    checkedAt: string;
  };
  items: CloudItem[];
  files: number;
  bytes: number;
  current?: string;
  error?: string;
  notes: string[];
}
export type CloudJobSummary = Omit<CloudJob, "items" | "folderIdentity"> & {
  totalFiles: number;
  knownBytes: number;
};
