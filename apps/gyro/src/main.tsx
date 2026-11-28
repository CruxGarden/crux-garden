import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createScene, type SceneInput } from "./scene";
import {
  stateKeys,
  states,
  variants,
  type PersonaState,
  type Variant,
} from "./states";
import { applyMood, initialMood, readMood, type MoodPalette } from "./mood";
import "./style.css";
import { createSound, soundProfiles, padStyles, type PadStyle } from "./sound";
import {
  personaToken,
  PERSONA_PRESETS,
} from "@cruxgarden/garden-ui/lib/moods/persona-tokens";
import { getVar } from "@cruxgarden/garden-ui/lib/moods/tokens";
import { renderStyles } from "./states";

// Three exploratory contexts for the same persona, shareable via ?variant=.
applyMood(initialMood);
function App() {
  const [state, setState] = useState<PersonaState>("idle");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [intensity, setIntensity] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [variant, setVariant] = useState<Variant>(() => {
    const value = new URLSearchParams(location.search).get("variant");
    return variants.find((v) => v.toLowerCase() === value) ?? "Observatory";
  });
  const [mood, setMood] = useState<MoodPalette>(initialMood);
  const [moodRevision, setMoodRevision] = useState(0);
  const [moodError, setMoodError] = useState("");
  const [renderError, setRenderError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundReady, setSoundReady] = useState(false);
  const soundWanted = useRef(true);
  const soundStarting = useRef(false);
  const [soundBusy, setSoundBusy] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [soundVolume, setSoundVolume] = useState(0.3);
  const [ambientSound, setAmbientSound] = useState(true);
  const [stateSounds, setStateSounds] = useState(true);
  const [buttonSounds, setButtonSounds] = useState(true);
  const [padStyle, setPadStyle] = useState<PadStyle>("warm");
  const sound = useRef<Awaited<ReturnType<typeof createSound>> | null>(null);
  const soundGeneration = useRef(0);
  const [draft, setDraft] = useState("What could we make together?");
  const [message, setMessage] = useState("What could we make together?");
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createScene> | null>(null);
  const live = useRef<SceneInput>({
    state,
    paused,
    reduced,
    intensity,
    moodRevision,
  });
  live.current = { state, paused, reduced, intensity, moodRevision };
  const selected = states[state];
  useEffect(
    () => () => {
      soundGeneration.current++;
      void sound.current?.dispose();
    },
    [],
  );
  useEffect(() => {
    sound.current?.setMix(soundVolume, ambientSound, stateSounds, buttonSounds);
  }, [soundVolume, ambientSound, stateSounds, buttonSounds, soundReady]);
  useEffect(() => {
    sound.current?.setPadStyle(padStyle);
  }, [padStyle, soundReady]);
  useEffect(() => {
    sound.current?.setState(state, stateSounds);
  }, [state, soundReady, stateSounds]);
  async function startSound() {
    if (!soundWanted.current || sound.current || soundStarting.current) return;
    soundStarting.current = true;
    const generation = ++soundGeneration.current;
    setSoundBusy(true);
    setSoundError("");
    try {
      const next = await createSound();
      if (generation !== soundGeneration.current || !soundWanted.current) {
        await next.dispose();
        return;
      }
      sound.current = next;
      setSoundReady(true);
    } catch {
      if (generation === soundGeneration.current)
        setSoundError("Audio could not start. Click or tap to try again.");
    } finally {
      if (generation === soundGeneration.current) {
        soundStarting.current = false;
        setSoundBusy(false);
      }
    }
  }
  function toggleSound() {
    soundWanted.current = !soundWanted.current;
    setSoundEnabled(soundWanted.current);
    if (soundWanted.current) {
      void startSound();
    } else {
      soundGeneration.current++;
      soundStarting.current = false;
      setSoundBusy(false);
      setSoundReady(false);
      setSoundError("");
      const previous = sound.current;
      sound.current = null;
      void previous?.dispose();
    }
  }
  function unlockSound(target: EventTarget) {
    if (!(target instanceof Element) || target.closest("[data-sound-toggle]"))
      return;
    void startSound();
  }
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = createScene(host.current, () => live.current);
    } catch {
      setRenderError(
        "Gyro needs WebGL 2. Enable hardware acceleration in your browser, then reload.",
      );
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const sequence: PersonaState[] = [
      "listening",
      "thinking",
      "speaking",
      "delighted",
      "idle",
    ];
    let i = 0;
    setState(sequence[0]!);
    const timer = window.setInterval(() => {
      if (live.current.paused) return;
      i++;
      if (i >= sequence.length) {
        setPlaying(false);
        return;
      }
      setState(sequence[i]!);
    }, 2800);
    return () => clearInterval(timer);
  }, [playing]);
  function select(next: PersonaState) {
    setPlaying(false);
    setState(next);
  }
  function changeVariant(next: Variant) {
    setVariant(next);
    const url = new URL(location.href);
    url.searchParams.set("variant", next.toLowerCase());
    history.replaceState(null, "", url);
  }
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, button, [contenteditable]"))
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      changeVariant(
        variants[
          (variants.indexOf(variant) + (event.key === "ArrowRight" ? 1 : 2)) % 3
        ]!,
      );
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [variant]);
  function updateMood(next: MoodPalette) {
    applyMood(next);
    setMood(next);
    setMoodRevision((v) => v + 1);
    setMoodError("");
  }
  function exportMood() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(mood, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "gyro-mood.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stateControls = (
    <details className="optics-controls" open>
      <summary>State</summary>
      <div className="states">
        {stateKeys.map((key) => (
          <button
            key={key}
            aria-pressed={state === key}
            onClick={() => select(key)}
          >
            <span
              className="state-symbol"
              aria-hidden="true"
              style={{ color: `var(${getVar(personaToken(key, "color"))})` }}
            >
              {states[key].symbol}
            </span>
            {states[key].label}
          </button>
        ))}
      </div>
    </details>
  );
  const controls = (
    <section className="controls" aria-label="Persona state controls">
      <details className="optics-controls">
        <summary>Playback</summary>
        <div className="transport">
          <button
            className="primary"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                setPaused(false);
                setPlaying(true);
              }
            }}
          >
            {playing ? "Stop sequence" : "Play an interaction"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
          <button onClick={() => setPaused(!paused)} aria-pressed={paused}>
            {paused ? "Resume motion" : "Pause motion"}
          </button>
          <button onClick={() => scene.current?.reset()}>Reset view</button>
        </div>
        <div className="motion-control">
          <label htmlFor="energy">Motion energy</label>
          <input
            id="energy"
            type="range"
            min="0.25"
            max="1.75"
            step="0.05"
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
          />
          <output htmlFor="energy">{intensity.toFixed(2)}×</output>
        </div>
        <label className="quiet">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
          />{" "}
          Reduced motion
        </label>
      </details>
      <details className="optics-controls style-picker">
        <summary>Style</summary>
        <div className="styles">
          {renderStyles.map((style) => (
            <button
              key={style.key}
              aria-pressed={mood.personaRenderStyle === style.key}
              onClick={() =>
                updateMood({ ...mood, personaRenderStyle: style.key })
              }
            >
              <strong>{style.label}</strong>
              <span>{style.description}</span>
            </button>
          ))}
        </div>
      </details>
      <details className="optics-controls state-editor">
        <summary>Settings</summary>
        <p className="caption">
          Changes apply only to {selected.label.toLowerCase()}. Glow spread runs
          from tight to diffuse; Electrical flow adds traveling light in Glow
          style. Each ring’s speed multiplier sets its rhythm; Movement speed
          scales the whole state. Save all states with Export Mood.
        </p>
        <label className="ring-color">
          State color{" "}
          <input
            type="color"
            value={mood[personaToken(state, "color")] ?? "#ffffff"}
            onChange={(event) =>
              updateMood({
                ...mood,
                [personaToken(state, "color")]: event.target.value,
              })
            }
          />
        </label>
        {(
          [
            ["speed", "Movement speed", 0, 1.8, 0.01],
            ["innerSpeed", "Inner ring speed", 0, 2, 0.05],
            ["middleSpeed", "Middle ring speed", 0, 2, 0.05],
            ["outerSpeed", "Outer ring speed", 0, 2, 0.05],
            ["size", "Ring size", 0.65, 1.3, 0.01],
            ["glow", "Glow strength", 0, 2, 0.01],
            ["glowSpread", "Glow spread", 0, 1, 0.01],
            ["flow", "Electrical flow", 0, 1, 0.01],
            ["pulse", "Pulse amount", 0, 0.35, 0.01],
            ["iridescence", "Color cycling", 0, 1, 0.01],
            ["rgbSplit", "State RGB split", 0, 1, 0.01],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <div className="motion-control" key={key}>
            <label htmlFor={`state-${key}`}>{label}</label>
            <input
              id={`state-${key}`}
              type="range"
              min={min}
              max={max}
              step={step}
              value={mood[personaToken(state, key)] ?? "0"}
              onChange={(event) =>
                updateMood({
                  ...mood,
                  [personaToken(state, key)]: event.target.value,
                })
              }
            />
            <output htmlFor={`state-${key}`}>
              {Number(mood[personaToken(state, key)] ?? 0).toFixed(2)}
              {key.endsWith("Speed") ? "×" : ""}
            </output>
          </div>
        ))}
        <button
          className="reset-state"
          onClick={() => {
            const next = { ...mood };
            for (const [key, value] of Object.entries(PERSONA_PRESETS[state]))
              next[personaToken(state, key)] = String(value);
            updateMood(next);
          }}
        >
          Reset {selected.label.toLowerCase()} settings
        </button>
      </details>
      <details className="optics-controls">
        <summary>Effects</summary>
        {(["Inner", "Middle", "Outer"] as const).map((ring) => (
          <div className="motion-control" key={ring}>
            <label htmlFor={`shade-${ring}`}>{ring} ring shade</label>
            <input
              id={`shade-${ring}`}
              type="range"
              min="0.3"
              max="1.5"
              step="0.01"
              value={mood[`personaRing${ring}Shade`] ?? "1"}
              onChange={(event) =>
                updateMood({
                  ...mood,
                  [`personaRing${ring}Shade`]: event.target.value,
                })
              }
            />
            <output htmlFor={`shade-${ring}`}>
              {Number(mood[`personaRing${ring}Shade`] ?? 1).toFixed(2)}
            </output>
          </div>
        ))}
        {(
          [
            ["lensChromaticAberration", "RGB split"],
            ["filmGrain", "Film grain"],
          ] as const
        ).map(([key, label]) => (
          <div className="motion-control" key={key}>
            <label htmlFor={key}>{label}</label>
            <input
              id={key}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={mood[key] ?? "0"}
              onChange={(event) =>
                updateMood({ ...mood, [key]: event.target.value })
              }
            />
            <output htmlFor={key}>
              {Math.round(Number(mood[key] ?? 0) * 100)}%
            </output>
          </div>
        ))}
        <p className="caption">
          Optional lens character. Set an effect to zero for a clean view.
        </p>
      </details>
    </section>
  );
  const soundscape = (
    <details className="optics-controls soundscape" open>
      <summary>Soundscape</summary>
      <div className="transport">
        <button
          data-sound-toggle
          onClick={toggleSound}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? "Mute sound" : "Enable sound"}
        </button>
        <span className="caption">
          {soundProfiles[state].name} · {selected.label.toLowerCase()} pad
        </span>
      </div>
      <div className="motion-control">
        <label htmlFor="sound-volume">Volume</label>
        <input
          id="sound-volume"
          type="range"
          min="0"
          max="0.8"
          step="0.01"
          value={soundVolume}
          onChange={(event) => setSoundVolume(Number(event.target.value))}
        />
        <output htmlFor="sound-volume">{Math.round(soundVolume * 100)}%</output>
      </div>
      <div className="styles pad-styles" aria-label="Ambient pad style">
        {(Object.keys(padStyles) as PadStyle[]).map((key) => (
          <button
            key={key}
            aria-pressed={padStyle === key}
            onClick={() => setPadStyle(key)}
          >
            <strong>{padStyles[key].label}</strong>
            <span>{padStyles[key].description}</span>
          </button>
        ))}
      </div>
      <div className="sound-options">
        <label className="quiet">
          <input
            type="checkbox"
            checked={buttonSounds}
            onChange={(event) => setButtonSounds(event.target.checked)}
          />{" "}
          Button sounds
        </label>
        <label className="quiet">
          <input
            type="checkbox"
            checked={ambientSound}
            onChange={(event) => setAmbientSound(event.target.checked)}
          />{" "}
          Ambient pads
        </label>
        <label className="quiet">
          <input
            type="checkbox"
            checked={stateSounds}
            onChange={(event) => setStateSounds(event.target.checked)}
          />{" "}
          Transition sounds
        </label>
      </div>
      <p className="caption">
        {soundEnabled
          ? soundReady
            ? "Sound is on."
            : soundBusy
              ? "Starting sound…"
              : "Sound is on — starts with your first click, tap or keypress."
          : "Sound is muted."}{" "}
        Audio fades out when this tab is hidden. Motion pause controls visuals.
      </p>
      {soundError && <p role="status">{soundError}</p>}
    </details>
  );
  const conversation = (
    <section className="conversation" aria-label="Simulated conversation">
      <p className="eyebrow">A conversation, imagined</p>
      <h2>A spark is all it takes.</h2>
      <div className="message user">
        <span>You</span>
        <p>{message}</p>
      </div>
      <div className="message">
        <span>Gyro · scripted demo</span>
        <p aria-live="polite">{selected.text}</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setMessage(draft.trim());
          setPaused(false);
          setPlaying(true);
        }}
      >
        <label className="sr-only" htmlFor="prompt">
          Demo message
        </label>
        <input
          id="prompt"
          value={draft}
          maxLength={400}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit">Try it ↗</button>
      </form>
      <p className="caption">
        Scripted responses. No model or microphone connected. Sound is
        synthesized locally.
      </p>
    </section>
  );
  const moodEditor = (
    <details className="mood-editor">
      <summary>Mood</summary>
      <p>
        Shared Garden tokens. Each state has its own color, motion, size and
        effects.
      </p>
      <div className="swatches">
        {(["accent", "warning", "bg", "text"] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              type="color"
              value={
                /^#[0-9a-f]{6}$/i.test(mood[key] ?? "") ? mood[key] : "#000000"
              }
              onChange={(e) => updateMood({ ...mood, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="transport">
        <button onClick={exportMood}>Export Mood</button>
        <label className="file-label">
          Import Mood
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 200000)
                  throw new Error("Mood file is too large.");
                updateMood(readMood(await file.text()));
              } catch (error) {
                setMoodError(
                  error instanceof Error
                    ? error.message
                    : "Could not read Mood.",
                );
              }
              e.target.value = "";
            }}
          />
        </label>
        <button onClick={() => updateMood(initialMood)}>Reset Mood</button>
      </div>
      <label className="token-editor">
        All shared tokens (JSON)
        <textarea
          key={moodRevision}
          defaultValue={JSON.stringify(mood, null, 2)}
          onBlur={(e) => {
            try {
              updateMood(readMood(e.target.value));
            } catch (error) {
              setMoodError(
                error instanceof Error ? error.message : "Invalid Mood.",
              );
            }
          }}
        />
      </label>
      <p role="status">{moodError}</p>
    </details>
  );
  return (
    <main
      className={`app ${variant.toLowerCase()}`}
      onPointerUpCapture={(event) => unlockSound(event.target)}
      onKeyDownCapture={(event) => {
        if (!event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey)
          unlockSound(event.target);
      }}
      onClickCapture={(event) => {
        unlockSound(event.target);
        const target = event.target as HTMLElement;
        if (target.closest("button:not(:disabled), summary"))
          sound.current?.press();
      }}
    >
      <header>
        <a className="brand" href="?variant=observatory">
          crux garden <span className="divider">/</span> <strong>gyro</strong>
        </a>
        <span className="badge">
          Persona study <span>001</span>
        </span>
      </header>
      <div className="experience">
        <div className="main-view">
          <section className="stage" aria-label="Gyro persona">
            <div className="stage-meta">
              <span>GYRO / {selected.label.toUpperCase()}</span>
              <span>WebGL 2 · live 3D</span>
            </div>
            <div className="viewport" ref={host} />
            {renderError && (
              <p className="render-error" role="alert">
                {renderError}
              </p>
            )}
            <p className="context-lost" role="status">
              Graphics context interrupted. Reload if it does not recover.
            </p>
            <div className="stage-caption">
              <span
                className="state-readout"
                aria-live="polite"
                style={{
                  color: `var(${getVar(personaToken(state, "color"))})`,
                }}
              >
                {selected.symbol} {selected.label}
                {paused
                  ? " · motion paused"
                  : reduced
                    ? " · reduced motion"
                    : ""}
              </span>
              <p>
                Drag to orbit <span>·</span> Scroll to explore
              </p>
            </div>
          </section>
          <div className="state-story">
            <p className="eyebrow">
              {selected.label} /{" "}
              {String(stateKeys.indexOf(state) + 1).padStart(2, "0")}
            </p>
            <h2>{selected.title}</h2>
            <p>{selected.copy}</p>
          </div>
          {variant === "Companion" && (
            <section className="workbench">
              <p className="eyebrow">An imagined Garden workspace</p>
              <h2>
                Make room
                <br />
                for a new idea.
              </h2>
              <p>
                A companion at the edge of your creative work.
                <br />
                Present when you need it. Quiet when you don’t.
              </p>
              <div className="notebook">
                <span>Collaboration</span>
                <p>What if a garden could help us think?</p>
                <div className="notebook-lines" />
              </div>
              {conversation}
            </section>
          )}

          {variant === "Conversation" && conversation}
        </div>
        <aside className="control-panel" aria-label="Gyro controls">
          {stateControls}
          {soundscape}
          {controls}
          {moodEditor}
        </aside>
      </div>
      <footer>
        <span>Made with Crux Garden</span>
        <span>Light, motion & a sense of possibility.</span>
      </footer>

      {import.meta.env.DEV && (
        <nav className="variant-switcher" aria-label="Prototype presentation">
          <button
            aria-label="Previous presentation"
            onClick={() =>
              changeVariant(variants[(variants.indexOf(variant) + 2) % 3]!)
            }
          >
            ←
          </button>
          <span>
            {variants.indexOf(variant) + 1} / 3 <strong>{variant}</strong>
          </span>
          <button
            aria-label="Next presentation"
            onClick={() =>
              changeVariant(variants[(variants.indexOf(variant) + 1) % 3]!)
            }
          >
            →
          </button>
        </nav>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
