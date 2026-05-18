import { useState } from "react";
import type { ChannelMeta, ChannelConfigField } from "@constants/channels";
import { TauriCommands } from "@services/tauri/TauriCommands";
import channelStyles from "./ChannelSettings.module.css";

interface ChannelConfigModalProps {
  channel: ChannelMeta;
  onClose: () => void;
  onConnected: () => void;
  t: (key: string) => string;
}

export default function ChannelConfigModal({
  channel,
  onClose,
  onConnected,
  t,
}: ChannelConfigModalProps) {
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    channel.configFields.forEach((f) => {
      initial[f.key] = "";
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string>("");
  const [testResult, setTestResult] = useState<string>("");

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setError("");
    setTestResult("");
  };

  const validate = (): boolean => {
    for (const field of channel.configFields) {
      if (field.required && !formData[field.key]?.trim()) {
        setError(`${field.label} ${t("channel.isRequired")}`);
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setError("");
    try {
      const config: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value.trim()) {
          config[key] = value.trim();
        }
      }
      await TauriCommands.channelSetupToken(channel.id, config);
      onConnected();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!validate()) return;
    setTesting(true);
    setError("");
    setTestResult("");
    try {
      const config: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value.trim()) {
          config[key] = value.trim();
        }
      }
      await TauriCommands.channelSetupToken(channel.id, config);
      await new Promise((r) => setTimeout(r, 3000));
      const status = await TauriCommands.channelCheckStatus(channel.id);
      if (status.status === "connected") {
        setTestResult(t("channel.testSuccess"));
      } else if (status.status === "connecting") {
        setTestResult(t("channel.testSuccess"));
      } else {
        setTestResult(t("channel.testFailed") + ": " + (status.errorMessage || status.status));
      }
    } catch (e) {
      setTestResult(t("channel.testFailed") + ": " + String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={channelStyles.modalOverlay} onClick={onClose}>
      <div className={channelStyles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={channelStyles.modalHeader}>
          <h3>
            {t("channel.configureConnect")} - {channel.name}
          </h3>
          <button className={channelStyles.modalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={channelStyles.modalBody}>
          {channel.setupGuide && (
            <div className={channelStyles.setupGuide}>
              {channel.setupGuide.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

          <div className={channelStyles.configForm}>
            {channel.configFields.map((field: ChannelConfigField) => (
              <div key={field.key} className={channelStyles.formField}>
                <label className={channelStyles.formLabel}>
                  {field.label}
                  {field.required && <span className={channelStyles.requiredMark}>*</span>}
                </label>
                <input
                  type={field.type === "password" ? "password" : "text"}
                  className={channelStyles.formInput}
                  placeholder={field.placeholder}
                  value={formData[field.key] || ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                />
                {field.helpText && <div className={channelStyles.formHelp}>{field.helpText}</div>}
              </div>
            ))}
          </div>

          {error && <div className={channelStyles.formError}>{error}</div>}
          {testResult && (
            <div
              className={`${channelStyles.formMessage} ${testResult.includes(t("channel.testSuccess")) ? channelStyles.formSuccess : channelStyles.formError}`}
            >
              {testResult}
            </div>
          )}
        </div>

        <div className={channelStyles.modalFooter}>
          <button className={channelStyles.btnSecondary} onClick={handleTest} disabled={testing}>
            {testing ? t("channel.testing") : t("channel.testConnection")}
          </button>
          <button className={channelStyles.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? t("channel.saving") : t("channel.save")}
          </button>
          <button className={channelStyles.btnSecondary} onClick={onClose}>
            {t("channel.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
