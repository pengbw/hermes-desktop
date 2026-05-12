import type { HermesConfigData } from "@core/types";
import styles from "@pages/settings/SettingsPanel.module.css";

interface AgentSettingsProps {
  config: HermesConfigData | null;
  model: string;
  provider: string;
  baseUrl: string;
  maxTurns: number;
  providers: { id: string; name: string; value: string }[];
  modelList: { id: string; ownedBy?: string }[];
  modelListLoading: boolean;
  modelListError: string | null;
  dirtyFields: Set<string>;
  saving: boolean;
  saveMessage: { text: string; type: "success" | "error" } | null;
  onModelChange: (model: string) => void;
  onProviderChange: (provider: string) => void;
  onMaxTurnsChange: (turns: number) => void;
  onWorkspaceRootChange: (root: string) => void;
  onRefreshModels: (provider: string) => void;
  onSave: () => void;
  onRefresh: () => void;
  t: (key: string) => string;
}

export default function AgentSettings({
  config,
  model,
  provider,
  baseUrl,
  maxTurns,
  providers,
  modelList,
  modelListLoading,
  modelListError,
  dirtyFields,
  saving,
  saveMessage,
  onModelChange,
  onProviderChange,
  onMaxTurnsChange,
  onWorkspaceRootChange,
  onRefreshModels,
  onSave,
  onRefresh,
  t,
}: AgentSettingsProps) {
  return (
    <div className={styles.settingsSectionCard}>
      <div className={styles.settingsHeader}>
        <h2>{t("agent.title")}</h2>
        <div className={styles.settingsActions}>
          <button className={styles.providerAddBtn} onClick={onRefresh}>
            {t("settings.refresh")}
          </button>
        </div>
      </div>
      {config && (
        <div className={styles.configPathInfo}>
          <span className={styles.pathLabel}>{t("settings.configPath")}:</span>
          <span className={styles.pathValue}>{config.config_path}</span>
        </div>
      )}
      {saveMessage && (
        <div
          className={`${styles.saveToast} ${saveMessage.type === "success" ? styles.saveToastSuccess : styles.saveToastError}`}
        >
          {saveMessage.type === "success" ? "✅" : "❌"} {saveMessage.text}
        </div>
      )}
      <div className={styles.settingsSection}>
        <h3>{t("agent.sectionTitle")}</h3>
        <div className={styles.settingsForm}>
          <div className={styles.formGroup}>
            <label>
              {t("agent.provider")}
              {dirtyFields.has("provider") && (
                <span className={styles.dirtyBadge}>{t("common.modified")}</span>
              )}
            </label>
            <div className="provider-select-row">
              <select value={provider} onChange={(e) => onProviderChange(e.target.value)}>
                <option value="">{t("common.selectProvider")}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.value}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>
              {t("agent.model")}
              {dirtyFields.has("model") && (
                <span className={styles.dirtyBadge}>{t("common.modified")}</span>
              )}
            </label>
            <div className={styles.modelSelectRow}>
              <select
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={modelListLoading}
              >
                <option value="">
                  {modelListLoading ? t("agent.loadingModels") : t("common.selectModel")}
                </option>
                {model && !modelList.some((m) => m.id === model) && (
                  <option value={model}>
                    {model} ({t("common.current")})
                  </option>
                )}
                {modelList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                    {m.ownedBy ? ` (${m.ownedBy})` : ""}
                  </option>
                ))}
              </select>
              {!modelListLoading && !provider && (
                <span className={styles.modelSelectHint}>{t("agent.selectProviderFirst")}</span>
              )}
              {modelListError && (
                <span className={styles.modelSelectError} title={modelListError}>
                  ⚠️
                </span>
              )}
              {!modelListLoading && modelList.length === 0 && provider && (
                <button
                  type="button"
                  className={styles.modelRefreshBtn}
                  onClick={() => onRefreshModels(provider)}
                  title={modelListError || t("agent.refreshModels")}
                >
                  🔄
                </button>
              )}
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>
              {t("agent.baseUrl")}
              {dirtyFields.has("baseUrl") && (
                <span className={styles.dirtyBadge}>{t("common.modified")}</span>
              )}
            </label>
            <input
              type="text"
              value={baseUrl}
              readOnly
              placeholder={t("agent.baseUrl")}
              className={styles.readonlyInput}
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t("agent.maxTurns")}</label>
            <div className={styles.maxTurnsControl}>
              <div
                className={styles.maxTurnsTrack}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const val = Math.round((pct * 190 + 10) / 10) * 10;
                  onMaxTurnsChange(Math.min(200, Math.max(10, val)));
                }}
              >
                <div
                  className={styles.maxTurnsFill}
                  style={{ width: `${((maxTurns - 10) / 190) * 100}%` }}
                />
                <div
                  className={styles.maxTurnsThumb}
                  style={{ left: `${((maxTurns - 10) / 190) * 100}%` }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const track = e.currentTarget.parentElement;
                    if (!track) return;
                    const rect = track.getBoundingClientRect();
                    const onMove = (ev: MouseEvent) => {
                      const pct = (ev.clientX - rect.left) / rect.width;
                      const val = Math.round((pct * 190 + 10) / 10) * 10;
                      onMaxTurnsChange(Math.min(200, Math.max(10, val)));
                    };
                    const onUp = () => {
                      document.removeEventListener("mousemove", onMove);
                      document.removeEventListener("mouseup", onUp);
                    };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}
                />
              </div>
              <span className={styles.maxTurnsValue}>{maxTurns}</span>
            </div>
            {dirtyFields.has("maxTurns") && (
              <span className={styles.dirtyBadge}>{t("common.modified")}</span>
            )}
          </div>
          <div className={styles.formGroup}>
            <label>{t("system.workspace.rootDir")}</label>
            <input
              type="text"
              value={config?.workspaceRoot || ""}
              onChange={(e) => onWorkspaceRootChange(e.target.value)}
              placeholder={t("system.workspace.rootDirPlaceholder")}
            />
            <p className="settings-hint">{t("system.workspace.rootDirHint")}</p>
          </div>
        </div>
        <div className={styles.sectionSaveBar}>
          <button className={styles.sectionSaveBtn} onClick={onSave} disabled={saving}>
            {saving ? t("settings.saving") : t("agent.saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
