import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "@hooks/common/useDebounce";

describe("useDebounce", () => {
  it("应该返回初始值", () => {
    const { result } = renderHook(() => useDebounce("initial", 300));
    expect(result.current).toBe("initial");
  });

  it("应该在 delay 后更新值", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ val }) => useDebounce(val, 300), {
      initialProps: { val: "a" },
    });
    rerender({ val: "b" });
    // 立即读取仍为旧值
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("b");
  });

  it("连续变化只触发最后一次更新", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ val }) => useDebounce(val, 300), {
      initialProps: { val: "a" },
    });
    rerender({ val: "b" });
    act(() => vi.advanceTimersByTime(100));
    rerender({ val: "c" });
    act(() => vi.advanceTimersByTime(100));
    rerender({ val: "d" });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("d");
  });
});
