import { useRef, useCallback } from "react";

export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef<number>(0);
  const lastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: unknown[]) => {
      const now = Date.now();
      const remaining = delay - (now - lastCallRef.current);

      if (remaining <= 0) {
        if (lastTimerRef.current) {
          clearTimeout(lastTimerRef.current);
          lastTimerRef.current = null;
        }
        lastCallRef.current = now;
        callback(...args);
      } else if (!lastTimerRef.current) {
        lastTimerRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          lastTimerRef.current = null;
          callback(...args);
        }, remaining);
      }
    },
    [callback, delay]
  ) as T;
}
