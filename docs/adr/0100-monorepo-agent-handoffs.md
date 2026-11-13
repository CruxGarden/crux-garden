# ADR 0100 — Shared project context and agent handoffs in the monorepo

Accepted November 12, 2026: the user requested Git-backed cross-machine handoffs, chose the monorepo as their home, limited shared clones to this repository, and named Home, Migrate and Lifecycle as the projects.

Keep portable agent instructions, project plans, relevant architecture decisions, task handoffs and curated visual references in `CruxGarden/crux-garden` alongside source. The existing parent workspace and older repositories stay intact; copying their entire history or requiring sibling clones would defeat a standalone checkout. The pinned local API archive already lives in this repository.

`AGENTS.md` is the common instruction entry; `CLAUDE.md` points to it. `NEXT-AGENT-HANDOFF.md` is a short current-state index; `ROADMAP.md` indexes the three project plans and priorities. Per-task files under `docs/handoffs` track ownership, code availability, exact checks, remaining work and authorization. Commit a task handoff with its code, and send the resulting SHA in the transfer message. A documentation-only checkpoint must explicitly identify missing local-only source.

Each machine has independent clones/worktrees and native dependencies. Git transfers source and Markdown; do not sync active repositories/runtime databases through generic folder synchronization. One writer owns a task branch at a time. Different active tasks use separate branches/worktrees. Sender stops before transfer, receiver verifies the exact checkpoint and acknowledges ownership; Git push rejection is not overridden with force. The ownership record is a human/agent coordination convention, not a distributed lease service.

Preserve platform-specific evidence: macOS checks do not qualify Omarchy, and synthetic exports do not qualify real accounts. Keep credentials, private machine inventories, transcripts, generated binaries and personal data outside Git. Ignore rules do not replace staged-content review.

Project names define planning boundaries, not a mandatory deployment topology. Migrate remains the implemented standalone tool; Home is planned experience/composition; Lifecycle is the proposed host/service boundary informed by the narrower existing Migrate lifecycle. This decision authorizes documentation organization, not restarting paused development, installing services, merging main or publishing a release.
