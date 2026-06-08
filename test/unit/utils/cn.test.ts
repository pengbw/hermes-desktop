import { describe, it, expect } from "vitest";
import { cn } from "@lib/utils";

describe("cn", () => {
  it("应该拼接 className", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("应该过滤 falsy 值", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("应该支持条件 className", () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn("base", isActive && "active", isDisabled && "disabled")).toBe("base active");
  });

  it("应该去重 tailwind 冲突类", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
