# Lifecycle

**State:** proposed project/contract, not an implemented general host agent or daemon. Updated November 12, 2026. The user clarified that the starting point is hardware sleep and waking with a controller or remote, making the machine behave like a PlayStation or console. The earlier service-management-first interpretation was incomplete.

## Starting point: a console-like computer

**Confirmed user direction:** build a system that manages hardware sleep and waking, operated from an external controller or remote. This is Lifecycle's initial product purpose, not merely a Bluetooth setup check or an application tray/process feature.

The original detailed conversation has not been recovered. The [complete supplied reference bundle](../../references/README.md) mentions couch controls and appliance-like usability but does not specify the full sleep/wake design. The following sequence is a proposal based on the user's correction, not a recovered prior agreement.

### Proposed first vertical slice

On the Omarchy reference machine, qualify one explicit controller or remote wake path and a user-requested sleep path, returning to a usable couch interface after resume. Establish a recovery route and inspect available power states and wake devices before changing settings. Record unsupported paths honestly; pairing a Bluetooth controller is not evidence it can wake this hardware.

Define and verify:

- Awake, preparing for sleep, asleep, resuming and failed-transition states; distinguish suspend, hibernate, shutdown and display-only standby.
- The selected physical wake trigger and supported power state. Controller, USB receiver, network and TV/remote mechanisms are candidates to investigate, not promised capabilities.
- Intentional sleep, cancellation and interaction with active downloads, backups, games and other work; decide when to pause work or inhibit sleep without silently terminating it.
- Return of input, display, audio, network and the chosen interface after resume; lock/unlock and household access behavior remain explicit design questions.
- Repeated sleep/wake cycles, accidental wake behavior, timeout/failure reporting and a physical recovery fallback. Measure latency and reliability before setting performance promises.

No wake mechanism, automatic idle policy, daemon, privilege scheme or TV power integration has been selected or qualified. The first implementation task must be scoped on the target machine. This documentation correction does not execute host changes.

## Workstation setup track

The [ordered Omarchy setup plan](omarchy-setup.md) covers SSH, backups, development tools, controller Bluetooth, SDR/HDR/VRR, then local AI and services. Its [handoff](../../handoffs/omarchy-setup.md) records actual stage status. Configuring this machine is distinct from implementing a reusable Lifecycle product; neither has been executed by adding these plans.

## Supporting application and service coordination

Support the hardware sleep/wake experience by making ownership and lifetime of local applications/services explicit: what is installed, configured, running, healthy, stopping, failed or recoverable; who may act; and how state/data survive restart or updates. Home should consume meaningful capability/status information without owning OS process administration.

Lifecycle is distinct from Assistant (a conversational/tool user), Migrate (durable migration jobs/content), and the Home UI. It must not become a second migration database or an unrestricted shell endpoint.

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
| Model-generated requests | Assistant as a scoped caller, never automatic authority |
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

## Supporting process-contract slice — after the hardware plan

Document and fixture-test the existing Migrate host/service ownership contract through launch, hide/reopen, graceful Quit and interrupted restart. Use a synthetic child/runtime and isolated profiles before any OS service installation. Expose only truthful read-only status to a prototype Home client if that is part of the agreed Home journey.

Candidate acceptance: one service owner per profile; no duplicate jobs on reopen/retry; explicit shutdown outcome; recoverable interruption with original files intact; client disappearance does not imply service termination; unsupported host operations are surfaced; no new personal-data permissions or elevated/system modifications. Preserve existing Migrate behavior as the reference rather than replacing it wholesale.

**Not authorized to implement or install yet.** The next task is a scoped hardware sleep/wake plan and target-machine capability assessment; process coordination supports that work. Later managed third-party services, updates, backup/restore and remote administration require additional adapter-specific decisions and acceptance.
