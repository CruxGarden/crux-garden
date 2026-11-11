import type { MigrationClient } from "@cruxgarden/migration-contracts";

declare global {
  interface Window {
    migrationAPI?: MigrationClient;
    __TAURI__?: {
      core: {
        invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
      };
    };
  }
}

/** The UI never chooses filesystem authority or a database transport. */
export function desktopClient(): MigrationClient {
  if (window.migrationAPI) return window.migrationAPI;
  const tauri = window.__TAURI__;
  if (tauri)
    return {
      request: (command, args = {}) =>
        tauri.core.invoke("migration_request", { command, args }),
      pick: (id, kind, context) =>
        tauri.core.invoke("migration_pick", { id, kind, context }),
      reveal: (id) => tauri.core.invoke("migration_reveal", { id }),
    };
  throw new Error(
    "Open Migrate in its desktop application to select and preserve files.",
  );
}
