import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./AvatarWindow.css";

const GREETING = "主人您好，我是小跃";
const MODEL_PATH = "/live2d/Pio_model1/model1.json";

export default function AvatarWindow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const [showGreeting, setShowGreeting] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    const initLive2D = async () => {
      try {
        // 检查 Cubism 2 core 是否可用
        const hasCubismCore = typeof (window as any).Live2DModelCore !== "undefined"
          || typeof (window as any).Live2D !== "undefined";

        if (!hasCubismCore) {
          // 尝试动态加载 Cubism 2 core
          try {
            await loadScript("/live2d/core/live2d.min.js");
          } catch {
            console.warn("[Avatar] Cubism 2 core not found, trying to continue...");
          }
        }

        const PIXI = await import("pixi.js");
        const { Live2DModel } = await import("pixi-live2d-display");

        if (destroyed) return;

        try {
          // @ts-expect-error pixi-live2d-display ticker type mismatch
          Live2DModel.registerTicker(PIXI.Ticker);
        } catch (e) {
          console.warn("[Avatar] registerTicker already registered or failed:", e);
        }

        const app = new PIXI.Application({
          width: 280,
          height: 380,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        if (destroyed) {
          app.destroy(true);
          return;
        }

        containerRef.current!.appendChild(app.view as HTMLCanvasElement);
        appRef.current = app;

        const model = await Live2DModel.from(MODEL_PATH, {
          autoUpdate: true,
        });

        if (destroyed) return;

        modelRef.current = model;
        // @ts-expect-error pixi-live2d-display DisplayObject type mismatch
        app.stage.addChild(model);

        const scaleX = 280 / model.width;
        const scaleY = 380 / model.height;
        const scale = Math.min(scaleX, scaleY) * 1.4;
        model.scale.set(scale);

        model.x = (280 - model.width) / 2;
        model.y = (380 - model.height) / 2 + 20;

        try {
          model.motion("idle");
        } catch (e) {
          console.warn("[Avatar] idle motion not available:", e);
        }

        model.on("pointerdown", () => {
          try {
            const motions = ["Touch1", "Touch2", "Touch3", "Touch4", "Touch5", "Touch6"];
            const randomMotion = motions[Math.floor(Math.random() * motions.length)];
            model.motion(randomMotion);
          } catch (e) {
            console.warn("[Avatar] touch motion failed:", e);
          }
        });
        model.eventMode = "static";
        model.cursor = "pointer";

        setIsLoaded(true);
      } catch (err) {
        console.error("[Avatar] Live2D model load failed:", err);
        setLoadError(String(err));
      }
    };

    initLive2D();

    return () => {
      destroyed = true;
      if (appRef.current) {
        try {
          appRef.current.destroy(true, { children: true, texture: true });
        } catch (e) {
          console.warn("[Avatar] destroy error:", e);
        }
        appRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowGreeting(false), 4000);
    return () => clearTimeout(t);
  }, []);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const win = getCurrentWindow();
    win.startDragging();
  };

  const handleDoubleClick = () => {
    openMainWindow("chat");
  };

  const menuItems: Array<{ label: string; action: () => void } | { separator: true }> = [
    { label: "🏠 首页", action: () => openMainWindow("home") },
    { label: "🗨️ 对话", action: () => openMainWindow("chat") },
    { label: "📦 技能中心", action: () => openMainWindow("skills") },
    { label: "⚙️ 设置", action: () => openMainWindow("settings") },
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
      <div ref={containerRef} className="live2d-canvas-mount" />

      {/* 加载中 */}
      {!isLoaded && !loadError && (
        <div className="loading-indicator">
          <div className="loading-spinner-avatar" />
          <span>加载中...</span>
        </div>
      )}

      {/* Live2D 加载失败 - 显示 fallback */}
      {loadError && (
        <div className="avatar-fallback">
          <div className="fallback-avatar-circle">
            <span className="fallback-emoji">🎭</span>
          </div>
          <div className="fallback-name">小跃</div>
          <div className="fallback-status">在线待命中</div>
          <div className="fallback-hint">Live2D 模型未加载</div>
        </div>
      )}

      {/* 打招呼气泡 */}
      {showGreeting && (isLoaded || loadError) && (
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
            "separator" in item ? (
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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function openMainWindow(tab: string) {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel("main");
    if (existing) {
      await existing.setFocus();
      await existing.emit("navigate-to-tab", { tab });
      return;
    }
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
