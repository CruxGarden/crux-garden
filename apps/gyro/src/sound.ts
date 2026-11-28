import type { PersonaState } from "./states";

// Original procedural sound design: local Web Audio, no recordings or microphone.
export const soundProfiles: Record<
  PersonaState,
  {
    name: string;
    chord: number[];
    cutoff: number;
    wave: OscillatorType;
    detune: number;
    cue: number[];
    octave: number;
  }
> = {
  idle: {
    name: "Blue hour",
    chord: [130.81, 196, 246.94, 293.66],
    cutoff: 650,
    wave: "sine",
    detune: 3,
    cue: [0],
    octave: 2,
  },
  listening: {
    name: "Open canopy",
    chord: [146.83, 196, 261.63, 329.63],
    cutoff: 1000,
    wave: "triangle",
    detune: 4,
    cue: [1, 3],
    octave: 2,
  },
  thinking: {
    name: "Violet currents",
    chord: [130.81, 196, 293.66, 369.99],
    cutoff: 1400,
    wave: "triangle",
    detune: 6,
    cue: [0, 2, 1],
    octave: 2,
  },
  speaking: {
    name: "Golden warmth",
    chord: [130.81, 164.81, 246.94, 329.63],
    cutoff: 950,
    wave: "triangle",
    detune: 3,
    cue: [1, 2],
    octave: 2,
  },
  delighted: {
    name: "Prismatic bloom",
    chord: [174.61, 261.63, 349.23, 440],
    cutoff: 1800,
    wave: "sine",
    detune: 5,
    cue: [0, 1, 2, 3],
    octave: 2,
  },
  uncertain: {
    name: "Amber dusk",
    chord: [146.83, 174.61, 220, 329.63],
    cutoff: 500,
    wave: "triangle",
    detune: 7,
    cue: [3, 1],
    octave: 1.5,
  },
  error: {
    name: "Low ember",
    chord: [98, 130.81, 155.56, 196],
    cutoff: 420,
    wave: "triangle",
    detune: 2,
    cue: [0, 0],
    octave: 2,
  },
};
export const padStyles = {
  warm: {
    label: "Warm",
    description: "Soft, rounded chords",
    register: 1,
    cutoff: 1,
    detune: 1,
    wave: "state",
    width: 0.65,
    level: 1,
  },
  airy: {
    label: "Airy",
    description: "Light and floating",
    register: 2,
    cutoff: 1.8,
    detune: 0.75,
    wave: "sine",
    width: 0.95,
    level: 0.8,
  },
  analog: {
    label: "Analog",
    description: "Warm, gently detuned synth",
    register: 1,
    cutoff: 0.7,
    detune: 2.2,
    wave: "sawtooth",
    width: 0.7,
    level: 0.7,
  },
  deep: {
    label: "Deep",
    description: "Low and spacious",
    register: 0.5,
    cutoff: 0.55,
    detune: 0.6,
    wave: "sine",
    width: 0.4,
    level: 1.1,
  },
} as const;
export type PadStyle = keyof typeof padStyles;
export async function createSound() {
  const context = new AudioContext();
  try {
    await context.resume();
  } catch (error) {
    await context.close();
    throw error;
  }
  const master = context.createGain();
  master.gain.value = 0;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.ratio.value = 6;
  master.connect(compressor);
  compressor.connect(context.destination);
  const pads = context.createGain();
  pads.gain.value = 0.18;
  pads.connect(master);
  const effects = context.createGain();
  effects.gain.value = 0.4;
  effects.connect(master);
  const buttons = context.createGain();
  buttons.gain.value = 0.3;
  buttons.connect(master);
  const reverb = context.createConvolver();
  const impulse = context.createBuffer(
    2,
    context.sampleRate * 2.8,
    context.sampleRate,
  );
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++)
      data[i] =
        (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.5) * 0.3;
  }
  reverb.buffer = impulse;
  const wet = context.createGain();
  wet.gain.value = 0.38;
  pads.connect(reverb);
  effects.connect(reverb);
  reverb.connect(wet);
  wet.connect(master);
  const liveOscillators = new Set<OscillatorNode>();
  let disposed = false,
    volume = 0.3,
    hidden = document.hidden,
    buttonSounds = true;
  let currentState: PersonaState | null = null;
  let padStyle: PadStyle = "warm";
  let bank: { gain: GainNode; oscillators: OscillatorNode[] } | null = null;
  function track(oscillator: OscillatorNode, cleanup: () => void) {
    liveOscillators.add(oscillator);
    oscillator.onended = () => {
      liveOscillators.delete(oscillator);
      oscillator.disconnect();
      cleanup();
    };
  }
  function fadeVolume() {
    if (!disposed)
      master.gain.setTargetAtTime(
        hidden ? 0 : volume,
        context.currentTime,
        0.3,
      );
  }
  const visibility = () => {
    hidden = document.hidden;
    fadeVolume();
  };
  document.addEventListener("visibilitychange", visibility);
  fadeVolume();
  function pad(state: PersonaState) {
    const profile = soundProfiles[state];
    const texture = padStyles[padStyle];
    const start = context.currentTime;
    if (bank) {
      bank.gain.gain.setTargetAtTime(0, start, 0.35);
      bank.oscillators.forEach((oscillator) => oscillator.stop(start + 2));
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, start, 0.65);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = profile.cutoff * texture.cutoff;
    filter.Q.value = 0.3;
    gain.connect(filter);
    filter.connect(pads);
    const oscillators: OscillatorNode[] = [];
    let remaining = 8;
    profile.chord.forEach((frequency, i) => {
      for (const direction of [-1, 1]) {
        const oscillator = context.createOscillator();
        oscillator.type =
          i % 2
            ? "sine"
            : texture.wave === "state"
              ? profile.wave
              : texture.wave;
        oscillator.frequency.value = frequency * texture.register;
        oscillator.detune.value = direction * profile.detune * texture.detune;
        const voice = context.createGain();
        voice.gain.value = 0.12 * texture.level;
        const pan = context.createStereoPanner();
        pan.pan.value = (i / 3 - 0.5) * texture.width;
        oscillator.connect(voice);
        voice.connect(pan);
        pan.connect(gain);
        oscillator.start();
        oscillators.push(oscillator);
        track(oscillator, () => {
          voice.disconnect();
          pan.disconnect();
          if (--remaining === 0) {
            gain.disconnect();
            filter.disconnect();
          }
        });
      }
    });
    bank = { gain, oscillators };
  }
  function tone(
    frequency: number,
    start: number,
    duration: number,
    level: number,
    target: AudioNode,
    type: OscillatorType = "sine",
  ) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(target);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
    track(oscillator, () => envelope.disconnect());
    return oscillator;
  }
  return {
    setPadStyle(next: PadStyle) {
      if (disposed || next === padStyle) return;
      padStyle = next;
      if (currentState) pad(currentState);
    },
    setMix(level: number, ambient: boolean, cues: boolean, ui = true) {
      volume = level;
      buttonSounds = ui;
      fadeVolume();
      pads.gain.setTargetAtTime(ambient ? 0.18 : 0, context.currentTime, 0.4);
      effects.gain.setTargetAtTime(cues ? 0.4 : 0, context.currentTime, 0.08);
      buttons.gain.setTargetAtTime(ui ? 0.3 : 0, context.currentTime, 0.05);
    },
    press() {
      if (disposed || hidden || !buttonSounds) return;
      const click = tone(
        480,
        context.currentTime,
        0.065,
        0.12,
        buttons,
        "triangle",
      );
      click.frequency.exponentialRampToValueAtTime(
        190,
        context.currentTime + 0.06,
      );
    },
    setState(state: PersonaState, cue: boolean) {
      if (disposed) return;
      if (currentState !== state) {
        pad(state);
        currentState = state;
      }
      if (!cue || hidden) return;
      const profile = soundProfiles[state];
      profile.cue.forEach((index, i) =>
        tone(
          profile.chord[index]! * profile.octave,
          context.currentTime + i * 0.15,
          state === "error" ? 0.45 : 1.25,
          0.1,
          effects,
        ),
      );
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      master.gain.setTargetAtTime(0, context.currentTime, 0.06);
      await new Promise((resolve) => setTimeout(resolve, 300));
      liveOscillators.forEach((oscillator) => oscillator.stop());
      await context.close();
    },
  };
}
