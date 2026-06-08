import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Separator } from "@/components/ui/separator";

describe("Separator", () => {
  it("默认 decorative 时 role=none", () => {
    const { container } = render(<Separator />);
    const sep = container.firstChild as HTMLElement;
    expect(sep.getAttribute("role")).toBe("none");
  });

  it("orientation=horizontal 时高度 1px", () => {
    const { container } = render(<Separator />);
    const sep = container.firstChild as HTMLElement;
    expect(sep.className).toContain("h-[1px]");
    expect(sep.className).toContain("w-full");
  });

  it("orientation=vertical 时宽度 1px", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const sep = container.firstChild as HTMLElement;
    expect(sep.className).toContain("h-full");
    expect(sep.className).toContain("w-[1px]");
  });

  it("decorative=false 时 role=separator", () => {
    const { container } = render(<Separator decorative={false} />);
    const sep = container.firstChild as HTMLElement;
    expect(sep.getAttribute("role")).toBe("separator");
    expect(sep.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("支持自定义 className", () => {
    const { container } = render(<Separator className="my-sep" />);
    expect((container.firstChild as HTMLElement).className).toContain("my-sep");
  });
});
