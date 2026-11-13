# ADR 0094 — Shared-file downloads before full account connectors

Accepted 2026-11-10 as the next Migrate vertical slice. Daniel requested continued work and supplied a small Dropbox file link for live validation.

Implement one Dropbox shared-file connector before account OAuth/browsing. Keep provider URL/transport policy separate from the durable transfer manager, and keep download records/states separate from preservation records. Both use the existing canonical SQLite owner. Store normalized link fingerprints, never URL/query credentials; the user supplies the same link after restart. This avoids introducing an unreviewed credential vault or requiring the user to create publicly shared data. Existing local exports remain supported.

Checkpoint synced byte offsets and prefix hashes. Range resume requires a matching strong ETag and exact response boundaries. A server without that validator offers an explicit restart; do not silently concatenate possibly different versions. The live 400,436-byte PDF succeeded but had no strong ETag. Full-account OAuth, remote-content hashes, rate-limit automation and cloud completeness remain future work. See `docs/dropbox-downloads.md` for implementation and evidence.

The React client remains injected. Native hosts own filesystem pickers; an authenticated local API exposes equivalent download actions to trusted native integrations. No renderer networking exception, arbitrary host fetch, second database owner, or production test-network override is introduced.

Clarification accepted 2026-11-10: shared-file-first is sequencing for infrastructure validation, not a preference over the best available provider method. Evaluate each provider's authenticated API, exports, shared links and local sources; recommend the strongest method for the intended data and offer useful alternatives. Resume identity is method-specific: the current strong-ETag requirement does not preclude a later revision-aware API strategy. The observed missing ETag is not evidence of absent Range support or a provider-wide limitation. See monorepo architecture's method-selection rule and Dropbox's official content-download format reference.
