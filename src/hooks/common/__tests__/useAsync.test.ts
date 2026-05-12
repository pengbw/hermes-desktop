import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAsync } from "../useAsync";

describe("useAsync", () => {
  it("has correct initial state", () => {
    const { result } = renderHook(() => useAsync<string>());
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("handles successful async operation", async () => {
    const { result } = renderHook(() => useAsync<string>());

    let promise: Promise<string | null>;
    act(() => {
      promise = result.current.execute(async () => "success");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await promise;
    });

    expect(result.current.data).toBe("success");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("handles failed async operation", async () => {
    const { result } = renderHook(() => useAsync<string>());

    let promise: Promise<string | null>;
    act(() => {
      promise = result.current.execute(async () => {
        throw new Error("failed");
      });
    });

    await act(async () => {
      await promise;
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("failed");
    expect(result.current.isLoading).toBe(false);
  });

  it("handles non-Error throws", async () => {
    const { result } = renderHook(() => useAsync<string>());

    let promise: Promise<string | null>;
    act(() => {
      promise = result.current.execute(async () => {
        throw "string error";
      });
    });

    await act(async () => {
      await promise;
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("string error");
  });

  it("resets state", async () => {
    const { result } = renderHook(() => useAsync<string>());

    let promise: Promise<string | null>;
    act(() => {
      promise = result.current.execute(async () => "data");
    });
    await act(async () => {
      await promise;
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("returns result from execute", async () => {
    const { result } = renderHook(() => useAsync<string>());

    let resolvedValue: string | null = null;
    await act(async () => {
      resolvedValue = await result.current.execute(async () => "result");
    });

    expect(resolvedValue).toBe("result");
  });

  it("returns null from execute on error", async () => {
    const { result } = renderHook(() => useAsync<string>());

    let resolvedValue: string | null = "initial";
    await act(async () => {
      resolvedValue = await result.current.execute(async () => {
        throw new Error("fail");
      });
    });

    expect(resolvedValue).toBeNull();
  });
});
