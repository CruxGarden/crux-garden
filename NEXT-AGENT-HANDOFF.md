# Start here — current monorepo state

Updated November 12, 2026. Read [AGENTS.md](AGENTS.md), then the [project index](docs/projects/README.md) and relevant task handoff. Only this repository needs to be cloned; no sibling repository, Mac-specific output directory or conversation is a setup dependency.

## Current state

- Repository: `CruxGarden/crux-garden`. Current shared development line: `codex/migration-foundation`; main has not been merged or released. Obtain the exact transfer SHA from the sender and verify it using the [workflow](docs/agents/workflow.md).
- Latest completed **application** checkpoint before this documentation setup: `e4eaaaffa6f8fcdd4554de182cb78f8dfc988a3f` (Messages selected-copy guidance). Documentation commits after it do not include the local comparison implementation.
- **Migrate work is stopped.** Local comparison source/test changes remain uncommitted on the MacBook. The continuation reminder was deleted. No agent should recreate it or resume that task from this document alone.
- **Home** and **Lifecycle** are documented projects, not new implemented applications/services. The supplied Home narrative and visual references are included; obsolete suggested first assignments do not override the current Migrate state.
- Current action is establishing portable shared project documentation and handoffs. Omarchy access, clone and test execution have not been performed here.

## Handoffs

| Task | State | Owner / location | Next action |
| --- | --- | --- | --- |
| [Local file comparison](docs/handoffs/migrate-local-comparison.md) | Paused; code not yet transferred | MacBook working tree; no active writer | Explicit resume, checkpoint the code, then complete qualification |
| Home first journey | Planning | Unassigned | Use the [Home project](docs/projects/home/README.md) to propose one scoped journey |
| Lifecycle contract | Planning | Unassigned | Use the [Lifecycle project](docs/projects/lifecycle/README.md) to define ownership/recovery |

## Evidence and constraints

Committed Migrate checkpoint e4eaaaf records 199 engine checks, 17 Electron journeys, 18 browser journeys and macOS Tauri/package checks. The newer local comparison tree passed 205 engine checks, 17 Electron journeys and 18 browser journeys before stopping; final comparison Tauri/package and visual acceptance are not complete. Those newer checks do not describe the code an Omarchy clone receives. See the task handoff and [verification history](docs/verification.md).

Production Photos remains disabled; real-account and maximum-scale checks remain pending as documented per provider. Preserve originals, personal data and unrelated local changes. Toadstool remains stopped. No merge to main, public release or host administration is part of this setup.
