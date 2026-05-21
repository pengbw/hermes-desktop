import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ThemeMode, ColorMode, ThemeContextValue } from "../themes/types";
import { getColorModeFromThemeName, getThemeDefinition } from "../themes/registry";

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: "system",
  themeName: "light",
  colorMode: "light",
  setThemeMode: () => {},
  setThemeName: () => {},
});

const STORAGE_KEY_MODE = "hermes-theme-mode";
const STORAGE_KEY_NAME = "hermes-theme-name";

const BG_MAP: Record<string, string> = {
  light: "#f5f5f7",
  dark: "#0f0f1a",
  "light-macos": "#f5f5f7",
  "dark-macos": "#1e1e1e",
};

function getSystemColorMode(): ColorMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveColorMode(mode: ThemeMode, themeName: string): ColorMode {
  if (mode === "system") {
    const sysMode = getSystemColorMode();
    if (themeName === "light" || themeName === "dark") return sysMode;
    const def = getThemeDefinition(themeName);
    if (def) return def.colorMode;
    return sysMode;
  }
  return mode;
}

function resolveThemeName(mode: ThemeMode, themeName: string): string {
  if (mode === "system") {
    if (themeName !== "light" && themeName !== "dark") return themeName;
    return getSystemColorMode();
  }
  if (mode === "light" || mode === "dark") {
    if (themeName === "light" || themeName === "dark") return mode;
    return themeName;
  }
  return themeName;
}

function applyTheme(mode: ThemeMode, themeName: string) {
  const resolved = resolveThemeName(mode, themeName);
  const colorMode = resolveColorMode(mode, themeName);

  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.backgroundColor =
    BG_MAP[resolved] || (colorMode === "dark" ? "#0f0f1a" : "#f5f5f7");
  invoke("set_titlebar_theme", { dark: colorMode === "dark" }).catch(() => {});
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    const stored = localStorage.getItem(STORAGE_KEY_MODE);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "system";
  });

  const [themeName, setThemeNameState] = useState<string>(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem(STORAGE_KEY_NAME);
    if (stored && getThemeDefinition(stored)) return stored;
    return "light";
  });

  const colorMode = resolveColorMode(themeMode, themeName);

  useEffect(() => {
    applyTheme(themeMode, themeName);
  }, [themeMode, themeName]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system", themeName);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeMode, themeName]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(STORAGE_KEY_MODE, mode);
  }, []);

  const setThemeName = useCallback(
    (name: string) => {
      setThemeNameState(name);
      localStorage.setItem(STORAGE_KEY_NAME, name);
      const def = getThemeDefinition(name);
      if (def && (themeMode === "light" || themeMode === "dark")) {
        if (def.colorMode !== themeMode) {
          setThemeModeState(def.colorMode);
          localStorage.setItem(STORAGE_KEY_MODE, def.colorMode);
        }
      }
    },
    [themeMode]
  );

  return (
    <ThemeContext.Provider value={{ themeMode, themeName, colorMode, setThemeMode, setThemeName }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { getColorModeFromThemeName, getThemeDefinition };
