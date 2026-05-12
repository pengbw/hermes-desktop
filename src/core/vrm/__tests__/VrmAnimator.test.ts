import { describe, it, expect } from "vitest";
import {
  createAnimationState,
  updateBreath,
  updateBlink,
  computeHeadRotation,
  computeIdleSway,
  computeGestureProgress,
  DEFAULT_BREATH_CONFIG,
} from "../VrmAnimator";

describe("VrmAnimator", () => {
  describe("createAnimationState", () => {
    it("creates initial animation state", () => {
      const state = createAnimationState();
      expect(state.breathElapsed).toBe(0);
      expect(state.lastBlink).toBe(0);
      expect(state.isBlinking).toBe(false);
      expect(state.blinkProgress).toBe(0);
    });
  });

  describe("updateBreath", () => {
    it("updates breath elapsed time", () => {
      const state = createAnimationState();
      updateBreath(state, 0.5);
      expect(state.breathElapsed).toBe(0.5);
    });

    it("returns breath values within amplitude range", () => {
      const state = createAnimationState();
      const { breathY, breathSway } = updateBreath(state, 1.0);
      expect(Math.abs(breathY)).toBeLessThanOrEqual(DEFAULT_BREATH_CONFIG.amplitudeY);
      expect(Math.abs(breathSway)).toBeLessThanOrEqual(DEFAULT_BREATH_CONFIG.amplitudeSway);
    });

    it("uses custom config", () => {
      const state = createAnimationState();
      const customConfig = { speedY: 2, amplitudeY: 0.01, speedSway: 1, amplitudeSway: 0.005 };
      const { breathY } = updateBreath(state, 0.5, customConfig);
      expect(Math.abs(breathY)).toBeLessThanOrEqual(0.01);
    });
  });

  describe("updateBlink", () => {
    it("returns no blink initially", () => {
      const state = createAnimationState();
      const result = updateBlink(state, 0, 0.016);
      expect(result.shouldBlink).toBe(false);
      expect(result.blinkValue).toBe(0);
    });

    it("starts blinking after interval", () => {
      const state = createAnimationState();
      const result = updateBlink(state, 5, 0.016, 3, 0);
      expect(result.shouldBlink).toBe(true);
    });

    it("completes blink cycle", () => {
      const state = createAnimationState();
      state.isBlinking = true;
      state.blinkProgress = 0;
      const result = updateBlink(state, 5, 0.5);
      expect(result.shouldBlink).toBe(true);
    });
  });

  describe("computeHeadRotation", () => {
    it("returns mouse rotation without gesture", () => {
      const result = computeHeadRotation(0.1, 0.2);
      expect(result.targetRotX).toBe(0.1);
      expect(result.targetRotY).toBe(0.2);
      expect(result.targetRotZ).toBe(0);
    });

    it("applies gesture lookAt offset", () => {
      const result = computeHeadRotation(0.1, 0.2, { x: 1, y: 1 });
      expect(result.targetRotX).toBeCloseTo(0.1 + 1 * 0.3);
      expect(result.targetRotY).toBeCloseTo(0.2 + 1 * 0.3);
    });

    it("applies gesture tilt", () => {
      const result = computeHeadRotation(0, 0, undefined, 0.5);
      expect(result.targetRotZ).toBe(0.5);
    });

    it("applies thinking sway", () => {
      const result = computeHeadRotation(0, 0, undefined, undefined, true, 1000);
      expect(result.targetRotY).not.toBe(0);
      expect(result.targetRotX).not.toBe(0);
    });
  });

  describe("computeIdleSway", () => {
    it("returns sway value", () => {
      const sway = computeIdleSway(0);
      expect(sway).toBe(0);
    });

    it("returns sway within amplitude", () => {
      const sway = computeIdleSway(1.0, 0.06);
      expect(Math.abs(sway)).toBeLessThanOrEqual(0.06);
    });
  });

  describe("computeGestureProgress", () => {
    it("returns progress at start", () => {
      const result = computeGestureProgress(0, 1000, 0);
      expect(result.t).toBe(0);
      expect(result.e).toBe(0);
      expect(result.isComplete).toBe(false);
    });

    it("returns complete at end", () => {
      const result = computeGestureProgress(0, 1000, 1000);
      expect(result.t).toBe(1);
      expect(result.isComplete).toBe(true);
    });

    it("returns mid progress", () => {
      const result = computeGestureProgress(0, 1000, 500);
      expect(result.t).toBe(0.5);
      expect(result.isComplete).toBe(false);
    });

    it("uses ease-in-out curve", () => {
      const result = computeGestureProgress(0, 1000, 250);
      expect(result.e).not.toBe(0.25);
      expect(result.e).toBeGreaterThan(0);
      expect(result.e).toBeLessThan(1);
    });
  });
});
