# Migrate — selected local-file comparison

Updated: November 12, 2026 (America/New_York)
Status: **paused by user**
Owner: MacBook working tree; no active writer
Receiver: unassigned
Branch: `codex/migration-foundation`
Last completed application commit: `e4eaaaffa6f8fcdd4554de182cb78f8dfc988a3f`
Code availability: **implementation is local-only and uncommitted on MacBook**. This documentation commit transfers its design and status, not the implementation. An Omarchy clone must not assume the new API/UI exists.
Authorization: documentation transfer is authorized. The user stopped development; the continuation reminder was deleted. Explicit resume is required before continuing implementation or scheduling it.

## Objective

Let users compare explicitly selected local files against known content before preservation. Rehash catalog candidates, show current matches and stale/unreadable locations, and preserve every selected file regardless of comparison. No deletion, merging, skipped copies or automatic storage deduplication.

See [design and bounds](../local-comparison.md), [ADR0095](../adr/0095-migrate-collections-and-content-inventory.md), and [Migrate project](../projects/migrate/README.md).

## Local implementation at pause

The existing Node service owns one comparison worker and the API-owned fingerprint catalog. The worker hashes explicit selected files, requests at most 20 SHA-256/size candidates per source, rehashes candidates, excludes the source path and checks source identity again before publishing. No worker SQLite access. Results are optional job state; selection changes clear them. Pause/restart discards partial results. The UI exposes a dated summary, 50-row preview and limits. A matching path is not proof of independent backup.

Untracked new code at pause: `packages/migration-engine/src/local-comparison.ts`, `local-comparison-worker.ts`, `packages/migration-engine/tests/local-comparison.test.cjs`, `packages/migration-ui/src/LocalComparison.tsx` (the second engine filename is in the same src directory).

Modified tracked code at pause: contracts; engine `cloud/fingerprints.ts`, `service.ts`, `http.ts`; UI `MigrationApp.tsx`; both desktop host allowlists; runtime build entry list; package checks; selected-file browser and desktop journeys. Inspect the MacBook diff before checkpointing; no source patch is embedded in this handoff.

## Verification observed before stop

These logs were read during documentation setup; no application checks were rerun for this documentation change. All results below describe the **uncommitted MacBook tree**, not the committed application baseline.

| Check | Platform | Result | Limits |
| --- | --- | --- | --- |
| `npm run verify` | macOS Apple Silicon | 205 checks passed | Includes typecheck/boundary/build and six new comparison checks; synthetic fixtures |
| `npm run test:desktop` | macOS Electron | 17 journeys passed, 1.3 min | Electron is not the final Tauri UI |
| `npm run test:embedding` | macOS Chromium | 18 journeys passed, 29.8 sec | Injected client and saved comparison summary |
| Final Tauri build/package/restart for this change | macOS | Not run | Existing distributable remains at e4eaaaf |
| Visual acceptance of comparison UI | macOS | Not complete | Browser layout assertions alone are not visual acceptance |
| Omarchy / Linux | Linux | Not run | No platform or package claim |

Comparison checks cover renamed equal bytes, changed/missing candidates, source exclusion, symlinks, source changes, selection/read/candidate/preview budgets, cancellation, catalog failure, authenticated HTTP dispatch, worker ownership, persisted restart and summary invalidation. Maximum-scale and personal-data acceptance remain unqualified.

## Next steps when resumed

1. On MacBook inspect current changes; preserve other tasks. Review comparison lifecycle, hashing/path checks, budget/cancellation behavior and UI disabled states. Check design against code rather than treating passing fixtures as proof of completeness.
2. Create an explicit WIP code+handoff checkpoint if transferring to Omarchy before completion; push and send the exact SHA. Change code availability in this file only once those files are actually included. Until then do not recreate the missing implementation on the receiving machine.
3. Finish appropriate checks, Tauri build and packaged-worker/restart acceptance on MacBook; inspect the resulting UI. Never rebuild runtime-dist while acceptance runs.
4. Assess Linux support in a separately scoped branch/task; preserve the macOS baseline and record unsupported tests/configuration honestly.
5. Update API docs, verification, current-state index and verified artifacts as appropriate. Commit/push coherent work; do not merge main or release.

## Boundaries

16 GiB/file, 64 GiB combined reads, 500 selected files and 20 candidates/file; summaries are bounded and point-in-time. Folder expansion and disk cleanup are not part of this slice. Production Photos remains disabled; no real account or library should be used as a readiness check. Existing provider-account/format/scale gaps remain separate.

## Suggested skills

No required external skill. Use a disciplined diagnosis workflow if a reproducible failure appears; the repository's tests and decisions are the portable source of truth.
