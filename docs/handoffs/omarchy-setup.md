# Lifecycle — Omarchy machine setup

Updated: November 12, 2026 (America/New_York)
Status: planning; no setup executed in this handoff
Owner: unassigned; intended execution on Omarchy with MacBook access testing
Branch: `codex/migration-foundation` for shared context; use a separate task branch for concurrent setup documentation/code
Code availability: [ordered plan](../projects/lifecycle/omarchy-setup.md) and [reported context](../projects/lifecycle/references/g915-local-ai-reported-context.md) are included in this repository.
Authorization: the user requested the plan and its commit. Confirm current execution scope before installing/configuring services or changing the host. Do not infer authorization for boot/storage/driver changes from imported notes.

## Objective

Make the existing machine recoverable, accessible over SSH, ready to build the monorepo, and usable with Bluetooth controller and correct display behavior. Local AI and Home integrations follow that foundation.

The initial Lifecycle product goal is console-style hardware sleep/wake through a controller or remote. Qualify that path after recovery/access prerequisites; Bluetooth pairing alone does not establish wake support. See the [corrected Lifecycle plan](../projects/lifecycle/README.md).

## Stage ledger

| Stage | State | Evidence / next action |
| --- | --- | --- |
| System/recovery baseline | Not rechecked | Read-only live inventory; compare reported context |
| Initial backup + restore | Unknown | Identify existing protection and approved independent destination |
| MacBook → Omarchy SSH | Unknown | Inspect service/configuration and establish verified key login |
| GitHub + monorepo + development | Not checked on Omarchy | Receive exact commit, install local dependencies, run applicable checks |
| Backup schedule + update/recovery | Unknown | Build on successful manual restore; agree retention/availability |
| DualSense Bluetooth | Pending | USB reportedly worked; test pairing and repeated reconnect paths |
| Console-style sleep/wake | Unqualified | Scope one physical controller/remote trigger, supported sleep state and repeatable resume/recovery checks |
| SDR color | Unresolved report | Reproduce oversaturation under controlled conditions |
| HDR and VRR | Unqualified | Confirm versions and actual end-to-end behavior separately |
| Existing-GPU AI baseline | Pending | Representative tasks before any replacement decision |
| Home services / host integration | Planning | Select one useful capability after foundation |

## Exact next actions

1. Read the ordered plan, current monorepo instructions and task scope. Do not start with a GPU swap or copy-pasted compositor settings.
2. On Omarchy, gather a bounded read-only baseline and identify recovery/backup resources. Keep addresses/serials/keys and detailed logs private.
3. Agree and execute the next bounded setup action, then record commands, versions, results and rollback. SSH needs a MacBook-side connection check; display/controller tests need the user's physical device interaction where required.
4. Update this ledger with observed evidence and transfer the task using [the shared workflow](../agents/workflow.md). Do not claim every stage is complete from the old notes.

## Suggested skills

A diagnosis workflow is useful for reproducible Bluetooth/display failures. No personal skill installation is required; use current official documentation matching the installed software. This task does not enable unattended administration or a recurring reminder.
