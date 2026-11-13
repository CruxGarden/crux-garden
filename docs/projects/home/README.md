# Home

**State:** product/design plan; no Home app entry has been implemented in this monorepo. Updated November 12, 2026. See [shared vision](vision.md), [visual references](design/README.md), [roadmap](../../../ROADMAP.md) and [Migrate](../migrate/README.md).

## Purpose

A calm, approachable home for personal photographs, documents, music, movies, books and applications. People should accomplish everyday tasks without first learning which service owns each capability. Local use stays free/open source; originals and data remain portable; cloud services are optional.

Home is an experience over the existing operating system and shared Crux Garden capabilities. It is not a new OS, a requirement to use a cloud account, or a bundled Builder installation. Lab, Field and Station describe future related experiences; they are not additional active projects in this initial organization.

## Existing building blocks

- `packages/garden-ui`: shared primitives, Mood tokens, Plasma, fonts and icon conventions.
- `packages/migration-ui`: embeddable React UI with an injected client; embedded mode respects host Mood/Plasma ownership.
- `packages/migration-contracts`: existing Migrate client and job contracts, not a general Home service model.
- `packages/migration-engine`: durable migration jobs, verified files, receipts and local API; not a photo/media library server.

Only these monorepo sources and the vendored API are required for this planning phase. Builder/app/API sibling repositories are not cloned as part of this setup. Do not recreate their broad functionality or assume their runtime is bundled here.

## Experience and visual direction

Use content-led layouts with an inviting overview and clear library navigation. The original storyboard suggests Together, Photos, Music, Movies, Books and Documents. The leaner Home exploration reduces decoration: quiet botanical surfaces, restrained iridescent emphasis, warm headings, readable controls and selective amber attention. All appearance must use editable Mood tokens and shared UI primitives; mockup colors/fonts are reference values rather than hardcoded component styling.

Provide real empty/loading/error/offline/permission states, keyboard focus and responsive layouts. Desktop is a useful first target; couch/controller, TV and mobile need explicit later qualification. A mockup's photos, service cards, health metrics and household controls are illustrative, not evidence of integrations.

## Proposed first vertical slice — for review

**Candidate:** Home overview → explicitly choose Migrate → preserve selected files through the existing workflow → return to Home with a truthful completed-import summary and an action to open the preserved location.

This would connect one real user task before promising a full library index, media server or household dashboard. It should reuse the Migrate client/component and receipts. It does not silently index personal folders, install services or add a second job/database owner.

Proposed acceptance:

- A Home entry uses the shared Mood/Plasma system, with no Cruxes or app-building UI required.
- Embedded Migrate and standalone Migrate preserve the same fixture bytes and expose the same durable result.
- Navigation away and back does not lose or duplicate jobs. Host/process lifetime is explicit; closing a pane is not quitting the app.
- Completion language means verified supplied files, not complete cloud-account migration or backup coverage.
- Empty/error/loading, keyboard focus, narrow layout and restart paths are demonstrable with synthetic files.

**Not approved for implementation yet.** Alternative first journeys may focus on a real media/document service; choose one deliberately rather than implementing every illustrated pane. Service integration would add Lifecycle dependencies that the Migrate-only candidate may not need.

## Decisions still needed

Home host/entry and distribution shape; first journey/persona; library indexing/storage contract; household identity/sharing; local versus remote access; Assistant tool permissions and local/cloud disclosure. The [Lifecycle plan](../lifecycle/README.md) must settle any new managed-service requirements before introducing a host daemon.

## Context imported, not active instructions

The November 12 refined Home bundle supplies vision and design context. This repository contains a curated synthesis, the original visual files and [the supplied vision as historical context](references/comprehensive-vision-as-supplied.md). The requested machine setup context now lives under [Lifecycle](../lifecycle/omarchy-setup.md). Older suggestions to inspect sibling app/API repositories or start Migrate again with ZIP intake have been superseded by the current standalone-monorepo implementation. The brief's illustrative assignments do not resume stopped tasks.
