import type { ThemeDefinition } from "./types";
import { classicTheme } from "./configs/classic";
import { vividTheme } from "./configs/vivid";
import { subtleTheme } from "./configs/subtle";
import { warmTheme } from "./configs/warm";
import { coolTheme } from "./configs/cool";
import { natureTheme } from "./configs/nature";
import { modernTheme } from "./configs/modern";
import { vibrantTheme } from "./configs/vibrant";
import { professionalTheme } from "./configs/professional";
import { softTheme } from "./configs/soft";
import { boldTheme } from "./configs/bold";
import { calmTheme } from "./configs/calm";
import { candyTheme } from "./configs/candy";
import { deepTheme } from "./configs/deep";
import { lightTheme } from "./configs/light";

export const themes: ThemeDefinition[] = [
  classicTheme,
  vividTheme,
  subtleTheme,
  warmTheme,
  coolTheme,
  natureTheme,
  modernTheme,
  vibrantTheme,
  professionalTheme,
  softTheme,
  boldTheme,
  calmTheme,
  candyTheme,
  deepTheme,
  lightTheme,
];

export const themeMap = new Map<string, ThemeDefinition>(
  themes.map((t) => [t.name, t])
);

export function getTheme(name: string): ThemeDefinition {
  return themeMap.get(name) ?? classicTheme;
}

export const DEFAULT_THEME = "classic";
