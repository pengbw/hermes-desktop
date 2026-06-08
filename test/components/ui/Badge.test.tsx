import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("应该渲染内容", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("默认 variant = default", () => {
    render(<Badge>x</Badge>);
    expect(screen.getByText("x").className).toContain("bg-primary");
  });

  it("支持 4 种 variant", () => {
    const { rerender } = render(<Badge variant="default">x</Badge>);
    expect(screen.getByText("x").className).toContain("bg-primary");

    rerender(<Badge variant="secondary">x</Badge>);
    expect(screen.getByText("x").className).toContain("bg-secondary");

    rerender(<Badge variant="destructive">x</Badge>);
    expect(screen.getByText("x").className).toContain("bg-destructive");

    rerender(<Badge variant="outline">x</Badge>);
    expect(screen.getByText("x").className).toContain("text-foreground");
  });

  it("支持自定义 className", () => {
    render(<Badge className="my-badge">x</Badge>);
    expect(screen.getByText("x").className).toContain("my-badge");
  });
});
