import { describe, it, expect } from "vitest";
import { lerp, easeInOut, slerpPose } from "@utils/vrmUtils";

describe("lerp", () => {
  it("t=0 应返回 a", () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });

  it("t=1 应返回 b", () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it("t=0.5 应返回中点", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it("t=0.3 线性插值", () => {
    expect(lerp(0, 100, 0.3)).toBe(30);
  });
});

describe("easeInOut", () => {
  it("t=0 应返回 0", () => {
    expect(easeInOut(0)).toBe(0);
  });

  it("t=1 应返回 1", () => {
    expect(easeInOut(1)).toBe(1);
  });

  it("t=0.5 应返回 0.5", () => {
    expect(easeInOut(0.5)).toBe(0.5);
  });

  it("t<0.5 用前半段 (2t²)", () => {
    expect(easeInOut(0.25)).toBeCloseTo(2 * 0.0625, 5);
  });

  it("t>0.5 用后半段", () => {
    expect(easeInOut(0.75)).toBeCloseTo(-1 + (4 - 2 * 0.75) * 0.75, 5);
  });
});

describe("slerpPose", () => {
  it("t=0 应返回 base", () => {
    const base = { x: 0, y: 0, z: 0, w: 1 };
    const target = { x: 0, y: 0, z: 0, w: 1 };
    const result = slerpPose(base, target, 0);
    expect(result.w).toBeCloseTo(1, 5);
  });

  it("t=1 应返回 target", () => {
    const base = { x: 0, y: 0, z: 0, w: 1 };
    const target = { x: 0, y: 0, z: 0.707, w: 0.707 };
    const result = slerpPose(base, target, 1);
    expect(result.z).toBeCloseTo(0.707, 2);
    expect(result.w).toBeCloseTo(0.707, 2);
  });

  it("相同 quaternion 应不变", () => {
    const q = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 };
    const r = slerpPose(q, q, 0.5);
    expect(r.x).toBeCloseTo(0.1, 1);
    expect(r.y).toBeCloseTo(0.2, 1);
    expect(r.z).toBeCloseTo(0.3, 1);
    expect(r.w).toBeCloseTo(0.9, 1);
  });
});
