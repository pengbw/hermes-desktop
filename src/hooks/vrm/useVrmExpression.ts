import { useState, useRef, useCallback } from "react";
import type { VRM } from "@pixiv/three-vrm";
import { applyExpression as sharedApplyExpression } from "../../utils/vrmUtils";

type VrmModel =
  | (VRM & {
      blendShapeProxy?: {
        getValue: (name: string) => number | null;
        setValue: (name: string, value: number) => void;
      };
    })
  | null;

interface UseVrmExpressionOptions {
  vrmRef: React.RefObject<VrmModel>;
}

export function useVrmExpression({ vrmRef }: UseVrmExpressionOptions) {
  const [currentExpression, setCurrentExpression] = useState<string>("neutral");
  const expressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkStateRef = useRef({
    lastBlink: 0,
    isBlinking: false,
    blinkProgress: 0,
  });

  const setExpression = useCallback(
    (name: string, val: number, duration?: number) => {
      sharedApplyExpression(vrmRef.current, name, val, duration, () => {
        sharedApplyExpression(vrmRef.current, "neutral", 0);
        if (name === "happy") sharedApplyExpression(vrmRef.current, "happy", 0.3);
      });
      setCurrentExpression(name);
    },
    [vrmRef]
  );

  const setExpressionTemporary = useCallback(
    (name: string, val: number, duration: number) => {
      if (expressionTimerRef.current) {
        clearTimeout(expressionTimerRef.current);
      }
      sharedApplyExpression(vrmRef.current, name, val);
      setCurrentExpression(name);
      expressionTimerRef.current = setTimeout(() => {
        sharedApplyExpression(vrmRef.current, name, 0);
        sharedApplyExpression(vrmRef.current, "neutral", 0);
        sharedApplyExpression(vrmRef.current, "happy", 0.5);
        setCurrentExpression("neutral");
        expressionTimerRef.current = null;
      }, duration);
    },
    [vrmRef]
  );

  const resetExpression = useCallback(
    (targetExpression: string = "neutral", targetVal: number = 0) => {
      if (expressionTimerRef.current) {
        clearTimeout(expressionTimerRef.current);
        expressionTimerRef.current = null;
      }
      sharedApplyExpression(vrmRef.current, targetExpression, targetVal);
      setCurrentExpression(targetExpression);
    },
    [vrmRef]
  );

  const updateBlink = useCallback(
    (elapsed: number, delta: number) => {
      const vrm = vrmRef.current;
      if (!vrm) return;

      const blinkState = blinkStateRef.current;
      const hasVRM1 = !!vrm.expressionManager;
      const hasVRM0 = !!vrm.blendShapeProxy;

      if (elapsed - blinkState.lastBlink > 3.5 + Math.random() * 2) {
        blinkState.isBlinking = true;
        blinkState.lastBlink = elapsed;
      }

      if (blinkState.isBlinking) {
        blinkState.blinkProgress += delta * 14;
        const bv = Math.max(0, Math.sin(blinkState.blinkProgress * Math.PI));
        try {
          if (hasVRM1 && vrm.expressionManager) {
            const bl = vrm.expressionManager.getExpression("blinkLeft");
            const br = vrm.expressionManager.getExpression("blinkRight");
            if (bl) (bl as unknown as { value: number }).value = bv;
            if (br) (br as unknown as { value: number }).value = bv;
          } else if (hasVRM0 && vrm.blendShapeProxy) {
            try {
              vrm.blendShapeProxy.setValue("Blink", bv);
            } catch {}
          }
        } catch {}
        if (blinkState.blinkProgress >= 1) {
          blinkState.isBlinking = false;
          blinkState.blinkProgress = 0;
        }
      }
    },
    [vrmRef]
  );

  const resetBlinkState = useCallback(() => {
    blinkStateRef.current = {
      lastBlink: 0,
      isBlinking: false,
      blinkProgress: 0,
    };
  }, []);

  return {
    currentExpression,
    setExpression,
    setExpressionTemporary,
    resetExpression,
    updateBlink,
    resetBlinkState,
  };
}
