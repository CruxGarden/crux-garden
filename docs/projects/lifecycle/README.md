# Lifecycle

**State:** proposed project/contract, not an implemented general host agent or daemon. Updated November 12, 2026. This project name comes from the user's request to organize Home, migration and lifecycle together; the scope below is a working definition for review.

## Purpose

Make ownership and lifetime of local applications/services explicit: what is installed, configured, running, healthy, stopping, failed or recoverable; who may act; and how state/data survive restart or updates. Home should consume meaningful capability/status information without owning OS process administration.

Lifecycle is distinct from Zac (a conversational/tool user), Migrate (durable migration jobs/content), and the Home UI. It must not become a second migration database or an unrestricted shell endpoint.

## Existing evidence to reuse

Migrate has a [native background lifecycle](../../background-lifecycle.md): closing the window hides it while the same Node service and jobs continue; tray/Dock can reopen it; explicit Quit pauses unfinished work and closes the owner. A profile lock and local API descriptor identify that running instance. Crash/stale-lock handling, cross-platform behavior and general service installation remain separate gaps.

Relevant sources: `apps/migration/electron/main.cjs`, `apps/migration/src-tauri/src/main.rs`, `packages/migration-engine/src/backend.ts`, and `service.ts` in the same engine directory. Do not require a sibling API repository to inspect these boundaries.

## Proposed responsibility split

| Concern | Owner / direction |
| --- | --- |
| Views, controls, requested actions | Home or standalone app UI through typed clients |
| Migration progress, receipts, SQLite, fingerprints | Existing Migrate Node/local API owner |
| Process admission, start/stop and shutdown coordination | Host/Lifecycle boundary, exact implementation to be decided |
| External service health/install/update details | Thin, separately qualified adapters |
| Model-generated requests | Zac as a scoped caller, never automatic authority |
| Secrets and elevated operations | Host-controlled mechanism; design not yet selected |

No service manifest schema, transport, runtime language, container engine, privilege model or persistence database is approved by this page. Avoid creating generic plugin machinery before a real slice needs it.

## Contract questions to settle first

- **Identity and ownership:** stable service/profile identity, one active owner, parent/child ownership, instance token and how stale ownership is proven. A PID or missing UI window alone is insufficient proof that a lock can be removed.
- **Desired versus observed state:** explicit user intent versus process state; starting/running/degraded/stopping/stopped/failed. A responding process is not automatically a healthy application.
- **Operations:** typed scoped status/start/stop/restart requests, cancellation, deadlines and repeated-request behavior. Separate close-view, quit-app and stop-service actions.
- **Recovery:** interrupted work, supervisor failure, child failure, lock/descriptor cleanup, restart rediscovery and durable-state reconciliation. Preserve existing Migrate pause/retry semantics.
- **Shutdown:** reject new work, request bounded pause/drain, flush durable state, release handles, then report completion; forced termination is a separately disclosed failure path.
- **Permissions and connectivity:** local-only authority by default; explicit service access, filesystem scope and network exposure. No implicit root access, LAN binding or personal-library grants.
- **Updates and data:** version pinning, compatibility, app-aware backup, verification and rollback proof. Runtime replacement is distinct from user-data migration; no update/rollback promise without testing.
- **Observability:** bounded status/events and redacted diagnostics; clear ownership and actionable errors, without secrets in handoffs/logs.
- **Platform adapters:** macOS/Omarchy behavior qualified separately. System services/login startup and unattended execution are new decisions, not consequences of a tray app.

## Proposed first slice — for review

Document and fixture-test the existing Migrate host/service ownership contract through launch, hide/reopen, graceful Quit and interrupted restart. Use a synthetic child/runtime and isolated profiles before any OS service installation. Expose only truthful read-only status to a prototype Home client if that is part of the agreed Home journey.

Candidate acceptance: one service owner per profile; no duplicate jobs on reopen/retry; explicit shutdown outcome; recoverable interruption with original files intact; client disappearance does not imply service termination; unsupported host operations are surfaced; no new personal-data permissions or elevated/system modifications. Preserve existing Migrate behavior as the reference rather than replacing it wholesale.

**Not authorized to implement or install yet.** The next task is a scoped contract/proposal and review of the current code. Later managed third-party services, updates, backup/restore and remote administration require additional adapter-specific decisions and acceptance.
