import type { FontConfig } from "../types";

export const defaultFont: FontConfig = {
  family:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  size: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
  },
  weight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: "1.25",
    normal: "1.5",
    relaxed: "1.75",
  },
};

export const modernFont: FontConfig = {
  family:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  size: {
    xs: "0.75rem",
    sm: "0.8125rem",
    base: "0.9375rem",
    lg: "1.0625rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "2rem",
  },
  weight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: "1.2",
    normal: "1.4",
    relaxed: "1.6",
  },
};

export const elegantFont: FontConfig = {
  family:
    '"Georgia", "Noto Serif SC", "Songti SC", serif',
  size: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.375rem",
    "2xl": "1.625rem",
    "3xl": "2rem",
  },
  weight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: "1.3",
    normal: "1.6",
    relaxed: "1.8",
  },
};

export const playfulFont: FontConfig = {
  family:
    '"Nunito", "Quicksand", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  size: {
    xs: "0.8125rem",
    sm: "0.9375rem",
    base: "1.0625rem",
    lg: "1.1875rem",
    xl: "1.375rem",
    "2xl": "1.625rem",
    "3xl": "2.125rem",
  },
  weight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "800",
  },
  lineHeight: {
    tight: "1.2",
    normal: "1.5",
    relaxed: "1.7",
  },
};
