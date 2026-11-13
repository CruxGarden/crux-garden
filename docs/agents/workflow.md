# MacBook ↔ Omarchy agent workflow

Only `CruxGarden/crux-garden` is cloned between these environments for now. Each machine has its own checkout, dependencies, native build outputs and isolated test profiles. Git carries reviewed code and Markdown. Do not synchronize active `.git`, `node_modules`, databases or runtime directories through a file-sync service.

## First checkout

Use a destination chosen locally; paths do not need to match across machines. Set up GitHub authentication separately on each machine. Never copy shell credential files or paste tokens into a handoff.

```sh
git clone git@github.com:CruxGarden/crux-garden.git
cd crux-garden
git fetch origin
git switch --track origin/codex/migration-foundation
git status --short
```

For an existing clone, inspect `git status --short`, `git branch --show-current` and `git worktree list` before switching or updating. Never stash, overwrite or clean another task automatically. Main is not currently the Migrate integration baseline; use the branch/commit in the transfer receipt until the user merges it.

Read `AGENTS.md`, `NEXT-AGENT-HANDOFF.md`, the project page and task handoff before executing a saved next step. A `paused` handoff requires an explicit resume; a stale automation or old checklist is not authorization.

## One writer per task branch

Use a distinct branch and task handoff for each concurrent task. An isolated worktree is useful when another checkout is dirty:

```sh
git fetch origin
git worktree add -b codex/home-first-journey ../crux-garden-home origin/codex/migration-foundation
```

The path is an example sibling worktree of this same monorepo, not a second project repository. Do not reuse a branch already checked out elsewhere. Separate agents must not run builds or edit the same working directory concurrently.

The handoff records status (`planning`, `in-progress`, `ready-for-transfer`, `paused`, `blocked`, `complete`), owning machine/agent role and intended receiver. This is a coordination record, not a distributed lock. The sender stops writing before offering transfer; the receiver acknowledges ownership before starting. If two agents race, a rejected non-fast-forward push is a coordination failure to resolve, not permission to force-push. Read-only review can proceed independently when authorized.

## Send a task

1. Review `git status --short` and `git diff`. Classify all dirty files; never blindly stage the whole tree.
2. Update `docs/handoffs/<task>.md` with scope, authorization, state, changed paths, exact checks and remaining risks. Update the current-state index/roadmap only when their status changes.
3. Commit the intended implementation and its handoff together. A `WIP` checkpoint is allowed when transferring unfinished work, but record failing/not-run checks and never call it a verified release. A handoff that describes uncommitted local work must explicitly say the receiver does not have that code.
4. Stage explicit paths, review `git diff --cached --stat` and `git diff --cached`, then commit. Do not include secrets, accounts, personal exports or generated output.
5. Push the named branch. Capture the resulting SHA outside the commit itself:

```sh
git push -u origin HEAD
git rev-parse HEAD
git ls-remote origin refs/heads/codex/migration-foundation
```

Replace the last branch with the task's actual branch. Verify the remote SHA equals the intended local commit. Put this short receipt in the transfer message:

```text
Repository: CruxGarden/crux-garden
Branch: <task branch>
Commit: <full pushed SHA>
Project: Home | Migrate | Lifecycle
Handoff: docs/handoffs/<task>.md
State: <ready-for-transfer or explicitly paused>
Sender: <machine / agent role>; sender has stopped writing
Receiver: <machine / agent role, or unassigned>
Next action: <one bounded action, including any required resume>
```

Use the current authorized communication channel; this procedure does not grant permission to send email/Slack messages or change other chats.

## Receive a task

1. Inspect local status/worktrees. Fetch the supplied branch and verify the supplied full SHA exists and is the intended checkpoint. Read the handoff at that SHA (`git show <SHA>:docs/handoffs/<task>.md`). If the remote tip differs from the receipt, resolve which state is intended before editing.
2. On a clean receiving checkout, create a tracking branch if absent (`git switch --track origin/<branch>`), or update the existing branch with `git merge --ff-only origin/<branch>`. Never hard-reset/diverge silently. Alternatively create a new task worktree from the exact SHA.
3. Check `git rev-parse HEAD` against the receipt. Confirm all required source files are tracked; untracked work on the sending machine is not transferred by a push.
4. Acknowledge taking ownership in the authorized conversation and update the handoff's owner/status on the branch before implementation. A stopped task remains stopped until the user resumes it.
5. Install native dependencies locally, run applicable baseline checks, and record platform-specific failures/skips. Continue only the agreed scope.
6. Return the task using the same procedure. Completed tasks retain a concise final handoff; Git preserves older detail.

## Setup and platform evidence

Use `.nvmrc` (currently Node 22.19.0), then `npm run setup`. The pinned local API package is tracked under `packages/migration-engine/vendor/`; do not fetch it from a sibling API checkout. Native dependencies must be installed for the receiving OS/architecture, never copied from the other machine.

| Check | Purpose | Current qualification |
| --- | --- | --- |
| `npm run verify` | TypeScript, boundary guard, build and engine/API tests | macOS evidence exists; Omarchy baseline pending |
| `npm run test:embedding` | Injected React client and browser journeys | Browser binaries required; macOS evidence exists |
| `npm run test:desktop` | Electron comparison-host journeys | Native UI environment required; Linux behavior pending |
| `npm run package:tauri` | Build preferred native shell | Current configuration targets macOS app bundles; not a qualified Linux distribution recipe |
| `npm run check:package` | Bundled Node/SQLite/restart checks | Currently macOS-specific paths/helper; do not count as a Linux pass |

macOS builds require the Apple command-line toolchain/Swift SDK. Some PhotoKit fixture tests are Darwin-only. Current CI is macOS-only. Linux build/test prerequisites, any unconditional macOS fixture calls, native modules, tray behavior and packaging must be assessed on Omarchy before claiming cross-platform support. Do not silently skip failures to obtain a green baseline. No root/system-package/driver/boot changes are authorized by this workflow.

Finish builds before starting acceptance tests. Never rebuild `runtime-dist` underneath tests. Use synthetic data and isolated profiles. Record command, commit (or dirty-tree status), OS/architecture, outcome, skips and limitations. For documentation-only changes verify local links, tracked paths, examples and staged diff; no application rebuild is needed.

## What belongs in Git

Track project plans, ADRs, agent instructions, curated design references, handoffs, fixtures and source. Keep local transcripts, credentials, runtime databases, personal inventories/exports, logs, build packages, screenshots from personal accounts and local machine paths out. `.agent-local/` is an ignored optional scratch directory; `.env.example` may describe variable names, never credentials. Ignore rules are convenience, not a secret detector; review staged content.

Machine access/SSH addresses and credentials are local configuration, not handoff content. This setup does not establish SSH control or automatic synchronization. Portable command/result summaries live in Git; attach sanitized large logs/build artifacts through approved artifact storage when actually needed.
