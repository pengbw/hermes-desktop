import { describe, it, expect } from "vitest";
import { ValidationError } from "@core/errors/ValidationError";
import { AppError } from "@core/errors/AppError";

describe("ValidationError", () => {
  it("应该继承 AppError", () => {
    expect(new ValidationError("x")).toBeInstanceOf(AppError);
  });

  it("默认 category 应该是 'validation'", () => {
    expect(new ValidationError("x").category).toBe("validation");
  });

  it("默认 code 应该是 'VALIDATION_ERROR'", () => {
    expect(new ValidationError("x").code).toBe("VALIDATION_ERROR");
  });

  it("应该暴露 fields 字段", () => {
    const err = new ValidationError("x", { fields: { name: "required" } });
    expect(err.fields).toEqual({ name: "required" });
  });

  it("没有传 fields 时应该是空对象", () => {
    expect(new ValidationError("x").fields).toEqual({});
  });

  it("name 应该是 'ValidationError'", () => {
    expect(new ValidationError("x").name).toBe("ValidationError");
  });

  it("应该支持自定义 code", () => {
    expect(new ValidationError("x", { code: "REQUIRED" }).code).toBe("REQUIRED");
  });
});
