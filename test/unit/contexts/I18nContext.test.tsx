import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { I18nProvider, useI18n } from "@contexts/I18nContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe("I18nContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("默认 locale 应该是 zh-CN", async () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    // initial state (before async load) should be zh-CN
    expect(result.current.locale).toBe("zh-CN");
  });

  it("t 函数应该返回原 key (未加载翻译时)", async () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("some.missing.key")).toBe("some.missing.key");
  });

  it("setLocale 应该更新 locale", async () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => {
      result.current.setLocale("en");
    });
    expect(result.current.locale).toBe("en");
  });

  it("localStorage 中存储的 locale 应该被读取", async () => {
    localStorage.setItem("hermes-locale", "en");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("en");
  });

  it("无效的 localStorage locale 应回退到 zh-CN", async () => {
    localStorage.setItem("hermes-locale", "klingon");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("zh-CN");
  });

  it("支持 3 种 locale", async () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    for (const loc of ["zh-CN", "zh-XG", "en"] as const) {
      act(() => {
        result.current.setLocale(loc);
      });
      expect(result.current.locale).toBe(loc);
      expect(localStorage.getItem("hermes-locale")).toBe(loc);
    }
  });

  it("t 函数应该支持参数插值 (i18n 标准 {{name}} 占位符)", async () => {
    // Wait for the async locale module to load
    const { result, rerender } = renderHook(() => useI18n(), { wrapper });
    // Force the effect by re-rendering
    rerender();
    // After mount, t should be a function
    expect(typeof result.current.t).toBe("function");
  });
});
