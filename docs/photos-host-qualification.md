# Photos host connection and native permission qualification

Reviewed November 10, 2026. The fixture-backed host/UI contract is implemented. **Production Photos access is still disabled and native permission attribution is not qualified.** No Photos status, permission prompt, library inventory or download was requested from the user's library during this work.

## What the package inspection establishes

Static inspection of the current macOS preview finds:

| Check | Observed |
| --- | --- |
| Bundle identifier | `garden.crux.migration.tauri-preview` |
| Executable | `crux-garden-migration-preview` |
| Minimum macOS | 13.0 |
| `NSPhotoLibraryUsageDescription` | Absent |
| `NSPhotoLibraryAddUsageDescription` | Absent |
| App and resource-helper signatures | Ad hoc, no TeamIdentifier, Info.plist not bound, no sealed resources |
| Production host Photos action/factory | Not installed |
| Native helper permission request operation | Not implemented |

`plistlib` and `codesign -d --verbose=2` supplied this evidence; neither queries Photos. It does not establish which app a permission prompt would name or whether authorization would survive a rebuild.

Apple requires a [Photos usage description](https://developer.apple.com/documentation/bundleresources/information-property-list/nsphotolibraryusagedescription) for APIs that read or write the library. Add-only permission is not suitable for exporting existing assets. The key must be added deliberately with the final host permission design, not simply to make a readiness test open a library.

Apple's [launch-constraint documentation](https://developer.apple.com/documentation/security/applying-launch-environment-and-library-constraints) distinguishes parent and responsible processes and describes the direct app-to-helper case. Our chain is Tauri → Node → Swift. That source does **not** establish attribution for this particular chain; treating the installed app as the responsible identity is still an inference requiring native acceptance. No private responsibility APIs are used.

[Apple TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements) explains that ad-hoc code identity is tied to a particular build and cannot reliably retain privacy authorization across versions. The current unsigned preview therefore does not qualify permission persistence through an update. A correctly configured signing identity and signed package must be part of that acceptance; changing a namespace in SQLite cannot solve operating-system attribution.

Apple's [PhotoKit privacy guidance](https://developer.apple.com/documentation/photokit/delivering-an-enhanced-privacy-experience-in-your-photos-app) describes explicit authorization timing and the modern read/write access level. Migrate must explain that terminology honestly while implementing only reads. We do not call authorization or reset system privacy settings during automated readiness tests.

## Host-only connection contract

`MigrationClient.connectPhotos({ networkAllowed })` is optional. React offers the Photos choice only when its host supplies this action. No OS-name detection, client-provided feature flag or generic HTTP request can create it. Selecting the service does not invoke the action. Pressing Connect calls it once with an explicit boolean; the checkbox defaults to off and resets after a successful connection. Returning null means the host/user cancelled; denial remains a visible error with no listing.

The host owns native permission presentation and determination of the intended source. Once qualified, it will pass an explicit source binding and network choice to the engine's **in-process** `runtime.connectPhotos({ sourceBinding, networkAllowed })` method. This method is not a request command or HTTP route. `cloudConnect`, `cloudAuthorize` and a forged `connectPhotos` command cannot access the Photos factory, even in a runtime configured with that factory. Production Electron/Tauri clients and backend launchers still install neither the native action nor the factory.

The engine snapshots the intent before its serialized queue runs. The adapter also snapshots connection options. Later changes to an options object cannot silently enable network retrieval or select another source. The host should finish native permission/user-source confirmation before invoking this engine method; the method itself never grants system permission.

## Persistent source namespace

The existing API-owned SQLite settings store retains a bounded map of hashed opaque host source bindings to generated UUID namespaces. The map uses `migration:photos-bindings`, supports at most 32 bindings per profile and validates stored shape/UUIDs. Corruption fails without clearing or replacing prior state. The same binding resolves to the same namespace across restart; a different binding receives a different namespace and cannot resume an old source's job. The raw host binding is not stored. Network choice remains per connection and is not a global stored permission.

A namespace is **not** Apple account identity, a library fingerprint, an authorization token or evidence that two libraries are the same. The future native host must define a stable source-binding lifecycle: retain it only for the confirmed source, rotate it after an intentional library/source change, and avoid blindly carrying it to another Mac. Detection/confirmation of such changes is still unqualified; no private Photos database, filesystem marker or hardware identifier was added as a shortcut.

The same Node runtime remains the sole durable owner. React has no source path or namespace field. Existing saved resources retain frozen native revisions and descriptor identities; unfinished resources are rediscovered and completed copies are rehashed. See [the bridge and job contract](photokit-bridge.md).

## Fixture UI and remaining acceptance

The shared interface shows readable resource roles, nothing selected initially, separate companion-video choices, unknown sizes and ongoing destination-space checks. The embedding harness uses a separately compiled synthetic Photos helper with the real shared API/SQLite/worker. It can simulate cancelled host interaction, denied/limited authorization and successful selected downloads without touching a real library. This is a development fixture, not a production switch or permission bypass.

Before exposing production access, qualify the final native host/helper topology and signed identity, add the appropriate usage description, and test the actual named prompt in an isolated test environment or an explicitly authorized manual session. Verify denial, cancellation, limited access, resource-only selection, reconnect, app update and source-binding changes. Record exact OS and signing context. A static package check cannot substitute for this acceptance. Manual native-window acceptance also remains pending after the earlier locked-Mac attempt.

Until those checks are possible, retain the disabled production gate and continue useful independent provider work. Existing local downloaded-file/Photos export preservation remains available. Do not repeatedly request account setup or inspect the user's library merely to prove readiness.
