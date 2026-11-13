# Crux Garden monorepo roadmap

Updated November 12, 2026. Scope: **Home, Migrate, Lifecycle**. Only this repository is shared between environments. This is the current planning index; historical details belong in Git and the project references.

| Project | Current evidence | Next bounded step | Authorization |
| --- | --- | --- | --- |
| [Home](docs/projects/home/README.md) | Shared Garden UI and embeddable Migrate UI exist; Home designs supplied | Review one library-focused Home journey and its host contract | Plan only; implementation not started |
| [Migrate](docs/projects/migrate/README.md) | Existing tool plus transferred local-comparison code checkpoint | Complete comparison review/package qualification in an agreed task | Consolidation/commit authorized; no unattended continuation |
| [Lifecycle](docs/projects/lifecycle/README.md) | Console-style hardware sleep/wake is the confirmed starting point; only Migrate process/tray behavior exists | Scope one controller/remote sleep/wake path on Omarchy; qualify hardware before implementation | Plan only; no host installation or daemon authorized |
| [Agent workflow](docs/agents/workflow.md) | Shared context and comparison source available in this checkpoint | First Omarchy checkout and platform baseline report | Transfer authorized; remote execution pending |
| [Omarchy setup](docs/projects/lifecycle/omarchy-setup.md) | Ordered SSH/backup/development/Bluetooth/display/AI plan | Live baseline, recovery and initial backup before changes | Plan recorded; host execution scope must be agreed |

## Sequence and acceptance

1. Share this documentation and existing committed code through Git. Transfer exact commits, not directories of live runtime data.
2. Establish the Omarchy baseline in an isolated clone: dependency setup, applicable checks, unsupported/platform-specific failures. Do not claim Linux packaging readiness from macOS evidence.
3. Receive the included Migrate comparison checkpoint, then complete review and final native/package qualification in an agreed task. See its [handoff](docs/handoffs/migrate-local-comparison.md).
4. Agree the first Home journey and the minimum Lifecycle capabilities it needs. Proposed boundaries and acceptance are in the project pages; no broad platform rewrite.
5. Add host integration and service adapters in independently verifiable slices, preserving shared UI, durable ownership and ordinary portable files.

## Deferred or unqualified

Photos native permission/source binding; Google/Dropbox account registration and applicable live tests; real Flickr/Takeout/Meta/X exports; large-mailbox scale; modern Facebook variants and X query/HLS references; complete Messages export; Linux/Windows distribution, signing and updates. No account or hardware action is implied by listing a gap.

Home's future household identity, network access, remote sharing, backup/restore, optional publishing and Zac capability model require explicit contracts. Lab/Field/Station and hardware are context, not extra active projects. Toadstool remains stopped.

## Decisions

[ADR index](docs/adr/README.md): Historical Home experiment 0092 and Migrate decisions 0093–0099 imported from the existing workspace; [0100](docs/adr/0100-monorepo-agent-handoffs.md) records this shared documentation and task-transfer workflow.
