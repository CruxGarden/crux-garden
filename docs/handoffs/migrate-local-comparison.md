# Migrate — selected local-file comparison

Updated: November 12, 2026 (America/New_York)
Status: **ready-for-transfer as an implementation checkpoint; final qualification incomplete**
Owner: MacBook consolidation finished; receiving agent unassigned
Branch: `codex/migration-foundation`
Previous completed application baseline: `e4eaaaffa6f8fcdd4554de182cb78f8dfc988a3f`
Code availability: **all comparison source/test changes described below are included in this commit**. Use the full pushed SHA in the transfer receipt. No local-only patch or sibling repository is required.
Authorization: the user requested relevant code/docs consolidation and commit after the earlier stop. This checkpoint transfers existing work; it does not enable unattended development, restore the deleted reminder or authorize unrelated host changes. Agree the next task before continuing.

## Objective and implementation

Explicit selected-file imports can compare against indexed content before preservation. The worker hashes selected bytes, asks the API owner for at most 20 SHA-256/size candidates, rehashes their current contents, excludes the source path and checks source identity again before publishing. No worker SQLite access; one shared worker lifecycle. Optional job state survives restart; changing selection clears the summary; pause/restart discards partial results. Source errors/budget exhaustion fail the whole observation. Every selected file is still copied by preservation.

See [design](../local-comparison.md), [ADR0095](../adr/0095-migrate-collections-and-content-inventory.md), [API](../local-api.md) and [Migrate project](../projects/migrate/README.md). A matching path may be a hard link, and the dated bounded summary is not proof of independent backup or global absence of duplicates.

## Included code

- `packages/migration-engine/src/local-comparison.ts`: bounded read-only comparison workflow.
- `packages/migration-engine/src/local-comparison-worker.ts`: cancellable worker/catalog request protocol; no database owner.
- `packages/migration-engine/src/cloud/fingerprints.ts`: optional strict path/identity and read-budget hooks.
- Engine `service.ts`/`http.ts`: capability, dispatch, lifecycle and persisted summary; contracts in `packages/migration-contracts/src/index.ts`.
- `packages/migration-ui/src/LocalComparison.tsx` and `MigrationApp.tsx`: optional comparison controls, explicit limits and current-byte result preview.
- Native allowlists, runtime build entry, package check, engine regression fixtures and selected-file browser/desktop journeys.

## Validation for this transfer

All fixtures are isolated/synthetic on macOS Apple Silicon. These checks were rerun for the source being committed, not inferred from the earlier handoff.

| Check | Result | Limits |
| --- | --- | --- |
| `npm run verify` | 205 pass, no skips | Typecheck, boundary, UI/runtime build and engine/API tests |
| `npm run test:embedding` | 18 pass, 18.5 sec | Injected client, selection, saved summary and restart |
| `env -u ELECTRON_RUN_AS_NODE npm run test:desktop` | 17 pass, 1.1 min | Initial plain command failed at launch due to VS Code's inherited Node-mode variable; corrected environment passes |
| Final Tauri build/package/restart | Not run for comparison | Existing distributable remains at e4eaaaf; package check source is included but not yet qualified for this change |
| Visual acceptance | Not complete | Layout assertions are not a full visual review |
| Omarchy/Linux and maximum-scale/personal data | Not run | No claim of qualification |

The six new engine tests cover renamed equal bytes, stale/missing catalog paths, source exclusion, symlinks, source changes, selection/read/candidate/preview bounds, cancellation, catalog failure, authenticated HTTP dispatch, worker ownership, restart and summary invalidation. Limits: 500 explicit files, 16 GiB/file, 64 GiB combined reads, 20 candidates/file, 50 preview rows.

## Exact next steps

1. Verify the received commit and read current source. Review hashing/path/identity, worker error/cancellation lifetime, and UI busy/disabled-state behavior; a fixture pass is not exhaustive proof.
2. In an agreed MacBook task, finish Tauri build and packaged-worker/restart acceptance, then inspect the comparison UI. Never rebuild runtime-dist during acceptance runs. Update validation and artifacts only after those checks.
3. In an agreed Omarchy task, establish platform baseline and report unsupported build/test assumptions separately. Use the ordered setup plan for any machine prerequisites rather than changing the system opportunistically.
4. Fix findings with focused regressions; commit/push verified changes and update this handoff. Do not merge main or publish a release automatically.

Folder expansion, automatic cleanup and disk deduplication are outside this slice. Production Photos remains disabled and existing account/format/scale gaps remain separate. No user library/account access is a readiness test.

## Suggested skills

No external skill is required to pick up the work. A disciplined diagnosis workflow is useful if a reproducible failure appears; source, tests and decisions here are the portable evidence.
