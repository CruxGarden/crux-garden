# Crux Garden Home — Comprehensive Vision & Agent Handoff

**Status:** Product vision / planning document, not a claim of implemented functionality  
**Updated:** November 12, 2026  
**Project:** Crux Garden (`crux.garden`)  
**Positioning:** **Make computing your own.**  
**Supporting line:** *Create what you imagine. Keep what you value. Share what you love.*

> **Instructions for a new agent:** This is a synthesis of discussions, not an implementation specification or verified repository audit. Preserve the product principles and user decisions below. Distinguish current Crux Garden capabilities from proposals. Before implementing anything, inspect the actual `/app` and `/api` repositories, ask for current priorities, and confirm OS, integration, and security constraints.

## 1. Executive vision

Crux Garden began as a free/open-source, AI-powered application builder with customizable interfaces, structured knowledge, collaboration, and social discovery. Its expanded vision is a **local-first personal computing environment**: a cohesive, welcoming interface for the applications, files, media, knowledge, devices, services, and AI that people own and operate on their own computers.

The ambition is not to invent a new kernel or replace Linux, Windows, or macOS. It is to build an **application and experience layer** on established operating systems and open-source services, removing the needless fragmentation and administrative complexity of personal computing without hiding the underlying system from people who want control.

The emotional promise: **your digital life can have a home that belongs to you, feels like you, and continues to work without mandatory dependence on distant services.**

The philosophical roots are local-first computing, ownership, repairability, interoperability, open source, creativity, and an optimistic, human-scale **solarpunk ethos**—not an anti-technology or survivalist aesthetic.

## 2. Non-negotiable product principles

1. **Free and open source.** The core system and local use must not require a subscription.
2. **Local-first, user-owned data.** Store and process data on user-controlled hardware by default. Cloud use is optional and explicit.
3. **No artificial lock-in.** Favor open formats, documented APIs, portable data, export and restore, and replaceable components.
4. **Human agency and creativity.** People should be able to build, alter, combine, and share tools, not merely consume prebuilt apps.
5. **Approachable without being simplistic.** Progressive disclosure: easy everyday workflows, with advanced controls available when desired.
6. **Composable architecture.** Reusable UI primitives, capabilities, manifests, services, and workflows should be able to work together.
7. **AI is a capability, not the product's sole identity.** It assists with creation, discovery, administration, and coordination, but conventional UI remains first-class.
8. **Permissioned, observable automation.** Agentic operations need scopes, approvals, logs, reversibility, and clear responsibility boundaries.
9. **Cross-device and eventually cross-platform.** Desktop, phone, television, and remote clients should access a coherent personal environment; do not assume identical OS-level features everywhere.
10. **Sustainable monetization through optional convenience.** Managed encrypted off-site backup and hosted website/application publishing are plausible paid services; neither may be required to use the local software.

## 3. Product family and naming

The names have evolved from **ZACOS**, **ZACOS Base/Hub**, and later **Garden**, toward the more unified **Crux Garden** family. Treat naming as **working**, not locked. **Zac** is the assistant/agent identity; **Crux Garden** is the broader software/platform identity.

The proposed experiences are **overlapping profiles**, not necessarily four separate operating systems:

| Profile | Purpose | Typical setting |
|---|---|---|
| **Crux Garden Home** | Everyday personal digital life: media, photos, files, household, apps, personal AI | Living room, family devices, phone |
| **Crux Garden Lab** | Self-hosting, local AI, storage, networking, services, containers, diagnostics | Home server / homelab |
| **Crux Garden Field** | Portable, offline-first, resilient knowledge and tools | Laptop, cabin, travel, off-grid use |
| **Crux Garden Station** | Creative and development workstation, gaming, design, coding, production | Desktop/workstation |

These share a common platform, account/identity model, visual language, capabilities, and data conventions. A single machine can simultaneously serve as Home + Lab + Station. Field might be a portable deployment/synchronization profile rather than a separate product.

**Future hardware** is possible: a small, understated, serviceable home computer; portable/off-grid machines; and DIY microphones, speakers, displays, and sensors. Hardware is aspirational and must not become a prerequisite for the software.

## 4. The existing Crux Garden foundation

The existing project is an AI-powered application builder, not merely a knowledge wiki or a speculative concept. Known themes from previous development discussions:

- **Composable applications** built from structured entities and configurable interfaces.
- **Cruxes, dimensions, paths, markers, tags, themes** as part of its knowledge/application model; some schema details may have evolved.
- **Collaboration, hierarchical organization, team chat**, and an application-building workspace.
- **Explore/social discovery** to share and discover other people's creations.
- **Themes and customization**, with a strong emphasis on making handmade, expressive software.
- **AI-assisted creation** while the human directs architecture, purpose, and UX.
- Frontend and API repositories historically referred to as `/app` and `/api`.

**Do not assume every bullet above is currently implemented in the latest branch.** Verify against the repositories. The strategic idea is to use Crux Garden as the **runtime and interface/composition foundation** for Home and related experiences—not create an unrelated dashboard with the same branding.

**Toadstool – Animation Workshop**, a creative stop-motion/animation application, is a separate envisioned product that illustrates how expressive, specialized tools could be built on the platform.

## 5. Home: everyday personal computing

Home is the friendly, nontechnical front door to a person's digital life. It should feel like an intentional personal environment, not a collection of admin panels.

### Desired experiences

- **Personal media:** Movies, television, music, and owned media libraries; couch-friendly playback and browsing.
- **Photos and videos:** Import, browse, organize, search, and preserve personal archives.
- **Documents and knowledge:** Local documents, notes, books, reference collections, and search across them.
- **Household controls:** Lighting, thermostat, scenes, devices, routines, and sensor state through local home automation.
- **Applications:** Launch and use Crux Garden creations and integrated third-party applications.
- **AI assistance:** Converse with Zac, ask questions about personal information, issue permitted commands, and request dynamically composed views.
- **Backup and health:** Understand what is protected, what needs attention, and whether restore is possible.
- **Multi-device access:** TV/couch, desktop, phone, and laptop as interfaces to the same home system.

Home should favor **capabilities and tasks over brand silos**. A user asks to watch a movie, find a photo, or print a document rather than having to know which container/service owns the function.

### UX character

- Warm, thoughtful, restrained, polished, responsive; not cyberpunk or a sci-fi command center.
- Human-scale solarpunk sensibility: natural materials and calm atmosphere in brand imagery, modern utility in UI.
- Easy navigation from a sofa with a controller or remote; also efficient with mouse and keyboard.
- Information-dense where useful, but progressively disclosed.
- Themeable and customizable within coherent design guardrails.
- Tactile, lively microinteractions that make the interface feel like a tool one can master.
- Accessibility, readable typography at TV distance, and responsive layouts.

## 6. Lab: the system beneath the experience

Lab exposes the infrastructure that powers Home while making routine administration understandable.

Potential areas:

- Host status: CPU/GPU, temperatures, RAM/VRAM, disks, network, power, logs.
- Storage: volumes, folders, capacity, permissions, mounts, backup targets, integrity checks.
- Services and containers: install, configure, start, stop, update, health, dependencies, logs.
- Local AI: model catalog, downloads, VRAM allocation, context settings, performance, routing, active workloads.
- Networking: local addresses, remote access, service discovery, certificates, and authentication.
- Automation: scheduled tasks, workflows, smart-home routines, and agent jobs.
- Maintenance: update plans, snapshots, rollback, restore tests, alerts, diagnostics.
- Permissions: which users, apps, and agents can access which resources or actions.

**Key design challenge:** provide a safe, simple path for a nontechnical user without pretending that Linux administration is trivial. Some operations will need explicit approvals and recovery mechanisms.

## 7. Zac: the personal agent

**Zac** is envisioned as an always-available, personal AI interface spanning Home, Lab, Station, Field, and mobile clients.

### Possible capabilities

- Natural conversation and teaching, with local personal context.
- Local search and retrieval over documents, photos, notes, and media metadata.
- Voice input/output using locally hosted speech components when practical.
- Household actions through Home Assistant or equivalent service APIs.
- UI composition: show relevant data, open a specific application/page, or assemble task-specific views from Crux Garden primitives.
- System diagnostics and guided administration, initially with human approval.
- Coding and creative collaboration.
- Local workflows that function offline when their dependencies are available.

### Model strategy

**Local by default, frontier cloud by choice/necessity.** A local model can handle conversational, retrieval, media, and routine automation tasks. Frontier cloud models remain valuable for difficult coding, complex reasoning, and risky system troubleshooting. Cloud escalation should disclose when private data will leave the device and honor user permissions.

The model should be **replaceable infrastructure**. Keep prompts, memories, tools, permissions, data indexes, and application capabilities outside any single provider's proprietary format.

### Critical security model

- Tool capabilities must be explicit, typed, scoped, and independently permissioned.
- Separate read-only diagnostics from reversible configuration changes and dangerous privileged actions.
- Require confirmation for destructive, security-sensitive, network-exposing, or boot/storage operations.
- Preserve audit trails, rollback paths, dry-run/preview modes, and post-action verification.
- Treat retrieved documents, web pages, and tool output as untrusted input; defend against prompt injection.
- Do not give an unattended general-purpose agent unrestricted root access.

## 8. Architecture: suggested layers (not yet an approved implementation)

```text
Clients / Experiences
  Home (TV/web/mobile) | Lab | Station | Field | Crux Garden apps
                           |
Application & Composition Layer
  UI primitives | Themes | Navigation | Search | Records | Views
  Identity | Permissions | Notifications | Workflows | Discovery
                           |
Zac / Agent Layer
  Model router | Context/RAG | Tool registry | Approvals | Audit
                           |
Capability / Integration Layer
  Media | Photos | Documents | Home automation | AI | Games
  Storage | Backup | Publishing | Printing | Networking
                           |
Host & Service Management
  Host agent | Container/service adapters | Health | Updates
  Snapshots | Rollback | Local API | Authentication
                           |
Existing OS and Hardware
  Linux / Windows / macOS as feasible; GPU, disks, network, devices
```

The **Host Agent** is a proposed local system component with narrowly scoped privileged operations, distinct from the conversational model. It would expose structured actions rather than arbitrary shell access, and be responsible for lifecycle management, host diagnostics, secure configuration, and rollback support.

Third-party software should be integrated through **adapters/manifests** describing install prerequisites, ports, storage, identity, health checks, updates, and backup/restore behavior. Prefer established projects to reinventing every service.

**Example candidate integrations (not confirmed bundled):** Jellyfin/Kodi (media), Immich (photos), Home Assistant (smart home), Ollama/llama.cpp (AI), Kiwix (offline encyclopedia), Kavita/Calibre-Web (books), Steam/Proton/RetroArch (gaming), and restic-like backup tools. The product should remain useful if any one integration is swapped out.

### Data and service boundaries

- Preserve original files and their provenance during import.
- Keep user data distinct from app runtime/configuration data.
- Design for import/export and migrations between machines.
- Prefer app-aware backup hooks for databases and stateful services; file copies alone may not be sufficient.
- Ensure encrypted backups are restorable; test restoration rather than treating successful upload as proof.
- Define how local identity, LAN access, remote access, and household sharing differ.

## 9. Migration: the bridge away from cloud dependence

**Crux Garden Migration** is a proposed standalone, free/open-source tool and a first-class part of the broader vision. It helps people move data from cloud platforms into a user-owned archive.

The proposed maturity ladder:

1. **Catalog:** Identify services and what data they hold.
2. **Guides:** Clear manual export instructions for each provider.
3. **Assisted import:** Accept exported ZIPs/folders, normalize or index metadata, and verify integrity.
4. **Connected acquisition:** Where supported and authorized, fetch data through official APIs or integrations.
5. **Continuous updates:** Incremental sync or repeatable exports where feasible.

A broad catalog of roughly **29 services** was discussed as an initial guide-oriented scope, not 29 complete automated integrations.

### Migration safety rules

- **Copy first, verify second, never delete originals automatically.**
- Preserve original export files and provenance.
- Use checksums (e.g. SHA-256), exception reports, and deterministic import manifests.
- Test with synthetic fixtures before using valuable personal data.
- Distinguish researched export guides from validated, currently working workflows.
- Design cross-platform handling and clear failure/retry behavior.
- Offer dry runs and an explicit review before any irreversible action.

The recommended first engineering slice was **local folder + ZIP import with verification**, not a large web-scraping or OAuth integration effort.

## 10. Backup and publishing: optional services and business model

The software itself remains **free and open source**. Potential revenue comes from reducing friction around optional external services:

### Managed encrypted off-site backup

- Convenient scheduled, encrypted backups of user-selected data and application state.
- Clear restore workflows and periodic integrity/restore tests.
- Possible free starter tier (e.g., ~1GB) and paid larger capacities—**idea only, not committed pricing**.
- **Bring-your-own storage remains free** where supported; no requirement to use Crux Garden's paid storage.
- Avoid unverifiable claims such as absolute privacy, zero loss, or magical recovery.

### Hosted publishing

- Publish selected Crux Garden websites/applications to `crux.garden` or custom domains.
- Keep private data and public content strictly separated.
- Publishing is a convenience service, not a gate on local app creation or use.

### Sustainability principle

The project succeeds commercially by making useful things easier, **not by making self-hosted functionality artificially difficult or subscription-locked**.

## 11. Field: resilient, portable computing

Field explores a self-contained, offline-first personal environment for a laptop or portable machine:

- Offline reference libraries (e.g., Kiwix), personal documents, maps, notes, and media.
- Local AI where hardware permits.
- Synchronization with Home when a connection becomes available.
- Explicit indicators of which data and functions work offline.
- Portable, power-aware, repairable deployment choices.

This is **resilience and freedom**, not a doomsday or militaristic product. Hardware, battery/solar configurations, and synchronization mechanisms remain research topics.

## 12. Station: workstation and creative computing

Station is the focused desktop experience for:

- Design and application building in Crux Garden.
- AI-assisted coding, architecture, UX, and product work.
- Creative tools, including possible Toadstool integration.
- Media creation and playback.
- PC gaming and emulation.
- A denser, keyboard/mouse-optimized interface, with couch mode where applicable.

The user's development philosophy is especially relevant: AI can write code, but the human remains the architect, designer, editor, and author of the experience. Crux Garden should support that workflow rather than reduce creation to a one-shot prompt.

## 13. Real-world proving ground: the PowerSpec G915

The current machine is a practical prototype host, **not a required target specification**:

- PowerSpec G915: AMD Ryzen 9 9900X3D, NVIDIA RTX 5080 16GB, 64GB DDR5, 2TB SSD.
- Dual boot: Windows 11 and Omarchy Linux (Arch-based, Hyprland).
- LG E9 55-inch 4K OLED, couch-first HDMI use; MacBook Pro for remote development/admin.
- Working: Omarchy, NVIDIA acceleration, 4K ~120Hz, Steam/Proton, Crimson Desert, wired DualSense audio (per previous setup notes).
- Outstanding at last report: SDR color oversaturation, game HDR unavailable, Bluetooth DualSense reliability not yet established, further service/AI setup.
- A cloud frontier coding/admin agent has been connected via Omarchy's agent tool according to a later user report; do not assume exact agent, credentials, or permissions.

The user is considering replacing the RTX 5080 with an **AMD Radeon AI PRO R9700 32GB** to run larger local models, but physical/PSU compatibility, ROCm on Omarchy, gaming tradeoffs, and performance remain to be validated. **No GPU replacement decision is final.**

This system exposes the UX problems Crux Garden Home should eventually solve: display setup, GPU drivers, Bluetooth, audio routing, game launch, media service setup, backups, model management, and reliable remote administration.

## 14. Important design tensions and unresolved decisions

These are **open questions**, not settled requirements:

1. **Product packaging:** Web app, native shell, kiosk/TV UI, desktop companion, or some combination?
2. **Host agent:** Implementation language, privilege separation, OS support, service model, and recovery behavior.
3. **Application runtime:** How existing Crux Garden apps compose with third-party service views and native applications.
4. **Identity:** Household accounts, device pairing, local-only auth, remote access, and sharing.
5. **Sync:** Home-to-Field synchronization, conflict resolution, encryption, and offline edits.
6. **AI routing:** Local model selection, GPU contention, privacy-aware cloud escalation, and cost controls.
7. **Service lifecycle:** Container engine, manifest schema, dependency orchestration, update pinning, health checks, rollback.
8. **Storage:** Library indexing, original-file preservation, metadata, permissions, backup and restore.
9. **Gaming/media:** TV HDR, VRR, controllers, streaming DRM limitations, and switching between game and AI GPU workloads.
10. **Hardware:** Whether future dedicated small servers or peripherals make sense; do not require branded hardware.
11. **Naming:** Whether ZACOS survives as a subsystem/legacy label or the entire offering uses Crux Garden names.
12. **Scope:** How to avoid attempting a new operating system, media platform, app builder, AI agent, and backup provider all at once.

## 15. Suggested phased execution (proposal, not a committed roadmap)

### Phase 0 — Audit and product boundaries

- Inspect `/app` and `/api`; map what already exists and is reusable.
- Document current user journeys, components, service interfaces, and gaps.
- Decide the first Home persona and the smallest end-to-end demonstration.
- Establish permission, backup, and host integration boundaries early.

### Phase 1 — Credible Home vertical slice

- A polished Home UI with a small set of real integrations.
- Personal library search and one media/photo/document workflow.
- Basic host health and a read-only Lab view.
- Zac answering questions with tools under explicit permission scopes.
- Reliable onboarding and recovery on the G915.

### Phase 2 — Manageable local services

- Service manifests/adapters, installation, health, configuration, and updates.
- User-visible backup state, tested restore path, and clear errors.
- Mobile/couch/desktop experience refinement.
- More robust local model serving and routing.

### Phase 3 — Migration and publishing ecosystem

- Ship the safe local folder/ZIP migration slice, expand guides and validated adapters.
- Optional encrypted off-site backup and selected-app publishing.
- Discovery and sharing that connects existing Crux Garden creativity to Home.

### Phase 4 — Broader profiles

- Expand Lab and Station, experiment with Field/offline sync.
- Evaluate dedicated hardware only after software proves useful on existing machines.

## 16. What success would look like

A person can install Crux Garden on hardware they own, bring their data home, create or install useful applications, find their media and documents, operate local services, and ask Zac for help—**without needing to become a Linux administrator or buy a subscription**.

An advanced user can inspect and customize everything underneath. An everyday user can ignore the machinery most of the time. Both retain meaningful control over their data and tools.

## 17. Explicit guidance for the next agent

**Do:**

- Treat this document as product context, not proof of implementation.
- Preserve local-first, open-source, portable, subscription-optional constraints.
- Reuse the existing Crux Garden app builder rather than proposing an unrelated rewrite.
- Separate product UX, application runtime, host agent, service adapters, and AI orchestration.
- Present tradeoffs and test them on real hardware.
- Define small, verifiable vertical slices and measurable acceptance criteria.
- Distinguish concept, prototype, implemented, and verified capabilities.

**Do not:**

- Claim Home, Lab, Field, Station, managed backup, or hardware are already shipping.
- Propose mandatory cloud accounts or paid subscriptions for local use.
- Assume unrestricted root-level AI administration is acceptable.
- Promise all services can be installed with one click or that all offline features work universally.
- Delete, move, or transform original personal archives without explicit approval and verification.
- Prioritize novelty over reliability, recoverability, and actual user experience.

### Suggested first assignment

> Inspect the existing Crux Garden application and API repositories. Produce a verified architecture map and capability inventory. Compare what is implemented today against the Home/Lab/Field/Station vision in this brief. Recommend the smallest useful Crux Garden Home vertical slice that reuses existing primitives, includes one real local service integration and a safe Zac tool workflow, and can be demonstrated on the PowerSpec G915. Explicitly label assumptions, security risks, dependencies, and unverified claims. Do not modify the system or repositories until the plan is reviewed.

---

**Enduring product thesis:** *Crux Garden is not merely a dashboard for self-hosted services or a chatbot attached to Linux. It is a creative, local-first computing environment that lets people own their data, shape their tools, and make computing their own.*
