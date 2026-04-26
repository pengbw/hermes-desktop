import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";

import AvatarWindow from "./windows/AvatarWindow";
import ChatWindow from "./windows/ChatWindow";
import MainWindow from "./windows/MainWindow";

async function bootstrap() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const label = win.label;
    console.log("[Hermes] Window label:", label);

    const root = document.getElementById("root") as HTMLElement;

    if (label === "avatar") {
      document.querySelectorAll('link[rel="icon"]').forEach(el => el.remove());
      document.body.style.background = "transparent";
      document.documentElement.style.background = "transparent";
      ReactDOM.createRoot(root).render(
        <React.StrictMode>
          <AvatarWindow />
        </React.StrictMode>
      );
    } else if (label === "chat") {
      document.querySelectorAll('link[rel="icon"]').forEach(el => el.remove());
      document.body.style.background = "transparent";
      document.documentElement.style.background = "transparent";
      ReactDOM.createRoot(root).render(
        <React.StrictMode>
          <ChatWindow />
        </React.StrictMode>
      );
    } else {
      ReactDOM.createRoot(root).render(
        <React.StrictMode>
          <MainWindow />
        </React.StrictMode>
      );
    }
  } catch (error) {
    console.error("[Hermes] Failed to bootstrap app:", error);
    const root = document.getElementById("root") as HTMLElement;
    root.innerHTML = `<div style="padding: 20px; color: red; font-family: monospace;">
      <h2>Hermes Desktop - Bootstrap Error</h2>
      <pre>${error}</pre>
    </div>`;
  }
}

bootstrap();
