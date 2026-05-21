import type { UIStyleConfig, UIStyle } from "./types";

export const uiStyles: UIStyleConfig[] = [
  {
    name: "vega",
    label: "经典标准",
    description: "经典的 shadcn 默认样式，最为标准通用",
    spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
    radius: { sm: "0.25rem", md: "0.5rem", lg: "0.75rem", xl: "1rem" },
    shadow: {
      sm: "0 1px 2px rgba(0,0,0,0.05)",
      md: "0 4px 6px rgba(0,0,0,0.07)",
      lg: "0 10px 15px rgba(0,0,0,0.1)",
    },
    borderWidth: "1px",
    componentDensity: "normal",
  },
  {
    name: "nova",
    label: "紧凑高效",
    description: "间距更紧凑，适合信息密度要求高的后台或仪表盘",
    spacing: { xs: "0.125rem", sm: "0.25rem", md: "0.5rem", lg: "0.75rem", xl: "1rem" },
    radius: { sm: "0.125rem", md: "0.25rem", lg: "0.375rem", xl: "0.5rem" },
    shadow: {
      sm: "0 1px 2px rgba(0,0,0,0.05)",
      md: "0 2px 4px rgba(0,0,0,0.06)",
      lg: "0 4px 8px rgba(0,0,0,0.08)",
    },
    borderWidth: "1px",
    componentDensity: "compact",
  },
  {
    name: "maia",
    label: "柔和圆润",
    description: "圆角更大、风格更柔和，视觉上亲和力更强",
    spacing: { xs: "0.375rem", sm: "0.75rem", md: "1.25rem", lg: "1.75rem", xl: "2.5rem" },
    radius: { sm: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.5rem" },
    shadow: {
      sm: "0 2px 4px rgba(0,0,0,0.04)",
      md: "0 6px 12px rgba(0,0,0,0.06)",
      lg: "0 12px 24px rgba(0,0,0,0.08)",
    },
    borderWidth: "1px",
    componentDensity: "spacious",
  },
  {
    name: "lyra",
    label: "清晰结构化",
    description: "线条锐利，强调结构感，适合严谨、专业的产品",
    spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
    radius: { sm: "0px", md: "0.125rem", lg: "0.25rem", xl: "0.375rem" },
    shadow: {
      sm: "none",
      md: "0 2px 4px rgba(0,0,0,0.04)",
      lg: "0 4px 8px rgba(0,0,0,0.06)",
    },
    borderWidth: "1.5px",
    componentDensity: "normal",
  },
  {
    name: "mira",
    label: "高密度产品型",
    description: "布局更致密，专为处理复杂数据和功能的产品设计",
    spacing: { xs: "0.125rem", sm: "0.25rem", md: "0.375rem", lg: "0.625rem", xl: "0.875rem" },
    radius: { sm: "0.125rem", md: "0.25rem", lg: "0.375rem", xl: "0.5rem" },
    shadow: {
      sm: "0 1px 2px rgba(0,0,0,0.04)",
      md: "0 2px 4px rgba(0,0,0,0.05)",
      lg: "0 4px 6px rgba(0,0,0,0.06)",
    },
    borderWidth: "1px",
    componentDensity: "compact",
  },
  {
    name: "luma",
    label: "柔和流畅",
    description: "整体感觉更柔软、过渡更平滑，比 Maia 更有流动感",
    spacing: { xs: "0.5rem", sm: "0.875rem", md: "1.375rem", lg: "1.875rem", xl: "2.75rem" },
    radius: { sm: "0.625rem", md: "0.875rem", lg: "1.25rem", xl: "1.75rem" },
    shadow: {
      sm: "0 2px 6px rgba(0,0,0,0.03)",
      md: "0 8px 16px rgba(0,0,0,0.05)",
      lg: "0 16px 32px rgba(0,0,0,0.07)",
    },
    borderWidth: "0.5px",
    componentDensity: "spacious",
  },
  {
    name: "sera",
    label: "编辑排版型",
    description: "强调文字和阅读节奏，适合博客、文档等内容型网站",
    spacing: { xs: "0.375rem", sm: "0.75rem", md: "1.5rem", lg: "2.25rem", xl: "3rem" },
    radius: { sm: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem" },
    shadow: {
      sm: "0 1px 2px rgba(0,0,0,0.03)",
      md: "0 3px 6px rgba(0,0,0,0.04)",
      lg: "0 6px 12px rgba(0,0,0,0.06)",
    },
    borderWidth: "1px",
    componentDensity: "spacious",
  },
];

export const uiStyleMap = new Map<UIStyle, UIStyleConfig>(
  uiStyles.map((s) => [s.name, s])
);

export function getUIStyle(name: UIStyle): UIStyleConfig {
  return uiStyleMap.get(name) ?? uiStyles[0];
}

export const DEFAULT_UI_STYLE: UIStyle = "vega";
