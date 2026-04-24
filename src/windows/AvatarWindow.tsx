import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";
import "./AvatarWindow.css";

const GREETING = "Hi 主人您好，我是你的助理小跃";

interface SeparatorItem {
  separator: true;
}

interface ActionItem {
  label: string;
  action: () => void;
  separator?: false;
}

type MenuItem = ActionItem | SeparatorItem;

export default function AvatarWindow() {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [showGreeting, setShowGreeting] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  // 初始化 Live2D
  useEffect(() => {
    let app: PIXI.Application | null = null;

    async function initLive2D() {
      if (!canvasRef.current) return;

      try {
        app = new PIXI.Application({
          view: canvasRef.current,
          width: 280,
          height: 380,
          backgroundAlpha: 0,
          autoStart: false,
        });

        const model = await Live2DModel.from("/live2d/Pio_model1/model1.json", {
          autoInteract: true,
        });

        model.anchor.set(0.5, 0.5);
        model.position.set(140, 220);
        model.scale.set(0.22);

        app.stage.addChild(model);
        app.renderer.render(app.stage);
        app.start();

        appRef.current = app;
      } catch (err) {
        console.error("Live2D init error:", err);
      }
    }

    initLive2D();

    return () => {
      if (app) {
        app.destroy(false, { children: true });
      }
    };
  }, []);

  // 隐藏 greeting 气泡
  useEffect(() => {
    const t = setTimeout(() => setShowGreeting(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // 关闭菜单
  useEffect(() => {
    if (!showMenu) return;
    const handler = () => setShowMenu(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [showMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  };

  const handleDoubleClick = () => {
    openMainWindow("chat");
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const win = getCurrentWindow();
    win.startDragging();
  };

  const menuItems: MenuItem[] = [
    { label: "🏠 首页", action: () => openMainWindow("home") },
    { label: "🗨️ 对话", action: () => openMainWindow("chat") },
    { label: "⚙️ 设置", action: () => openMainWindow("settings") },
    { label: "📦 技能中心", action: () => openMainWindow("skills") },
    { separator: true },
    { label: "🔄 重启 Agent", action: () => restartAgent() },
    { label: "📋 查看日志", action: () => openLogDir() },
    { separator: true },
    { label: "❌ 退出", action: () => quitApp() },
  ];

  return (
    <div
      className="avatar-window"
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Live2D Canvas */}
      <canvas ref={canvasRef} className="live2d-canvas" />

      {/* 打招呼气泡 */}
      {showGreeting && (
        <div className="greeting-bubble">
          <span>{GREETING}</span>
          <div className="bubble-tail" />
        </div>
      )}

      {/* 右键菜单 */}
      {showMenu && (
        <div
          className="context-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuItems.map((item, i) =>
            item.separator ? (
              <div key={i} className="menu-separator" />
            ) : (
              <div
                key={i}
                className="menu-item"
                onClick={() => {
                  setShowMenu(false);
                  item.action();
                }}
              >
                {item.label}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

async function openMainWindow(tab: string) {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const mainWin = new WebviewWindow("main", {
      url: `index.html?tab=${tab}`,
    });
    mainWin.once("tauri://error", (e) => {
      console.error("main window error:", e);
    });
  } catch (err) {
    console.error("openMainWindow error:", err);
  }
}

async function restartAgent() {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("restart_hermes");
  } catch (e) {
    console.error("restart agent error:", e);
  }
}

async function openLogDir() {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("open_log_dir");
  } catch (e) {
    console.error("open log dir error:", e);
  }
}

async function quitApp() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}
