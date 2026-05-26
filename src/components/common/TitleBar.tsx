import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import logoIcon from "@assets/icons/128x128.svg";
import type { Tab } from "../../stores/types";

interface TitleBarProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  showAvatar: boolean;
  onToggleAvatar: () => void;
}

export default function TitleBar({
  t,
  activeTab,
  setActiveTab,
  showAvatar,
  onToggleAvatar,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const win = getCurrentWindow();
        const maximized = await win.isMaximized();
        setIsMaximized(maximized);
      } catch {
        // ignore
      }
    };
    checkMaximized();
  }, []);

  const handleMinimize = useCallback(async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {
      // ignore
    }
  }, []);

  const handleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      if (await win.isMaximized()) {
        await win.unmaximize();
        setIsMaximized(false);
      } else {
        await win.maximize();
        setIsMaximized(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      // ignore
    }
  }, []);

  const tabs: Tab[] = ["home", "chat", "studio", "knowledge", "skills", "settings"];

  return (
    <div
      className="h-10 bg-card border-b border-border flex items-center select-none"
      data-tauri-drag-region
    >
      {/* Logo + 拖拽区域 */}
      <div className="flex items-center gap-2 px-3 h-full" data-tauri-drag-region>
        <img src={logoIcon} alt="Hermes" className="w-5 h-5" />
        <span className="text-sm font-medium text-foreground">HD</span>
      </div>

      {/* 菜单栏 */}
      <nav className="flex items-center gap-0.5 h-full px-2" data-tauri-drag-region>
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "home" && t("tabs.home")}
            {tab === "chat" && t("tabs.chat")}
            {tab === "studio" && t("tabs.studio")}
            {tab === "knowledge" && t("tabs.knowledge")}
            {tab === "skills" && t("tabs.skills")}
            {tab === "settings" && t("tabs.settings")}
          </button>
        ))}
      </nav>

      {/* 弹性空间 */}
      <div className="flex-1" data-tauri-drag-region />

      {/* 数字人切换按钮 */}
      <button
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer mr-1 ${
          showAvatar
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        onClick={onToggleAvatar}
        title={t("main.openAvatar")}
      >
        <img src="/bot.svg" alt={t("main.avatar")} className="w-5 h-5 rounded-full" />
      </button>

      {/* 窗口控制按钮 */}
      <div className="flex items-center h-full">
        <button
          className="w-10 h-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          onClick={handleMinimize}
          title="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          className="w-10 h-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          onClick={handleMaximize}
          title={isMaximized ? "还原" : "最大化"}
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          className="w-10 h-full flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
          onClick={handleClose}
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
