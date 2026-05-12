import { describe, it, expect } from "vitest";
import {
  mapExpressionName,
  clampWeight,
  lerpWeight,
  computeExpressionResetSequence,
} from "../VrmExpressionController";

describe("VrmExpressionController", () => {
  describe("mapExpressionName", () => {
    it("maps VRM1 expression names", () => {
      expect(mapExpressionName("happy", true)).toBe("happy");
      expect(mapExpressionName("fun", true)).toBe("fun");
      expect(mapExpressionName("angry", true)).toBe("angry");
      expect(mapExpressionName("sad", true)).toBe("sad");
    });

    it("maps VRM0 expression names", () => {
      expect(mapExpressionName("happy", false)).toBe("Joy");
      expect(mapExpressionName("fun", false)).toBe("Fun");
      expect(mapExpressionName("angry", false)).toBe("Angry");
      expect(mapExpressionName("sad", false)).toBe("Sorrow");
    });

    it("maps blink expressions", () => {
      expect(mapExpressionName("blinkLeft", true)).toBe("blinkLeft");
      expect(mapExpressionName("blinkLeft", false)).toBe("Blink_L");
      expect(mapExpressionName("blinkRight", true)).toBe("blinkRight");
      expect(mapExpressionName("blinkRight", false)).toBe("Blink");
    });

    it("returns original name for unknown expressions", () => {
      expect(mapExpressionName("customExpr", true)).toBe("customExpr");
      expect(mapExpressionName("customExpr", false)).toBe("customExpr");
    });
  });

  describe("clampWeight", () => {
    it("clamps values between 0 and 1", () => {
      expect(clampWeight(0.5)).toBe(0.5);
      expect(clampWeight(1.5)).toBe(1);
      expect(clampWeight(-0.5)).toBe(0);
      expect(clampWeight(0)).toBe(0);
      expect(clampWeight(1)).toBe(1);
    });
  });

  describe("lerpWeight", () => {
    it("interpolates between current and target", () => {
      expect(lerpWeight(0, 1, 0.5)).toBe(0.5);
      expect(lerpWeight(0, 1, 0)).toBe(0);
      expect(lerpWeight(0, 1, 1)).toBe(1);
    });

    it("interpolates with different ranges", () => {
      expect(lerpWeight(0.2, 0.8, 0.5)).toBeCloseTo(0.5);
      expect(lerpWeight(1, 0, 0.5)).toBe(0.5);
    });
  });

  describe("computeExpressionResetSequence", () => {
    it("returns neutral reset for non-happy expression", () => {
      const seq = computeExpressionResetSequence("sad");
      expect(seq).toEqual([{ name: "neutral", weight: 0 }]);
    });

    it("returns happy reset sequence for happy expression", () => {
      const seq = computeExpressionResetSequence("happy");
      expect(seq).toEqual([
        { name: "neutral", weight: 0 },
        { name: "happy", weight: 0.3 },
      ]);
    });
  });
});
