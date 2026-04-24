import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  const avatarRef = useRef<HTMLDivElement>(null);

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
      {/* 数字人本体 */}
      <div className="avatar-body" ref={avatarRef}>
        <div className="avatar-sprite" />
        <div className="avatar-shadow" />
      </div>

      {/* 打招呼气泡 */}
      {showGreeting && (
        <div className="greeting-bubble">
          <span>{GREETING}</span>
          <div className="bubble-tail" />
        </div>
      )}

      {/* 浮动粒子 */}
      <div className="particle p1" />
      <div className="particle p2" />
      <div className="particle p3" />

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
