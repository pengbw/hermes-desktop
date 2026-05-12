import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, unwrap, unwrapOr } from "../Result";

describe("Result type", () => {
  describe("ok()", () => {
    it("creates a successful result", () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it("creates a successful result with string", () => {
      const result = ok("hello");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("hello");
      }
    });

    it("creates a successful result with null", () => {
      const result = ok(null);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe("err()", () => {
    it("creates an error result", () => {
      const result = err(new Error("fail"));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("fail");
      }
    });

    it("creates an error result with string", () => {
      const result = err("something went wrong");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("something went wrong");
      }
    });
  });

  describe("isOk()", () => {
    it("returns true for ok result", () => {
      expect(isOk(ok(1))).toBe(true);
    });

    it("returns false for err result", () => {
      expect(isOk(err("fail"))).toBe(false);
    });
  });

  describe("isErr()", () => {
    it("returns false for ok result", () => {
      expect(isErr(ok(1))).toBe(false);
    });

    it("returns true for err result", () => {
      expect(isErr(err("fail"))).toBe(true);
    });
  });

  describe("unwrap()", () => {
    it("returns value for ok result", () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it("throws error for err result", () => {
      expect(() => unwrap(err(new Error("fail")))).toThrow("fail");
    });
  });

  describe("unwrapOr()", () => {
    it("returns value for ok result", () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it("returns default for err result", () => {
      expect(unwrapOr(err(new Error("fail")), 0)).toBe(0);
    });
  });
});
