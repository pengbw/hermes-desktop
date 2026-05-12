import { useCallback } from "react";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import {
  setBoneRotation as sharedSetBoneRotation,
  applyGestureSlerp as sharedApplyGestureSlerp,
  applyExpression as sharedApplyExpression,
  type GestureData,
} from "../../utils/vrmUtils";

export function useVrmAnimation(
  vrmRef: React.RefObject<
    | (VRM & {
        blendShapeProxy?: {
          getValue: (name: string) => number | null;
          setValue: (name: string, value: number) => void;
        };
      })
    | null
  >,
  bonesRef: React.RefObject<Record<string, THREE.Object3D | null>>,
  gesturesRef: React.RefObject<GestureData[]>,
  gestureStateRef: React.RefObject<{ index: number; start: number; active: boolean }>
) {
  const findGesture = useCallback(
    (name: string) => {
      return gesturesRef.current.find((g) => g.name === name);
    },
    [gesturesRef]
  );

  const getSilentTarget = useCallback((): Record<
    string,
    { x: number; y: number; z: number; w: number }
  > => {
    const silent = findGesture("silent");
    return silent?.target || {};
  }, [findGesture]);

  const setBoneRotation = useCallback(
    (bone: THREE.Object3D | null, rot: { x: number; y: number; z: number; w: number }) => {
      sharedSetBoneRotation(bone, rot);
    },
    []
  );

  const applySilentPose = useCallback(() => {
    const target = getSilentTarget();
    if (Object.keys(target).length > 0) {
      sharedApplyGestureSlerp(bonesRef.current, target, getSilentTarget(), 1);
    }
  }, [getSilentTarget, bonesRef]);

  const applyGestureSlerp = useCallback(
    (target: Record<string, { x: number; y: number; z: number; w: number }>, t: number) => {
      sharedApplyGestureSlerp(bonesRef.current, target, getSilentTarget(), t);
    },
    [getSilentTarget, bonesRef]
  );

  const applyExpression = useCallback(
    (name: string, val: number, duration?: number) => {
      sharedApplyExpression(vrmRef.current, name, val, duration, () => {
        sharedApplyExpression(vrmRef.current, "neutral", 0);
        if (name === "happy") sharedApplyExpression(vrmRef.current, "happy", 0.3);
      });
    },
    [vrmRef]
  );

  const triggerGesture = useCallback(
    (name: string) => {
      const idx = gesturesRef.current.findIndex((g) => g.name === name);
      if (idx >= 0) {
        gestureStateRef.current = { index: idx, start: performance.now(), active: true };
      }
    },
    [gesturesRef, gestureStateRef]
  );

  return {
    findGesture,
    getSilentTarget,
    setBoneRotation,
    applySilentPose,
    applyGestureSlerp,
    applyExpression,
    triggerGesture,
  };
}
