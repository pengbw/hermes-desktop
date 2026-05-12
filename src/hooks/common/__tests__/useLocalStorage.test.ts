import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "../useLocalStorage";

describe("useLocalStorage", () => {
  const key = "test-key";

  beforeEach(() => {
    localStorage.clear();
  });

  it("returns initial value when no stored value", () => {
    const { result } = renderHook(() => useLocalStorage(key, "default"));
    expect(result.current[0]).toBe("default");
  });

  it("stores and retrieves value", () => {
    const { result } = renderHook(() => useLocalStorage(key, "default"));
    act(() => {
      result.current[1]("new value");
    });
    expect(result.current[0]).toBe("new value");
    const stored = localStorage.getItem(key);
    expect(stored).toBe('"new value"');
  });

  it("reads existing value from localStorage", () => {
    localStorage.setItem(key, JSON.stringify("existing"));
    const { result } = renderHook(() => useLocalStorage(key, "default"));
    expect(result.current[0]).toBe("existing");
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useLocalStorage(key, 0));
    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    expect(result.current[0]).toBe(1);
  });

  it("handles object values", () => {
    const initial = { name: "test", count: 0 };
    const { result } = renderHook(() => useLocalStorage(key, initial));
    act(() => {
      result.current[1]({ name: "updated", count: 5 });
    });
    expect(result.current[0]).toEqual({ name: "updated", count: 5 });
  });

  it("falls back to initial value on invalid JSON", () => {
    localStorage.setItem(key, "not-json{{{");
    const { result } = renderHook(() => useLocalStorage(key, "fallback"));
    expect(result.current[0]).toBe("fallback");
  });
});
