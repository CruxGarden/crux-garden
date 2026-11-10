import { GARDEN_DARK } from "@cruxgarden/garden-ui/lib/moods/garden-dark";
import {
  getVar,
  moodTokenValues,
} from "@cruxgarden/garden-ui/lib/moods/tokens";
import { applyIconSet } from "@cruxgarden/garden-ui/lib/moods/icon-set";
import { canRenderPlasma } from "@cruxgarden/garden-ui/lib/graphics";

/** Migration's initial presentation uses the existing Mood token vocabulary, without a seeded Mood Crux. */
export const MIGRATION_MOOD: Record<string, string> = {
  bg: "#071912",
  panel: "#14251e",
  surface: "#1b3328",
  text: "#f3f1e6",
  textMuted: "#afc4b6",
  accent: "#e0ad49",
  border: "#355448",
  radius: "2rem",
  radiusSm: "0.8rem",
  fontDisplay: "'Cormorant Garamond', serif",
  fontBody: "'Outfit', 'Inter', sans-serif",
  fontSans: "'Outfit', 'Inter', sans-serif",
  fontWeightDisplay: "600",
  surfaceStyle: "plasma",
  plasmaField: "#071912 #194936 #a4dfca",
  plasmaTint: "#14251e",
  plasmaOpacity: "0.9",
  plasmaFrost: "0.15",
  plasmaRim: "0.65",
  plasmaRimWidth: "1.1",
  plasmaBlend: "8",
  plasmaElevation: "0.25",
  plasmaFlow: "0",
  plasmaAmbientDrops: "off",
  plasmaPointerDrop: "off",
  plasmaPointerPull: "off",
  plasmaFormIn: "off",
  plasmaFormOut: "off",
  plasmaShimmer: "0",
  plasmaGrain: "0.2",
  motionIntensity: "subtle",
};

export function applyMigrationMood(overrides: Record<string, string>) {
  const root = document.documentElement;
  const clean = Object.fromEntries(
    Object.entries(overrides).filter(
      ([k, v]) =>
        k in GARDEN_DARK &&
        typeof v === "string" &&
        !/url\s*\(|asset:|@import/i.test(v),
    ),
  );
  for (const [key, value] of Object.entries(
    moodTokenValues({ ...MIGRATION_MOOD, ...clean }),
  ))
    root.style.setProperty(getVar(key), value);
  const motionOff = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const style = clean.surfaceStyle || MIGRATION_MOOD.surfaceStyle;
  root.dataset.surfaceStyle =
    style === "plasma" && canRenderPlasma() && !motionOff
      ? "plasma"
      : style === "solid"
        ? "solid"
        : "glass";
  root.dataset.motionIntensity = motionOff ? "off" : "subtle";
  // Migration's spacious surfaces need crisp edges on high-density displays.
  root.dataset.plasmaTier = "ultra";
  root.classList.add("dark");
  applyIconSet("line");
  requestAnimationFrame(() =>
    document.dispatchEvent(new Event("palette-change")),
  );
}
