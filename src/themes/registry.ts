import type { ThemeDefinition, ColorMode } from "./types";

export const builtinThemes: ThemeDefinition[] = [
  {
    name: "light",
    label: "默认亮色",
    icon: "☀️",
    colorMode: "light",
    preview: { primary: "#4fc3f7", bg: "#f5f5f7", surface: "#ffffff" },
  },
  {
    name: "light-macos",
    label: "macOS 亮色",
    icon: "🍎",
    colorMode: "light",
    preview: { primary: "#007AFF", bg: "#f5f5f7", surface: "#ffffff" },
  },
  {
    name: "light-neumorphism",
    label: "新拟态",
    icon: "🫧",
    colorMode: "light",
    preview: { primary: "#6c5ce7", bg: "#e8ecf1", surface: "#e8ecf1" },
  },
  {
    name: "light-ai-native",
    label: "AI 原生",
    icon: "🤖",
    colorMode: "light",
    preview: { primary: "#7c3aed", bg: "#f8fafc", surface: "#ffffff" },
  },
  {
    name: "dark",
    label: "默认暗色",
    icon: "🌙",
    colorMode: "dark",
    preview: { primary: "#4fc3f7", bg: "#0f0f1a", surface: "#1a1a2e" },
  },
  {
    name: "dark-macos",
    label: "macOS 暗色",
    icon: "🍎",
    colorMode: "dark",
    preview: { primary: "#0a84ff", bg: "#1e1e1e", surface: "#2d2d2d" },
  },
  {
    name: "dark-glassmorphism",
    label: "毛玻璃",
    icon: "🔮",
    colorMode: "dark",
    preview: { primary: "#667eea", bg: "#1a1035", surface: "rgba(255,255,255,0.08)" },
  },
  {
    name: "dark-cyberpunk",
    label: "赛博朋克",
    icon: "⚡",
    colorMode: "dark",
    preview: { primary: "#00f0ff", bg: "#0a0a0f", surface: "#12121a" },
  },
  {
    name: "dark-aurora",
    label: "极光",
    icon: "🌌",
    colorMode: "dark",
    preview: { primary: "#7c4dff", bg: "#0c1222", surface: "#141e33" },
  },
  {
    name: "dark-ai-native",
    label: "AI 原生",
    icon: "🤖",
    colorMode: "dark",
    preview: { primary: "#a78bfa", bg: "#0c0a1a", surface: "#1a1730" },
  },
];

export function getThemeDefinition(name: string): ThemeDefinition | undefined {
  return builtinThemes.find((t) => t.name === name);
}

export function getThemesByColorMode(mode: ColorMode): ThemeDefinition[] {
  return builtinThemes.filter((t) => t.colorMode === mode);
}

export function getColorModeFromThemeName(name: string): ColorMode {
  const def = getThemeDefinition(name);
  if (def) return def.colorMode;
  if (name.startsWith("dark")) return "dark";
  return "light";
}
