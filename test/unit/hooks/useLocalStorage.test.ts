import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "@hooks/common/useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("localStorage 为空时应使用 initialValue", () => {
    const { result } = renderHook(() => useLocalStorage<number>("k", 10));
    expect(result.current[0]).toBe(10);
  });

  it("localStorage 有值时应该读取", () => {
    localStorage.setItem("k", JSON.stringify(99));
    const { result } = renderHook(() => useLocalStorage<number>("k", 10));
    expect(result.current[0]).toBe(99);
  });

  it("setValue 应该更新 state 和 localStorage", () => {
    const { result } = renderHook(() => useLocalStorage<number>("k", 0));
    act(() => {
      result.current[1](5);
    });
    expect(result.current[0]).toBe(5);
    expect(JSON.parse(localStorage.getItem("k")!)).toBe(5);
  });

  it("setValue 支持函数式更新", () => {
    const { result } = renderHook(() => useLocalStorage<number>("k", 0));
    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    expect(result.current[0]).toBe(2);
  });

  it("localStorage 解析失败应回退到 initialValue", () => {
    localStorage.setItem("k", "not-json");
    const { result } = renderHook(() => useLocalStorage<number>("k", 7));
    expect(result.current[0]).toBe(7);
  });
});
