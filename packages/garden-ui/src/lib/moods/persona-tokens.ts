// Semantic persona appearance: portable Mood values, independent of a renderer.
export const PERSONA_PRESETS = {
  idle: {
    color: "#76adff",
    speed: 0.18,
    size: 0.9,
    glow: 1.25,
    pulse: 0.025,
    iridescence: 0,
    glowSpread: 0.15,
    flow: 0,
    rgbSplit: 0,
  },
  listening: {
    color: "#6fe0a7",
    speed: 0.3,
    size: 1.12,
    glow: 1.45,
    pulse: 0.045,
    iridescence: 0,
    glowSpread: 0.15,
    flow: 0,
    rgbSplit: 0,
  },
  thinking: {
    color: "#bb89ff",
    speed: 1.1,
    size: 0.94,
    glow: 1.5,
    pulse: 0.08,
    iridescence: 0.12,
    glowSpread: 0.15,
    flow: 0,
    rgbSplit: 0,
  },
  speaking: {
    color: "#efc566",
    speed: 0.55,
    size: 1.04,
    glow: 1.5,
    pulse: 0.2,
    iridescence: 0,
    glowSpread: 0.15,
    flow: 0,
    rgbSplit: 0,
  },
  delighted: {
    color: "#b5d5ed",
    speed: 0.8,
    size: 1.23,
    glow: 1.6,
    pulse: 0.12,
    iridescence: 1,
    glowSpread: 0.15,
    flow: 0,
    rgbSplit: 0.08,
  },
  uncertain: {
    color: "#ed9c57",
    speed: 0.1,
    size: 0.84,
    glow: 1.1,
    pulse: 0.06,
    iridescence: 0,
    glowSpread: 0.15,
    flow: 0,
    rgbSplit: 0,
  },
  error: {
    color: "#ff4654",
    speed: 0.35,
    size: 1.12,
    glow: 1.65,
    pulse: 0.3,
    iridescence: 0,
    glowSpread: 0.15,
    flow: 0,
    rgbSplit: 0,
  },
} as const;
export function personaToken(state: string, property: string) {
  return `persona${state[0]!.toUpperCase()}${state.slice(1)}${property[0]!.toUpperCase()}${property.slice(1)}`;
}
export function personaTokens(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PERSONA_PRESETS).flatMap(([state, preset]) =>
      Object.entries(preset).map(([property, value]) => [
        personaToken(state, property),
        String(value),
      ]),
    ),
  );
}
