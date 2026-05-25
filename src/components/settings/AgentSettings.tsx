import { useState, useEffect } from "react";
import type { HermesConfigData } from "@core/types";
import { Eye, EyeOff, RotateCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface AgentSettingsProps {
  config: HermesConfigData | null;
  model: string;
  provider: string;
  baseUrl: string;
  maxTurns: number;
  hermesApiBase: string;
  hermesApiKey: string;
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
  onConversationStoragePathChange: (path: string) => void;
  onHermesApiBaseChange: (base: string) => void;
  onHermesApiKeyChange: (key: string) => void;
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
  hermesApiBase,
  hermesApiKey,
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
  onConversationStoragePathChange,
  onHermesApiBaseChange,
  onHermesApiKeyChange,
  onRefreshModels,
  onSave,
  onRefresh,
  t,
}: AgentSettingsProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [defaultStoragePath, setDefaultStoragePath] = useState("");

  useEffect(() => {
    invoke<string>("get_default_conversation_storage_path")
      .then(setDefaultStoragePath)
      .catch(() => {});
  }, []);
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground m-0">{t("agent.title")}</h2>
          <div className="flex gap-2">
            <button
              className="px-3.5 py-1.5 border border-primary rounded-md bg-transparent text-primary text-xs cursor-pointer transition-all hover:bg-primary/5 whitespace-nowrap"
              onClick={onRefresh}
            >
              {t("settings.refresh")}
            </button>
          </div>
        </div>
        {config && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-xs mb-3">
            <span className="text-muted-foreground font-medium shrink-0">
              {t("settings.configPath")}:
            </span>
            <span className="text-muted-foreground font-mono truncate">{config.config_path}</span>
          </div>
        )}
        {saveMessage && (
          <div
            className={`px-4 py-2.5 rounded-lg text-[13px] animate-in slide-in-from-top-2 duration-300 ${
              saveMessage.type === "success"
                ? "bg-green-500/10 text-green-600"
                : "bg-red-500/10 text-red-600"
            }`}
          >
            {saveMessage.type === "success" ? "✅" : "❌"} {saveMessage.text}
          </div>
        )}
        <div className="mt-3">
          <h3 className="text-[15px] font-semibold text-foreground m-0 mb-4">
            {t("agent.sectionTitle")}
          </h3>
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("agent.provider")}
                {dirtyFields.has("provider") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">
                    {t("common.modified")}
                  </span>
                )}
              </label>
              <div className="provider-select-row">
                <select
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
                  value={provider}
                  onChange={(e) => onProviderChange(e.target.value)}
                >
                  <option value="">{t("common.selectProvider")}</option>
                  {provider && !providers.some((p) => p.value === provider) && (
                    <option value={provider}>
                      {provider} ({t("common.current")})
                    </option>
                  )}
                  {providers.map((p) => (
                    <option key={p.id} value={p.value}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("agent.model")}
                {dirtyFields.has("model") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">
                    {t("common.modified")}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
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
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {t("agent.selectProviderFirst")}
                  </span>
                )}
                {modelListError && (
                  <span className="text-sm cursor-help shrink-0" title={modelListError}>
                    ⚠️
                  </span>
                )}
                {!modelListLoading && modelList.length === 0 && provider && (
                  <button
                    type="button"
                    className="px-2 py-1 border border-input rounded-md bg-background text-muted-foreground text-sm transition-all hover:border-primary hover:text-primary shrink-0"
                    onClick={() => onRefreshModels(provider)}
                    title={modelListError || t("agent.refreshModels")}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("agent.baseUrl")}
                {dirtyFields.has("baseUrl") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">
                    {t("common.modified")}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={baseUrl}
                readOnly
                placeholder={t("agent.baseUrl")}
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-muted text-muted-foreground outline-none cursor-not-allowed h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground font-medium">
                {t("agent.maxTurns")}
              </label>
              <div className="flex items-center gap-3.5">
                <div
                  className="flex-1 h-1.5 rounded-full bg-border cursor-pointer relative"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    const val = Math.round((pct * 190 + 10) / 10) * 10;
                    onMaxTurnsChange(Math.min(200, Math.max(10, val)));
                  }}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${((maxTurns - 10) / 190) * 100}%` }}
                  />
                  <div
                    className="absolute top-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background shadow-md -translate-y-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing active:scale-110 transition-all"
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
                <span className="min-w-[32px] h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-lg text-sm font-bold shrink-0">
                  {maxTurns}
                </span>
              </div>
              {dirtyFields.has("maxTurns") && (
                <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold w-fit">
                  {t("common.modified")}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("agent.hermesApiBase") || "Hermes 网关地址"}
                {dirtyFields.has("hermesApiBase") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">
                    {t("common.modified")}
                  </span>
                )}
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
                value={hermesApiBase}
                onChange={(e) => onHermesApiBaseChange(e.target.value)}
                placeholder="http://127.0.0.1:8642/v1"
              />
              <p className="text-xs text-muted-foreground m-0">
                {t("agent.hermesApiBaseHint") ||
                  "Hermes Agent 本地网关的 API 地址，工作室角色对话通过此网关路由"}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("agent.hermesApiKey") || "Hermes 网关密钥"}
                {dirtyFields.has("hermesApiKey") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">
                    {t("common.modified")}
                  </span>
                )}
              </label>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? "text" : "password"}
                  className="w-full px-3 py-2 pr-10 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
                  value={hermesApiKey}
                  onChange={(e) => onHermesApiKeyChange(e.target.value)}
                  placeholder="94ea2...6c40"
                />
                <button
                  type="button"
                  className="absolute right-2 bg-none border-0 cursor-pointer text-muted-foreground flex items-center justify-center p-1 rounded transition-colors hover:text-foreground"
                  onClick={() => setShowApiKey((v) => !v)}
                  tabIndex={-1}
                >
                  {showApiKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground m-0">
                {t("agent.hermesApiKeyHint") || "Hermes Agent 本地网关的访问密钥"}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground font-medium">
                {t("system.workspace.rootDir")}
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
                value={config?.workspaceRoot || ""}
                onChange={(e) => onWorkspaceRootChange(e.target.value)}
                placeholder={t("system.workspace.rootDirPlaceholder")}
              />
              <p className="text-xs text-muted-foreground m-0">
                {t("system.workspace.rootDirHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] text-muted-foreground font-medium flex items-center gap-2">
                {t("system.conversation.storagePath") || "对话存储路径"}
                {dirtyFields.has("conversationStoragePath") && (
                  <span className="text-[10px] px-1.5 py-px rounded-md bg-primary/20 text-primary font-semibold">
                    {t("common.modified")}
                  </span>
                )}
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
                value={config?.conversationStoragePath || ""}
                onChange={(e) => onConversationStoragePathChange(e.target.value)}
                placeholder={defaultStoragePath || t("system.conversation.storagePathPlaceholder")}
              />
              <p className="text-xs text-muted-foreground m-0">
                {t("system.conversation.storagePathHint") ||
                  "对话记录加密存储的目录路径，留空使用默认路径。修改后需重启应用生效。"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-3 mt-3 border-t border-dashed border-border">
          <button
            className="px-3.5 py-1.5 bg-primary text-primary-foreground border-0 rounded-md text-xs cursor-pointer transition-all font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? t("settings.saving") : t("agent.saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
