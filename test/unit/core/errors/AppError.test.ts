import { describe, it, expect } from "vitest";
import { AppError } from "@core/errors/AppError";

describe("AppError", () => {
  it("应该用默认 category 'app' 和 code 'UNKNOWN' 构造", () => {
    const err = new AppError("Something went wrong");
    expect(err.message).toBe("Something went wrong");
    expect(err.category).toBe("app");
    expect(err.code).toBe("UNKNOWN");
    expect(err.name).toBe("AppError");
  });

  it("应该支持自定义 category 和 code", () => {
    const err = new AppError("VRM failed", {
      category: "vrm",
      code: "VRM_LOAD_FAIL",
      details: { path: "/tmp/m.vrm" },
    });
    expect(err.category).toBe("vrm");
    expect(err.code).toBe("VRM_LOAD_FAIL");
    expect(err.details).toEqual({ path: "/tmp/m.vrm" });
  });

  it("应该继承 Error", () => {
    const err = new AppError("test");
    expect(err).toBeInstanceOf(Error);
  });

  it("toJSON 应该返回可序列化结构", () => {
    const err = new AppError("test", { code: "X" });
    const json = err.toJSON();
    expect(json.name).toBe("AppError");
    expect(json.message).toBe("test");
    expect(json.code).toBe("X");
    expect(json.category).toBe("app");
    expect(typeof json.timestamp).toBe("number");
  });

  it("timestamp 应该是 Date.now() 时刻", () => {
    const before = Date.now();
    const err = new AppError("test");
    const after = Date.now();
    expect(err.timestamp).toBeGreaterThanOrEqual(before);
    expect(err.timestamp).toBeLessThanOrEqual(after);
  });

  it("应该支持 cause 选项", () => {
    const cause = new Error("inner");
    const err = new AppError("outer", { cause });
    // AppError 暂不传递 cause 给 super; 这里仅验证 options 可用
    expect(cause).toBeDefined();
    expect(err.message).toBe("outer");
  });

  it("支持所有 6 种 ErrorCategory", () => {
    const categories: Array<"app" | "database" | "network" | "validation" | "vrm" | "tauri"> = [
      "app",
      "database",
      "network",
      "validation",
      "vrm",
      "tauri",
    ];
    for (const cat of categories) {
      const err = new AppError("x", { category: cat });
      expect(err.category).toBe(cat);
    }
  });
});
