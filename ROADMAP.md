# Crux Garden monorepo roadmap

Updated November 28, 2026. Scope: **Home, Migrate, Lifecycle, Gyro**. Only this repository is shared between environments. This is the current planning index; historical details belong in Git and the project references.

## TL;DR

Gyro joins Home, Migrate and Lifecycle as an isolated interactive 3D persona prototype. Its seven editable states, four styles, per-ring shades and optional state/UI audio are published for visual review at [the public demo](https://crux-garden-gyro.thesantiagodog.chatgpt.site); smooth returns to one shared head-on starting pose are implemented. The main view now has a scrolling sidebar with seven collapsible sections, Soundscape open at the top and sound enabled on first interaction. All states move every ring at independently editable rates. Production AI integration remains future work. Existing project priorities and stopped tasks are unchanged.

| Project | Current evidence | Next bounded step | Authorization |
| --- | --- | --- | --- |
| [Gyro](docs/projects/gyro/README.md) | Runnable WebGL 2 persona prototype with seven editable states, four styles and optional audio | Review state legibility, materials and presentation context | Runnable demo explicitly authorized; production AI integration not included |
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

Home's future household identity, network access, remote sharing, backup/restore, optional publishing and Assistant capability model require explicit contracts. Lab/Field/Station and hardware are context, not extra active projects. Toadstool remains stopped.

## Decisions

[ADR index](docs/adr/README.md): Historical Home experiment 0092 and Migrate decisions 0093–0099 imported from the existing workspace; [0100](docs/adr/0100-monorepo-agent-handoffs.md) records this shared documentation and task-transfer workflow.

## Gyro — interactive persona study

November 28: `apps/gyro` is a registered workspace with `npm run gyro`, typecheck/build in the verification gate, and shared Mood JSON editing/export/import. The current user-selected design is three simple rings; the earlier core, lattice, engravings and particles were explicitly removed. Glow, Metal, Flat and Cartoon styles share seven editable states: blue Idle, green Listening, purple Thinking, gold Speaking, whole-ring color-cycling Delighted, amber Uncertain and red Error/danger. Each state owns color, speed, size, glow strength/spread, electrical flow, pulse, color cycling and RGB split; the rings use deeper/base/lighter shades. Optional local Web Audio includes crossfading state pads with Warm/Airy/Analog/Deep choices, transition cues and button sounds with independent toggles. All styles use head-on framing with centered, mirrored axis motion. Every state uses the same head-on concentric starting pose. State changes ease back to it, then restart animation phase. Rapid changes retarget the current pose. Reset view restores the shared pose and phase. Per-state angles were reverted; the proposed tilted resting pose was rejected. Each ring uses one solid color that fades over time; the spatial rainbow material was rejected. Introductory hero copy and the invented brand icon were removed while preserving state controls. Three development presentation contexts remain available. WebGL 2 is the renderer, with no real model or microphone connection. Demo version 3 is published publicly through Sites from monorepo source `8182123`; the isolated static publishing source is `f0db44ef6def2156b1b6418ba4befdcecdd213bf`. The main monorepo branch has not been pushed or merged. Final production integration and device qualification are open. See [project](docs/projects/gyro/README.md) and [validation handoff](docs/handoffs/gyro-poc.md).
