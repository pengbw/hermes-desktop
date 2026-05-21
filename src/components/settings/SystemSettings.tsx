import ThemePicker from "./ThemePicker";

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
    <div className="animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-foreground m-0">{t("system.title")}</h2>
      </div>
      <div className="bg-card rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-[15px] font-semibold text-foreground m-0 mb-4">{t("system.theme")}</h3>
        <ThemePicker />
      </div>
      <div className="bg-card rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-[15px] font-semibold text-foreground m-0 mb-4">{t("system.language")}</h3>
        <div className="flex gap-3">
          <button
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
              locale === "zh-CN"
                ? "border-primary bg-primary/5 text-primary"
                : "border-input bg-background text-foreground hover:bg-muted"
            }`}
            onClick={() => onLocaleChange("zh-CN")}
          >
            <span className="text-lg">🇨🇳</span>
            <span className="text-sm">{t("system.language.zhCN")}</span>
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
              locale === "zh-XG"
                ? "border-primary bg-primary/5 text-primary"
                : "border-input bg-background text-foreground hover:bg-muted"
            }`}
            onClick={() => onLocaleChange("zh-XG")}
          >
            <span className="text-lg">🇭🇰</span>
            <span className="text-sm">{t("system.language.zhTW")}</span>
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
              locale === "en"
                ? "border-primary bg-primary/5 text-primary"
                : "border-input bg-background text-foreground hover:bg-muted"
            }`}
            onClick={() => onLocaleChange("en")}
          >
            <span className="text-lg">🇺🇸</span>
            <span className="text-sm">{t("system.language.en")}</span>
          </button>
        </div>
      </div>
      <div className="bg-card rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-[15px] font-semibold text-foreground m-0 mb-4">{t("system.display")}</h3>
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("system.display.showReasoning")}
                {dirtyFields.has("showReasoning") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={showReasoning}
                onChange={(e) => onShowReasoningChange(e.target.checked)}
                className="w-10 h-[22px] appearance-none bg-border rounded-full relative cursor-pointer transition-colors checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-[18px] after:h-[18px] after:bg-white after:rounded-full after:transition-transform after:shadow-sm checked:after:translate-x-[18px]"
              />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("system.display.ttsEnabled")}
                {dirtyFields.has("ttsEnabled") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={(e) => onTtsEnabledChange(e.target.checked)}
                className="w-10 h-[22px] appearance-none bg-border rounded-full relative cursor-pointer transition-colors checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-[18px] after:h-[18px] after:bg-white after:rounded-full after:transition-transform after:shadow-sm checked:after:translate-x-[18px]"
              />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("system.display.voiceEnabled")}
                {dirtyFields.has("voiceEnabled") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => onVoiceEnabledChange(e.target.checked)}
                className="w-10 h-[22px] appearance-none bg-border rounded-full relative cursor-pointer transition-colors checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-[18px] after:h-[18px] after:bg-white after:rounded-full after:transition-transform after:shadow-sm checked:after:translate-x-[18px]"
              />
            </label>
          </div>
        </div>
      </div>
      <div className="bg-card rounded-xl p-5 shadow-sm">
        <h3 className="text-[15px] font-semibold text-foreground m-0 mb-4">{t("system.context.title")}</h3>
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("system.terminal.compression")}
                {dirtyFields.has("compressionEnabled") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={compressionEnabled}
                onChange={(e) => onCompressionChange(e.target.checked)}
                className="w-10 h-[22px] appearance-none bg-border rounded-full relative cursor-pointer transition-colors checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-[18px] after:h-[18px] after:bg-white after:rounded-full after:transition-transform after:shadow-sm checked:after:translate-x-[18px]"
              />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("system.terminal.memory")}
                {dirtyFields.has("memoryEnabled") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">{t("common.modified")}</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={(e) => onMemoryChange(e.target.checked)}
                className="w-10 h-[22px] appearance-none bg-border rounded-full relative cursor-pointer transition-colors checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-[18px] after:h-[18px] after:bg-white after:rounded-full after:transition-transform after:shadow-sm checked:after:translate-x-[18px]"
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end pt-3 mt-3 border-t border-dashed border-border">
          <button
            className="px-3.5 py-1.5 bg-primary text-primary-foreground border-0 rounded-md text-xs cursor-pointer transition-all font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? t("settings.saving") : t("system.saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
