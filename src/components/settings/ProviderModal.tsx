import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import styles from "@pages/settings/SettingsPanel.module.css";

interface Provider {
  id: string;
  name: string;
  value: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
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
    } catch {
      alert("保存供应商失败: " + String(e));
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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalContent} ${styles.providerModal}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h3>
            {editingProvider && editingProvider.id
              ? t("provider.editTitle", { name: editingProvider.name })
              : editingProvider
                ? t("provider.addTitle")
                : t("provider.manageTitle")}
          </h3>
          <button className={styles.modalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        {editingProvider ? (
          <div className={styles.providerEditForm}>
            <div className={styles.providerEditSection}>
              <div className={styles.providerEditSectionTitle}>
                <span className={styles.providerEditSectionIcon}>📋</span>
                {t("provider.basicInfo")}
              </div>
              <div className={styles.providerEditFields}>
                <div className={styles.formGroup}>
                  <label>{t("provider.nameLabel")}</label>
                  <input
                    type="text"
                    value={providerForm.name}
                    onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                    placeholder={t("provider.namePlaceholder")}
                    readOnly={editingProvider.isBuiltin}
                    className={editingProvider.isBuiltin ? styles.readonlyInput : ""}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>
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
                    className={editingProvider.isBuiltin ? styles.readonlyInput : ""}
                  />
                </div>
              </div>
            </div>

            <div className={styles.providerEditSection}>
              <div className={styles.providerEditSectionTitle}>
                <span className={styles.providerEditSectionIcon}>🌐</span>
                {t("provider.apiConfig")}
              </div>
              <div className={styles.providerEditFields}>
                <div className={styles.formGroup}>
                  <label>{t("provider.baseUrlLabel")}</label>
                  <input
                    type="text"
                    value={providerForm.baseUrl}
                    onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                    placeholder={t("provider.baseUrlPlaceholder")}
                    readOnly={editingProvider.isBuiltin}
                    className={editingProvider.isBuiltin ? styles.readonlyInput : ""}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.providerLabelWithHelp}>
                    {t("provider.apiKeyEnvLabel")}
                    <span
                      className={styles.kbHelpIcon}
                      onClick={() => setShowApiKeyEnvHelp(!showApiKeyEnvHelp)}
                    >
                      ?
                    </span>
                    {showApiKeyEnvHelp && (
                      <div
                        className={styles.kbHelpPopup}
                        style={{ left: 0, top: "calc(100% + 4px)" }}
                      >
                        <div className={styles.kbHelpPopupTitle}>API Key 环境变量名说明</div>
                        <div className={styles.kbHelpPopupSection}>
                          <div className={styles.kbHelpPopupSubtitle}>什么是环境变量名？</div>
                          <div className={styles.kbHelpPopupItem}>
                            API Key 环境变量名是存储在系统环境变量中的变量名，Hermes
                            会从环境变量中读取对应的 API Key
                          </div>
                          <div className={styles.kbHelpPopupItem}>
                            如果直接填写了 API Key，环境变量名可留空
                          </div>
                        </div>
                        <div className={styles.kbHelpPopupSection}>
                          <div className={styles.kbHelpPopupSubtitle}>常用厂商环境变量名</div>
                          <div className={styles.kbHelpPopupItem}>
                            <b>OpenAI</b> — OPENAI_API_KEY
                          </div>
                          <div className={styles.kbHelpPopupItem}>
                            <b>Anthropic</b> — ANTHROPIC_API_KEY
                          </div>
                          <div className={styles.kbHelpPopupItem}>
                            <b>Google Gemini</b> — GOOGLE_API_KEY
                          </div>
                          <div className={styles.kbHelpPopupItem}>
                            <b>xAI</b> — XAI_API_KEY
                          </div>
                          <div className={styles.kbHelpPopupItem}>
                            <b>Mistral</b> — MISTRAL_API_KEY
                          </div>
                          <div className={styles.kbHelpPopupItem}>
                            <b>DeepSeek</b> — DEEPSEEK_API_KEY
                          </div>
                          <div className={styles.kbHelpPopupItem}>
                            <b>硅基流动</b> — SILICONFLOW_API_KEY
                          </div>
                          <div className={styles.kbHelpPopupItem}>
                            <b>智谱 AI</b> — ZHIPU_API_KEY
                          </div>
                        </div>
                        <div className={styles.kbHelpPopupNote}>
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
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t("provider.apiKeyLabel")}</label>
                  <div className={styles.apiKeyInputWrap}>
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={providerForm.apiKey}
                      onChange={(e) => {
                        setProviderForm({ ...providerForm, apiKey: e.target.value });
                        setApiKeyVerifyResult("idle");
                      }}
                      placeholder={t("provider.apiKeyPlaceholder")}
                    />
                    <button
                      type="button"
                      className={styles.apiKeyInnerToggle}
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? "🙈" : "👁"}
                    </button>
                  </div>
                  <div className={styles.apiKeyVerifyRow}>
                    {!providerForm.apiKey && providerForm.baseUrl ? (
                      <span className={styles.apiKeyVerifyError}>
                        ⚠️ {t("provider.apiKeyRequired")}
                      </span>
                    ) : !providerForm.baseUrl && providerForm.apiKey ? (
                      <span className={styles.apiKeyVerifyError}>
                        ⚠️ {t("provider.baseUrlRequired")}
                      </span>
                    ) : !providerForm.baseUrl && !providerForm.apiKey ? (
                      <span className={styles.apiKeyVerifyError}>
                        ⚠️ {t("provider.bothRequired")}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={`${styles.apiKeyVerifyTextBtn} ${apiKeyVerifyResult === "ok" ? styles.apiKeyVerifyOk : apiKeyVerifyResult === "fail" ? styles.apiKeyVerifyFail : ""}`}
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
                        } catch {
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
                      <span className={styles.apiKeyVerifyInfo}>
                        ✓ {t("provider.verifyOkCount", { count: apiKeyVerifyCount })}
                      </span>
                    )}
                    {apiKeyVerifyResult === "ok" && apiKeyVerifyCount === 0 && (
                      <span className={styles.apiKeyVerifyInfo}>✓ {t("provider.verifyOk")}</span>
                    )}
                    {apiKeyVerifyResult === "fail" && (
                      <span className={styles.apiKeyVerifyError}>✗ {apiKeyVerifyError}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.providerEditActions}>
              <button className={styles.providerEditCancel} onClick={onClose}>
                {t("provider.cancel")}
              </button>
              <button className={styles.providerEditSave} onClick={handleSaveProvider}>
                {t("provider.save")}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.providerModalList}>
            {providers.map((p) => (
              <div key={p.id} className={styles.providerModalItem}>
                <div className={styles.providerModalItemLeft}>
                  <div className={styles.providerModalItemIcon}>
                    {p.name === "OpenAI"
                      ? "🤖"
                      : p.name === "Anthropic"
                        ? "🧠"
                        : p.name === "Google"
                          ? "🔍"
                          : p.name === "xAI"
                            ? "🚀"
                            : p.name === "Mistral"
                              ? "🌀"
                              : p.name === "DeepSeek"
                                ? "🔮"
                                : "🔌"}
                  </div>
                  <div className={styles.providerModalItemInfo}>
                    <div className={styles.providerModalItemName}>
                      {p.name}
                      {p.isBuiltin && (
                        <span
                          className={`${styles.providerGridCornerTag} ${styles.providerGridTagBuiltin}`}
                        >
                          {t("provider.builtin")}
                        </span>
                      )}
                      <span
                        className={`${styles.providerGridCornerTag} ${p.apiKey ? styles.providerGridTagKeyOk : styles.providerGridTagKeyMissing}`}
                      >
                        {p.apiKey ? "🔑" : "⚠️"}
                      </span>
                    </div>
                    <div className={styles.providerModalItemValue}>{p.value}</div>
                    {p.baseUrl && <div className={styles.providerModalItemUrl}>{p.baseUrl}</div>}
                  </div>
                </div>
                <div className={styles.providerModalItemActions}>
                  <button
                    className={`${styles.providerGridBtn} provider-grid-btn-edit`}
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
                      className={`${styles.providerGridBtn} ${styles.providerGridBtnDelete}`}
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
            <button className={styles.providerModalAddBtn} onClick={openNewProvider}>
              <span>+</span> {t("provider.add")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
