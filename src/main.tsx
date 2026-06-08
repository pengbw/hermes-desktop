import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import "./styles/themes.css";

import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./contexts/I18nContext";
import { ToastProvider } from "./contexts/ToastContext";
import MainWindow from "./windows/MainWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

async function bootstrap() {
  let label = "main";
  try {
    const win = getCurrentWindow();
    label = win.label;
    // console.log("[Hermes] Window label:", label);
  } catch {
    // console.warn("[Hermes] Could not get window label, using default:", e);
  }

  try {
    const root = document.getElementById("root") as HTMLElement;

    if (label === "avatar") {
      document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
      document.body.style.background = "transparent";
      document.documentElement.style.background = "transparent";
      const { default: AvatarWindow } = await import("./windows/AvatarWindow");
      ReactDOM.createRoot(root).render(
        <React.StrictMode>
          <ThemeProvider>
            <I18nProvider>
              <ToastProvider>
                <AvatarWindow />
              </ToastProvider>
            </I18nProvider>
          </ThemeProvider>
        </React.StrictMode>
      );
    } else if (label === "chat") {
      document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
      document.body.style.background = "transparent";
      document.documentElement.style.background = "transparent";
      const { default: ChatWindow } = await import("./windows/ChatWindow");
      ReactDOM.createRoot(root).render(
        <React.StrictMode>
          <ThemeProvider>
            <I18nProvider>
              <ToastProvider>
                <ChatWindow />
              </ToastProvider>
            </I18nProvider>
          </ThemeProvider>
        </React.StrictMode>
      );
    } else {
      ReactDOM.createRoot(root).render(
        <React.StrictMode>
          <ThemeProvider>
            <I18nProvider>
              <ToastProvider>
                <MainWindow />
              </ToastProvider>
            </I18nProvider>
          </ThemeProvider>
        </React.StrictMode>
      );
    }
  } catch (error) {
    const root = document.getElementById("root") as HTMLElement;
    const container = document.createElement("div");
    container.style.cssText = "padding: 20px; color: red; font-family: monospace;";
    const heading = document.createElement("h2");
    heading.textContent = "Hermes Desktop - Bootstrap Error";
    container.appendChild(heading);
    const pre = document.createElement("pre");
    pre.textContent = String(error);
    container.appendChild(pre);
    root.appendChild(container);
  }
}

bootstrap();
