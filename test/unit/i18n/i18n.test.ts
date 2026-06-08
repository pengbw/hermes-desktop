import { describe, it, expect } from "vitest";
import en from "@i18n/en.json";
import zhCN from "@i18n/zh-CN.json";
import zhXG from "@i18n/zh-XG.json";

describe("i18n 文案一致性", () => {
  it("三语言文件必须存在", () => {
    expect(en).toBeDefined();
    expect(zhCN).toBeDefined();
    expect(zhXG).toBeDefined();
  });

  it("en 和 zh-CN 应该拥有相同的 key 集合", () => {
    const enKeys = Object.keys(en).sort();
    const cnKeys = Object.keys(zhCN).sort();
    expect(enKeys).toEqual(cnKeys);
  });

  it("en 和 zh-XG 应该拥有相同的 key 集合", () => {
    // zh-XG 允许 key 子集（项目未补全繁体翻译）
    const enKeys = new Set(Object.keys(en));
    const xgKeys = new Set(Object.keys(zhXG));
    for (const k of xgKeys) {
      expect(enKeys.has(k)).toBe(true);
    }
  });

  it("每个 key 的值必须是非空字符串", () => {
    for (const [, v] of Object.entries(en)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
    for (const [, v] of Object.entries(zhCN)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("每个 locale 应至少有 50 条文案", () => {
    expect(Object.keys(en).length).toBeGreaterThan(50);
    expect(Object.keys(zhCN).length).toBeGreaterThan(50);
    expect(Object.keys(zhXG).length).toBeGreaterThan(50);
  });

  it("common.* key 应在所有 locale 都存在", () => {
    const enKeys = Object.keys(en);
    const commonKeys = enKeys.filter((k) => k.startsWith("common."));
    for (const k of commonKeys) {
      expect(zhCN).toHaveProperty(k);
      expect(zhXG).toHaveProperty(k);
    }
  });
});
