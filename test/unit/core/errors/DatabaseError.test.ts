import { describe, it, expect } from "vitest";
import { DatabaseError } from "@core/errors/DatabaseError";
import { AppError } from "@core/errors/AppError";

describe("DatabaseError", () => {
  it("应该继承 AppError", () => {
    const err = new DatabaseError("DB failed");
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it("默认 category 应该是 'database'", () => {
    const err = new DatabaseError("DB failed");
    expect(err.category).toBe("database");
  });

  it("默认 code 应该是 'DB_ERROR'", () => {
    const err = new DatabaseError("DB failed");
    expect(err.code).toBe("DB_ERROR");
  });

  it("应该支持自定义 code", () => {
    const err = new DatabaseError("FK violation", { code: "FK_VIOLATION" });
    expect(err.code).toBe("FK_VIOLATION");
  });

  it("应该支持 details", () => {
    const err = new DatabaseError("insert", { details: { table: "users" } });
    expect(err.details).toEqual({ table: "users" });
  });

  it("name 应该是 'DatabaseError'", () => {
    const err = new DatabaseError("x");
    expect(err.name).toBe("DatabaseError");
  });
});
