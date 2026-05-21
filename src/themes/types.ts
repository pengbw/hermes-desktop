export type ColorMode = "light" | "dark";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemePreview {
  primary: string;
  bg: string;
  surface: string;
}

export interface ThemeDefinition {
  name: string;
  label: string;
  icon: string;
  colorMode: ColorMode;
  preview: ThemePreview;
}

export interface ThemeContextValue {
  themeMode: ThemeMode;
  themeName: string;
  colorMode: ColorMode;
  setThemeMode: (mode: ThemeMode) => void;
  setThemeName: (name: string) => void;
}
