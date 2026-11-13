# Omarchy setup — ordered machine plan

Updated November 12, 2026. **Planning handoff, not an executed setup script.** This is the practical order for making the existing Omarchy machine reliable, remotely accessible and ready for Crux Garden development and Home use. No machine inspection or configuration change was performed from the MacBook for this document.

The user explicitly wants SSH, backups, development setup, controller Bluetooth and the SDR/HDR issues included. The [reported machine context](references/g915-local-ai-reported-context.md) preserves prior observations; recheck them before acting. GPU shopping and general AI research are later, independent decisions.

## Order and completion gates

| Order | Work | Done when |
| --- | --- | --- |
| 0 | Read-only system and recovery baseline | Actual versions/storage/network and local recovery path recorded privately |
| 1 | Initial backup and restore proof | Selected data/configuration has a separate copy and a sample restore passes |
| 2 | SSH from MacBook | Verified host identity, key login and reconnect succeed with local recovery available |
| 3 | GitHub, monorepo and development tools | Exact branch/commit checked out; applicable build/test results recorded |
| 4 | Routine backup, maintenance and recovery | Schedule, retention, failure visibility and restore instructions are tested |
| 5 | DualSense Bluetooth and audio | Pairing, Steam input and repeated reconnect/sleep/reboot checks pass or gaps are explicit |
| 6 | SDR color, then HDR and VRR | Each is tested separately, preserving a known usable display configuration |
| 7 | Local AI baseline | Existing GPU benchmarked with representative tasks and resource limits |
| 8 | Needed Home services and Lifecycle integration | One chosen service has storage, permissions, health and restore evidence |

Do not wait for a GPU purchase or all media features to begin development. Steps 5–6 can proceed independently after the recovery/remote-access foundation is established. A blocked backup destination or unavailable display test needs an explicit recorded limitation, not a fabricated pass. This plan is not approval to execute every system mutation unattended; use the user's current task scope.

## 0. Establish what is actually installed

At the local console, identify Omarchy/Hyprland, kernel, GPU driver, storage/mounts, free space, encryption, boot arrangement and network interfaces. Determine which existing backup/snapshot tools, SSH service and development dependencies are already present. Inspect only the information needed; keep serial numbers, addresses, recovery keys and full inventories out of Git.

Confirm that local login remains available and both previously working operating systems can still boot. Know how to recover display configuration from a console before changing it. Do not repartition, reinstall Omarchy, change boot priority, replace drivers or delete snapshots as part of discovery. Record reported facts separately from new observed results.

Match documentation to installed versions. The old [Omarchy 3 manual](https://learn.omacom.io/2/the-omarchy-manual) now identifies itself as legacy and links to the [current manual](https://omarchy.org/manual/). Do not assume the current manual describes this machine, or that the earlier Lua/Hyprland settings still apply unchanged.

## 1. Establish protection before changing the system

Choose a user-approved destination separate from the system drive, with capacity for the selected scope. Preserve important home-directory data and relevant configuration; account for Windows data separately if it is in scope. Exclude reproducible caches/build output deliberately, not by accidentally omitting important files. Recovery material belongs in secure private storage, not this repository.

Treat system snapshots and independent backups as different protections. Inspect actual snapshot coverage, boot integration and restoration before relying on it; a snapshot on the same failed drive is not a separate backup. Identify live databases/services needing a supported export, consistent snapshot or stop before copying their state.

Complete a first backup and restore a small representative sample into a temporary location. Check its bytes and usability. Record scope, excluded data, destination type, restore procedure and result without recording secrets. If storage is unavailable, document that gate and restrict subsequent changes to the explicitly agreed safe scope.

## 2. Get SSH working from the MacBook

Inspect the installed OpenSSH service and effective configuration. Propose LAN-only access first; do not open router ports or add public exposure. Decide the normal user, key authentication and firewall/interface scope. Keep private keys on their originating machines and verify the server host-key fingerprint through the local console before trusting it from the MacBook.

After the agreed service/configuration change, verify a new MacBook session and normal-user privileges. Keep a local console or working recovery session while changing authentication. Test key login before restricting fallback login methods. Validate syntax with the installed `sshd -t`; inspect effective settings with `sshd -T`, including relevant Match rules. These are [OpenSSH-supported checks](https://man.openbsd.org/sshd); authentication/listener options are defined in [sshd_config](https://man.openbsd.org/sshd_config).

Check disconnect/reconnect and reboot persistence when authorized. Confirm an ordinary login is not unrestricted root access. Store convenience aliases and network addresses in private local SSH configuration. Record only a redacted success/failure summary in the [setup handoff](../../handoffs/omarchy-setup.md). Remote internet access is a separate future decision.

## 3. Establish the coding environment

Use a separately authenticated local coding agent and GitHub access; never copy the MacBook's shell credential files or private keys. Clone only `CruxGarden/crux-garden` and use the exact supplied checkpoint on `codex/migration-foundation` until a different integration branch is agreed. Read `AGENTS.md`, `NEXT-AGENT-HANDOFF.md` and [the transfer procedure](../../agents/workflow.md).

Use `.nvmrc` and `npm run setup`; the local API dependency is vendored. Install missing OS/native build prerequisites only after inspecting what is present and agreeing the changes. Do not copy macOS node_modules or binaries. Run `npm run verify` and applicable browser/desktop checks, recording failures/skips rather than silently excluding them. Current Tauri/package configuration remains macOS-specific; Linux qualification is work, not a promised bootstrap outcome.

VS Code terminals may inherit `ELECTRON_RUN_AS_NODE=1`, which prevents Electron UI launch. If the test log shows Node rejecting `--remote-debugging-port`, run the desktop test in an environment with that variable removed (for example `env -u ELECTRON_RUN_AS_NODE npm run test:desktop`). This was observed on the MacBook; do not interpret it as a product regression without checking the launch environment.

## 4. Make maintenance repeatable

Turn the successful manual backup into an agreed schedule and retention policy. Define whether missed runs catch up after sleep/shutdown and how failures become visible. Test recovery of both a representative file and relevant application state. Keep backup keys recoverable through the user's chosen private mechanism. Never prune the only verified copy as part of initial setup.

Use the update procedure appropriate to the installed Omarchy version. Before a planned update, preserve required data/configuration, identify rollback and schedule a reboot if needed. Afterwards verify boot, SSH, desktop, input/audio and developer baseline. Do not automatically substitute generic Arch upgrade instructions or turn this checklist into unattended privileged administration.

Document power/suspend expectations: remote access and background jobs require a running reachable system. A dual-boot machine running Windows cannot simultaneously provide its Omarchy-hosted services. Decide whether later household services need different availability; do not silently disable sleep or move them to a new host.

## 5. DualSense Bluetooth and audio

Earlier USB controller and headphone checks reportedly passed; Bluetooth reliability remains unqualified. First confirm the USB baseline, adapter/firmware/service state and existing pairing state. Pair only the intended controller, with the user able to place it in pairing mode. Use the installed BlueZ/desktop controls and [upstream bluetoothctl documentation](https://github.com/bluez/bluez/blob/master/doc/bluetoothctl.rst), not a blanket reset of all paired devices.

Test: initial pairing; Steam controller detection; button/stick/trigger input; a short real-game session; disconnect/reconnect; controller power-off/on; host sleep/wake; and a reboot. Observe lag/disconnections and test supported rumble features separately. Keep USB as a known fallback. Headphone audio over controller Bluetooth is optional and must not be promised from successful USB audio. Confirm soundbar/default output and headphone routing independently so controller changes do not obscure audio failures.

Record controller/adapter/software versions, test conditions and reproducible failures without publishing Bluetooth addresses. Any firmware, package or power-management adjustment should follow an observed failure and include a rollback/check.

## 6. Display: SDR first, then HDR, then VRR

Reported baseline: LG E9 over HDMI; 4K at roughly 120 Hz and scale 3; oversaturated Linux SDR; game HDR unavailable despite prior configuration changes. These are reports, not a diagnosis. Preserve the current usable display configuration and local/SSH recovery route.

1. **SDR color:** use a known SDR reference and consistent TV/input settings. Check actual compositor/output mode; change one variable at a time. Do not copy an unrelated device's ICC profile or assume oversaturation proves a GPU defect.
2. **HDR path:** inspect installed compositor, driver, game/runtime and TV support separately. Compare desktop/video and game behavior. A configured option or available game menu is not proof of correct TV HDR signaling. Recheck the version-matched [Hyprland configuration documentation](https://wiki.hypr.land/configuring/core/config-options/); do not paste old launch flags or legacy-parser commands blindly.
3. **VRR/performance:** verify observed operation during a controlled game scene; record frame pacing/settings and display evidence. Keep 4K/high-refresh usability and audio intact.

For each experiment record baseline, exact reversible change, observed result and revert result. Use Windows as an available comparison, not as proof of the Linux path. Finish with a documented working configuration and explicit unresolved limitations.

## 7. Local AI after the foundation

Benchmark the existing GPU before buying replacements. Choose representative coding and general-assistant tasks; record model/version, quantization, context, memory use, prompt/generation speed and task quality. Include contention with gaming and background services. Keep initial endpoints local and do not add broad file/tool privileges simply because inference works.

The supplied GPU comparison ideas are research questions, not a purchase recommendation or validated runtime compatibility. Verify exact hardware and current upstream support before advising a change. No GPU/driver swap is part of this setup plan.

## 8. Add services only for a chosen Home journey

Select one useful capability with the user, then choose its runtime/adapter. Containers are an option to assess, not an automatic installation requirement. Define data location, credentials, access/listener scope, health, startup/shutdown, update pinning and a tested restore path before relying on the service.

Keep Migrate's existing Node/SQLite owner intact. Implementing the general [Lifecycle project](README.md) is separate from manually configuring this workstation. Record the concrete lessons from setup as inputs to that product contract rather than shipping privileged scripts that only work on this machine.

## Record progress

Update [Omarchy setup handoff](../../handoffs/omarchy-setup.md) after each verified stage. Keep planned, reported, attempted, verified and blocked states distinct. Git carries plans and sanitized results; secrets, host addresses, full logs and machine-specific recovery files remain private. No step is marked complete merely because it appears in this document.
