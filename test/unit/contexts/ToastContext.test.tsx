import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@contexts/ToastContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe("ToastContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("应该返回 toast 函数", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(typeof result.current.toast).toBe("function");
    expect(typeof result.current.success).toBe("function");
    expect(typeof result.current.error).toBe("function");
    expect(typeof result.current.warning).toBe("function");
    expect(typeof result.current.info).toBe("function");
  });

  it("toast() 应该渲染 toast 消息", () => {
    function Demo() {
      const t = useToast();
      return (
        <div>
          <button onClick={() => t.toast("Hello")}>Trigger</button>
        </div>
      );
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("Trigger").click();
    });
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("success 应该使用 success 类型", () => {
    function Demo() {
      const t = useToast();
      return <button onClick={() => t.success("Done!")}>Go</button>;
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("Go").click();
    });
    const toast = screen.getByText("Done!").parentElement;
    expect(toast?.className).toContain("hermes-toast-success");
  });

  it("error 应该使用 error 类型", () => {
    function Demo() {
      const t = useToast();
      return <button onClick={() => t.error("Failed!")}>Go</button>;
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("Go").click();
    });
    expect(screen.getByText("Failed!").parentElement?.className).toContain("hermes-toast-error");
  });

  it("warning 应该使用 warning 类型", () => {
    function Demo() {
      const t = useToast();
      return <button onClick={() => t.warning("Caution!")}>Go</button>;
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("Go").click();
    });
    expect(screen.getByText("Caution!").parentElement?.className).toContain("hermes-toast-warning");
  });

  it("info 应该使用 info 类型", () => {
    function Demo() {
      const t = useToast();
      return <button onClick={() => t.info("Note!")}>Go</button>;
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("Go").click();
    });
    expect(screen.getByText("Note!").parentElement?.className).toContain("hermes-toast-info");
  });

  it("3 秒后 toast 应该自动消失", () => {
    function Demo() {
      const t = useToast();
      return <button onClick={() => t.toast("Bye")}>Go</button>;
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("Go").click();
    });
    expect(screen.getByText("Bye")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText("Bye")).not.toBeInTheDocument();
  });

  it("点击 toast 应该立即消失", () => {
    function Demo() {
      const t = useToast();
      return <button onClick={() => t.toast("Click me")}>Go</button>;
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("Go").click();
    });
    const toastEl = screen.getByText("Click me").parentElement!;
    act(() => {
      toastEl.click();
    });
    expect(screen.queryByText("Click me")).not.toBeInTheDocument();
  });

  it("应该支持多个 toast 同时显示", () => {
    function Demo() {
      const t = useToast();
      return (
        <>
          <button onClick={() => t.toast("ToastA")}>A</button>
          <button onClick={() => t.toast("ToastB")}>B</button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("A").click();
    });
    expect(screen.getByText("ToastA")).toBeInTheDocument();
    act(() => {
      screen.getByText("B").click();
    });
    expect(screen.getByText("ToastB")).toBeInTheDocument();
    // 两个都在
    expect(screen.getByText("ToastA")).toBeInTheDocument();
    expect(screen.getByText("ToastB")).toBeInTheDocument();
  });
});
