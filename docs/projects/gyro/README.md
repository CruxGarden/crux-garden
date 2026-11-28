# Gyro

**Gyro** is an interactive gyroscope AI persona proof of concept for Crux Garden, authorized November 28, 2026. The current direction is **three simple rings**, with recognizable states and selectable styles. The user explicitly removed the earlier complicated core, lattice, engravings and particles; do not restore those from stale notes. They liked the simple LED rings and requested state-specific color/motion/size/effects, other visual styles, sound and per-ring shade variation.

## Current study

Can a non-humanoid persona communicate its state clearly from a distance while feeling playful? The seven presets are blue Idle, green Listening, purple Thinking, gold Speaking, whole-ring color-cycling Delighted, amber Uncertain and red Error/danger. Each has independent editable color, overall speed, three per-ring speed multipliers, size, glow strength/spread, electrical flow, pulse, color cycling and RGB split. Three rings use deeper/base/lighter shades of the same state color. All states share one head-on concentric starting pose. State changes ease back to it before the animation starts from zero; rapid selections retarget the currently displayed pose. Per-state angles were reverted at the user’s request.

Glow, Metal, Flat and Cartoon styles retain the same state vocabulary. The simple geometry remains consistent; style changes lighting, ring thickness, outline and shading. Flat is a 2D-looking orthographic WebGL rendering. WebGL 2 is the current GPU renderer; no WebGPU claim.

Optional local synthesized sound provides a separate ambient chord/timbre for each state, crossfading pads, distinct transition cues and soft button sounds. A large main view has a scrolling side panel with seven collapsible sections (stacked below on mobile). Soundscape is open at the top; sound is enabled by default and starts on the first click, tap or keypress. Mute remains effective until explicitly enabled again; the three layers can be switched separately. No microphone, model, account or external media service is connected. The latest color treatment is a solid color per ring fading smoothly over time; the spatial rainbow material was rejected. The introductory hero copy and invented brand icon were removed; state buttons stay.

[apps/gyro](../../../apps/gyro/README.md) runs via `npm run gyro`. Appearance uses shared Garden Mood tokens and visual settings can be exported/imported. State and audio otherwise live in memory. Three development presentation contexts let the same persona stand alone, accompany a conversation or sit beside work.

## Next bounded review

Review state legibility from a distance, the four visual styles and sound levels on actual speakers/headphones. Choose the motion/material direction before connecting real model events. Device/GPU performance, actual mobile browsers, production packaging and real Assistant/voice integration remain future scoped work.

Gyro is the project name; Assistant remains the personal-agent name. There is no new database, native shell or content owner. The user-approved simplification is current direction; the final production persona and integration protocol remain open.

See [handoff](../../handoffs/gyro-poc.md) for code availability and exact checks.
