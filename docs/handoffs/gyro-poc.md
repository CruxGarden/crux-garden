# Gyro — interactive persona study

Updated: November 28, 2026
Status: complete (local prototype checkpoint; production integration is not included)
Owner: MacBook / Codex; receiver unassigned
Branch: `codex/gyro-poc`
Base: `dcca939ec8023dc18b14f5fe56ef1d1999aacb54`
Code availability: monorepo source `8182123` remains local; standalone static demo published publicly at https://crux-garden-gyro.thesantiagodog.chatgpt.site. No monorepo push/merge or native release.

## TL;DR

Public review: [Gyro](https://crux-garden-gyro.thesantiagodog.chatgpt.site). Local development: `npm run gyro`, open http://127.0.0.1:4190. Gyro is three simple rings with seven editable states, four visual styles, per-ring shading and optional UI/state audio with four ambient pad choices. All states use the same head-on concentric starting pose, with smooth arrival before their animation restarts. Per-state angles were reverted; no tilted resting pose remains. Full setup/controls: [app README](../../apps/gyro/README.md). Scope: [project](../projects/gyro/README.md).

## Current user-approved direction

- Keep only **three simple circular rings**. The user removed the earlier central core, cage/lattice, engravings, bearings, halo geometry and particle field. Do not restore those from earlier notes.
- **Latest framing correction:** every state uses the same head-on concentric circles and centered orthographic camera. Per-state starting-angle controls/tokens were reverted at the user’s request; the proposed tilted resting pose was also rejected. State changes smoothly return to the common pose before rotation/effects restart from zero. Rapid changes retarget the currently displayed pose. Pause freezes the return; reduced motion/zero Motion scale use the static pose immediately. Return duration uses shared Slow motion duration and Motion scale tokens. Reset view restores camera/zoom and phase. Manual orbit can leave the default view.
- **Glow** LED rings are the default; **Metal**, **Flat** and **Cartoon** provide genuinely different lighting/thickness/outline treatments. Flat is an orthographic, unlit 2D-looking WebGL render and disables camera orbit. All styles use WebGL 2, not WebGPU.
- State presets: blue Idle, green Listening, purple Thinking, gold Speaking, color-cycling Delighted, amber Uncertain and red Error/danger. Each state independently edits color, overall movement speed, three ring-speed multipliers, ring size, glow strength/spread, electrical flow, pulse, color cycling and RGB split. Three rings use deeper/base/lighter shades, adjustable globally. States interpolate smoothly; labels/poses supplement color.
- **Glow controls:** per-state Glow spread maps tight→diffuse through bloom radius/strength. Optional Electrical flow moves a smooth brightness envelope around each ring without changing its uniform color. Both respect pause/reduced motion and persist in Mood JSON.
- **Latest iridescence correction:** each whole ring has one solid color and fades between colors, with the three cycles phase-offset. There is no spatial rainbow/Plasma/physical thin-film shader on a ring. `persona<State>Iridescence` is the existing prototype token for the UI's Color cycling control; it now blends toward a uniform per-ring color. Color cycling advances independently of rotation speed. Pause/reduced motion freeze it.
- **Audio placement/default correction:** Soundscape is open at the top of the scrolling control panel in all presentation contexts. The main view sits beside seven collapsible control sections on desktop; narrow screens stack the panel below. Sound is enabled by default; the first click, tap or keypress starts playback under browser autoplay rules. Mute works before or after activation and remains effective through later interactions; Enable sound explicitly restarts it. Button ticks, transition cues and ambient pads have independent toggles. Each state has its own chord/timbre and named pad; **Warm, Airy, Analog, Deep** change texture/register without losing state harmony. Pad banks crossfade and retire their old voices. Mute closes the AudioContext; hidden tabs fade out. Visual pause does not mute sound. All sound is original procedural Web Audio, with no files, microphone, inference or external service.
- The user explicitly removed the top three-line intro ("A living instrument", "Intelligence, with a little soul.", "A study in presence, curiosity and quiet wonder.") and the invented concentric-circle Crux Garden brand icon. The state buttons and their heading stay. Keep branding text-only until actual brand assets are supplied or selected.

## Implementation and ownership

`apps/gyro/` owns the isolated Vite/React prototype. `src/scene.ts` owns rendering/cleanup; `src/states.ts` owns copy/choreography; `src/optics.ts` owns optional canvas-only RGB split/grain; `src/glow.ts` owns smooth electrical brightness flow; `src/sound.ts` owns pads/cues/UI sounds; `src/main.tsx` owns controls; `src/mood.ts` applies shared tokens. The rejected spatial iridescence shader and its copied license file were removed.

Shared `packages/garden-ui/src/lib/moods/persona-tokens.ts` defines semantic state defaults; `garden-dark.ts` registers those plus visual style, ring-shade factors, outline color and optional lens/grain tokens. Visual settings, including all state presets/style/shades, survive Mood JSON export/import. It is not a full production Mood archive with fonts. Audio choices are memory-only. No browser storage, native shell, account, API inference, real Garden data or new content owner.

The root package/lockfile/tsconfig register `apps/gyro`, `npm run gyro`, `build:gyro` and typecheck/build inclusion in `verify`. Project, agent and handoff indexes are updated. Development-only contexts are `?variant=observatory`, `?variant=conversation`, `?variant=companion`; they are independent of visual style. The floating context switcher is development-only.

Existing Home presentation changes were present before this task: additions in roadmap/current-state index, `docs/projects/home/design/README.md`, briefings and hardware image/provenance. They were preserved across the branch switch and must not be swept into a Gyro-only commit. Existing Migrate source and stopped tasks were not resumed.

## Verification

macOS Apple Silicon, Node 22.19.0, local working tree. Verification is automated browser/PCM evidence, not actual-device listening or production qualification.

- Full `npm run verify`: typecheck, reusable-package boundary guard, Migrate/Gyro builds and **205 engine checks, zero skips**. Final log: `/tmp/gyro-verify-panel-motion.log`. Initial sandbox execution needed ordinary approved access to the Swift module cache/local test servers. No product source fix was needed for that environment issue.
- Chromium style/state acceptance: all **28** combinations render; seven states and four styles produce distinct images; red Error default verified. Editing seven appearance properties remains state-local. Reset is state-local. Style/state export/import reproduces exact canvas pixels. All styles fit a 390px viewport, zero page/shader errors. `/tmp/gyro-styles.json`.
- Per-ring shade acceptance: varied versus uniform shades change pixels independently in all four styles; all three factors survive export/import with exact rendered pixel match. `/tmp/gyro-shades.json`.
- Earlier audio synthesis acceptance (opt-in startup superseded below): no AudioContext before opt-in; seven state banks have distinct actual oscillator frequencies/timbres. Old banks retire after crossfades, leaving eight pad oscillators. Button and transition signals are independently audible in PCM; disabled layers are silent; mute closes the context. Sampled pad peak ~0.026, UI tick ~0.013, transition ~0.022, no clipping/errors. `/tmp/gyro-audio.json`.
- Four pad choices produce distinct oscillator textures, crossfade/clean up correctly and preserve independent UI/transition controls. `/tmp/gyro-pads.json`.
- Final whole-ring color/header acceptance: `/tmp/gyro-solid.json` passes: intro/icon absent, seven buttons retained, whole-ring color fading independent of rotation, exact pause/static behavior, zero page/shader errors.
- Earlier zero-angle head-on start/reset acceptance (before per-state poses): `/tmp/gyro-head-on.json`; static/moving Flat-style geometry has mean left/right differences below 0.04/255 and zero top/bottom difference; reset matches geometry pixels exactly. Exclude the correctly changing DOM state labels when comparing the canvas bounding box. `/tmp/gyro-symmetry.json`.
- Glow diffusion/flow acceptance: `/tmp/gyro-glow.json` records per-state diffusion, moving brightness with rotation/pulse stopped, exact pause and saved-setting pixel equivalence.
- Shared head-on return acceptance: `/tmp/gyro-restored-head-on.json` verifies all seven states have identical head-on starting orientations, removed per-state controls, intermediate return frames before new animation, pause, rapid retargeting and Reset view. Full gate passes 205 checks with zero skips. Earlier custom-pose evidence is superseded by this requested reversion.
- Earlier interaction checks covered scripted progression, pause/resume without restarting, direct-state interruption, orbit/reset, OS reduced motion, all three presentation contexts and no horizontal overflow. One run was invalidated by formatter-triggered Vite hot reload, then rerun after writes stopped.
- Desktop Glow/Flat/Cartoon and mobile layouts were visually inspected. The in-app browser host was unavailable; tests used isolated headless Chromium, not the user's browser profile. Generated screenshots/logs remain temporary evidence.
- Existing Migrate font-path warnings and Gyro's non-failing Vite chunk-size advisory remain. No WebKit/Firefox/actual phone, Linux, GPU frame-rate benchmark, production-browser packaging or native package acceptance is claimed. Source-to-style changes are verified; subjective sound quality remains for user listening.

## Next bounded step

Review the running prototype's state legibility at distance, visual styles and sound on real speakers/headphones. Continue from the simple-ring and whole-ring-fade direction. Any model/voice/Assistant integration is separate scoped work. The demo is publicly shareable; monorepo source remains local until a branch push is authorized. Preserve unrelated Home work when staging; do not resume unrelated roadmap tasks.

## Public demo publication — November 28

Daniel authorized publishing and explicitly chose anyone-with-the-link access. Sites version 1 succeeded; public URL above. No Zulip message was sent: a copyable announcement was drafted in chat.

- Site ID: `appgprj_6b0a844ab4908191bf9c1eb49532233a`; tracked manifest: `apps/gyro/.openai/hosting.json`. Reuse this Site for updates.
- Saved version: `appgprj_6b0a844ab4908191bf9c1eb49532233a~appgver_a4179306bb3881919d9e5414dc2c51d4`; deployment: `appgdep_6b0a848e76388191898cedd8d985f8c4`.
- Canonical source: monorepo `8a2d14f`; isolated static publishing commit: `f5adcd101d26e8de7c9e9935e9d592eaaac4cb5c`. Only built Gyro HTML/assets, manifest and provenance README were uploaded. No monorepo history, private data or unrelated Home files.
- Build: `npm run build:gyro` passes; source full gate remains 205 passing checks. Published anonymous Chromium smoke evidence: `/tmp/gyro-live.json` (HTTP, WebGL, seven states, styles, sound toggle).
- For updates, build `apps/gyro/dist`, obtain a fresh Sites source credential, open the existing Site through the Sites source workflow and replace its static `dist` with the new build. Preserve Site identity/public audience, push/package/save/deploy through that workflow. Local publishing checkout `.agent-local/gyro-site` is ignored scratch, not canonical source. Never run the Sites Git helper against the whole monorepo.

## Published audio update — November 28

Sites version 2 succeeded at the same public URL. Canonical source `2c574d7`; static publishing commit `4e2d244da0f14b429e1f4d5ab9f23b3c88a5dcfa`. Saved version `appgprj_6b0a844ab4908191bf9c1eb49532233a~appgver_b574881f8bfc81919c2990c299933f5f`; deployment `appgdep_6b0a8637a0c88191958d979806c62b80`.

Local Chromium checks `/tmp/gyro-audio-default.json` verify top placement on desktop/390px mobile, enabled-by-default UI, first-interaction activation with actual nonzero PCM, mute before/after startup, mute persistence through state changes, explicit re-enable, keyboard and touch activation, and no horizontal overflow. Live counterpart: `/tmp/gyro-audio-default-live.json`. Full verification gate: 205 pass, zero skips. No inference, microphone or audio recording added.

## Published sidebar and independent ring motion — November 28

Sites version 3 succeeded at the same public URL. Canonical source `8182123`; static publishing commit `f0db44ef6def2156b1b6418ba4befdcecdd213bf`. Saved version `appgprj_6b0a844ab4908191bf9c1eb49532233a~appgver_687bb005221c8191a894e65a359cea12`; deployment `appgdep_6b0a87a30a488191a01c653f4caf4e75`.

- Every state moves all three rings using distinct defaults. `persona<State>InnerSpeed`, `MiddleSpeed`, `OuterSpeed` are editable 0–2× multipliers of that state’s Movement speed. Rotation phase accumulates separately per ring; transitions/reset still restore the common head-on pose. Pause/reduced motion remain respected. Settings reset/export/import include all three rates.
- The large main view stays visible beside a separately scrolling panel. Seven independent details sections cover sound, states, playback, styles, state settings, global ring/effects and Mood. Soundscape and state buttons start expanded; others collapsed. Mobile stacks the controls below the main view.
- `/tmp/gyro-ring-speeds.json`: actual rendered angular deltas are positive and different for all three rings in every state; shared arrival pose; stopping one ring while others preserve a measured 3:1 ratio; pause; state-local editing; exact saved Mood pixel equivalence. Initial isolation test forgot to reset a previously accumulated phase after reduced motion; corrected the test setup, not product code.
- `/tmp/gyro-panel.json` and live `/tmp/gyro-panel-live.json`: desktop main/sidebar placement in all three contexts, seven collapsible sections, sound mute, state/style/rate controls, independent panel scroll and 390px layout without overflow. Screenshots visually inspected. Full gate passes 205 checks, zero skips.
