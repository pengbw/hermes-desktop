import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ToastType = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

const DEFAULT_DURATION = 3000;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), DEFAULT_DURATION);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    toast: show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    warning: (m) => show(m, "warning"),
    info: (m) => show(m, "info"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {items.length > 0 && (
        <div className="hermes-toast-container" aria-live="polite">
          {items.map((item) => (
            <div
              key={item.id}
              className={`hermes-toast hermes-toast-${item.type}`}
              onClick={() => dismiss(item.id)}
              role="status"
            >
              <span className="hermes-toast-icon">{getIcon(item.type)}</span>
              <span className="hermes-toast-msg">{item.message}</span>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function getIcon(type: ToastType): string {
  switch (type) {
    case "success":
      return "✅";
    case "error":
      return "❌";
    case "warning":
      return "⚠️";
    default:
      return "ℹ️";
  }
}

export function useToast() {
  return useContext(ToastContext);
}
