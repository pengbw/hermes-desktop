import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("应该渲染 input", () => {
    render(<Input placeholder="Enter" />);
    expect(screen.getByPlaceholderText("Enter")).toBeInTheDocument();
  });

  it("type 属性应该传递", () => {
    render(<Input type="password" placeholder="pwd" />);
    const el = screen.getByPlaceholderText("pwd");
    expect(el.getAttribute("type")).toBe("password");
  });

  it("onChange 应该触发", () => {
    const cb = vi.fn();
    render(<Input onChange={cb} placeholder="x" />);
    fireEvent.change(screen.getByPlaceholderText("x"), { target: { value: "hi" } });
    expect(cb).toHaveBeenCalled();
  });

  it("disabled 应该被应用", () => {
    render(<Input disabled placeholder="x" />);
    expect(screen.getByPlaceholderText("x")).toBeDisabled();
  });

  it("支持自定义 className", () => {
    render(<Input className="my-input" placeholder="x" />);
    expect(screen.getByPlaceholderText("x").className).toContain("my-input");
  });

  it("支持 ref", () => {
    let refValue: HTMLInputElement | null = null;
    render(
      <Input
        ref={(el) => {
          refValue = el;
        }}
        placeholder="x"
      />
    );
    expect(refValue).not.toBeNull();
  });
});
