# Gyro — persona prototype

Three simple gyroscope rings exploring how color, motion, shape and sound communicate an AI persona's state. This is a standalone prototype in the Crux Garden monorepo, not a live AI integration.

Public demo: [Gyro](https://crux-garden-gyro.thesantiagodog.chatgpt.site). Anyone with the link can open it; no sign-in required.

From the monorepo root, using `.nvmrc` and after `npm ci`:

```sh
npm run gyro
```

Open http://127.0.0.1:4190. `npm run build:gyro` produces `apps/gyro/dist`; root `npm run verify` includes its typecheck/build.

## State and style

| State | Default signal | Ambient pad |
| --- | --- | --- |
| Idle | Blue, slow, compact | Blue hour |
| Listening | Green, open, steady | Open canopy |
| Thinking | Purple, faster rotation | Violet currents |
| Speaking | Gold, rhythmic pulse | Golden warmth |
| Delighted | Solid color cycling, expansive | Prismatic bloom |
| Uncertain | Amber, slow, hesitant | Amber dusk |
| Error / danger | Red, measured pulse | Low ember |

The large main view stays visible beside a separately scrolling control panel. Its seven sections collapse independently: Soundscape, Explore its state, Playback, Visual style, state settings, Ring shading & global effects, and Mood & materials. On narrow screens the panel stacks below the main view.

Select a state directly or play a scripted interaction. Each state independently owns its color, movement speed, ring size, glow strength, glow spread, electrical flow, pulse, whole-ring color cycling and RGB split. Inner/Middle/Outer ring speed multipliers independently control each ring’s motion; Movement speed scales the whole state. All presets move every ring at different rates. Each ring accumulates its own rotation phase, so changing a rate does not jump its orientation. Reset restores only the selected state's defaults. Changes remain in memory until exported.

Four visual styles use the same states: **Glow** (LED rings), **Metal** (satin reflections), **Flat** (orthographic, unlit 2D graphic) and **Cartoon** (thicker rings, outlines and stepped shading). The three rings have deeper/base/lighter shades of the same state color; customize those factors under Ring shading & global effects. Shading changes color intensity, not alpha.

All styles and states start in the same head-on orientation: three concentric circular rings and a centered orthographic camera. State changes smoothly return the rings and camera to this common pose before rotation and effect phases restart. Rapid changes retarget the currently displayed pose. Return duration uses shared Slow motion duration and Motion scale tokens. The automatic motion uses opposing horizontal/vertical axes without bobbing or diagonal tilt. Drag to orbit, scroll/pinch to zoom and reset the view; Reset view also resets the animation phase to the shared head-on pose. Flat disables camera orbit to preserve its 2D presentation. Pause freezes a return in progress until resumed. Reduced motion and zero Motion scale apply the destination pose immediately without animated travel. The OS reduced-motion preference is honored initially and on change. Glow spread ranges from a tight halo to a broad diffuse glow; Electrical flow adds a smooth traveling brightness envelope while keeping each ring one color. Both effects pause with motion and are saved per state. Glow controls apply to Glow style; other styles express states through color, motion and size.

## Sound

Soundscape is open at the top of the control panel and **sound is enabled by default**. Playback starts on the first click, tap or keypress to satisfy browser autoplay rules. Mute is available immediately, including before playback starts, and stays muted through later interactions; Enable sound starts it again. Button sounds, transition sounds and ambient pads are independently switchable with a shared volume control. Choose **Warm**, **Airy**, **Analog** or **Deep** to change the pad texture/register. Each state has a distinct harmonic/timbral pad; state changes crossfade pad banks and retire the old voices. Short cues distinguish arrivals, thought, delight, uncertainty and error; ordinary buttons use a gentle tick. Hidden tabs fade to silence. Mute closes the AudioContext. Visual pause does not mute audio.

Sound is synthesized locally with Web Audio. No downloaded samples, AI generation, microphone, inference or external audio services are used. Sound settings are memory-only and are not part of a Mood export.

## Moods and implementation

Appearance uses shared Garden tokens, including semantic `persona<State><Property>` values, visual style and ring-shade factors. Export/import under Mood & materials preserves all visual states and style. The raw JSON editor exposes every token. This prototype export is not a production Mood archive with font assets.

Three.js 0.187.0 renders every style through **WebGL 2**, including the orthographic Flat style. No WebGPU or physics simulation claim. No runtime CDN or external assets. Color cycling gives each whole ring a single solid color that smoothly fades through a cycle; there is no spatial rainbow surface shader. RGB split and film grain affect only the canvas; interface text stays sharp.

- `src/scene.ts`: rendering, state interpolation, style switching, lifecycle/cleanup.
- `src/states.ts`: persona copy and experimental choreography.
- `src/glow.ts`: optional smooth electrical brightness flow.
- `src/optics.ts`: optional canvas-only lens effects.
- `src/sound.ts`: original state pads, transitions and UI sounds.
- `src/main.tsx`, `src/mood.ts`: controls and shared token editing/export/import.
- Shared `packages/garden-ui/src/lib/moods/persona-tokens.ts`: default state appearance values.

Development presentation contexts: `?variant=observatory`, `?variant=conversation`, `?variant=companion`. The bottom switcher and arrow shortcuts outside controls are development-only. Context is independent of visual style. Delete or absorb exploratory contexts after review.

[Project scope](../../docs/projects/gyro/README.md) · [Task handoff](../../docs/handoffs/gyro-poc.md) · [Three.js renderer reference](https://threejs.org/docs/)
