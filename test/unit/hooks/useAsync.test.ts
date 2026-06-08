import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAsync } from "@hooks/common/useAsync";

describe("useAsync", () => {
  it("初始 state 应该是 isLoading=false, data=null, error=null", () => {
    const { result } = renderHook(() => useAsync<string>());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("execute 成功后应设置 data", async () => {
    const { result } = renderHook(() => useAsync<number>());
    await act(async () => {
      await result.current.execute(async () => 42);
    });
    expect(result.current.data).toBe(42);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("execute 失败后应设置 error", async () => {
    const { result } = renderHook(() => useAsync<number>());
    await act(async () => {
      await result.current.execute(async () => {
        throw new Error("boom");
      });
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.isLoading).toBe(false);
  });

  it("reset 应该清空所有 state", async () => {
    const { result } = renderHook(() => useAsync<number>());
    await act(async () => {
      await result.current.execute(async () => 1);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("execute 应该返回结果", async () => {
    const { result } = renderHook(() => useAsync<number>());
    let returned: number | null = null;
    await act(async () => {
      returned = await result.current.execute(async () => 7);
    });
    expect(returned).toBe(7);
  });

  it("execute 失败时返回 null", async () => {
    const { result } = renderHook(() => useAsync<number>());
    let returned: number | null = 1;
    await act(async () => {
      returned = await result.current.execute(async () => {
        throw new Error("x");
      });
    });
    expect(returned).toBeNull();
  });

  it("非 Error 抛出应包装为 Error", async () => {
    const { result } = renderHook(() => useAsync<number>());
    await act(async () => {
      await result.current.execute(async () => {
        throw "string error";
      });
    });
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
