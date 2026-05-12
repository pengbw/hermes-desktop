import { useRef, useCallback, useState } from "react";
import * as THREE from "three";
import {
  applyGestureSlerp as sharedApplyGestureSlerp,
  parseGesturesFromDb,
  type GestureData,
} from "../../utils/vrmUtils";

interface GestureState {
  index: number;
  start: number;
  active: boolean;
}

interface UseGestureOptions {
  bonesRef: React.RefObject<Record<string, THREE.Object3D | null>>;
  onGestureComplete?: () => void;
}

export function useGesture({ bonesRef, onGestureComplete }: UseGestureOptions) {
  const gestureStateRef = useRef<GestureState>({ index: -1, start: 0, active: false });
  const gesturesRef = useRef<GestureData[]>([]);
  const [activeGesture, setActiveGesture] = useState<string | null>(null);

  const loadGestures = useCallback(
    (
      dbGestures: Array<{
        name: string;
        duration: number;
        lookAtX: number;
        lookAtY: number;
        tilt: number;
        targetJson: string;
      }>
    ) => {
      const parsed = parseGesturesFromDb(dbGestures);
      gesturesRef.current = parsed;
      return parsed;
    },
    []
  );

  const getSilentTarget = useCallback((): Record<
    string,
    { x: number; y: number; z: number; w: number }
  > => {
    const silent = gesturesRef.current.find((g) => g.name === "silent");
    return silent?.target || {};
  }, []);

  const applySilentPose = useCallback(() => {
    const target = getSilentTarget();
    if (Object.keys(target).length > 0) {
      sharedApplyGestureSlerp(bonesRef.current, target, target, 1);
    }
  }, [bonesRef, getSilentTarget]);

  const applyGestureSlerp = useCallback(
    (target: Record<string, { x: number; y: number; z: number; w: number }>, t: number) => {
      sharedApplyGestureSlerp(bonesRef.current, target, getSilentTarget(), t);
    },
    [bonesRef, getSilentTarget]
  );

  const triggerGesture = useCallback((name: string) => {
    const idx = gesturesRef.current.findIndex((g) => g.name === name);
    if (idx >= 0) {
      gestureStateRef.current = { index: idx, start: performance.now(), active: true };
      setActiveGesture(name);
    }
  }, []);

  const deactivateGesture = useCallback(() => {
    gestureStateRef.current.active = false;
    setActiveGesture(null);
    applySilentPose();
    onGestureComplete?.();
  }, [applySilentPose, onGestureComplete]);

  const getCurrentGesture = useCallback((): GestureData | undefined => {
    if (!gestureStateRef.current.active) return undefined;
    return gesturesRef.current[gestureStateRef.current.index];
  }, []);

  const getGestureProgress = useCallback((): number => {
    const g = getCurrentGesture();
    if (!g) return 1;
    return Math.min(1, (performance.now() - gestureStateRef.current.start) / g.duration);
  }, [getCurrentGesture]);

  const isGestureActive = useCallback((): boolean => {
    return gestureStateRef.current.active;
  }, []);

  const getGestureState = useCallback((): GestureState => {
    return gestureStateRef.current;
  }, []);

  return {
    gesturesRef,
    gestureStateRef,
    activeGesture,
    loadGestures,
    getSilentTarget,
    applySilentPose,
    applyGestureSlerp,
    triggerGesture,
    deactivateGesture,
    getCurrentGesture,
    getGestureProgress,
    isGestureActive,
    getGestureState,
  };
}
