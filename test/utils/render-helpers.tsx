import { type ReactNode, type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { I18nProvider } from "@contexts/I18nContext";
import { ThemeProvider } from "@contexts/ThemeContext";
import { ToastProvider } from "@contexts/ToastContext";

/**
 * 包装常见的 Provider (Theme / I18n / Toast)
 */
function AllProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  render(ui, { wrapper: AllProviders, ...options });

export * from "@testing-library/react";
export { customRender as render };
