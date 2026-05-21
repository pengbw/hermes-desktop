import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { BaseMode, ThemeContextValue, UIStyle } from "@/themes/types";
import { getTheme, DEFAULT_THEME } from "@/themes/registry";
import { getUIStyle, DEFAULT_UI_STYLE } from "@/themes/ui-styles";

const STORAGE_KEY_BASE = "hermes-theme-base";
const STORAGE_KEY_NAME = "hermes-theme-name";
const STORAGE_KEY_UI_STYLE = "hermes-ui-style";

function getSystemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredBaseMode(): BaseMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_BASE);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "system";
}

function getStoredThemeName(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_NAME);
    if (stored) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_THEME;
}

function getStoredUIStyle(): UIStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_UI_STYLE);
    const validStyles: UIStyle[] = [
      "vega",
      "nova",
      "maia",
      "lyra",
      "mira",
      "luma",
      "sera",
    ];
    if (stored && validStyles.includes(stored as UIStyle)) {
      return stored as UIStyle;
    }
  } catch {
    // ignore
  }
  return DEFAULT_UI_STYLE;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [baseMode, setBaseModeState] = useState<BaseMode>(getStoredBaseMode);
  const [themeName, setThemeNameState] = useState<string>(getStoredThemeName);
  const [uiStyle, setUIStyleState] = useState<UIStyle>(getStoredUIStyle);

  const resolvedMode: "light" | "dark" = useMemo(() => {
    if (baseMode === "system") {
      return getSystemMode();
    }
    return baseMode;
  }, [baseMode]);

  const currentTheme = useMemo(() => getTheme(themeName), [themeName]);
  const currentUIStyle = useMemo(() => getUIStyle(uiStyle), [uiStyle]);

  const applyTheme = useCallback(
    (
      mode: "light" | "dark",
      theme: typeof currentTheme,
      style: typeof currentUIStyle
    ) => {
      const root = document.documentElement;
      const vars = theme.variables[mode];

      // Color variables
      root.style.setProperty("--background", vars.background);
      root.style.setProperty("--foreground", vars.foreground);
      root.style.setProperty("--card", vars.card);
      root.style.setProperty("--card-foreground", vars.cardForeground);
      root.style.setProperty("--primary", vars.primary);
      root.style.setProperty("--primary-foreground", vars.primaryForeground);
      root.style.setProperty("--secondary", vars.secondary);
      root.style.setProperty("--secondary-foreground", vars.secondaryForeground);
      root.style.setProperty("--muted", vars.muted);
      root.style.setProperty("--muted-foreground", vars.mutedForeground);
      root.style.setProperty("--accent", vars.accent);
      root.style.setProperty("--accent-foreground", vars.accentForeground);
      root.style.setProperty("--border", vars.border);
      root.style.setProperty("--input", vars.input);
      root.style.setProperty("--ring", vars.ring);
      root.style.setProperty("--radius", theme.radius);

      // Font variables
      const font = theme.font;
      root.style.setProperty("--font-family", font.family);
      root.style.setProperty("--font-size-xs", font.size.xs);
      root.style.setProperty("--font-size-sm", font.size.sm);
      root.style.setProperty("--font-size-base", font.size.base);
      root.style.setProperty("--font-size-lg", font.size.lg);
      root.style.setProperty("--font-size-xl", font.size.xl);
      root.style.setProperty("--font-size-2xl", font.size["2xl"]);
      root.style.setProperty("--font-size-3xl", font.size["3xl"]);
      root.style.setProperty("--font-weight-normal", font.weight.normal);
      root.style.setProperty("--font-weight-medium", font.weight.medium);
      root.style.setProperty("--font-weight-semibold", font.weight.semibold);
      root.style.setProperty("--font-weight-bold", font.weight.bold);
      root.style.setProperty("--line-height-tight", font.lineHeight.tight);
      root.style.setProperty("--line-height-normal", font.lineHeight.normal);
      root.style.setProperty("--line-height-relaxed", font.lineHeight.relaxed);

      // UI Style variables
      root.style.setProperty("--spacing-xs", style.spacing.xs);
      root.style.setProperty("--spacing-sm", style.spacing.sm);
      root.style.setProperty("--spacing-md", style.spacing.md);
      root.style.setProperty("--spacing-lg", style.spacing.lg);
      root.style.setProperty("--spacing-xl", style.spacing.xl);
      root.style.setProperty("--radius-sm", style.radius.sm);
      root.style.setProperty("--radius-md", style.radius.md);
      root.style.setProperty("--radius-lg", style.radius.lg);
      root.style.setProperty("--radius-xl", style.radius.xl);
      root.style.setProperty("--shadow-sm", style.shadow.sm);
      root.style.setProperty("--shadow-md", style.shadow.md);
      root.style.setProperty("--shadow-lg", style.shadow.lg);
      root.style.setProperty("--border-width", style.borderWidth);
      root.style.setProperty(
        "--component-density",
        style.componentDensity
      );

      // Apply density class
      root.classList.remove("density-compact", "density-normal", "density-spacious");
      root.classList.add(`density-${style.componentDensity}`);

      if (mode === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    },
    []
  );

  useEffect(() => {
    applyTheme(resolvedMode, currentTheme, currentUIStyle);
  }, [resolvedMode, currentTheme, currentUIStyle, applyTheme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (baseMode === "system") {
        applyTheme(e.matches ? "dark" : "light", currentTheme, currentUIStyle);
      }
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [baseMode, currentTheme, currentUIStyle, applyTheme]);

  const setBaseMode = useCallback((mode: BaseMode) => {
    setBaseModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY_BASE, mode);
    } catch {
      // ignore
    }
  }, []);

  const setThemeName = useCallback((name: string) => {
    setThemeNameState(name);
    try {
      localStorage.setItem(STORAGE_KEY_NAME, name);
    } catch {
      // ignore
    }
  }, []);

  const setUIStyle = useCallback((style: UIStyle) => {
    setUIStyleState(style);
    try {
      localStorage.setItem(STORAGE_KEY_UI_STYLE, style);
    } catch {
      // ignore
    }
  }, []);

  const value: ThemeContextValue = useMemo(
    () => ({
      baseMode,
      themeName,
      uiStyle,
      resolvedMode,
      currentTheme,
      setBaseMode,
      setThemeName,
      setUIStyle,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      baseMode,
      themeName,
      uiStyle,
      resolvedMode,
      currentTheme,
      // setBaseMode, setThemeName, setUIStyle 是稳定的 useCallback 引用，不需要作为依赖
    ]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
