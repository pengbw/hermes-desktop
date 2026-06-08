import { describe, it, expect } from "vitest";
import { themes, getTheme, DEFAULT_THEME, themeMap } from "@/themes/registry";

describe("themes/registry", () => {
  it("应该至少注册 1 个主题", () => {
    expect(themes.length).toBeGreaterThan(0);
  });

  it("每个主题必须有 name + label + variables", () => {
    for (const t of themes) {
      expect(t.name).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.variables).toBeDefined();
      expect(t.variables.light).toBeDefined();
      expect(t.variables.dark).toBeDefined();
    }
  });

  it("主题名应该唯一", () => {
    const names = themes.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("DEFAULT_THEME 应该是 'classic'", () => {
    expect(DEFAULT_THEME).toBe("classic");
  });

  it("getTheme 应该根据名称返回主题", () => {
    const t = getTheme("vivid");
    expect(t.name).toBe("vivid");
  });

  it("getTheme 未知名称应回退到 classic", () => {
    const t = getTheme("non-existent");
    expect(t.name).toBe("classic");
  });

  it("themeMap 与 themes 长度一致", () => {
    expect(themeMap.size).toBe(themes.length);
  });
});
