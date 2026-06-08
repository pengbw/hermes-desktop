import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@contexts/ToastContext";
import ProviderIcon from "./ProviderIcon";

interface Provider {
  id: string;
  name: string;
  value: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
  icon: string;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface ProviderModalProps {
  visible: boolean;
  editingProvider: Provider | null;
  providers: Provider[];
  onClose: () => void;
  onSave: () => void;
  onEdit: (p: Provider) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export default function ProviderModal({
  visible,
  editingProvider,
  providers,
  onClose,
  onSave,
  onEdit,
  onAdd,
  onDelete,
  t,
}: ProviderModalProps) {
  const toast = useToast();
  const [providerForm, setProviderForm] = useState({
    name: "",
    value: "",
    baseUrl: "",
    apiKeyEnv: "",
    apiKey: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiKeyEnvHelp, setShowApiKeyEnvHelp] = useState(false);
  const [apiKeyVerifyResult, setApiKeyVerifyResult] = useState<
    "idle" | "verifying" | "ok" | "fail"
  >("idle");
  const [apiKeyVerifyError, setApiKeyVerifyError] = useState("");
  const [apiKeyVerifyCount, setApiKeyVerifyCount] = useState(0);

  const handleSaveProvider = async () => {
    try {
      if (editingProvider && editingProvider.id) {
        await invoke("update_provider", {
          req: {
            id: editingProvider.id,
            name: providerForm.name,
            baseUrl: providerForm.baseUrl,
            apiKeyEnv: providerForm.apiKeyEnv,
            apiKey: providerForm.apiKey,
          },
        });
      } else {
        await invoke("create_provider", {
          req: {
            name: providerForm.name,
            value: providerForm.value,
            baseUrl: providerForm.baseUrl,
            apiKeyEnv: providerForm.apiKeyEnv,
            apiKey: providerForm.apiKey,
          },
        });
      }
      onSave();
    } catch (e) {
      toast.error("保存供应商失败: " + String(e));
    }
  };

  const openEditProvider = (p: Provider) => {
    setProviderForm({
      name: p.name,
      value: p.value,
      baseUrl: p.baseUrl,
      apiKeyEnv: p.apiKeyEnv,
      apiKey: p.apiKey,
    });
    setShowApiKey(false);
    onEdit(p);
  };

  useEffect(() => {
    if (editingProvider && editingProvider.id) {
      setProviderForm({
        name: editingProvider.name,
        value: editingProvider.value,
        baseUrl: editingProvider.baseUrl,
        apiKeyEnv: editingProvider.apiKeyEnv,
        apiKey: editingProvider.apiKey,
      });
      setShowApiKey(false);
      setApiKeyVerifyResult("idle");
      setApiKeyVerifyError("");
    }
  }, [editingProvider]);

  const openNewProvider = () => {
    setProviderForm({ name: "", value: "", baseUrl: "", apiKeyEnv: "", apiKey: "" });
    setShowApiKey(false);
    onAdd();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl w-[90%] max-w-[560px] max-h-[85vh] overflow-y-auto shadow-xl animate-[fadeIn_0.2s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-10 px-3 border-b border-border">
          <h3 className="text-base font-semibold text-foreground m-0">
            {editingProvider && editingProvider.id
              ? t("provider.editTitle", { name: editingProvider.name })
              : editingProvider
                ? t("provider.addTitle")
                : t("provider.manageTitle")}
          </h3>
          <button
            className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {editingProvider ? (
          <div className="p-5 flex flex-col gap-5">
            <div className="bg-muted/40 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <span>📋</span>
                {t("provider.basicInfo")}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    {t("provider.nameLabel")}
                  </label>
                  <input
                    type="text"
                    value={providerForm.name}
                    onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                    placeholder={t("provider.namePlaceholder")}
                    readOnly={editingProvider.isBuiltin}
                    className={`w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground transition-colors focus:outline-none focus:border-primary ${editingProvider.isBuiltin ? "opacity-60 cursor-not-allowed bg-muted" : ""}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    {editingProvider.isBuiltin
                      ? t("provider.identifierBuiltin")
                      : t("provider.identifierLabel")}
                  </label>
                  <input
                    type="text"
                    value={editingProvider.isBuiltin ? editingProvider.value : providerForm.value}
                    onChange={(e) => setProviderForm({ ...providerForm, value: e.target.value })}
                    placeholder={t("provider.identifierPlaceholder")}
                    readOnly={editingProvider.isBuiltin}
                    className={`w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground transition-colors focus:outline-none focus:border-primary ${editingProvider.isBuiltin ? "opacity-60 cursor-not-allowed bg-muted" : ""}`}
                  />
                </div>
              </div>
            </div>

            <div className="bg-muted/40 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <span>🌐</span>
                {t("provider.apiConfig")}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    {t("provider.baseUrlLabel")}
                  </label>
                  <input
                    type="text"
                    value={providerForm.baseUrl}
                    onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                    placeholder={t("provider.baseUrlPlaceholder")}
                    readOnly={editingProvider.isBuiltin}
                    className={`w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground transition-colors focus:outline-none focus:border-primary ${editingProvider.isBuiltin ? "opacity-60 cursor-not-allowed bg-muted" : ""}`}
                  />
                </div>
                <div className="flex flex-col gap-1 relative">
                  <label className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                    {t("provider.apiKeyEnvLabel")}
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 text-[11px] font-bold rounded-full bg-muted-foreground text-white cursor-pointer hover:bg-primary transition-colors leading-none"
                      onClick={() => setShowApiKeyEnvHelp(!showApiKeyEnvHelp)}
                    >
                      ?
                    </span>
                    {showApiKeyEnvHelp && (
                      <div className="absolute top-7 left-0 z-[100] w-80 p-3 bg-popover border border-border rounded-lg shadow-lg text-[11px] leading-relaxed text-foreground">
                        <div className="absolute -top-[6px] left-[60px] w-[10px] h-[10px] bg-popover border-l border-t border-border rotate-45" />
                        <div className="font-semibold text-xs mb-1.5">API Key 环境变量名说明</div>
                        <div className="mb-2">
                          <div className="font-medium text-[11px] mb-1">什么是环境变量名？</div>
                          <div className="text-muted-foreground mb-1">
                            API Key 环境变量名是存储在系统环境变量中的变量名，Hermes
                            会从环境变量中读取对应的 API Key
                          </div>
                          <div className="text-muted-foreground">
                            如果直接填写了 API Key，环境变量名可留空
                          </div>
                        </div>
                        <div className="mb-2">
                          <div className="font-medium text-[11px] mb-1">常用厂商环境变量名</div>
                          <div className="text-muted-foreground">
                            <b>OpenAI</b> — OPENAI_API_KEY
                          </div>
                          <div className="text-muted-foreground">
                            <b>Anthropic</b> — ANTHROPIC_API_KEY
                          </div>
                          <div className="text-muted-foreground">
                            <b>Google Gemini</b> — GOOGLE_API_KEY
                          </div>
                          <div className="text-muted-foreground">
                            <b>xAI</b> — XAI_API_KEY
                          </div>
                          <div className="text-muted-foreground">
                            <b>Mistral</b> — MISTRAL_API_KEY
                          </div>
                          <div className="text-muted-foreground">
                            <b>DeepSeek</b> — DEEPSEEK_API_KEY
                          </div>
                          <div className="text-muted-foreground">
                            <b>硅基流动</b> — SILICONFLOW_API_KEY
                          </div>
                          <div className="text-muted-foreground">
                            <b>智谱 AI</b> — ZHIPU_API_KEY
                          </div>
                        </div>
                        <div className="text-muted-foreground">
                          💡 建议使用环境变量管理 API Key，避免密钥泄露
                        </div>
                      </div>
                    )}
                  </label>
                  <input
                    type="text"
                    value={providerForm.apiKeyEnv}
                    onChange={(e) =>
                      setProviderForm({ ...providerForm, apiKeyEnv: e.target.value })
                    }
                    placeholder={t("provider.apiKeyEnvPlaceholder")}
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground transition-colors focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    {t("provider.apiKeyLabel")}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={providerForm.apiKey}
                      onChange={(e) => {
                        setProviderForm({ ...providerForm, apiKey: e.target.value });
                        setApiKeyVerifyResult("idle");
                      }}
                      placeholder={t("provider.apiKeyPlaceholder")}
                      className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm bg-background text-foreground transition-colors focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-base p-1 rounded hover:bg-muted transition-colors"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? "🙈" : "👁"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {!providerForm.apiKey && providerForm.baseUrl ? (
                      <span className="text-xs text-orange-500">
                        ⚠️ {t("provider.apiKeyRequired")}
                      </span>
                    ) : !providerForm.baseUrl && providerForm.apiKey ? (
                      <span className="text-xs text-orange-500">
                        ⚠️ {t("provider.baseUrlRequired")}
                      </span>
                    ) : !providerForm.baseUrl && !providerForm.apiKey ? (
                      <span className="text-xs text-orange-500">
                        ⚠️ {t("provider.bothRequired")}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-all border ${
                        apiKeyVerifyResult === "ok"
                          ? "bg-green-500/10 text-green-500 border-green-500/30"
                          : apiKeyVerifyResult === "fail"
                            ? "bg-red-500/10 text-red-500 border-red-500/30"
                            : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                      }`}
                      onClick={async () => {
                        if (!providerForm.baseUrl || !providerForm.apiKey) return;
                        setApiKeyVerifyResult("verifying");
                        setApiKeyVerifyError("");
                        try {
                          const result = await invoke<string>("verify_provider_api_key", {
                            baseUrl: providerForm.baseUrl,
                            apiKey: providerForm.apiKey,
                          });
                          if (result.startsWith("ok")) {
                            const count = parseInt(result.split(":")[1] || "0", 10);
                            setApiKeyVerifyCount(count);
                            setApiKeyVerifyResult("ok");
                          } else {
                            setApiKeyVerifyResult("ok");
                            setApiKeyVerifyCount(0);
                          }
                          setTimeout(() => {
                            setApiKeyVerifyResult("idle");
                            setApiKeyVerifyCount(0);
                          }, 8000);
                        } catch (e) {
                          setApiKeyVerifyResult("fail");
                          setApiKeyVerifyError(String(e));
                          setTimeout(() => {
                            setApiKeyVerifyResult("idle");
                            setApiKeyVerifyError("");
                          }, 8000);
                        }
                      }}
                      disabled={
                        apiKeyVerifyResult === "verifying" ||
                        !providerForm.baseUrl ||
                        !providerForm.apiKey
                      }
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      {apiKeyVerifyResult === "verifying"
                        ? t("provider.verifying")
                        : apiKeyVerifyResult === "ok"
                          ? t("provider.verifyOk")
                          : apiKeyVerifyResult === "fail"
                            ? t("provider.verifyFail")
                            : t("provider.verifyBtn")}
                    </button>
                    {apiKeyVerifyResult === "ok" && apiKeyVerifyCount > 0 && (
                      <span className="text-xs text-green-500">
                        ✓ {t("provider.verifyOkCount", { count: apiKeyVerifyCount })}
                      </span>
                    )}
                    {apiKeyVerifyResult === "ok" && apiKeyVerifyCount === 0 && (
                      <span className="text-xs text-green-500">✓ {t("provider.verifyOk")}</span>
                    )}
                    {apiKeyVerifyResult === "fail" && (
                      <span className="text-xs text-red-500">✗ {apiKeyVerifyError}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 border border-border rounded-lg text-sm font-medium cursor-pointer bg-transparent text-foreground transition-colors hover:bg-muted"
                onClick={onClose}
              >
                {t("provider.cancel")}
              </button>
              <button
                className="px-4 py-2 border-none rounded-lg text-sm font-medium cursor-pointer bg-primary text-primary-foreground transition-opacity hover:opacity-90"
                onClick={handleSaveProvider}
              >
                {t("provider.save")}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-2">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-3 bg-muted/50 border border-border rounded-xl transition-all hover:bg-card hover:border-primary/30"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center text-xl shrink-0">
                    <ProviderIcon providerName={p.name} icon={p.icon} size={40} />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{p.name}</span>
                      {p.isBuiltin && (
                        <span className="text-[10px] font-medium px-1.5 py-px rounded-md bg-muted text-muted-foreground">
                          {t("provider.builtin")}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-medium px-1.5 py-px rounded-md ${
                          p.apiKey
                            ? "bg-green-500/10 text-green-500"
                            : "bg-orange-500/10 text-orange-500"
                        }`}
                      >
                        {p.apiKey ? "🔑" : "⚠️"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{p.value}</div>
                    {p.baseUrl && (
                      <div className="text-[11px] text-muted-foreground truncate">{p.baseUrl}</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => openEditProvider(p)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {!p.isBuiltin && (
                    <button
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30"
                      onClick={() => onDelete(p.id)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              className="flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-border rounded-xl bg-transparent text-muted-foreground cursor-pointer text-sm transition-all hover:border-primary hover:text-primary hover:bg-primary/5"
              onClick={openNewProvider}
            >
              <span className="text-base">+</span> {t("provider.add")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
