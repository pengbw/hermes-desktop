import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("应该渲染按钮文字", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("点击应该触发 onClick", () => {
    const cb = vi.fn();
    render(<Button onClick={cb}>Go</Button>);
    fireEvent.click(screen.getByText("Go"));
    expect(cb).toHaveBeenCalled();
  });

  it("disabled 按钮不能点击", () => {
    const cb = vi.fn();
    render(
      <Button disabled onClick={cb}>
        Off
      </Button>
    );
    const btn = screen.getByText("Off");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(cb).not.toHaveBeenCalled();
  });

  it("支持 6 种 variant", () => {
    const { rerender } = render(<Button variant="default">x</Button>);
    expect(screen.getByText("x").className).toContain("bg-primary");

    rerender(<Button variant="destructive">x</Button>);
    expect(screen.getByText("x").className).toContain("bg-destructive");

    rerender(<Button variant="outline">x</Button>);
    expect(screen.getByText("x").className).toContain("border-input");

    rerender(<Button variant="secondary">x</Button>);
    expect(screen.getByText("x").className).toContain("bg-secondary");

    rerender(<Button variant="ghost">x</Button>);
    expect(screen.getByText("x").className).toContain("hover:bg-accent");

    rerender(<Button variant="link">x</Button>);
    expect(screen.getByText("x").className).toContain("underline-offset-4");
  });

  it("支持 4 种 size", () => {
    const { rerender } = render(<Button size="default">x</Button>);
    expect(screen.getByText("x").className).toContain("h-9");

    rerender(<Button size="sm">x</Button>);
    expect(screen.getByText("x").className).toContain("h-8");

    rerender(<Button size="lg">x</Button>);
    expect(screen.getByText("x").className).toContain("h-10");

    rerender(<Button size="icon">x</Button>);
    expect(screen.getByText("x").className).toContain("w-9");
  });

  it("支持自定义 className", () => {
    render(<Button className="custom-cls">x</Button>);
    expect(screen.getByText("x").className).toContain("custom-cls");
  });

  it("asChild 用 Slot 渲染子元素", () => {
    render(
      <Button asChild>
        <a href="#">Link</a>
      </Button>
    );
    const link = screen.getByText("Link");
    expect(link.tagName).toBe("A");
  });
});
