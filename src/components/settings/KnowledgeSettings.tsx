import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import settingsStyles from "@pages/settings/SettingsPanel.module.css";
import kbStyles from "@pages/knowledge/KnowledgePanel.module.css";

function KnowledgeSettingsSection({ t }: { t: (key: string) => string }) {
  const [kbConfig, setKbConfig] = useState({
    defaultEmbeddingModel: "local",
    defaultRetrievalMode: "off",
    defaultMaxContextChunks: 8,
    globalAutoRetrieve: true,
    cloudProvider: "",
    cloudEmbeddingModel: "",
    ollamaEndpoint: "http://localhost:11434",
    ollamaModel: "nomic-embed-text",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [providers, setProviders] = useState<
    { id: string; name: string; value: string; baseUrl: string; apiKey: string }[]
  >([]);
  const [localModelStatus, setLocalModelStatus] = useState<
    "unknown" | "ready" | "onnx_ready" | "missing" | "downloading"
  >("unknown");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [cloudTestResult, setCloudTestResult] = useState<"idle" | "testing" | "ok" | "fail">(
    "idle"
  );
  const [cloudTestError, setCloudTestError] = useState<string>("");
  const [ollamaTestResult, setOllamaTestResult] = useState<"idle" | "testing" | "ok" | "fail">(
    "idle"
  );
  const [ollamaTestError, setOllamaTestError] = useState<string>("");
  const [cloudModels, setCloudModels] = useState<{ id: string; ownedBy?: string }[]>([]);
  const [cloudModelsLoading, setCloudModelsLoading] = useState(false);
  const [cloudHasEmbeddingModels, setCloudHasEmbeddingModels] = useState(true);
  const [showEmbeddingHelp, setShowEmbeddingHelp] = useState(false);
  const [showRetrievalHelp, setShowRetrievalHelp] = useState(false);
  const [showAdvancedHelp, setShowAdvancedHelp] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await invoke<any>("get_knowledge_config");
        setKbConfig({
          defaultEmbeddingModel: cfg.defaultEmbeddingModel || "local",
          defaultRetrievalMode: cfg.defaultRetrievalMode || "off",
          defaultMaxContextChunks: cfg.defaultMaxContextChunks || 8,
          globalAutoRetrieve: cfg.globalAutoRetrieve || false,
          cloudProvider: cfg.cloudProvider || "",
          cloudEmbeddingModel: cfg.cloudEmbeddingModel || "",
          ollamaEndpoint: cfg.ollamaEndpoint || "http://localhost:11434",
          ollamaModel: cfg.ollamaModel || "nomic-embed-text",
        });
      } catch {
        // console.error("Failed to load knowledge config:", e);
      }
    })();
    (async () => {
      try {
        const list =
          await invoke<
            { id: string; name: string; value: string; baseUrl: string; apiKey: string }[]
          >("list_providers");
        setProviders(list || []);
      } catch {
        // console.error("Failed to load providers:", e);
      }
    })();
    (async () => {
      try {
        const result = await invoke<string>("check_local_embedding_model");
        if (result === "onnx_ready") {
          setLocalModelStatus("onnx_ready");
        } else if (result === "ready") {
          setLocalModelStatus("ready");
        } else {
          setLocalModelStatus("missing");
        }
      } catch {
        setLocalModelStatus("unknown");
      }
    })();
  }, []);

  const checkLocalModel = async () => {
    try {
      const result = await invoke<string>("check_local_embedding_model");
      if (result === "onnx_ready") {
        setLocalModelStatus("onnx_ready");
      } else if (result === "ready") {
        setLocalModelStatus("ready");
      } else {
        setLocalModelStatus("missing");
      }
    } catch {
      setLocalModelStatus("unknown");
    }
  };

  useEffect(() => {
    if (!kbConfig.cloudProvider) {
      setCloudModels([]);
      return;
    }
    (async () => {
      setCloudModelsLoading(true);
      setCloudModels([]);
      try {
        const list = await invoke<{ id: string; ownedBy?: string }[]>("list_models", {
          providerValue: kbConfig.cloudProvider,
        });
        const embeddingModels = (list || []).filter(
          (m) =>
            m.id.toLowerCase().includes("embed") ||
            m.id.toLowerCase().includes("e5") ||
            m.id.toLowerCase().includes("bge")
        );
        if (embeddingModels.length > 0) {
          setCloudModels(embeddingModels);
          setCloudHasEmbeddingModels(true);
        } else {
          setCloudModels(list || []);
          setCloudHasEmbeddingModels((list || []).length > 0);
        }
      } catch {
        setCloudModels([]);
      } finally {
        setCloudModelsLoading(false);
      }
    })();
  }, [kbConfig.cloudProvider]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await invoke("set_knowledge_config", { config: kbConfig });
      setSaveMsg("success");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      // console.error("Failed to save knowledge config:", e);
      setSaveMsg("error");
    } finally {
      setSaving(false);
    }
  };

  const handleTestCloud = async () => {
    setCloudTestResult("testing");
    setCloudTestError("");
    try {
      const result = await invoke<string>("test_cloud_embedding", {
        provider: kbConfig.cloudProvider,
        model: kbConfig.cloudEmbeddingModel,
      });
      setCloudTestResult(result === "ok" ? "ok" : "fail");
      if (result !== "ok") setCloudTestError("Unexpected response");
      setTimeout(() => {
        setCloudTestResult("idle");
        setCloudTestError("");
      }, 5000);
    } catch (e) {
      setCloudTestResult("fail");
      setCloudTestError(String(e));
      setTimeout(() => {
        setCloudTestResult("idle");
        setCloudTestError("");
      }, 8000);
    }
  };

  const handleTestOllama = async () => {
    setOllamaTestResult("testing");
    setOllamaTestError("");
    try {
      const result = await invoke<string>("test_ollama_embedding", {
        endpoint: kbConfig.ollamaEndpoint,
        model: kbConfig.ollamaModel,
      });
      setOllamaTestResult(result === "ok" ? "ok" : "fail");
      if (result !== "ok") setOllamaTestError("Unexpected response");
      setTimeout(() => {
        setOllamaTestResult("idle");
        setOllamaTestError("");
      }, 5000);
    } catch (e) {
      setOllamaTestResult("fail");
      setOllamaTestError(String(e));
      setTimeout(() => {
        setOllamaTestResult("idle");
        setOllamaTestError("");
      }, 8000);
    }
  };

  const handleInstallLocalModel = async () => {
    setLocalModelStatus("downloading");
    setDownloadProgress(0);
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<{ payload: number }>(
        "local-embedding-model-progress",
        (event) => {
          if (typeof event.payload === "number") {
            setDownloadProgress(event.payload);
          }
        }
      );
      await invoke("install_local_embedding_model");
      setDownloadProgress(100);
      setLocalModelStatus("ready");
      unlisten();
    } catch {
      // console.error("Failed to install local model:", e);
      setLocalModelStatus("missing");
    }
  };

  const handleInstallOnnxModel = async () => {
    try {
      const result = await invoke<string>("install_onnx_model");
      if (result === "installed" || result === "already_exists") {
        setLocalModelStatus("onnx_ready");
      }
    } catch {
      // console.error("Failed to install ONNX model:", e);
    }
  };

  const retrievalModes = [
    { value: "off", icon: "🚫", desc: t("kb.settings.modeOffDesc") },
    { value: "auto", icon: "⚡", desc: t("kb.settings.modeAutoDesc") },
  ];

  const updateConfig = (patch: Partial<typeof kbConfig>) => setKbConfig({ ...kbConfig, ...patch });

  return (
    <div className={settingsStyles.settingsSectionCard}>
      <div className={settingsStyles.settingsHeader}>
        <h2>{t("kb.settings.title")}</h2>
      </div>
      {saveMsg && (
        <div
          className={`${settingsStyles.saveToast} ${saveMsg === "success" ? settingsStyles.saveToastSuccess : settingsStyles.saveToastError}`}
        >
          {saveMsg === "success" ? "✅" : "❌"}{" "}
          {saveMsg === "success" ? t("common.saved") : t("common.saveFailed")}
        </div>
      )}
      <div className={settingsStyles.settingsSection}>
        <h3 className={kbStyles.kbSectionTitleWithHelp}>
          {t("kb.settings.embeddingModelSection")}
          <span
            className={kbStyles.kbHelpIcon}
            onClick={() => setShowEmbeddingHelp(!showEmbeddingHelp)}
          >
            ?
          </span>
          {showEmbeddingHelp && (
            <div className={kbStyles.kbHelpPopup}>
              <div className={kbStyles.kbHelpPopupTitle}>嵌入模型支持说明</div>
              <div className={kbStyles.kbHelpPopupSection}>
                <div className={kbStyles.kbHelpPopupSubtitle}>☁️ 云端模型（推荐）</div>
                <div className={kbStyles.kbHelpPopupItem}>
                  <b>硅基流动 SiliconFlow</b> — BAAI/bge-large-zh-v1.5, BAAI/bge-m3,
                  netease-youdao/bce-embedding-base_v1
                </div>
                <div className={kbStyles.kbHelpPopupItem}>
                  <b>OpenAI</b> — text-embedding-3-small, text-embedding-3-large,
                  text-embedding-ada-002
                </div>
                <div className={kbStyles.kbHelpPopupItem}>
                  <b>智谱 AI</b> — embedding-3
                </div>
                <div className={kbStyles.kbHelpPopupItem}>
                  <b>阿里云 DashScope</b> — text-embedding-v3, text-embedding-v2
                </div>
              </div>
              <div className={kbStyles.kbHelpPopupSection}>
                <div className={kbStyles.kbHelpPopupSubtitle}>🦙 Ollama（本地部署）</div>
                <div className={kbStyles.kbHelpPopupItem}>
                  nomic-embed-text, mxbai-embed-large, bge-m3, all_minilm
                </div>
                <div className={kbStyles.kbHelpPopupCmd}>ollama pull nomic-embed-text</div>
              </div>
              <div className={kbStyles.kbHelpPopupSection}>
                <div className={kbStyles.kbHelpPopupSubtitle}>💻 本地模型</div>
                <div className={kbStyles.kbHelpPopupItem}>all-MiniLM-L6-v2（内置，自动下载）</div>
              </div>
              <div className={kbStyles.kbHelpPopupNote}>
                ⚠️ DeepSeek、Anthropic (Claude) 等供应商不支持嵌入模型 API
              </div>
            </div>
          )}
        </h3>
        <p className={kbStyles.kbSettingsSectionDesc}>{t("kb.settings.embeddingModelDesc")}</p>
        <div className={kbStyles.kbModelTabs}>
          {[
            { value: "local", icon: "💻", label: t("kb.embeddingModel.local") },
            { value: "cloud", icon: "☁️", label: t("kb.embeddingModel.cloud") },
            { value: "ollama", icon: "🦙", label: t("kb.embeddingModel.ollama") },
          ].map((m) => (
            <button
              key={m.value}
              className={
                kbStyles.kbModelTab +
                " " +
                (kbConfig.defaultEmbeddingModel === m.value ? kbStyles.active : "")
              }
              onClick={() => {
                updateConfig({ defaultEmbeddingModel: m.value });
                if (m.value === "local") checkLocalModel();
              }}
            >
              <span className={kbStyles.kbModelTabIcon}>{m.icon}</span>
              <span className={kbStyles.kbModelTabLabel}>{m.label}</span>
            </button>
          ))}
        </div>
        {kbConfig.defaultEmbeddingModel === "local" && (
          <div className={kbStyles.kbModelDetail}>
            <div className={kbStyles.kbModelDetailRow}>
              <span className={kbStyles.kbModelDetailLabel}>all-MiniLM-L6-v2</span>
              <span
                className={`${kbStyles.kbModelStatus} ${kbStyles["kbModelStatus" + (localModelStatus === "downloading" ? "Missing" : localModelStatus === "onnx_ready" ? "Ready" : localModelStatus.charAt(0).toUpperCase() + localModelStatus.slice(1))] || ""}`}
              >
                {localModelStatus === "onnx_ready" &&
                  "✓ " + t("kb.settings.modelReady") + " (ONNX)"}
                {localModelStatus === "ready" && "✓ " + t("kb.settings.modelReady")}
                {localModelStatus === "missing" && "⚠ " + t("kb.settings.modelMissing")}
                {localModelStatus === "unknown" && t("kb.settings.modelUnknown")}
                {localModelStatus === "downloading" && t("kb.settings.modelDownloading")}
              </span>
            </div>
            <p className={kbStyles.kbModelDetailHint}>{t("kb.settings.localModelHint")}</p>
            {localModelStatus === "missing" && (
              <button className={kbStyles.kbModelInstallBtn} onClick={handleInstallLocalModel}>
                {t("kb.settings.installModel")}
              </button>
            )}
            {localModelStatus === "ready" && (
              <button
                className={kbStyles.kbModelInstallBtn}
                onClick={handleInstallOnnxModel}
                style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
              >
                ⚡ 安装 ONNX 加速
              </button>
            )}
            {localModelStatus === "downloading" && (
              <div className={kbStyles.kbDownloadProgressWrap}>
                <div className={kbStyles.kbDownloadProgressBar}>
                  <div
                    className={kbStyles.kbDownloadProgressFill}
                    style={{ width: `${Math.min(downloadProgress, 100)}%` }}
                  />
                </div>
                <span className={kbStyles.kbDownloadProgressText}>
                  {Math.round(downloadProgress)}%
                </span>
              </div>
            )}
          </div>
        )}
        {kbConfig.defaultEmbeddingModel === "cloud" && (
          <div className={kbStyles.kbModelDetail}>
            <div className={settingsStyles.formGroup}>
              <label>{t("kb.settings.cloudProvider")}</label>
              <select
                value={kbConfig.cloudProvider}
                onChange={(e) =>
                  updateConfig({ cloudProvider: e.target.value, cloudEmbeddingModel: "" })
                }
              >
                <option value="">{t("common.selectProvider")}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.value}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={settingsStyles.formGroup}>
              <label>{t("kb.settings.embeddingModelName")}</label>
              <select
                value={kbConfig.cloudEmbeddingModel}
                onChange={(e) => updateConfig({ cloudEmbeddingModel: e.target.value })}
                disabled={!kbConfig.cloudProvider || cloudModelsLoading}
              >
                <option value="">
                  {cloudModelsLoading ? t("kb.settings.loadingModels") : t("common.selectModel")}
                </option>
                {kbConfig.cloudEmbeddingModel &&
                  !cloudModels.some((m) => m.id === kbConfig.cloudEmbeddingModel) && (
                    <option value={kbConfig.cloudEmbeddingModel}>
                      {kbConfig.cloudEmbeddingModel}
                    </option>
                  )}
                {cloudModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
              {!cloudModelsLoading && kbConfig.cloudProvider && !cloudHasEmbeddingModels && (
                <span className={kbStyles.kbNoEmbeddingWarning}>
                  ⚠ 该供应商未检测到嵌入模型，测试连接可能会失败
                </span>
              )}
            </div>
            <div className={kbStyles.kbModelDetailRow}>
              <span className={kbStyles.kbModelDetailHint}>
                {t("kb.settings.cloudProviderHint")}
              </span>
              <button
                className={kbStyles.kbModelTestBtn}
                onClick={handleTestCloud}
                disabled={
                  !kbConfig.cloudProvider ||
                  !kbConfig.cloudEmbeddingModel ||
                  cloudTestResult === "testing"
                }
              >
                {cloudTestResult === "testing" ? "..." : t("kb.settings.testConnection")}
              </button>
            </div>
            {cloudTestResult === "ok" && (
              <span className={kbStyles.kbTestOk}>✓ {t("kb.settings.testOk")}</span>
            )}
            {cloudTestResult === "fail" && (
              <span className={kbStyles.kbTestFail}>
                ✗ {t("kb.settings.testFail")}
                {cloudTestError ? `: ${cloudTestError}` : ""}
              </span>
            )}
          </div>
        )}
        {kbConfig.defaultEmbeddingModel === "ollama" && (
          <div className={kbStyles.kbModelDetail}>
            <div className={settingsStyles.formGroup}>
              <label>{t("kb.settings.ollamaEndpoint")}</label>
              <input
                type="text"
                value={kbConfig.ollamaEndpoint}
                onChange={(e) => updateConfig({ ollamaEndpoint: e.target.value })}
                placeholder="http://localhost:11434"
              />
            </div>
            <div className={settingsStyles.formGroup}>
              <label>{t("kb.settings.ollamaModelName")}</label>
              <input
                type="text"
                value={kbConfig.ollamaModel}
                onChange={(e) => updateConfig({ ollamaModel: e.target.value })}
                placeholder="nomic-embed-text"
              />
            </div>
            <div className={kbStyles.kbModelDetailRow}>
              <span className={kbStyles.kbModelDetailHint}>{t("kb.settings.ollamaHint")}</span>
              <button
                className={kbStyles.kbModelTestBtn}
                onClick={handleTestOllama}
                disabled={
                  !kbConfig.ollamaEndpoint ||
                  !kbConfig.ollamaModel ||
                  ollamaTestResult === "testing"
                }
              >
                {ollamaTestResult === "testing" ? "..." : t("kb.settings.testConnection")}
              </button>
            </div>
            {ollamaTestResult === "ok" && (
              <span className={kbStyles.kbTestOk}>✓ {t("kb.settings.testOk")}</span>
            )}
            {ollamaTestResult === "fail" && (
              <span className={kbStyles.kbTestFail}>
                ✗ {t("kb.settings.testFail")}
                {ollamaTestError ? `: ${ollamaTestError}` : ""}
              </span>
            )}
          </div>
        )}
      </div>
      <div className={settingsStyles.settingsSection}>
        <h3 className={kbStyles.kbSectionTitleWithHelp}>
          {t("kb.settings.retrievalModeSection")}
          <span
            className={kbStyles.kbHelpIcon}
            onClick={() => setShowRetrievalHelp(!showRetrievalHelp)}
          >
            ?
          </span>
          {showRetrievalHelp && (
            <div className={kbStyles.kbHelpPopup}>
              <div className={kbStyles.kbHelpPopupTitle}>检索注入策略说明</div>
              <div className={kbStyles.kbHelpPopupSection}>
                <div className={kbStyles.kbHelpPopupSubtitle}>🚫 关闭</div>
                <div className={kbStyles.kbHelpPopupItem}>
                  不自动检索知识库，可在对话中手动选择知识库
                </div>
              </div>
              <div className={kbStyles.kbHelpPopupSection}>
                <div className={kbStyles.kbHelpPopupSubtitle}>⚡ 自动注入</div>
                <div className={kbStyles.kbHelpPopupItem}>
                  每次对话自动检索所有就绪知识库的相关片段，注入到上下文中发送给模型
                </div>
              </div>
              <div className={kbStyles.kbHelpPopupNote}>
                💡 关闭自动注入后，可在对话输入框手动选择需要的知识库
              </div>
            </div>
          )}
        </h3>
        <p className={kbStyles.kbSettingsSectionDesc}>{t("kb.settings.retrievalModeDesc")}</p>
        <div className={kbStyles.kbModeCards}>
          {retrievalModes.map((m) => (
            <div
              key={m.value}
              className={
                kbStyles.kbModeCard +
                " " +
                (kbConfig.defaultRetrievalMode === m.value ? kbStyles.active : "")
              }
              onClick={() => updateConfig({ defaultRetrievalMode: m.value })}
            >
              <div className={kbStyles.kbModeCardTitle}>
                <span className={kbStyles.kbModeCardIcon}>{m.icon}</span>
                <span className={kbStyles.kbModeCardName}>{t(`kb.retrievalMode.${m.value}`)}</span>
              </div>
              <div className={kbStyles.kbModeCardDesc}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={settingsStyles.settingsSection}>
        <h3 className={kbStyles.kbSectionTitleWithHelp}>
          {t("kb.settings.advancedSection")}
          <span
            className={kbStyles.kbHelpIcon}
            onClick={() => setShowAdvancedHelp(!showAdvancedHelp)}
          >
            ?
          </span>
          {showAdvancedHelp && (
            <div className={kbStyles.kbHelpPopup}>
              <div className={kbStyles.kbHelpPopupTitle}>高级设置说明</div>
              <div className={kbStyles.kbHelpPopupSection}>
                <div className={kbStyles.kbHelpPopupSubtitle}>📊 最大上下文块数</div>
                <div className={kbStyles.kbHelpPopupItem}>
                  每次检索返回的最大知识片段数量。数值越大，注入的上下文越丰富，但消耗的 Token
                  也越多
                </div>
                <div className={kbStyles.kbHelpPopupItem}>
                  推荐值：4~12，知识库内容较短时可适当增大
                </div>
              </div>
              <div className={kbStyles.kbHelpPopupSection}>
                <div className={kbStyles.kbHelpPopupSubtitle}>🔄 全局自动检索</div>
                <div className={kbStyles.kbHelpPopupItem}>
                  开启后，所有知识库在对话时都会自动检索注入。关闭则需在每个知识库中单独配置
                </div>
              </div>
            </div>
          )}
        </h3>
        <div className={settingsStyles.settingsForm}>
          <div className={settingsStyles.formGroup}>
            <label>{t("kb.settings.defaultMaxContextChunks")}</label>
            <div className={kbStyles.kbChunksControl}>
              <input
                type="range"
                min={1}
                max={32}
                value={kbConfig.defaultMaxContextChunks}
                onChange={(e) =>
                  updateConfig({ defaultMaxContextChunks: parseInt(e.target.value) || 8 })
                }
                className={kbStyles.kbChunksSlider}
                style={
                  {
                    "--slider-pct": `${((kbConfig.defaultMaxContextChunks - 1) / 31) * 100}%`,
                  } as React.CSSProperties
                }
              />
              <span className={kbStyles.kbChunksValue}>{kbConfig.defaultMaxContextChunks}</span>
            </div>
            <span className={kbStyles.kbChunksHint}>{t("kb.settings.chunksHint")}</span>
          </div>
          <div className={settingsStyles.formGroup}>
            <label className={kbStyles.kbToggleLabel}>
              <span className={kbStyles.kbToggleText}>
                <span className={kbStyles.kbToggleTitle}>
                  {t("kb.settings.globalAutoRetrieve")}
                </span>
                <span className={kbStyles.kbToggleDesc}>{t("kb.settings.autoRetrieveDesc")}</span>
              </span>
              <button
                type="button"
                className={
                  kbStyles.kbToggleSwitch + " " + (kbConfig.globalAutoRetrieve ? kbStyles.on : "")
                }
                onClick={() => updateConfig({ globalAutoRetrieve: !kbConfig.globalAutoRetrieve })}
              >
                <span className={kbStyles.kbToggleKnob} />
              </button>
            </label>
          </div>
        </div>
      </div>
      <div className={kbStyles.kbSettingsFooter}>
        <button className={kbStyles.kbSettingsSaveBtn} onClick={handleSave} disabled={saving}>
          {saving ? <span className={kbStyles.kbSpinner} /> : t("kb.settings.saveBtn")}
        </button>
      </div>
    </div>
  );
}

export default KnowledgeSettingsSection;
