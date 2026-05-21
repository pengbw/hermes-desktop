import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { themes } from "../../themes/registry";
import { uiStyles } from "../../themes/ui-styles";
import type { ThemeDefinition, UIStyle } from "../../themes/types";

export default function ThemePicker() {
  const {
    baseMode,
    themeName,
    uiStyle,
    setBaseMode,
    setThemeName,
    setUIStyle,
  } = useTheme();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"theme" | "style" | "mode">("theme");
  const ref = useRef<HTMLDivElement>(null);

  const currentDef = themes.find((t) => t.name === themeName);
  const currentStyle = uiStyles.find((s) => s.name === uiStyle);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleSelect = (def: ThemeDefinition) => {
    setThemeName(def.name);
    if (baseMode === "system") {
      setBaseMode("light");
    }
  };

  const handleSystem = () => {
    setBaseMode("system");
  };

  const handleStyleSelect = (styleName: UIStyle) => {
    setUIStyle(styleName);
  };

  const handleModeSelect = (mode: "light" | "dark") => {
    setBaseMode(mode);
  };

  return (
    <div className="relative inline-block min-w-[240px]" ref={ref}>
      <button
        className="flex items-center gap-2 w-full px-3 py-2 bg-background border border-border rounded-lg cursor-pointer transition-all text-[13px] text-foreground hover:border-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm shrink-0">{currentDef?.preview.accent ?? "🎨"}</span>
        <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">
          {currentDef?.label ?? "选择主题"}
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
          {currentStyle?.label ?? "经典标准"}
        </span>
        <span
          className={`text-xs text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 min-w-[400px] max-w-[480px] max-h-[480px] overflow-y-auto bg-card border border-border rounded-xl shadow-xl z-[1000] p-3 animate-[fadeIn_0.12s_ease]">
          {/* Tab 导航 */}
          <div className="flex gap-1 mb-2">
            <button
              className={`flex-1 px-3 py-2 border rounded-lg text-[13px] cursor-pointer transition-all text-center ${
                activeTab === "theme"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setActiveTab("theme")}
            >
              🎨 主题
            </button>
            <button
              className={`flex-1 px-3 py-2 border rounded-lg text-[13px] cursor-pointer transition-all text-center ${
                activeTab === "style"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setActiveTab("style")}
            >
              🎯 风格
            </button>
            <button
              className={`flex-1 px-3 py-2 border rounded-lg text-[13px] cursor-pointer transition-all text-center ${
                activeTab === "mode"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setActiveTab("mode")}
            >
              🌓 模式
            </button>
          </div>

          <div className="h-px bg-border my-2" />

          {/* 主题色系 Tab */}
          {activeTab === "theme" && (
            <div className="grid grid-cols-3 gap-2 max-h-[360px] overflow-y-auto p-1">
              {themes.map((def) => (
                <button
                  key={def.name}
                  className={`flex flex-col items-center gap-1.5 px-2 py-2.5 border-2 rounded-xl bg-transparent cursor-pointer transition-all relative ${
                    themeName === def.name
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted hover:border-border"
                  }`}
                  onClick={() => handleSelect(def)}
                  title={def.description}
                >
                  <div
                    className="w-12 h-12 rounded-xl border-2 flex items-center justify-center relative overflow-hidden"
                    style={{
                      background: def.preview.bg,
                      borderColor: def.preview.accent,
                    }}
                  >
                    <div
                      className="absolute top-1 right-1 w-3 h-3 rounded-full"
                      style={{ background: def.preview.accent }}
                    />
                    <div
                      className="text-base font-bold"
                      style={{ color: def.preview.text }}
                    >
                      Aa
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-semibold text-foreground">{def.label}</span>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">{def.description}</span>
                  </div>
                  {themeName === def.name && (
                    <span className="absolute top-1 right-1 text-xs text-primary font-bold bg-card rounded-full w-[18px] h-[18px] flex items-center justify-center">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* UI 风格 Tab */}
          {activeTab === "style" && (
            <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto p-1">
              {uiStyles.map((style) => (
                <button
                  key={style.name}
                  className={`flex flex-col gap-1 px-3 py-2.5 border-2 rounded-xl bg-transparent cursor-pointer transition-all relative text-left ${
                    uiStyle === style.name
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted hover:border-border"
                  }`}
                  onClick={() => handleStyleSelect(style.name)}
                  title={style.description}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-foreground">{style.label}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide shrink-0 ${
                        style.componentDensity === "compact"
                          ? "bg-red-500/10 text-red-500"
                          : style.componentDensity === "spacious"
                            ? "bg-green-500/10 text-green-500"
                            : "bg-sky-500/10 text-sky-500"
                      }`}
                    >
                      {style.componentDensity === "compact" ? "紧凑" : style.componentDensity === "spacious" ? "宽松" : "标准"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground m-0 leading-relaxed">{style.description}</p>
                  <div className="flex gap-3 text-[11px] text-muted-foreground font-mono">
                    <span>间距: {style.spacing.md}</span>
                    <span>圆角: {style.radius.md}</span>
                    <span>边框: {style.borderWidth}</span>
                  </div>
                  {uiStyle === style.name && (
                    <span className="absolute top-2 right-2 text-xs text-primary font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* 模式 Tab */}
          {activeTab === "mode" && (
            <div className="flex flex-col gap-1.5 p-1">
              <button
                className={`flex items-center gap-3 px-3.5 py-3 border-2 rounded-xl bg-transparent cursor-pointer transition-all relative text-left w-full ${
                  baseMode === "light"
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-muted hover:border-border"
                }`}
                onClick={() => handleModeSelect("light")}
              >
                <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center bg-muted rounded-xl">☀️</div>
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-sm font-semibold text-foreground">浅色模式</span>
                  <span className="text-xs text-muted-foreground">明亮的界面，适合白天使用</span>
                </div>
                {baseMode === "light" && (
                  <span className="text-sm text-primary font-bold shrink-0">✓</span>
                )}
              </button>

              <button
                className={`flex items-center gap-3 px-3.5 py-3 border-2 rounded-xl bg-transparent cursor-pointer transition-all relative text-left w-full ${
                  baseMode === "dark"
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-muted hover:border-border"
                }`}
                onClick={() => handleModeSelect("dark")}
              >
                <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center bg-muted rounded-xl">🌙</div>
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-sm font-semibold text-foreground">深色模式</span>
                  <span className="text-xs text-muted-foreground">暗色界面，适合夜间使用</span>
                </div>
                {baseMode === "dark" && (
                  <span className="text-sm text-primary font-bold shrink-0">✓</span>
                )}
              </button>

              <button
                className={`flex items-center gap-3 px-3.5 py-3 border-2 rounded-xl bg-transparent cursor-pointer transition-all relative text-left w-full ${
                  baseMode === "system"
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-muted hover:border-border"
                }`}
                onClick={handleSystem}
              >
                <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center bg-muted rounded-xl">🖥️</div>
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-sm font-semibold text-foreground">跟随系统</span>
                  <span className="text-xs text-muted-foreground">自动切换浅色/深色模式</span>
                </div>
                {baseMode === "system" && (
                  <span className="text-sm text-primary font-bold shrink-0">✓</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
