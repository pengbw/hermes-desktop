import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "@contexts/I18nContext";

function KnowledgeSettingsSection({ t }: { t: (key: string) => string }) {
  const { locale } = useI18n();
  const [kbConfig, setKbConfig] = useState({
    defaultEmbeddingModel: "local",
    defaultRetrievalMode: "off",
    defaultMaxContextChunks: 8,
    globalAutoRetrieve: false,
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
      } catch (err) {
        console.error("[KnowledgeSettings] Failed to load knowledge config:", err);
      }
    })();
    (async () => {
      try {
        const list = await invoke<
          { id: string; name: string; value: string; baseUrl: string; apiKey: string }[]
        >("list_providers", { locale });
        setProviders(list || []);
      } catch (err) {
        console.error("[KnowledgeSettings] Failed to load providers:", err);
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
      } catch (err) {
        console.error("[KnowledgeSettings] Failed to check local model:", err);
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
    } catch (err) {
      console.error("[checkLocalModel] Failed to check local model:", err);
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
      } catch (err) {
        console.error("[KnowledgeSettings] Failed to load cloud models:", err);
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
    } catch (err) {
      console.error("[handleSave] Failed to save knowledge config:", err);
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
      const result = await invoke<string>("install_local_embedding_model");
      setDownloadProgress(100);
      setLocalModelStatus(result === "onnx_ready" ? "onnx_ready" : "ready");
      unlisten();
    } catch (err) {
      console.error("[handleInstallLocalModel] Failed to install local model:", err);
      setLocalModelStatus("missing");
    }
  };

  const handleInstallOnnxModel = async () => {
    try {
      const result = await invoke<string>("install_onnx_model");
      if (result === "installed" || result === "already_exists") {
        setLocalModelStatus("onnx_ready");
      }
    } catch (err) {
      console.error("[handleInstallOnnxModel] Failed to install ONNX model:", err);
    }
  };

  const retrievalModes = [
    { value: "off", icon: "🚫", desc: t("kb.settings.modeOffDesc") },
    { value: "auto", icon: "⚡", desc: t("kb.settings.modeAutoDesc") },
  ];

  const updateConfig = (patch: Partial<typeof kbConfig>) => setKbConfig({ ...kbConfig, ...patch });

  const getModelStatusClass = (status: string) => {
    switch (status) {
      case "onnx_ready":
      case "ready":
        return "text-green-500";
      case "missing":
        return "text-amber-500";
      case "downloading":
        return "text-primary";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-foreground m-0">{t("kb.settings.title")}</h2>
      </div>
      {saveMsg && (
        <div
          className={`mb-4 px-3 py-2 rounded-lg text-sm font-medium ${
            saveMsg === "success"
              ? "bg-green-500/10 text-green-500 border border-green-500/20"
              : "bg-red-500/10 text-red-500 border border-red-500/20"
          }`}
        >
          {saveMsg === "success" ? "✅" : "❌"}{" "}
          {saveMsg === "success" ? t("common.saved") : t("common.saveFailed")}
        </div>
      )}

      {/* 嵌入模型 */}
      <div className="mb-6">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground mb-1 relative">
          {t("kb.settings.embeddingModelSection")}
          <span
            className="inline-flex items-center justify-center w-4 h-4 text-[11px] font-bold rounded-full bg-muted-foreground text-white cursor-pointer hover:bg-primary transition-colors leading-none"
            onClick={() => setShowEmbeddingHelp(!showEmbeddingHelp)}
          >
            ?
          </span>
          {showEmbeddingHelp && (
            <div className="absolute top-[calc(100%+8px)] left-0 z-[100] w-80 p-3 bg-popover border border-border rounded-lg shadow-lg text-[11px] leading-relaxed text-foreground">
              <div className="absolute -top-[6px] left-[60px] w-[10px] h-[10px] bg-popover border-l border-t border-border rotate-45" />
              <div className="font-semibold text-xs mb-1.5">嵌入模型支持说明</div>
              <div className="mb-1.5">
                <div className="font-semibold mb-0.5">☁️ 云端模型（推荐）</div>
                <div className="pl-2 text-muted-foreground">
                  <b>硅基流动 SiliconFlow</b> — BAAI/bge-large-zh-v1.5, BAAI/bge-m3,
                  netease-youdao/bce-embedding-base_v1
                </div>
                <div className="pl-2 text-muted-foreground">
                  <b>OpenAI</b> — text-embedding-3-small, text-embedding-3-large,
                  text-embedding-ada-002
                </div>
                <div className="pl-2 text-muted-foreground">
                  <b>智谱 AI</b> — embedding-3
                </div>
                <div className="pl-2 text-muted-foreground">
                  <b>阿里云 DashScope</b> — text-embedding-v3, text-embedding-v2
                </div>
              </div>
              <div className="mb-1.5">
                <div className="font-semibold mb-0.5">🦙 Ollama（本地部署）</div>
                <div className="pl-2 text-muted-foreground">
                  nomic-embed-text, mxbai-embed-large, bge-m3, all_minilm
                </div>
                <div className="mt-0.5 px-1.5 py-0.5 bg-muted rounded font-mono text-xs text-primary">
                  ollama pull nomic-embed-text
                </div>
              </div>
              <div className="mb-1.5">
                <div className="font-semibold mb-0.5">💻 本地模型</div>
                <div className="pl-2 text-muted-foreground">all-MiniLM-L6-v2（内置，自动下载）</div>
              </div>
              <div className="mt-1 pt-1 border-t border-border text-amber-500 text-xs">
                ⚠️ DeepSeek、Anthropic (Claude) 等供应商不支持嵌入模型 API
              </div>
            </div>
          )}
        </h3>
        <p className="text-[13px] text-muted-foreground mb-3.5 leading-relaxed">
          {t("kb.settings.embeddingModelDesc")}
        </p>

        <div className="flex gap-1 bg-muted rounded-lg p-[3px]">
          {[
            { value: "local", icon: "💻", label: t("kb.embeddingModel.local") },
            { value: "cloud", icon: "☁️", label: t("kb.embeddingModel.cloud") },
            { value: "ollama", icon: "🦙", label: t("kb.embeddingModel.ollama") },
          ].map((m) => (
            <button
              key={m.value}
              className={`flex items-center justify-center gap-1 px-3 py-[5px] rounded-md text-xs transition-all flex-1 ${
                kbConfig.defaultEmbeddingModel === m.value
                  ? "bg-background text-foreground font-semibold shadow-sm"
                  : "bg-transparent text-muted-foreground hover:bg-background/50 hover:text-foreground"
              }`}
              onClick={() => {
                updateConfig({ defaultEmbeddingModel: m.value });
                if (m.value === "local") checkLocalModel();
              }}
            >
              <span className="text-[13px]">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {kbConfig.defaultEmbeddingModel === "local" && (
          <div className="mt-2.5 p-3 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-xs font-semibold text-foreground font-mono">
                all-MiniLM-L6-v2
              </span>
              <span className={`text-xs font-medium ${getModelStatusClass(localModelStatus)}`}>
                {localModelStatus === "onnx_ready" &&
                  "✓ " + t("kb.settings.modelReady") + " (ONNX)"}
                {localModelStatus === "ready" && "✓ " + t("kb.settings.modelReady")}
                {localModelStatus === "missing" && "⚠ " + t("kb.settings.modelMissing")}
                {localModelStatus === "unknown" && t("kb.settings.modelUnknown")}
                {localModelStatus === "downloading" && t("kb.settings.modelDownloading")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground m-0 leading-relaxed">
              {t("kb.settings.localModelHint")}
            </p>
            {localModelStatus === "missing" && (
              <button
                className="mt-2 px-3.5 py-1 text-[13px] border border-primary rounded-md bg-transparent text-primary cursor-pointer transition-all hover:bg-primary hover:text-white"
                onClick={handleInstallLocalModel}
              >
                {t("kb.settings.installModel")}
              </button>
            )}
            {localModelStatus === "ready" && (
              <button
                className="mt-2 px-3.5 py-1 text-[13px] border border-primary rounded-md text-primary cursor-pointer transition-all hover:bg-primary hover:text-white"
                style={{
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "#fff",
                  border: "none",
                }}
                onClick={handleInstallOnnxModel}
              >
                ⚡ 安装 ONNX 加速
              </button>
            )}
            {localModelStatus === "downloading" && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(downloadProgress, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-primary min-w-[32px] text-right">
                  {Math.round(downloadProgress)}%
                </span>
              </div>
            )}
          </div>
        )}

        {kbConfig.defaultEmbeddingModel === "cloud" && (
          <div className="mt-2.5 p-3 bg-muted/50 rounded-lg border border-border">
            <div className="flex flex-col gap-1.5 mb-2">
              <label className="text-[13px] text-muted-foreground font-medium">
                {t("kb.settings.cloudProvider")}
              </label>
              <select
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
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
            <div className="flex flex-col gap-1.5 mb-2">
              <label className="text-[13px] text-muted-foreground font-medium">
                {t("kb.settings.embeddingModelName")}
              </label>
              <select
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
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
                <span className="text-xs text-amber-500 mt-1">
                  ⚠ 该供应商未检测到嵌入模型，测试连接可能会失败
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-xs text-muted-foreground">
                {t("kb.settings.cloudProviderHint")}
              </span>
              <button
                className="px-2.5 py-[3px] text-[13px] border border-primary rounded-md bg-transparent text-primary cursor-pointer transition-all hover:bg-primary hover:text-white whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
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
              <span className="block mt-1.5 text-xs text-green-500">
                ✓ {t("kb.settings.testOk")}
              </span>
            )}
            {cloudTestResult === "fail" && (
              <span className="block mt-1.5 text-xs text-red-500">
                ✗ {t("kb.settings.testFail")}
                {cloudTestError ? `: ${cloudTestError}` : ""}
              </span>
            )}
          </div>
        )}

        {kbConfig.defaultEmbeddingModel === "ollama" && (
          <div className="mt-2.5 p-3 bg-muted/50 rounded-lg border border-border">
            <div className="flex flex-col gap-1.5 mb-2">
              <label className="text-[13px] text-muted-foreground font-medium">
                {t("kb.settings.ollamaEndpoint")}
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
                value={kbConfig.ollamaEndpoint}
                onChange={(e) => updateConfig({ ollamaEndpoint: e.target.value })}
                placeholder="http://localhost:11434"
              />
            </div>
            <div className="flex flex-col gap-1.5 mb-2">
              <label className="text-[13px] text-muted-foreground font-medium">
                {t("kb.settings.ollamaModelName")}
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
                value={kbConfig.ollamaModel}
                onChange={(e) => updateConfig({ ollamaModel: e.target.value })}
                placeholder="nomic-embed-text"
              />
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-xs text-muted-foreground">{t("kb.settings.ollamaHint")}</span>
              <button
                className="px-2.5 py-[3px] text-[13px] border border-primary rounded-md bg-transparent text-primary cursor-pointer transition-all hover:bg-primary hover:text-white whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
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
              <span className="block mt-1.5 text-xs text-green-500">
                ✓ {t("kb.settings.testOk")}
              </span>
            )}
            {ollamaTestResult === "fail" && (
              <span className="block mt-1.5 text-xs text-red-500">
                ✗ {t("kb.settings.testFail")}
                {ollamaTestError ? `: ${ollamaTestError}` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 检索模式 */}
      <div className="mb-6">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground mb-1 relative">
          {t("kb.settings.retrievalModeSection")}
          <span
            className="inline-flex items-center justify-center w-4 h-4 text-[11px] font-bold rounded-full bg-muted-foreground text-white cursor-pointer hover:bg-primary transition-colors leading-none"
            onClick={() => setShowRetrievalHelp(!showRetrievalHelp)}
          >
            ?
          </span>
          {showRetrievalHelp && (
            <div className="absolute top-[calc(100%+8px)] left-0 z-[100] w-80 p-3 bg-popover border border-border rounded-lg shadow-lg text-[11px] leading-relaxed text-foreground">
              <div className="absolute -top-[6px] left-[60px] w-[10px] h-[10px] bg-popover border-l border-t border-border rotate-45" />
              <div className="font-semibold text-xs mb-1.5">检索注入策略说明</div>
              <div className="mb-1.5">
                <div className="font-semibold mb-0.5">🚫 关闭</div>
                <div className="pl-2 text-muted-foreground">
                  不自动检索知识库，可在对话中手动选择知识库
                </div>
              </div>
              <div className="mb-1.5">
                <div className="font-semibold mb-0.5">⚡ 自动注入</div>
                <div className="pl-2 text-muted-foreground">
                  每次对话自动检索所有就绪知识库的相关片段，注入到上下文中发送给模型
                </div>
              </div>
              <div className="mt-1 pt-1 border-t border-border text-amber-500 text-xs">
                💡 关闭自动注入后，可在对话输入框手动选择需要的知识库
              </div>
            </div>
          )}
        </h3>
        <p className="text-[13px] text-muted-foreground mb-3.5 leading-relaxed">
          {t("kb.settings.retrievalModeDesc")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {retrievalModes.map((m) => (
            <div
              key={m.value}
              className={`p-2 border-[1.5px] rounded-md cursor-pointer transition-all text-center ${
                kbConfig.defaultRetrievalMode === m.value
                  ? "border-primary bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary))]"
                  : "border-border bg-card hover:border-primary hover:bg-primary/[0.03]"
              }`}
              onClick={() => updateConfig({ defaultRetrievalMode: m.value })}
            >
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <span className="text-[13px]">{m.icon}</span>
                <span className="text-[13px] font-semibold text-foreground">
                  {t(`kb.retrievalMode.${m.value}`)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground leading-tight">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 高级设置 */}
      <div className="mb-6">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground mb-3 relative">
          {t("kb.settings.advancedSection")}
          <span
            className="inline-flex items-center justify-center w-4 h-4 text-[11px] font-bold rounded-full bg-muted-foreground text-white cursor-pointer hover:bg-primary transition-colors leading-none"
            onClick={() => setShowAdvancedHelp(!showAdvancedHelp)}
          >
            ?
          </span>
          {showAdvancedHelp && (
            <div className="absolute top-[calc(100%+8px)] left-0 z-[100] w-80 p-3 bg-popover border border-border rounded-lg shadow-lg text-[11px] leading-relaxed text-foreground">
              <div className="absolute -top-[6px] left-[60px] w-[10px] h-[10px] bg-popover border-l border-t border-border rotate-45" />
              <div className="font-semibold text-xs mb-1.5">高级设置说明</div>
              <div className="mb-1.5">
                <div className="font-semibold mb-0.5">📊 最大上下文块数</div>
                <div className="pl-2 text-muted-foreground">
                  每次检索返回的最大知识片段数量。数值越大，注入的上下文越丰富，但消耗的 Token
                  也越多
                </div>
                <div className="pl-2 text-muted-foreground">
                  推荐值：4~12，知识库内容较短时可适当增大
                </div>
              </div>
              <div className="mb-1.5">
                <div className="font-semibold mb-0.5">🔄 全局自动检索</div>
                <div className="pl-2 text-muted-foreground">
                  开启后，所有知识库在对话时都会自动检索注入。关闭则需在每个知识库中单独配置
                </div>
              </div>
            </div>
          )}
        </h3>
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-muted-foreground font-medium">
              {t("kb.settings.defaultMaxContextChunks")}
            </label>
            <div className="flex items-center gap-3.5">
              <input
                type="range"
                min={1}
                max={32}
                value={kbConfig.defaultMaxContextChunks}
                onChange={(e) =>
                  updateConfig({ defaultMaxContextChunks: parseInt(e.target.value) || 8 })
                }
                className="flex-1 h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-primary"
              />
              <span className="min-w-[32px] h-8 flex items-center justify-center bg-primary text-white rounded-lg text-sm font-bold shrink-0">
                {kbConfig.defaultMaxContextChunks}
              </span>
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              {t("kb.settings.chunksHint")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-foreground">
                  {t("kb.settings.globalAutoRetrieve")}
                </span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {t("kb.settings.autoRetrieveDesc")}
                </span>
              </span>
              <button
                type="button"
                className={`w-11 h-6 rounded-full border-none cursor-pointer relative transition-colors shrink-0 p-0 ${
                  kbConfig.globalAutoRetrieve ? "bg-primary" : "bg-border"
                }`}
                onClick={() => updateConfig({ globalAutoRetrieve: !kbConfig.globalAutoRetrieve })}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-card shadow-sm transition-transform ${
                    kbConfig.globalAutoRetrieve ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end pt-4 border-t border-border">
        <button
          className="px-7 py-2.5 bg-primary text-primary-foreground border-none rounded-xl text-sm font-semibold cursor-pointer transition-all hover:opacity-90 hover:-translate-y-px hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center gap-2"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          {t("kb.settings.saveBtn")}
        </button>
      </div>
    </div>
  );
}

export default KnowledgeSettingsSection;
