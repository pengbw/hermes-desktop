import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "../ErrorBoundary";

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>Content loaded</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Content loaded")).toBeInTheDocument();
  });

  it("renders default error UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("组件加载失败")).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();
  });

  it("renders custom title when provided", () => {
    render(
      <ErrorBoundary title="Custom error title">
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom error title")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
  });

  it("calls onError callback", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it("retries on button click", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function ConditionalThrow() {
      if (shouldThrow) throw new Error("Test error");
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText("组件加载失败")).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByText("重试"));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });
});
