# Gyro — interactive persona study

Updated: November 28, 2026
Status: complete (local prototype checkpoint; production integration is not included)
Owner: MacBook / Codex; receiver unassigned
Branch: `codex/gyro-poc`
Base: `dcca939ec8023dc18b14f5fe56ef1d1999aacb54`
Code availability: included in this local checkpoint commit; not pushed, merged or released.

## TL;DR

Run `npm run gyro`, open http://127.0.0.1:4190. The preview was left running. Gyro is three simple rings with seven editable states, four visual styles, per-ring shading and optional UI/state audio with four ambient pad choices. Each state now has its own editable starting pose with smooth arrival before its animation restarts. Full setup/controls: [app README](../../apps/gyro/README.md). Scope: [project](../projects/gyro/README.md).

## Current user-approved direction

- Keep only **three simple circular rings**. The user removed the earlier central core, cage/lattice, engravings, bearings, halo geometry and particle field. Do not restore those from earlier notes.
- **Latest framing correction:** all styles use a centered head-on orthographic camera. Idle starts as concentric circles; other states have editable inner/middle/outer starting angles. Motion uses common horizontal/vertical axes with mirrored rotations, without bobbing/diagonal tilt. Every state change smoothly returns the rings and camera to the destination starting pose, then starts rotation/effects from phase zero. Rapid changes capture the currently rendered pose. Pause freezes returns; reduced motion/zero Motion scale use immediate static poses. Return duration comes from the shared Slow motion duration and Motion scale tokens. Reset view resets camera/zoom and the selected state’s phase; Preview starting pose additionally pauses for editing. Manual orbit can leave the default head-on view.
- **Glow** LED rings are the default; **Metal**, **Flat** and **Cartoon** provide genuinely different lighting/thickness/outline treatments. Flat is an orthographic, unlit 2D-looking WebGL render and disables camera orbit. All styles use WebGL 2, not WebGPU.
- State presets: blue Idle, green Listening, purple Thinking, gold Speaking, color-cycling Delighted, amber Uncertain and red Error/danger. Each state independently edits color, speed, ring size, glow strength/spread, electrical flow, pulse, color cycling and RGB split. Three rings use deeper/base/lighter shades, adjustable globally. States interpolate smoothly; labels/poses supplement color.
- **Glow controls:** per-state Glow spread maps tight→diffuse through bloom radius/strength. Optional Electrical flow moves a smooth brightness envelope around each ring without changing its uniform color. Both respect pause/reduced motion and persist in Mood JSON.
- **Latest iridescence correction:** each whole ring has one solid color and fades between colors, with the three cycles phase-offset. There is no spatial rainbow/Plasma/physical thin-film shader on a ring. `persona<State>Iridescence` is the existing prototype token for the UI's Color cycling control; it now blends toward a uniform per-ring color. Color cycling advances independently of rotation speed. Pause/reduced motion freeze it.
- Optional sound starts only after **Enable sound**. Button ticks, transition cues and ambient pads have independent toggles. Each state has its own chord/timbre and named pad; **Warm, Airy, Analog, Deep** change texture/register without losing state harmony. Pad banks crossfade and retire their old voices. Mute closes the AudioContext; hidden tabs fade out. Visual pause does not mute sound. All sound is original procedural Web Audio, with no files, microphone, inference or external service.
- The user explicitly removed the top three-line intro ("A living instrument", "Intelligence, with a little soul.", "A study in presence, curiosity and quiet wonder.") and the invented concentric-circle Crux Garden brand icon. The state buttons and their heading stay. Keep branding text-only until actual brand assets are supplied or selected.

## Implementation and ownership

`apps/gyro/` owns the isolated Vite/React prototype. `src/scene.ts` owns rendering/cleanup; `src/states.ts` owns copy/choreography; `src/optics.ts` owns optional canvas-only RGB split/grain; `src/glow.ts` owns smooth electrical brightness flow; `src/sound.ts` owns pads/cues/UI sounds; `src/main.tsx` owns controls; `src/mood.ts` applies shared tokens. The rejected spatial iridescence shader and its copied license file were removed.

Shared `packages/garden-ui/src/lib/moods/persona-tokens.ts` defines semantic state defaults; `garden-dark.ts` registers those plus visual style, ring-shade factors, outline color and optional lens/grain tokens. Visual settings, including all state presets/style/shades, survive Mood JSON export/import. It is not a full production Mood archive with fonts. Audio choices are memory-only. No browser storage, native shell, account, API inference, real Garden data or new content owner.

The root package/lockfile/tsconfig register `apps/gyro`, `npm run gyro`, `build:gyro` and typecheck/build inclusion in `verify`. Project, agent and handoff indexes are updated. Development-only contexts are `?variant=observatory`, `?variant=conversation`, `?variant=companion`; they are independent of visual style. The floating context switcher is development-only.

Existing Home presentation changes were present before this task: additions in roadmap/current-state index, `docs/projects/home/design/README.md`, briefings and hardware image/provenance. They were preserved across the branch switch and must not be swept into a Gyro-only commit. Existing Migrate source and stopped tasks were not resumed.

## Verification

macOS Apple Silicon, Node 22.19.0, local working tree. Verification is automated browser/PCM evidence, not actual-device listening or production qualification.

- Full `npm run verify`: typecheck, reusable-package boundary guard, Migrate/Gyro builds and **205 engine checks, zero skips**. Final log: `/tmp/gyro-verify-poses.log`. Initial sandbox execution needed ordinary approved access to the Swift module cache/local test servers. No product source fix was needed for that environment issue.
- Chromium style/state acceptance: all **28** combinations render; seven states and four styles produce distinct images; red Error default verified. Editing seven appearance properties remains state-local. Reset is state-local. Style/state export/import reproduces exact canvas pixels. All styles fit a 390px viewport, zero page/shader errors. `/tmp/gyro-styles.json`.
- Per-ring shade acceptance: varied versus uniform shades change pixels independently in all four styles; all three factors survive export/import with exact rendered pixel match. `/tmp/gyro-shades.json`.
- Audio acceptance: no AudioContext before opt-in; seven state banks have distinct actual oscillator frequencies/timbres. Old banks retire after crossfades, leaving eight pad oscillators. Button and transition signals are independently audible in PCM; disabled layers are silent; mute closes the context. Sampled pad peak ~0.026, UI tick ~0.013, transition ~0.022, no clipping/errors. `/tmp/gyro-audio.json`.
- Four pad choices produce distinct oscillator textures, crossfade/clean up correctly and preserve independent UI/transition controls. `/tmp/gyro-pads.json`.
- Final whole-ring color/header acceptance: `/tmp/gyro-solid.json` passes: intro/icon absent, seven buttons retained, whole-ring color fading independent of rotation, exact pause/static behavior, zero page/shader errors.
- Earlier zero-angle head-on start/reset acceptance (before per-state poses): `/tmp/gyro-head-on.json`; static/moving Flat-style geometry has mean left/right differences below 0.04/255 and zero top/bottom difference; reset matches geometry pixels exactly. Exclude the correctly changing DOM state labels when comparing the canvas bounding box. `/tmp/gyro-symmetry.json`.
- Glow diffusion/flow acceptance: `/tmp/gyro-glow.json` records per-state diffusion, moving brightness with rotation/pulse stopped, exact pause and saved-setting pixel equivalence.
- State pose acceptance: `/tmp/gyro-return.json` verifies intermediate return frames, destination pose before new motion, pause/resume, rapid retargeting, reduced motion, orbit/zoom return, state-local angles, exact Mood export/import pixels and Preview starting pose. The full gate passes 205 checks with zero skips.
- Earlier interaction checks covered scripted progression, pause/resume without restarting, direct-state interruption, orbit/reset, OS reduced motion, all three presentation contexts and no horizontal overflow. One run was invalidated by formatter-triggered Vite hot reload, then rerun after writes stopped.
- Desktop Glow/Flat/Cartoon and mobile layouts were visually inspected. The in-app browser host was unavailable; tests used isolated headless Chromium, not the user's browser profile. Generated screenshots/logs remain temporary evidence.
- Existing Migrate font-path warnings and Gyro's non-failing Vite chunk-size advisory remain. No WebKit/Firefox/actual phone, Linux, GPU frame-rate benchmark, production-browser packaging or native package acceptance is claimed. Source-to-style changes are verified; subjective sound quality remains for user listening.

## Next bounded step

Review the running prototype's state legibility at distance, visual styles and sound on real speakers/headphones. Continue from the simple-ring and whole-ring-fade direction. Any model/voice/Assistant integration is separate scoped work. The checkpoint is committed locally but not pushed; another clone cannot see it until transfer is authorized. Preserve unrelated Home work when staging; do not resume unrelated roadmap tasks.
