# ADR 0092 — Home entry and bounded Tauri experiment

**Status:** implementation authorized by Daniel on 2026-11-10; local macOS Apple Silicon preview accepted through synthetic migration tests. Tauri is recommended for continued Home development; public shipping shell qualification remains open. The general application's Electron decision (ADR 0002) remains in force.

> **2026-11-10 direction update:** [ADR0093](0093-migration-first-monorepo.md) supersedes the full-app embedding prerequisite and the no-local-listener restriction. Migration is now the standalone product in the new staged monorepo, with future Home/Lab/Builder hosting. The evidence below records the earlier Home experiment.

## Context

Daniel requests a fresh Home entry inside the Crux Garden codebase, separately distributable with no included Cruxes or app-building features. Migration is its first native tool. The supplied storyboard guides a calm, roomy environment using existing UI components, Plasma and editable Mood appearance. Toadstool is on the backburner.

Daniel explicitly reopened Tauri as a size experiment. Removing authoring and Astro does not remove the existing API's Node/native SQLite dependency. A comparison must include the complete runtime, not just the shell executable.

## Decision for this milestone

1. Use a separate minimal renderer entry in the existing app repo. Extract the existing Plasma material from its full-app activity adapter and reuse the existing Mood token mapping; keep the full app's behavior intact. Exclude authoring modules and bundled Crux assets through a build-time module guard and explicit assets.
2. Provide small Electron and Tauri host adapters over one shared Home contract. Native dialogs grant source/destination paths; renderer requests cannot grant themselves arbitrary filesystem or SQL access. External help opens only references selected by provider and index from the host-side bundled guide catalog; renderer-supplied URLs are not accepted. No local network listener.
3. Bundle the same Node service and pinned local API with both previews. `LocalGraphRuntime` owns the database; Home metadata occupies namespaced settings records. Migration workers stream filesystem bytes outside the renderer. Do not create a second content database owner or rewrite the API in Rust for this experiment.
4. Use distinct preview/development application identities and profiles. Do not concurrently open the existing full-app database from a standalone Home installation. Full-app integration will use that application's existing owner, not launch this standalone profile behind its back.
5. Prove local folder preservation before archive parsing or semantic library import. Save guide checklist/progress, inspect counts/space, preserve ordinary files without overwrites, hash them, and retain an ordinary JSON receipt. Use complete-before-visible files/checkpoints. Report preservation separately from interpretation, synchronization and backup.
6. Extend the same preservation writer to ZIP and TAR/TAR.GZ. Preserve original archive bytes before extracting, validate SHA-256 and ZIP CRC-32, bound expansion, and reject traversal, links and collisions. Bundle 31 offline guides (the reconstructed 29 plus Flickr/S3), with provider-specific saved checklists. Export guidance and verified bytes do not imply interpreted records or complete remote-account capture.
7. Keep this a preview until full-app entry, platform qualification, performance/accessibility checks and release packaging are completed. No public signing, update channel or deployment is implied.

## Evidence and implications

On macOS Apple Silicon, equivalent complete packages measure approximately **188 MB ZIP / 464 MB installed for Electron** and **61 MB ZIP / 167 MB installed for Tauri** (decimal MB, logical installed bytes). Both contain an identical approximately 161.5 MB Node/API runtime including archive dependencies and a renderer/guide payload of approximately 1.02 MB. This supports Tauri for continued Home development despite retaining Node.

The first Electron number reported in chat was invalid: electron-builder excluded nested API dependencies from extraResources. An explicit afterPack copy fixes this, and the measurement script now compares every staged runtime file against both installed bundles before producing results. Both packaged runtimes pass actual native SQLite startup, zero-Crux verification, copying, hash verification and restart in isolated profiles. Both final packages additionally pass ZIP/TAR.GZ preservation with retained-original verification. Tauri passes manual native archive dialogs and visible TAR.GZ preservation/restart; Electron has three real desktop journeys including offline catalog/checklist and link boundaries. The Home runtime suite has 27 passing cases. The shared extraction passes the full app and Electron gates.

The ultra Plasma tier replaces Home's initial forced-low setting, which looked jagged. Shared Mood optics, still desktop surfaces, Glass/Solid alternatives and reduced-motion fallback remain. There is no claim of measured frame rate, cold-cache startup, total webview-inclusive memory or cross-platform parity from these checks.

## Alternatives and remaining costs

- Retain only Electron: simpler host maintenance but materially larger complete package in this experiment. Keep it runnable as the reference while qualifying Tauri.
- Rewrite the API in Rust now: might remove more size, but duplicates the database ownership contract and expands scope before Migration is useful. Not selected.
- Bundle authoring and hide navigation: fails the lightweight/no-Crux requirement. Reuse source-level primitives and runtime contracts instead.
- Make Home a preinstalled central Crux: conflicts with Daniel's explicit no-included-Cruxes direction. Unlike Toadstool's environment model in ADR 0087, this entry is a native application area.

Further work must finish the full-app adapter without a second live database owner; qualify WKWebView accessibility, reduced motion, energy and Windows/Linux behavior; and establish signed distribution/update ownership. Do not infer production readiness from the preview.
