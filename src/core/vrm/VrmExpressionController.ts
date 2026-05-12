export interface ExpressionWeight {
  name: string;
  weight: number;
}

export interface ExpressionMapEntry {
  vrm1: string;
  vrm0: string;
}

const EXPRESSION_MAP: Record<string, ExpressionMapEntry> = {
  happy: { vrm1: "happy", vrm0: "Joy" },
  fun: { vrm1: "fun", vrm0: "Fun" },
  angry: { vrm1: "angry", vrm0: "Angry" },
  sad: { vrm1: "sad", vrm0: "Sorrow" },
  surprised: { vrm1: "surprised", vrm0: "Surprise" },
  neutral: { vrm1: "neutral", vrm0: "Joy" },
  aa: { vrm1: "aa", vrm0: "A" },
  winkLeft: { vrm1: "blinkLeft", vrm0: "Blink_L" },
  blinkLeft: { vrm1: "blinkLeft", vrm0: "Blink_L" },
  blinkRight: { vrm1: "blinkRight", vrm0: "Blink" },
};

export function mapExpressionName(name: string, isVRM1: boolean): string {
  const entry = EXPRESSION_MAP[name];
  if (entry) {
    return isVRM1 ? entry.vrm1 : entry.vrm0;
  }
  return name;
}

export function clampWeight(val: number): number {
  return Math.min(1, Math.max(0, val));
}

export function lerpWeight(current: number, target: number, t: number): number {
  return current + (target - current) * t;
}

export function computeExpressionResetSequence(expressionName: string): ExpressionWeight[] {
  const sequence: ExpressionWeight[] = [{ name: "neutral", weight: 0 }];
  if (expressionName === "happy") {
    sequence.push({ name: "happy", weight: 0.3 });
  }
  return sequence;
}
