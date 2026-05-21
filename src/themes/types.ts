export type BaseMode = "light" | "dark" | "system";

export type UIStyle =
  | "vega"
  | "nova"
  | "maia"
  | "lyra"
  | "mira"
  | "luma"
  | "sera";

export interface ThemeVariables {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
}

export interface FontConfig {
  family: string;
  size: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    "2xl": string;
    "3xl": string;
  };
  weight: {
    normal: string;
    medium: string;
    semibold: string;
    bold: string;
  };
  lineHeight: {
    tight: string;
    normal: string;
    relaxed: string;
  };
}

export interface UIStyleConfig {
  name: UIStyle;
  label: string;
  description: string;
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  shadow: {
    sm: string;
    md: string;
    lg: string;
  };
  borderWidth: string;
  componentDensity: "compact" | "normal" | "spacious";
}

export interface ThemePreview {
  accent: string;
  bg: string;
  text: string;
}

export interface ThemeDefinition {
  name: string;
  label: string;
  description: string;
  radius: string;
  font: FontConfig;
  variables: {
    light: ThemeVariables;
    dark: ThemeVariables;
  };
  preview: ThemePreview;
}

export interface ThemeContextValue {
  baseMode: BaseMode;
  themeName: string;
  uiStyle: UIStyle;
  resolvedMode: "light" | "dark";
  currentTheme: ThemeDefinition;
  setBaseMode: (mode: BaseMode) => void;
  setThemeName: (name: string) => void;
  setUIStyle: (style: UIStyle) => void;
}
