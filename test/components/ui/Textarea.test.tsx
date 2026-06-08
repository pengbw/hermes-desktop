import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "@/components/ui/textarea";

describe("Textarea", () => {
  it("应该渲染 textarea", () => {
    render(<Textarea placeholder="say" />);
    expect(screen.getByPlaceholderText("say")).toBeInTheDocument();
  });

  it("onChange 应该触发", () => {
    const cb = vi.fn();
    render(<Textarea onChange={cb} placeholder="x" />);
    fireEvent.change(screen.getByPlaceholderText("x"), { target: { value: "hi" } });
    expect(cb).toHaveBeenCalled();
  });

  it("disabled 应该被应用", () => {
    render(<Textarea disabled placeholder="x" />);
    expect(screen.getByPlaceholderText("x")).toBeDisabled();
  });

  it("支持自定义 className", () => {
    render(<Textarea className="my-text" placeholder="x" />);
    expect(screen.getByPlaceholderText("x").className).toContain("my-text");
  });
});
