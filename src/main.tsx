import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles/index.css";

import AvatarWindow from "./windows/AvatarWindow";
import MainWindow from "./windows/MainWindow";

async function bootstrap() {
  const label = getCurrentWindow().label;

  if (label === "avatar") {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <AvatarWindow />
      </React.StrictMode>
    );
  } else {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <MainWindow />
      </React.StrictMode>
    );
  }
}

bootstrap();
