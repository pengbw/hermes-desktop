export interface BoneRotation {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface AnimationState {
  breathElapsed: number;
  lastBlink: number;
  isBlinking: boolean;
  blinkProgress: number;
}

export interface BreathConfig {
  speedY: number;
  amplitudeY: number;
  speedSway: number;
  amplitudeSway: number;
}

export interface GestureState {
  index: number;
  start: number;
  active: boolean;
}

export const DEFAULT_BREATH_CONFIG: BreathConfig = {
  speedY: 1.2,
  amplitudeY: 0.004,
  speedSway: 0.8,
  amplitudeSway: 0.002,
};

export function createAnimationState(): AnimationState {
  return {
    breathElapsed: 0,
    lastBlink: 0,
    isBlinking: false,
    blinkProgress: 0,
  };
}

export function updateBreath(
  state: AnimationState,
  delta: number,
  config: BreathConfig = DEFAULT_BREATH_CONFIG
): { breathY: number; breathSway: number } {
  state.breathElapsed += delta;
  const breathY = Math.sin(state.breathElapsed * config.speedY) * config.amplitudeY;
  const breathSway = Math.sin(state.breathElapsed * config.speedSway) * config.amplitudeSway;
  return { breathY, breathSway };
}

export function updateBlink(
  state: AnimationState,
  elapsed: number,
  delta: number,
  blinkInterval: number = 3.5,
  blinkRandomRange: number = 2
): { shouldBlink: boolean; blinkValue: number; blinkDone: boolean } {
  if (elapsed - state.lastBlink > blinkInterval + Math.random() * blinkRandomRange) {
    state.isBlinking = true;
    state.lastBlink = elapsed;
  }

  if (state.isBlinking) {
    state.blinkProgress += delta * 14;
    const bv = Math.max(0, Math.sin(state.blinkProgress * Math.PI));
    const blinkDone = state.blinkProgress >= 1;
    if (blinkDone) {
      state.isBlinking = false;
      state.blinkProgress = 0;
    }
    return { shouldBlink: true, blinkValue: bv, blinkDone };
  }

  return { shouldBlink: false, blinkValue: 0, blinkDone: false };
}

export function computeHeadRotation(
  mouseRotX: number,
  mouseRotY: number,
  gestureLookAt?: { x: number; y: number },
  gestureTilt?: number,
  isThinking?: boolean,
  now?: number
): { targetRotX: number; targetRotY: number; targetRotZ: number } {
  let targetRotX = mouseRotX;
  let targetRotY = mouseRotY;
  let targetRotZ = 0;

  if (gestureLookAt) {
    targetRotX += gestureLookAt.y * 0.3;
    targetRotY += gestureLookAt.x * 0.3;
  }

  if (gestureTilt) {
    targetRotZ = gestureTilt;
  }

  if (isThinking && now) {
    targetRotY += Math.sin(now * 0.0007) * 0.08;
    targetRotX += Math.sin(now * 0.0005 + 1.2) * 0.03;
  }

  return { targetRotX, targetRotY, targetRotZ };
}

export function computeIdleSway(elapsed: number, amplitude: number = 0.06): number {
  return Math.sin(elapsed * 0.4) * amplitude;
}

export function computeGestureProgress(
  gestureStart: number,
  gestureDuration: number,
  now: number
): { t: number; e: number; isComplete: boolean } {
  const t = Math.min(1, (now - gestureStart) / gestureDuration);
  const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  return { t, e, isComplete: t >= 1 };
}
