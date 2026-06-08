import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("💥");
  return <div>Safe Content</div>;
}

describe("ErrorBoundary", () => {
  // Suppress React's noisy error logging in tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it("正常渲染子组件", () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("子组件抛错时显示默认 fallback", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("组件加载失败")).toBeInTheDocument();
    expect(screen.getByText("💥")).toBeInTheDocument();
  });

  it("支持自定义 title", () => {
    render(
      <ErrorBoundary title="加载聊天失败">
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("加载聊天失败")).toBeInTheDocument();
  });

  it("支持自定义 fallback", () => {
    render(
      <ErrorBoundary fallback={<div>Custom Fallback</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom Fallback")).toBeInTheDocument();
  });

  it("点击重试按钮后调用 setState", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("组件加载失败")).toBeInTheDocument();
    const retryBtn = screen.getByText("重试");
    // 点击不会抛错 (setState 内部调用)
    fireEvent.click(retryBtn);
    // setState 后仍显示错误 (因为子组件还会再 throw)
    expect(screen.getByText("组件加载失败")).toBeInTheDocument();
  });

  it("子组件抛错时调用 onError", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalled();
    const call = onError.mock.calls[0];
    expect(call[0].message).toBe("💥");
    expect(call[1]).toBeDefined(); // errorInfo
  });
});
