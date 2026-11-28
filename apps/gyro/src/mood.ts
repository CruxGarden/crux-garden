import {
  GARDEN_DARK,
  type MoodPalette,
} from "@cruxgarden/garden-ui/lib/moods/garden-dark";
import {
  getVar,
  moodTokenValues,
} from "@cruxgarden/garden-ui/lib/moods/tokens";

// A prototype Mood using existing shared tokens; no second appearance schema.
export const initialMood: MoodPalette = {
  ...GARDEN_DARK,
  bg: "#0a1211",
  panel: "#101c19",
  surface: "#15241f",
  text: "#ede9d9",
  textMuted: "#9daea3",
  accent: "#b7edb8",
  warning: "#d8b779",
  border: "#30443a",
  lensChromaticAberration: "0",
  filmGrain: "0",
};
export function applyMood(mood: MoodPalette) {
  for (const [key, value] of Object.entries(moodTokenValues(mood))) {
    document.documentElement.style.setProperty(
      getVar(key as keyof MoodPalette),
      value,
    );
  }
}
export function readMood(text: string): MoodPalette {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Choose a Gyro Mood JSON file.");
  const result = { ...initialMood };
  for (const [key, value] of Object.entries(data)) {
    if (
      !Object.hasOwn(initialMood, key) ||
      typeof value !== "string" ||
      value.length > 2000
    )
      throw new Error("The Mood contains an unknown or invalid token.");
    result[key as keyof MoodPalette] = value;
  }
  return result;
}
export type { MoodPalette };
