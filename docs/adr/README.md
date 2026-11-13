# Architecture decisions

ADRs 0093–0099 were brought into this monorepo from the existing workspace on November 12, 2026; their original numbering and chronology are retained, with repository path references normalized. These monorepo copies are maintained here for Home/Migrate/Lifecycle work. Other historical ADR numbers refer to the older projects and are not checkout prerequisites.

Historical sequencing paragraphs are not current feature inventories. Read the latest project page, task handoff and code for implementation status. In particular, ADR0095's local-comparison extension is a design with paused local implementation, not a shipped connector.

- [0093 — Migrate-first staged monorepo](0093-migration-first-monorepo.md)
- [0094 — Shared-file downloads](0094-migrate-shared-file-downloads.md)
- [0095 — Collections and content inventory](0095-migrate-collections-and-content-inventory.md)
- [0096 — Selected export parts and files](0096-migrate-multiple-export-parts.md)
- [0097 — Account authorization and Dropbox/Gmail](0097-migrate-account-oauth-and-dropbox.md)
- [0098 — Derived photo/mail/social metadata](0098-migrate-derived-photo-metadata.md)
- [0099 — PhotoKit bridge](0099-migrate-photokit-bridge.md)
- [0100 — Monorepo agent handoffs](0100-monorepo-agent-handoffs.md)

Home architecture and the proposed general Lifecycle host component still require their own scoped decisions; the vision diagrams do not silently approve new privileged services or database owners.
