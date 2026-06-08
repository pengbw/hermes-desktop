import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

describe("Avatar", () => {
  it("应该渲染 Avatar 容器", () => {
    const { container } = render(<Avatar data-testid="a" />);
    expect(container.querySelector("span")).toBeInTheDocument();
  });

  it("AvatarImage 应该渲染 <img>", () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.com/a.png" alt="avatar" />
      </Avatar>
    );
    const img = screen.getByAltText("avatar");
    expect(img.tagName).toBe("IMG");
  });

  it("AvatarFallback 应该渲染文本", () => {
    render(
      <Avatar>
        <AvatarFallback>FB</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText("FB")).toBeInTheDocument();
  });

  it("Avatar 容器应该支持 className", () => {
    const { container } = render(<Avatar className="my-avatar" />);
    expect(container.querySelector("span")?.className).toContain("my-avatar");
  });
});
