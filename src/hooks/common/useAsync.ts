import { useState, useCallback, useRef } from "react";

interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

export function useAsync<T>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    isLoading: false,
  });
  const mountedRef = useRef(true);

  const execute = useCallback(async (asyncFn: () => Promise<T>): Promise<T | null> => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const result = await asyncFn();
      if (mountedRef.current) {
        setState({ data: result, error: null, isLoading: false });
      }
      return result;
    } catch {
      if (mountedRef.current) {
        setState({
          data: null,
          error: err instanceof Error ? err : new Error(String(err)),
          isLoading: false,
        });
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return { ...state, execute, reset };
}
