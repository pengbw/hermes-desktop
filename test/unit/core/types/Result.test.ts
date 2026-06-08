import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, unwrap, unwrapOr } from "@core/types/Result";

describe("Result", () => {
  describe("ok", () => {
    it("应该返回 ok 包装的值", () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(42);
    });

    it("支持任意类型", () => {
      expect(ok("string").ok).toBe(true);
      expect(ok(null).ok).toBe(true);
      expect(ok({ a: 1 }).ok).toBe(true);
    });
  });

  describe("err", () => {
    it("应该返回 err 包装的 error", () => {
      const r = err("fail");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("fail");
    });
  });

  describe("isOk", () => {
    it("ok 结果返回 true", () => {
      expect(isOk(ok(1))).toBe(true);
    });

    it("err 结果返回 false", () => {
      expect(isOk(err("x"))).toBe(false);
    });
  });

  describe("isErr", () => {
    it("err 结果返回 true", () => {
      expect(isErr(err("x"))).toBe(true);
    });

    it("ok 结果返回 false", () => {
      expect(isErr(ok(1))).toBe(false);
    });
  });

  describe("unwrap", () => {
    it("ok 结果返回值", () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it("err 结果抛出 error", () => {
      expect(() => unwrap(err(new Error("boom")))).toThrow("boom");
    });
  });

  describe("unwrapOr", () => {
    it("ok 结果返回值", () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it("err 结果返回 default", () => {
      expect(unwrapOr(err("x"), 99)).toBe(99);
    });
  });
});
