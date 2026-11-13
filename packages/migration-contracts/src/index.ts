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
  mailReview?: MailReview;
  localComparison?: LocalComparison;
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
    reference?: string;
    mediaRole?: "photo" | "playback";
    status: string;
    issue?: string;
    candidates: string[];
    candidateCount: number;
    memberCount?: number;
  }>;
}
export interface MailReview {
  state: "running" | "complete" | "failed" | "paused";
  checked?: number;
  total?: number;
  bytesChecked?: number;
  totalBytes?: number;
  error?: string;
  report?: string;
  counts?: {
    mailboxes: number;
    checked: number;
    invalid: number;
    candidates: number;
    warnings: number;
    labelHeaders: number;
  };
  preview?: Array<{
    path: string;
    status: string;
    issue?: string;
    candidates?: number;
    warnings?: number;
    preamble?: boolean;
    preview?: Array<{
      offset: number;
      subject?: string;
      date?: string;
      messageId?: string;
      labels?: string[];
      issue?: string;
    }>;
  }>;
}
export interface LocalComparison {
  state: "running" | "complete" | "failed" | "paused";
  checked?: number;
  total?: number;
  checkedAt?: string;
  bytesRead?: number;
  error?: string;
  counts?: {
    matched: number;
    notFound: number;
    unavailableCandidates: number;
    candidatesChecked: number;
  };
  preview?: Array<{ path: string; match?: string }>;
}
export interface MigrationInfo {
  product: "migration";
  capabilities?: {
    sharedFileDownloads: boolean;
    cloudCollections?: boolean;
    localFileSelection?: boolean;
    localComparison?: boolean;
    photoMetadata?: boolean;
    mailInventory?: boolean;
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
  | "mailReview"
  | "localCompare"
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
  /** Optional native-host action; never infer it from platform or an HTTP feature flag.
   * The host owns permission presentation and source binding. Null means cancelled.
   */
  connectPhotos?(options: {
    networkAllowed: boolean;
  }): Promise<CloudConnection | null>;
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
  | "Gmail"
  | "Dropbox"
  | "iCloud Photos";
export interface CloudEntry {
  id: string;
  revision?: string;
  name: string;
  kind: "file" | "folder";
  size?: number;
}
export interface CloudConnection {
  id: string;
  photosNetworkAllowed?: boolean;
  provider: CloudProvider;
  label: string;
  state: "connecting" | "connected" | "failed";
  error?: string;
}
export interface CloudItem {
  id: string;
  reusePolicy?: "checksum-only";
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
  unknownFiles: number;
};
