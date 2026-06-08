import { describe, it, expect } from "vitest";
import { uiStyles, DEFAULT_UI_STYLE } from "@/themes/ui-styles";

describe("themes/ui-styles", () => {
  it("应该至少注册 1 个 UI 风格", () => {
    expect(uiStyles.length).toBeGreaterThan(0);
  });

  it("每个风格应有完整配置", () => {
    for (const s of uiStyles) {
      expect(s.name).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.spacing).toBeDefined();
      expect(s.radius).toBeDefined();
      expect(s.shadow).toBeDefined();
    }
  });

  it("DEFAULT_UI_STYLE 应该是有效值", () => {
    expect(DEFAULT_UI_STYLE).toBeTruthy();
    const names = uiStyles.map((s) => s.name);
    expect(names).toContain(DEFAULT_UI_STYLE);
  });

  it("风格名应唯一", () => {
    const names = uiStyles.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
