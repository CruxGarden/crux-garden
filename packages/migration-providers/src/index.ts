import catalog from "./guides.json";

export interface MigrationGuide {
  id: string;
  name: string;
  category: string;
  reviewed: string;
  provisional: boolean;
  steps: { id: string; label: string; text: string }[];
  checks: string;
  sources: { title: string; url: string }[];
}

/** Bundled text only: no provider SDKs, account credentials or remote content. */
export const MIGRATION_GUIDES: MigrationGuide[] = catalog;
export const findGuide = (provider: string) =>
  MIGRATION_GUIDES.find((g) => g.name === provider);
