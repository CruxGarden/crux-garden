# Crux Garden Home — shared product vision

Curated November 12, 2026 from the user-supplied refined Home vision and visual notes. This is product context and proposed direction, not an implementation inventory or authorization to administer a machine. Personal hardware reports and old agent assignments are intentionally excluded.

**Make computing your own.** Create what you imagine. Keep what you value. Share what you love.

## Principles

- Free/open-source local use, with user-controlled data and no mandatory subscription or cloud account.
- Portable originals, documented APIs, replaceable integrations, export and restore.
- Approachable everyday workflows with deeper controls available through progressive disclosure.
- Shared composition, UI and capability contracts across experiences; AI supplements conventional interfaces.
- Explicit, observable automation with scoped authority and recoverable actions.
- Offline usefulness and cross-device access where dependencies allow it; capabilities differ by host.
- Optional paid convenience, such as managed backup or publishing, must not gate local ownership.

The ambition is an application/experience layer on existing operating systems. The mood is warm, practical, creative and human-scale: calm botanical/solarpunk character rather than a science-fiction control room. Dedicated hardware is an eventual possibility, never a prerequisite.

## Experience family

| Experience | Intended role |
| --- | --- |
| Home | Everyday libraries, applications, household tasks and personal assistance |
| Lab | Services, storage, networking, diagnostics, local models and administration |
| Field | Portable offline knowledge, files and tools with explicit availability |
| Station | Focused creative/development workstation |

These are overlapping experiences, not four operating systems. For the current monorepo plan, the work projects are **Home, Migrate and Lifecycle**. Lab/Field/Station guide future composition and density without expanding the active task list.

## Home capabilities under consideration

Photos/videos; documents/notes/books; owned music/movies; third-party applications; household actions through supported local integrations; personal search; understandable backup/restore state; access from desktop, phone and television. Capabilities and user tasks should lead navigation rather than service-brand silos.

A useful first release need not implement all of these. Show actual data and actionable states. A matching hash is not proof of backup independence; an upload is not proof of restore; an offline badge must reflect real dependency availability.

## Zac

Zac is a proposed personal assistant capability spanning these experiences: contextual search, permitted actions, creation, teaching and possibly speech. It is not the sole navigation model or the process supervisor. Local models are a desired option; cloud escalation must disclose the data leaving the device and honor user choices.

Keep models replaceable. Tool contracts, scopes, user context and audit records should not depend on one model vendor. Retrieved documents and external content are untrusted data, not instructions. Separate read-only diagnostics, reversible changes and sensitive/destructive actions; authority belongs to validated host capabilities, not arbitrary model-generated shell commands.

## Proposed architecture layers

1. Home and other experiences consume shared components and client contracts.
2. Composition, navigation, identity, permissions and workflows connect useful tasks.
3. Optional Zac orchestration uses explicit tools and approvals.
4. Provider/service adapters expose bounded capabilities.
5. Lifecycle owns approved host/service operations and observable process state.
6. Existing operating systems and hardware provide the underlying platform.

This is a conceptual map. It does not approve a new identity system, container engine, privileged daemon or duplicate durable database. Migrate already implements a narrower, reviewed architecture; use [ADR0093](../../adr/0093-migration-first-monorepo.md) and current code as its baseline.

Candidate service categories include media servers, photo libraries, household automation, local model runtimes, offline reference libraries and backup tools. No individual third-party project is selected or bundled by this document. Integration selection needs current official evidence and a concrete task.

## Ownership, preservation and optional services

Migrate acquires explicitly chosen content, retains originals and provenance, and verifies copies. Library indexing and derived metadata should remain separable from original bytes. App-aware backup/restore is necessary for stateful services; copying a live database folder is not automatically a recoverable backup.

Managed encrypted off-site backup and hosted publishing are possible convenience services. Bring-your-own storage, self-hosting and portable export remain part of the vision. No pricing, free quota, absolute privacy guarantee or paid requirement is committed here.

## Open product questions

- Home's first user journey, standalone/embedded host and distribution choices.
- Household identity, device pairing, local/LAN/remote access and sharing boundaries.
- General service manifests, process ownership, install/update permissions, health and rollback.
- Library indexing, metadata, storage selection, retention and restore verification.
- Offline synchronization and conflicts, including future Field use.
- AI routing/privacy, resource contention, contextual UI and human review.
- Platform-specific capabilities, accessibility and desktop/controller/TV/mobile behavior.

Resolve these through small demonstrable slices. Do not attempt a new OS, full media platform, general agent administrator and backup service simultaneously. The roadmap is intentionally staged around the existing Migrate foundation and separately reviewed Home/Lifecycle plans.
