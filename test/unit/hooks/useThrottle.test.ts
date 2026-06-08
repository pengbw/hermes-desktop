import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useThrottle } from "@hooks/common/useThrottle";

describe("useThrottle", () => {
  it("第一次调用应该立即执行", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useThrottle(cb, 300));
    act(() => {
      result.current("a");
    });
    expect(cb).toHaveBeenCalledWith("a");
  });

  it("在 delay 内的连续调用应该节流", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const { result } = renderHook(() => useThrottle(cb, 300));
    act(() => {
      result.current("a");
    });
    expect(cb).toHaveBeenCalledTimes(1);
    // 100ms 后再次调用 (仍在节流窗口内)
    act(() => {
      vi.advanceTimersByTime(100);
      result.current("b");
    });
    // 立即调用不触发
    expect(cb).toHaveBeenCalledTimes(1);
    // 推进到节流结束
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // 节流定时器触发最后一次调用
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith("b");
  });
});
