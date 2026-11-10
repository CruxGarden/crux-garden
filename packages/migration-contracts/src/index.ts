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
  | "help";
export interface MigrationClient {
  request<T>(
    command: MigrationCommand,
    args?: Record<string, unknown>,
  ): Promise<T>;
  pick(id: string, kind: "source" | "archive" | "destination"): Promise<void>;
  reveal(id: string): Promise<void>;
}
