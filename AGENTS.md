# Crux Garden monorepo agent instructions

Applies throughout this repository. This monorepo is the only repository shared between the MacBook and Omarchy for now; no parent workspace or sibling clone is required. The user's current instructions govern task scope, including stops. A saved plan or handoff does not authorize resuming paused work.

## Start here

1. Read [current state](NEXT-AGENT-HANDOFF.md), [roadmap](ROADMAP.md), and the relevant project in [docs/projects](docs/projects/README.md).
2. Read the task's [handoff](docs/handoffs/README.md), relevant [ADRs](docs/adr/README.md), and [cross-machine workflow](docs/agents/workflow.md).
3. Check branch, worktree status and supplied commit before editing. Preserve unrelated changes. One writer per task branch; parallel tasks use separate worktrees and branches. Do not silently take over a stopped or owned task.

## Project boundaries

- **Gyro:** exploratory WebGL 2 gyroscope persona in `apps/gyro`; simulated states, shared Mood tokens, no model/microphone/native integration. See its project page and handoff.
- **Home:** planned everyday experience using the shared Garden UI, Mood and host-injected clients. Visual concepts are references, not implemented features.
- **Migrate:** implemented standalone React/Tauri application; Electron is the comparison/test host. Internal `migration-*` names remain stable. Do not bundle Builder, Cruxes or personal data.
- **Lifecycle:** console-style hardware sleep/wake with a controller or remote is the starting point; host/service coordination supports it. Existing Migrate tray/process behavior is evidence, not a general installed service manager.
- Node owns Migrate jobs, SQLite and fingerprints through the existing local API. Workers do not open a second database. React does not own filesystem, credentials or native permissions. Keep reusable workflows and thin provider adapters.
- Moods own appearance. Use shared editable semantic tokens for color, typography, surfaces, borders, focus and motion. Do not hardcode a separate Home theme or copy an entire shell to add a feature.
- Preserve originals and explicit selection; recheck current content before reuse. Metadata references are not content fingerprints or proof of export completeness.
- Production Photos stays disabled until native permission and source-binding qualification. Never inspect personal libraries/accounts as a readiness test. Use isolated synthetic fixtures; no private Photos/Messages databases or login scraping.
- Toadstool remains stopped. Home, Lifecycle, Linux distribution, hardware and service installation are not implicitly authorized by documentation.

## Verification and transfer

- Use the Node version in `.nvmrc`; install dependencies independently on each machine with `npm run setup`. The local API archive is already vendored here.
- For code changes run `npm run verify` and applicable browser/desktop checks. Do not rebuild `runtime-dist` while acceptance tests are using it. See [workflow](docs/agents/workflow.md) for platform limitations.
- For documentation-only changes check links, paths, claims and staged diff; don't manufacture application test evidence.
- Record command, platform, result, skips and unverified areas. macOS passing does not qualify Linux; fixture checks do not qualify live accounts.
- Keep the roadmap and current-state index concise. Update the relevant task handoff with its code checkpoint; use Git history for chronology. Use relative paths, never local profile/token paths or secrets.
- Commit only intended files, push the task branch when authorized, and verify the remote SHA before announcing a transfer. Never merge main, publish a release, force-push shared history or delete another agent's work without authorization.
- The legacy parent workspace documents are historical context for other repositories. For these monorepo projects, maintain the documents here; do not require agents to synchronize an unavailable parent repository.
