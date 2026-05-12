export interface VrmBoneRotation {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface VrmGestureData {
  name: string;
  bones: Record<string, VrmBoneRotation>;
  lookAtX?: number;
  lookAtY?: number;
  tilt?: number;
  duration?: number;
}

export interface VrmExpressionPreset {
  happy: number;
  angry: number;
  sad: number;
  surprised: number;
  neutral: number;
  [key: string]: number;
}

export interface GestureEditorSaveParams {
  name: string;
  targetJson: string;
  duration: number;
  lookAtX: number;
  lookAtY: number;
  tilt: number;
}
