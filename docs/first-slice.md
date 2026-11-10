# Slice 1: preserve a small Dropbox export

Goal: prove one complete Migration workflow and the reusable boundaries it crosses. Dropbox is chosen as a small, ordinary-files infrastructure case, not from a verified popularity ranking.

1. Open the standalone Migration application with a fresh isolated profile.
2. Read the Dropbox export guide. Use a small folder or ZIP already downloaded through Dropbox; direct cloud downloading is outside this slice.
3. Choose a destination outside the source. Review file count and required/free space.
4. Preserve the files. Confirm their hashes and the saved report; ZIPs retain the original archive as well as extracted files.
5. Pause a larger synthetic copy, restart and resume. Verify that no completed file is duplicated or silently overwritten.
6. Close/reopen and confirm saved job state, provider checklist and Mood.
7. Connect a local integration using the service's private connection descriptor. Run the same flow without a renderer and verify its jobs are visible through the shared service.
8. Render Migration in a host that supplies its client and appearance; no Tauri global or second database should be required.

Existing ZIP/TAR and provider-guide tests remain regression coverage. This slice does not certify entire Dropbox accounts, remote completeness, Google/Apple semantics, background downloads, or production distribution.

After this infrastructure test, prioritize a modest Google Drive export, then a chosen photo service. Real personal account inventories stay in local planning records outside the repository.
