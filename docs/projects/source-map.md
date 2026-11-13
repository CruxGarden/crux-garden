# Home, Migrate and Lifecycle — source audit

Audited November 12, 2026. This maps the relevant earlier Home preview to its current monorepo successors; it is not a whole-Builder migration. The source experiment was `CruxGarden/app` commit `b5d52d144` on `codex/home-migration`. Its isolated Home paths were checked for local changes; none were reported. The unrelated current Builder/Toadstool checkout and its work remain intact.

## Why there is only apps/migration

The earlier product called Home was a minimal migration-focused preview. It was extracted into this repository and became **Crux Garden Migrate**, per [ADR0093](../adr/0093-migration-first-monorepo.md). `apps/migration` is the current maintained host; its internal name does not make it stale. The broader Home design and general Lifecycle host manager have not been implemented as separate applications. Do not create empty app directories or duplicate old runtime owners to suggest otherwise.

## Code and tool mapping

| Earlier Home source | Maintained monorepo location | Disposition |
| --- | --- | --- |
| `src/home/Home.tsx`, `MigrationGuide.tsx` | `packages/migration-ui/src/MigrationApp.tsx`, `MigrationGuide.tsx` | Extracted and extended; injected host client supports future Home embedding |
| `src/home/main.tsx`, `bridge.ts` | `apps/migration/main.tsx`, `bridge.ts` | Standalone entry and native bridge |
| `src/home/mood.ts`, `home.css`; shared UI/Plasma | `packages/migration-ui/src/`, `packages/garden-ui/` | Shared Mood/appearance and reusable UI; provenance in docs/source-provenance.json |
| `home/contract.ts` | `packages/migration-contracts/src/index.ts` | Current shared client/job contract |
| `home/guides.ts`, `guides.json` | `packages/migration-providers/src/` | Current guide catalog and provider-specific scope |
| `home/runtime/backend.ts` | `packages/migration-engine/src/backend.ts`, `service.ts`, `store.ts`, `http.ts` | Extended Node service and API-owned durable state |
| `home/runtime/files.ts`, `worker.ts`, `zip.ts`, `tar.ts` | Same filenames under `packages/migration-engine/src/` | Shared preservation engine, now with additional connectors/reviews |
| `home/electron/`, `home/src-tauri/` | `apps/migration/electron/`, `apps/migration/src-tauri/` | Current shells include background lifecycle/tray/shutdown |
| `home/scripts/build.mjs`, `home/vite.config.ts` | `scripts/build-runtime.mjs`, `apps/migration/vite.config.ts` | Current isolated renderer/runtime staging |
| `home/scripts/check-packages.mjs` | `scripts/check-packages.mjs` | Current package verification; macOS-specific |
| `home/scripts/electron-after-pack.cjs` | `scripts/electron-after-pack.cjs` | Retained complete runtime-copy packaging hook |
| `home/scripts/measure.mjs` | Historical measurement evidence in ADR0092 | One-off old two-shell comparison; not required to build/run current source |
| `home/tests/`, `home/tools/` | `packages/migration-engine/tests/`, `apps/migration/tests/`, `tests/embedding/`, `tools/` | Current tests/tooling and lockfiles |
| Pinned canonical local API | `packages/migration-engine/vendor/` | Tracked package dependency; no sibling API clone required |

The earlier README/build instructions and no-HTTP/old-profile behavior were superseded by current contracts. Copying that runtime alongside the maintained engine would create two implementations and misleading old commands. The historical decision is preserved in [ADR0092](../adr/0092-home-entry-and-tauri-experiment.md), while current evidence remains in [verification](../verification.md).

## Existing Lifecycle code

Migrate's native hosts own window/tray/quit behavior. Engine `backend.ts` owns service process protocol/lock/descriptor; `service.ts` coordinates workers, close and durable writes. [Background lifecycle](../background-lifecycle.md) describes the implemented behavior and limits. The audit found no separate general Home/Lifecycle daemon in these relevant sources. Builder notebook/Crux/task lifecycle modules govern a different product domain and are not silently imported here.

## Plans and operational context

- [Home plan](home/README.md), [curated vision](home/vision.md), [original supplied vision](home/references/comprehensive-vision-as-supplied.md), [visual notes](home/references/visual-refinement-as-supplied.md), and all 13 original [design images](home/design/README.md).
- [Migrate plan](migrate/README.md), provider/method docs, current code and [comparison checkpoint](../handoffs/migrate-local-comparison.md).
- [Lifecycle product plan](lifecycle/README.md), [ordered Omarchy setup](lifecycle/omarchy-setup.md) and [reported machine context](lifecycle/references/g915-local-ai-reported-context.md).

Original brief references to app/API clones and fresh ZIP implementation are historical. Current work must start from this repository, not restart completed slices. Chat transcripts, credentials, personal exports and generated packages are not part of this consolidation. The original repositories and documents have not been deleted or rewritten.
