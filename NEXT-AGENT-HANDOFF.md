# Start here — current monorepo state

Updated November 12, 2026. Read [AGENTS.md](AGENTS.md), the [documentation index](docs/README.md), then the relevant project/task handoff. Only this repository is required; no sibling clone or conversation is a setup dependency.

## Current state

- Repository: `CruxGarden/crux-garden`, shared development branch `codex/migration-foundation`. Main has not been merged or released. Verify the exact pushed SHA in the transfer receipt before taking ownership.
- The user authorized consolidating and committing all relevant Home/Migrate/Lifecycle code and context. **The previously local-only Migrate comparison implementation is included in this checkpoint**, together with its tests and design. It is no longer missing from a clone of this checkpoint.
- Application baseline before comparison was `e4eaaaffa6f8fcdd4554de182cb78f8dfc988a3f`. The documentation foundation was `b0fa6cd9f0c6c90c5bbdd1cbe247f1866340e8cb`. This checkpoint has passing engine/browser/Electron checks but final comparison Tauri/package/visual qualification remains pending; no new preview package or release is claimed.
- Home's earlier migration-focused preview already became Migrate. Current maintained code is in `apps/migration` and shared packages. The broader Home UI and general Lifecycle host manager are still plans. See the [source audit/map](docs/projects/source-map.md), not folder names alone.
- The [ordered Omarchy setup plan](docs/projects/lifecycle/omarchy-setup.md) covers baseline/recovery → backup → SSH → development → routine maintenance → Bluetooth controller → SDR/HDR/VRR → local AI → chosen Home services. Prior machine reports are preserved as unverified context. No Omarchy command or system change has been executed here.
- No agent currently owns implementation on Omarchy. The continuation reminder remains deleted. Transfer/commit authorization does not restart unattended development or approve every system change in the plan.

- Lifecycle correction: hardware sleep/wake operated through a controller or remote, like a console, is the initial purpose. Service management is supporting scope. Read the corrected [Lifecycle plan](docs/projects/lifecycle/README.md); the detailed earlier conversation remains unrecovered.
- The [complete original Home handoff bundle](docs/references/README.md), including three documents, thirteen mockups and its README, is preserved with a SHA-256 manifest; subsequent user-requested terminology edits are recorded there.

- Current names: **Assistant** for the personal agent and **Crux Garden Migrate** (formerly Migration) for the tool. Internal `migration` paths/packages remain unchanged.

## Handoffs

| Task | State | Next action |
| --- | --- | --- |
| [Local file comparison](docs/handoffs/migrate-local-comparison.md) | Code checkpoint available; qualification incomplete | Verify received commit; agree next scoped review/package work |
| [Omarchy setup](docs/handoffs/omarchy-setup.md) | Ordered plan ready; execution unverified | Start with live baseline and recovery/backup inventory within agreed scope |
| Home first journey | Planning | Review [Home project](docs/projects/home/README.md) |
| Lifecycle hardware sleep/wake | Planning | Review [Lifecycle project](docs/projects/lifecycle/README.md); distinct from workstation setup |

## Validation at this checkpoint

`npm run verify`: 205 checks pass. Browser embedding: 18 journeys pass. Electron desktop: 17 journeys pass after removing inherited `ELECTRON_RUN_AS_NODE=1` from the test command; the initial VS Code-environment attempt failed before application launch. No source change was needed for that environment issue. See [verification history](docs/verification.md) and [comparison handoff](docs/handoffs/migrate-local-comparison.md).

Production Photos remains disabled; live account/export, scale and Linux distribution gaps remain as documented. Preserve originals and unrelated work. Toadstool stays stopped. No main merge, release, driver, boot, partition, account or host administration action is included in this consolidation.
