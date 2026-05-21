import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { builtinThemes } from "../../themes/registry";
import type { ThemeDefinition } from "../../themes/types";
import styles from "./ThemePicker.module.css";

export default function ThemePicker() {
  const { themeMode, themeName, setThemeMode, setThemeName } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentDef = builtinThemes.find((t) => t.name === themeName);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = (def: ThemeDefinition) => {
    setThemeName(def.name);
    setThemeMode(def.colorMode);
    setOpen(false);
  };

  const handleSystem = () => {
    setThemeMode("system");
    setOpen(false);
  };

  const lightThemes = builtinThemes.filter((t) => t.colorMode === "light");
  const darkThemes = builtinThemes.filter((t) => t.colorMode === "dark");

  return (
    <div className={styles.picker} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(!open)}>
        <span className={styles.triggerIcon}>{currentDef?.icon ?? "🎨"}</span>
        <span className={styles.triggerLabel}>{currentDef?.label ?? "选择主题"}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▾</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownGroup}>
            <div className={styles.groupLabel}>☀️ 亮色主题</div>
            {lightThemes.map((def) => (
              <button
                key={def.name}
                className={`${styles.option} ${themeName === def.name && themeMode !== "system" ? styles.optionActive : ""}`}
                onClick={() => handleSelect(def)}
              >
                <span className={styles.optionIcon}>{def.icon}</span>
                <span className={styles.optionLabel}>{def.label}</span>
                <span
                  className={styles.optionPreview}
                  style={{ background: def.preview.primary }}
                />
                {themeName === def.name && themeMode !== "system" && (
                  <span className={styles.check}>✓</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.dropdownDivider} />

          <div className={styles.dropdownGroup}>
            <div className={styles.groupLabel}>🌙 暗色主题</div>
            {darkThemes.map((def) => (
              <button
                key={def.name}
                className={`${styles.option} ${themeName === def.name && themeMode !== "system" ? styles.optionActive : ""}`}
                onClick={() => handleSelect(def)}
              >
                <span className={styles.optionIcon}>{def.icon}</span>
                <span className={styles.optionLabel}>{def.label}</span>
                <span
                  className={styles.optionPreview}
                  style={{ background: def.preview.primary }}
                />
                {themeName === def.name && themeMode !== "system" && (
                  <span className={styles.check}>✓</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.dropdownDivider} />

          <button
            className={`${styles.option} ${themeMode === "system" ? styles.optionActive : ""}`}
            onClick={handleSystem}
          >
            <span className={styles.optionIcon}>🖥️</span>
            <span className={styles.optionLabel}>跟随系统</span>
            {themeMode === "system" && <span className={styles.check}>✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}
