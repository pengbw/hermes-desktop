import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@contexts/ThemeContext";
import { I18nProvider, useI18n } from "@contexts/I18nContext";
import { ToastProvider, useToast } from "@contexts/ToastContext";
import type { ReactNode } from "react";

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

describe("Theme + I18n 联动", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("应该同时使用 Theme 和 I18n 上下文", () => {
    function Demo() {
      const theme = useTheme();
      const { locale, t } = useI18n();
      return (
        <div>
          <span data-testid="theme">{theme.themeName}</span>
          <span data-testid="locale">{locale}</span>
          <span data-testid="t">{t("app.name")}</span>
        </div>
      );
    }
    render(
      <AllProviders>
        <Demo />
      </AllProviders>
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("classic");
    expect(screen.getByTestId("locale")).toHaveTextContent("zh-CN");
  });
});

describe("Toast 在 Theme + I18n Provider 中可用", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("toast.error 应该正常显示", () => {
    function Demo() {
      const toast = useToast();
      return <button onClick={() => toast.error("Error from i18n")}>trigger</button>;
    }
    render(
      <AllProviders>
        <Demo />
      </AllProviders>
    );
    fireEvent.click(screen.getByText("trigger"));
    expect(screen.getByText("Error from i18n")).toBeInTheDocument();
  });
});
