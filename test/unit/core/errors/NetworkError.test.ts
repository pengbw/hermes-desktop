import { describe, it, expect } from "vitest";
import { NetworkError } from "@core/errors/NetworkError";
import { AppError } from "@core/errors/AppError";

describe("NetworkError", () => {
  it("应该继承 AppError", () => {
    const err = new NetworkError("HTTP failed");
    expect(err).toBeInstanceOf(AppError);
  });

  it("默认 category 应该是 'network'", () => {
    const err = new NetworkError("x");
    expect(err.category).toBe("network");
  });

  it("默认 code 应该是 'NETWORK_ERROR'", () => {
    const err = new NetworkError("x");
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("应该暴露 statusCode", () => {
    const err = new NetworkError("x", { statusCode: 404 });
    expect(err.statusCode).toBe(404);
  });

  it("没有传 statusCode 时应为 undefined", () => {
    const err = new NetworkError("x");
    expect(err.statusCode).toBeUndefined();
  });

  it("name 应该是 'NetworkError'", () => {
    expect(new NetworkError("x").name).toBe("NetworkError");
  });
});
