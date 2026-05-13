import { useState, useEffect, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../../contexts/ThemeContext";
import { useI18n } from "../../contexts/I18nContext";
import type { HermesConfigData, AvatarGesture } from "@core/types";
import { CardManagerPanel } from "@pages/cards";
const GestureEditor = lazy(() => import("../../windows/GestureEditor"));
import AgentSettings from "@components/settings/AgentSettings";
import ProviderSettings from "@components/settings/ProviderSettings";
import type { Provider } from "@components/settings/ProviderSettings";
import SystemSettings from "@components/settings/SystemSettings";
import GestureSettingsComponent from "@components/settings/GestureSettings";
import AiRolesSettingsSection from "@components/settings/AiRolesSettings";
import KnowledgeSettingsSection from "@components/settings/KnowledgeSettings";
import ProviderModal from "@components/settings/ProviderModal";
import styles from "./SettingsPanel.module.css";

function SettingsPanel() {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const [config, setConfig] = useState<HermesConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [maxTurns, setMaxTurns] = useState(90);
  const [personality, setPersonality] = useState("default");
  const [showReasoning, setShowReasoning] = useState(false);
  const [terminalBackend, setTerminalBackend] = useState("local");
  const [terminalTimeout, setTerminalTimeout] = useState(180);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [ttsProvider, setTtsProvider] = useState("edge");
  const [hermesApiBase, setHermesApiBase] = useState("http://127.0.0.1:8642/v1");
  const [hermesApiKey, setHermesApiKey] = useState(
    "94ea2475d7544b6e8020a530c9c7bdb58d456803f3409ba3a5458b22999e6c40"
  );

  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState("agent");

  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerSearch, setProviderSearch] = useState("");
  const [providerPage, setProviderPage] = useState(1);
  const providerPageSize = 15;
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [modelList, setModelList] = useState<{ id: string; ownedBy?: string }[]>([]);
  const [modelListLoading, setModelListLoading] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);

  const [gestures, setGestures] = useState<AvatarGesture[]>([]);
  const [showGestureModal, setShowGestureModal] = useState(false);
  const [editingGesture, setEditingGesture] = useState<AvatarGesture | null>(null);
  const [gestureReadOnly, setGestureReadOnly] = useState(false);
  const [gestureForm, setGestureForm] = useState({
    name: "",
    duration: 1000,
    lookAtX: 0,
    lookAtY: 0,
    tilt: 0,
    targetJson: "{}",
  });

  const markDirty = (field: string) => {
    setDirtyFields((prev) => new Set(prev).add(field));
  };

  const loadProviders = async (): Promise<Provider[]> => {
    try {
      const raw: unknown[] = await invoke("list_providers");
      const list = (raw as Record<string, unknown>[]).map((item) => ({
        id: (item.id ?? item.ID ?? "") as string,
        name: (item.name ?? item.Name ?? "") as string,
        value: (item.value ?? item.Value ?? "") as string,
        baseUrl: (item.baseUrl ?? item.base_url ?? "") as string,
        apiKeyEnv: (item.apiKeyEnv ?? item.api_key_env ?? "") as string,
        apiKey: (item.apiKey ?? item.api_key ?? "") as string,
        isBuiltin: (item.isBuiltin ?? item.is_builtin ?? false) as boolean,
        sortOrder: (item.sortOrder ?? item.sort_order ?? 0) as number,
        createdAt: (item.createdAt ?? item.created_at ?? 0) as number,
        updatedAt: (item.updatedAt ?? item.updated_at ?? 0) as number,
      }));
      setProviders(list);
      return list;
    } catch (err) {
      console.error("Failed to load providers:", err);
      return [];
    }
  };

  const fetchModelList = async (providerValue: string) => {
    setModelList([]);
    setModelListLoading(true);
    setModelListError(null);
    try {
      const list = await invoke<{ id: string; ownedBy?: string }[]>("list_models", {
        providerValue,
      });
      setModelList(list);
    } catch (err) {
      console.error("Failed to fetch model list:", err);
      setModelList([]);
      setModelListError(String(err));
    } finally {
      setModelListLoading(false);
    }
  };

  const DEFAULT_BASE_URLS: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com",
    google: "https://generativelanguage.googleapis.com",
    xai: "https://api.x.ai/v1",
    mistral: "https://api.mistral.ai/v1",
    deepseek: "https://api.deepseek.com",
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    markDirty("provider");
    const found = providers.find((p) => p.value === newProvider);
    if (found) {
      const url = found.baseUrl || DEFAULT_BASE_URLS[found.value] || "";
      setBaseUrl(url);
      markDirty("baseUrl");
    }
    fetchModelList(newProvider);
  };

  const handleSaveProvider = async () => {
    setShowProviderModal(false);
    setEditingProvider(null);
    loadProviders();
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm("确定删除该供应商吗？")) return;
    try {
      await invoke("delete_provider", { id });
      loadProviders();
    } catch (e) {
      alert("删除供应商失败: " + String(e));
    }
  };

  const openEditProvider = (p: Provider) => {
    setEditingProvider(p);
    setShowProviderModal(true);
  };

  const openNewProvider = () => {
    setEditingProvider({
      id: "",
      name: "",
      value: "",
      baseUrl: "",
      apiKeyEnv: "",
      apiKey: "",
      isBuiltin: false,
      sortOrder: 0,
      createdAt: 0,
      updatedAt: 0,
    });
    setShowProviderModal(true);
  };

  const closeProviderModal = () => {
    setShowProviderModal(false);
    setEditingProvider(null);
  };

  const SECTION_FIELDS: Record<string, string[]> = {
    model: [
      "model",
      "provider",
      "baseUrl",
      "maxTurns",
      "workspaceRoot",
      "hermesApiBase",
      "hermesApiKey",
    ],
    display: ["personality", "showReasoning", "ttsProvider"],
    terminal: ["terminalBackend", "terminalTimeout", "compressionEnabled", "memoryEnabled"],
    system: [
      "personality",
      "showReasoning",
      "ttsProvider",
      "terminalBackend",
      "terminalTimeout",
      "compressionEnabled",
      "memoryEnabled",
    ],
  };

  const sectionDirtyCount = (section: string) => {
    return (SECTION_FIELDS[section] || []).filter((f) => dirtyFields.has(f)).length;
  };

  const saveSectionConfig = async (section: string) => {
    const sectionFields = SECTION_FIELDS[section] || [];
    const fieldsToSave = sectionFields.filter((f) => dirtyFields.has(f));
    if (fieldsToSave.length === 0) {
      setSaveMessage({ text: t("settings.noChange"), type: "success" });
      setTimeout(() => setSaveMessage(null), 2000);
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      const configKeyMap: Record<string, string> = {
        model: "model.default",
        provider: "model.provider",
        baseUrl: "model.base_url",
        maxTurns: "agent.max_turns",
        personality: "display.personality",
        showReasoning: "display.show_reasoning",
        terminalBackend: "terminal.backend",
        terminalTimeout: "terminal.timeout",
        compressionEnabled: "compression.enabled",
        memoryEnabled: "memory.memory_enabled",
        ttsProvider: "tts.provider",
      };
      const fieldValueMap: Record<string, string> = {
        model,
        provider,
        baseUrl,
        maxTurns: String(maxTurns),
        personality,
        showReasoning: String(showReasoning),
        terminalBackend,
        terminalTimeout: String(terminalTimeout),
        compressionEnabled: String(compressionEnabled),
        memoryEnabled: String(memoryEnabled),
        ttsProvider,
      };

      let needRestartGateway = false;
      for (const field of fieldsToSave) {
        if (field === "workspaceRoot") {
          const cfg = config;
          await invoke("set_config", { key: "workspace_root", value: cfg?.workspaceRoot || "" });
          needRestartGateway = true;
          continue;
        }
        if (field === "hermesApiBase") {
          await invoke("set_config", { key: "hermes_api_base", value: hermesApiBase });
          continue;
        }
        if (field === "hermesApiKey") {
          await invoke("set_config", { key: "hermes_api_key", value: hermesApiKey });
          continue;
        }
        const configKey = configKeyMap[field];
        const value = fieldValueMap[field];
        if (configKey && value !== undefined) {
          await invoke<string>("set_hermes_config", { key: configKey, value });
        }
      }

      setSaveMessage({
        text: t("settings.saved", { count: fieldsToSave.length }),
        type: "success",
      });
      setDirtyFields((prev) => {
        const next = new Set(prev);
        fieldsToSave.forEach((f) => next.delete(f));
        return next;
      });

      if (needRestartGateway) {
        try {
          await invoke("restart_hermes");
          setSaveMessage({ text: "设置已保存，网关已重启", type: "success" });
        } catch (restartErr) {
          console.error("Failed to restart gateway:", restartErr);
          setSaveMessage({ text: "设置已保存，但网关重启失败，请手动重启", type: "error" });
        }
      }
    } catch (err) {
      console.error("Failed to save config:", err);
      setSaveMessage({ text: `${t("settings.saveFailed")}: ${err}`, type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const loadGestures = async () => {
    try {
      const list = await invoke<AvatarGesture[]>("get_avatar_gestures");
      setGestures(list);
    } catch (err) {
      console.error("Failed to load gestures:", err);
    }
  };

  const loadConfig = async (providerList: Provider[]) => {
    setLoading(true);
    try {
      const result = await invoke<HermesConfigData>("get_hermes_config");
      setConfig(result);
      setModel(result.model);
      setProvider(result.provider);
      let url = result.base_url;
      if (!url && result.provider) {
        const found = providerList.find((p) => p.value === result.provider);
        if (found) url = found.baseUrl;
        if (!url) url = DEFAULT_BASE_URLS[result.provider] || "";
      }
      setBaseUrl(url);
      setMaxTurns(result.max_turns || 90);
      setPersonality(result.personality);
      setShowReasoning(result.show_reasoning);
      setTerminalBackend(result.terminal_backend);
      setTerminalTimeout(result.terminal_timeout);
      setCompressionEnabled(result.compression_enabled);
      setMemoryEnabled(result.memory_enabled);
      setTtsProvider(result.tts_provider);
      try {
        const wsRoot = await invoke<string>("get_config", { key: "workspace_root" });
        const cfg: HermesConfigData = { ...result };
        cfg.workspaceRoot = wsRoot || "";
        setConfig(cfg);
      } catch (err) {
        console.warn("Failed to parse config:", err);
      }
      try {
        const savedApiBase = await invoke<string>("get_config", { key: "hermes_api_base" });
        const savedApiKey = await invoke<string>("get_config", { key: "hermes_api_key" });
        if (savedApiBase) setHermesApiBase(savedApiBase);
        if (savedApiKey) setHermesApiKey(savedApiKey);
      } catch (err) {
        console.warn("Failed to load API config:", err);
      }
      setDirtyFields(new Set());
      if (result.provider) {
        fetchModelList(result.provider);
      }
    } catch (err) {
      console.error("Failed to load hermes config:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const list = await loadProviders();
      await loadConfig(list);
    })();
    loadGestures();
  }, []);

  if (loading) {
    return (
      <div className={`panel ${styles.settingsPanel}`}>
        <div className={styles.skillsLoading}>
          <span className={styles.loadingSpinner}>⏳</span>
          <p>正在加载配置...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`panel ${styles.settingsPanelNew}`}>
      <div className={styles.settingsSidebar}>
        <div className={styles.settingsSidebarTitle}>{t("settings.title")}</div>
        <nav className={styles.settingsNav}>
          {(
            [
              { key: "provider", icon: "🔌", labelKey: "nav.provider" as const, dirty: 0 },
              {
                key: "agent",
                icon: "👾",
                labelKey: "nav.agent" as const,
                dirty: sectionDirtyCount("model"),
              },
              { key: "knowledge", icon: "📚", labelKey: "nav.knowledge" as const, dirty: 0 },
              { key: "gesture", icon: "💃", labelKey: "nav.gesture" as const, dirty: 0 },
              { key: "cardManager", icon: "🃏", labelKey: "nav.cardManager" as const, dirty: 0 },
              { key: "aiRoles", icon: "👥", labelKey: "nav.aiRoles" as const, dirty: 0 },
              {
                key: "system",
                icon: "⚙️",
                labelKey: "nav.system" as const,
                dirty: sectionDirtyCount("system"),
              },
              { key: "about", icon: "ℹ️", labelKey: "nav.about" as const, dirty: 0 },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              className={`${styles.settingsNavItem} ${activeSection === item.key ? styles.settingsNavItemActive : ""}`}
              onClick={() => setActiveSection(item.key)}
            >
              <span className={styles.settingsNavIcon}>{item.icon}</span>
              <span className={styles.settingsNavLabel}>{t(item.labelKey)}</span>
              {item.dirty > 0 && (
                <span className={`${styles.dirtyBadge} ${styles.navDirtyBadge}`}>{item.dirty}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className={styles.settingsContent}>
        <div className={styles.settingsSectionContent}>
          {activeSection === "agent" && (
            <AgentSettings
              config={config}
              model={model}
              provider={provider}
              baseUrl={baseUrl}
              maxTurns={maxTurns}
              hermesApiBase={hermesApiBase}
              hermesApiKey={hermesApiKey}
              providers={providers}
              modelList={modelList}
              modelListLoading={modelListLoading}
              modelListError={modelListError}
              dirtyFields={dirtyFields}
              saving={saving}
              saveMessage={saveMessage}
              onModelChange={(v) => {
                setModel(v);
                markDirty("model");
              }}
              onProviderChange={handleProviderChange}
              onMaxTurnsChange={(v) => {
                setMaxTurns(v);
                markDirty("maxTurns");
              }}
              onWorkspaceRootChange={(v) => {
                const cfg: HermesConfigData = { ...config! };
                cfg.workspaceRoot = v;
                setConfig(cfg);
                markDirty("workspaceRoot");
              }}
              onHermesApiBaseChange={(v) => {
                setHermesApiBase(v);
                markDirty("hermesApiBase");
              }}
              onHermesApiKeyChange={(v) => {
                setHermesApiKey(v);
                markDirty("hermesApiKey");
              }}
              onRefreshModels={fetchModelList}
              onSave={() => saveSectionConfig("model")}
              onRefresh={() => loadConfig(providers)}
              t={t}
            />
          )}

          {activeSection === "provider" && (
            <ProviderSettings
              providers={providers}
              searchQuery={providerSearch}
              onSearchChange={setProviderSearch}
              page={providerPage}
              pageSize={providerPageSize}
              onPageChange={setProviderPage}
              onAdd={openNewProvider}
              onEdit={openEditProvider}
              onDelete={handleDeleteProvider}
              t={t}
            />
          )}

          {activeSection === "system" && (
            <SystemSettings
              theme={theme}
              locale={locale}
              personality={personality}
              showReasoning={showReasoning}
              ttsProvider={ttsProvider}
              terminalBackend={terminalBackend}
              terminalTimeout={terminalTimeout}
              compressionEnabled={compressionEnabled}
              memoryEnabled={memoryEnabled}
              dirtyFields={dirtyFields}
              saving={saving}
              onThemeChange={setTheme}
              onLocaleChange={setLocale}
              onPersonalityChange={(v) => {
                setPersonality(v);
                markDirty("personality");
              }}
              onShowReasoningChange={(v) => {
                setShowReasoning(v);
                markDirty("showReasoning");
              }}
              onTtsProviderChange={(v) => {
                setTtsProvider(v);
                markDirty("ttsProvider");
              }}
              onTerminalBackendChange={(v) => {
                setTerminalBackend(v);
                markDirty("terminalBackend");
              }}
              onTerminalTimeoutChange={(v) => {
                setTerminalTimeout(v);
                markDirty("terminalTimeout");
              }}
              onCompressionChange={(v) => {
                setCompressionEnabled(v);
                markDirty("compressionEnabled");
              }}
              onMemoryChange={(v) => {
                setMemoryEnabled(v);
                markDirty("memoryEnabled");
              }}
              onSave={() => saveSectionConfig("system")}
              t={t}
            />
          )}

          {activeSection === "gesture" && (
            <GestureSettingsComponent
              gestures={gestures}
              onRefresh={loadGestures}
              onShowEditor={(gesture, readOnly, form) => {
                setEditingGesture(gesture);
                setGestureForm(form);
                setGestureReadOnly(readOnly);
                setShowGestureModal(true);
              }}
              t={t}
            />
          )}

          {activeSection === "cardManager" && <CardManagerPanel t={t} />}

          {activeSection === "aiRoles" && <AiRolesSettingsSection t={t} />}

          {activeSection === "about" && (
            <div className={styles.settingsSectionCard}>
              <div className={styles.settingsSection}>
                <h3>{t("about.title")}</h3>
                <div className={styles.aboutInfo}>
                  <div className={styles.aboutLogo}>
                    <img src="/bot.svg" alt="Hermes" />
                  </div>
                  <div className={styles.aboutName}>{t("app.name")}</div>
                  <div className={styles.aboutVersion}>{t("about.version")}</div>
                  <div className={styles.aboutDesc}>{t("app.desc")}</div>
                  <div className={styles.aboutMeta}>
                    <div className={styles.aboutAuthor}>{t("about.author")}</div>
                    <div className={styles.aboutEmail}>{t("about.email")}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "knowledge" && <KnowledgeSettingsSection t={t} />}
        </div>
      </div>

      {showGestureModal && (
        <Suspense fallback={<div>Loading...</div>}>
          <GestureEditor
            gestureName={editingGesture ? gestureForm.name : ""}
            initialTargetJson={gestureForm.targetJson}
            duration={gestureForm.duration}
            lookAtX={gestureForm.lookAtX}
            lookAtY={gestureForm.lookAtY}
            tilt={gestureForm.tilt}
            readOnly={gestureReadOnly}
            onCancel={() => {
              setShowGestureModal(false);
              setGestureReadOnly(false);
            }}
            onSave={async (params) => {
              try {
                if (editingGesture) {
                  await invoke("update_avatar_gesture", {
                    req: { id: editingGesture.id, ...params },
                  });
                } else {
                  await invoke("create_avatar_gesture", { req: params });
                }
                setShowGestureModal(false);
                loadGestures();
              } catch (e) {
                alert("保存失败: " + String(e));
              }
            }}
          />
        </Suspense>
      )}

      <ProviderModal
        visible={showProviderModal}
        editingProvider={editingProvider}
        providers={providers}
        onClose={closeProviderModal}
        onSave={handleSaveProvider}
        onEdit={openEditProvider}
        onAdd={openNewProvider}
        onDelete={handleDeleteProvider}
        t={t}
      />
    </div>
  );
}

export default SettingsPanel;
