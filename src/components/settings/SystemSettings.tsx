import ThemePicker from "./ThemePicker";
import styles from "@pages/settings/SettingsPanel.module.css";

interface SystemSettingsProps {
  locale: "zh-CN" | "zh-XG" | "en";
  showReasoning: boolean;
  ttsEnabled: boolean;
  voiceEnabled: boolean;
  compressionEnabled: boolean;
  memoryEnabled: boolean;
  dirtyFields: Set<string>;
  saving: boolean;
  onLocaleChange: (locale: "zh-CN" | "zh-XG" | "en") => void;
  onShowReasoningChange: (v: boolean) => void;
  onTtsEnabledChange: (v: boolean) => void;
  onVoiceEnabledChange: (v: boolean) => void;
  onCompressionChange: (v: boolean) => void;
  onMemoryChange: (v: boolean) => void;
  onSave: () => void;
  t: (key: string) => string;
}

export default function SystemSettings({
  locale,
  showReasoning,
  ttsEnabled,
  voiceEnabled,
  compressionEnabled,
  memoryEnabled,
  dirtyFields,
  saving,
  onLocaleChange,
  onShowReasoningChange,
  onTtsEnabledChange,
  onVoiceEnabledChange,
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
        <ThemePicker />
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
            <label className={styles.toggleLabel}>
              <span>
                {t("system.display.ttsEnabled")}
                {dirtyFields.has("ttsEnabled") && (
                  <span className={styles.dirtyBadge}>{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={(e) => onTtsEnabledChange(e.target.checked)}
              />
            </label>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.toggleLabel}>
              <span>
                {t("system.display.voiceEnabled")}
                {dirtyFields.has("voiceEnabled") && (
                  <span className={styles.dirtyBadge}>{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => onVoiceEnabledChange(e.target.checked)}
              />
            </label>
          </div>
        </div>
      </div>
      <div className={styles.settingsSection}>
        <h3>{t("system.context.title")}</h3>
        <div className={styles.settingsForm}>
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
