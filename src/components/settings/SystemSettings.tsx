interface SystemSettingsProps {
  theme: "light" | "dark" | "system";
  locale: "zh-CN" | "zh-XG" | "en";
  personality: string;
  showReasoning: boolean;
  ttsProvider: string;
  terminalBackend: string;
  terminalTimeout: number;
  compressionEnabled: boolean;
  memoryEnabled: boolean;
  dirtyFields: Set<string>;
  saving: boolean;
  onThemeChange: (theme: "light" | "dark" | "system") => void;
  onLocaleChange: (locale: "zh-CN" | "zh-XG" | "en") => void;
  onPersonalityChange: (p: string) => void;
  onShowReasoningChange: (v: boolean) => void;
  onTtsProviderChange: (v: string) => void;
  onTerminalBackendChange: (v: string) => void;
  onTerminalTimeoutChange: (v: number) => void;
  onCompressionChange: (v: boolean) => void;
  onMemoryChange: (v: boolean) => void;
  onSave: () => void;
  t: (key: string) => string;
}

import styles from "@pages/settings/SettingsPanel.module.css";

export default function SystemSettings({
  theme,
  locale,
  personality,
  showReasoning,
  ttsProvider,
  terminalBackend,
  terminalTimeout,
  compressionEnabled,
  memoryEnabled,
  dirtyFields,
  saving,
  onThemeChange,
  onLocaleChange,
  onPersonalityChange,
  onShowReasoningChange,
  onTtsProviderChange,
  onTerminalBackendChange,
  onTerminalTimeoutChange,
  onCompressionChange,
  onMemoryChange,
  onSave,
  t,
}: SystemSettingsProps) {
  return (
    <div className={styles.settingsSectionCard}>
      <div className={styles.settingsHeader}>
        <h2>{t("system.title")}</h2>
      </div>
      <div className={styles.settingsSection}>
        <h3>{t("system.theme")}</h3>
        <div className={styles.themeOptions}>
          <button
            className={`${styles.themeOption} ${theme === "light" ? styles.themeOptionActive : ""}`}
            onClick={() => onThemeChange("light")}
          >
            <span className={styles.themeOptionIcon}>☀️</span>
            <span className={styles.themeOptionLabel}>{t("system.theme.light")}</span>
          </button>
          <button
            className={`${styles.themeOption} ${theme === "dark" ? styles.themeOptionActive : ""}`}
            onClick={() => onThemeChange("dark")}
          >
            <span className={styles.themeOptionIcon}>🌙</span>
            <span className={styles.themeOptionLabel}>{t("system.theme.dark")}</span>
          </button>
          <button
            className={`${styles.themeOption} ${theme === "system" ? styles.themeOptionActive : ""}`}
            onClick={() => onThemeChange("system")}
          >
            <span className={styles.themeOptionIcon}>🖥️</span>
            <span className={styles.themeOptionLabel}>{t("system.theme.system")}</span>
          </button>
        </div>
      </div>
      <div className={styles.settingsSection}>
        <h3>{t("system.language")}</h3>
        <div className={styles.languageOptions}>
          <button
            className={`${styles.languageOption} ${locale === "zh-CN" ? styles.languageOptionActive : ""}`}
            onClick={() => onLocaleChange("zh-CN")}
          >
            <span className={`${styles.languageFlag} ${styles.languageFlagCn}`}></span>
            <span className={styles.languageLabel}>{t("system.language.zhCN")}</span>
          </button>
          <button
            className={`${styles.languageOption} ${locale === "zh-XG" ? styles.languageOptionActive : ""}`}
            onClick={() => onLocaleChange("zh-XG")}
          >
            <span className={`${styles.languageFlag} ${styles.languageFlagHk}`}></span>
            <span className={styles.languageLabel}>{t("system.language.zhTW")}</span>
          </button>
          <button
            className={`${styles.languageOption} ${locale === "en" ? styles.languageOptionActive : ""}`}
            onClick={() => onLocaleChange("en")}
          >
            <span className={`${styles.languageFlag} ${styles.languageFlagUs}`}></span>
            <span className={styles.languageLabel}>{t("system.language.en")}</span>
          </button>
        </div>
      </div>
      <div className={styles.settingsSection}>
        <h3>{t("system.display")}</h3>
        <div className={styles.settingsForm}>
          <div className={styles.formGroup}>
            <label>
              {t("system.display.personality")}
              {dirtyFields.has("personality") && (
                <span className={styles.dirtyBadge}>{t("common.modified")}</span>
              )}
            </label>
            <select value={personality} onChange={(e) => onPersonalityChange(e.target.value)}>
              <option value="default">{t("system.display.personalityDefault")}</option>
              <option value="kawaii">{t("system.display.personalityKawaii")}</option>
              <option value="professional">{t("system.display.personalityProfessional")}</option>
              <option value="pirate">{t("system.display.personalityPirate")}</option>
              <option value="zen">{t("system.display.personalityZen")}</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.toggleLabel}>
              <span>
                {t("system.display.showReasoning")}
                {dirtyFields.has("showReasoning") && (
                  <span className={styles.dirtyBadge}>{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={showReasoning}
                onChange={(e) => onShowReasoningChange(e.target.checked)}
              />
            </label>
          </div>
          <div className={styles.formGroup}>
            <label>
              {t("system.display.ttsProvider")}
              {dirtyFields.has("ttsProvider") && (
                <span className={styles.dirtyBadge}>{t("common.modified")}</span>
              )}
            </label>
            <select value={ttsProvider} onChange={(e) => onTtsProviderChange(e.target.value)}>
              <option value="edge">Edge TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="openai">OpenAI TTS</option>
              <option value="xai">xAI</option>
              <option value="mistral">Mistral</option>
            </select>
          </div>
        </div>
      </div>
      <div className={styles.settingsSection}>
        <h3>{t("system.terminal")}</h3>
        <div className={styles.settingsForm}>
          <div className={styles.formGroup}>
            <label>
              {t("system.terminal.backend")}
              {dirtyFields.has("terminalBackend") && (
                <span className={styles.dirtyBadge}>{t("common.modified")}</span>
              )}
            </label>
            <select
              value={terminalBackend}
              onChange={(e) => onTerminalBackendChange(e.target.value)}
            >
              <option value="local">本地 (local)</option>
              <option value="docker">Docker</option>
              <option value="modal">Modal</option>
              <option value="daytona">Daytona</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>
              {t("system.terminal.timeout")}: {terminalTimeout}
              {dirtyFields.has("terminalTimeout") && (
                <span className={styles.dirtyBadge}>{t("common.modified")}</span>
              )}
            </label>
            <input
              type="range"
              min="30"
              max="600"
              step="30"
              value={terminalTimeout}
              onChange={(e) => onTerminalTimeoutChange(parseInt(e.target.value))}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.toggleLabel}>
              <span>
                {t("system.terminal.compression")}
                {dirtyFields.has("compressionEnabled") && (
                  <span className={styles.dirtyBadge}>{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={compressionEnabled}
                onChange={(e) => onCompressionChange(e.target.checked)}
              />
            </label>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.toggleLabel}>
              <span>
                {t("system.terminal.memory")}
                {dirtyFields.has("memoryEnabled") && (
                  <span className={styles.dirtyBadge}>{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={(e) => onMemoryChange(e.target.checked)}
              />
            </label>
          </div>
        </div>
        <div className={styles.sectionSaveBar}>
          <button className={styles.sectionSaveBtn} onClick={onSave} disabled={saving}>
            {saving ? t("settings.saving") : t("system.saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
