import { useState } from "react";
import type { ChannelMeta, ChannelConfigField } from "@constants/channels";
import { TauriCommands } from "@services/tauri/TauriCommands";

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-[90%] max-w-[520px] max-h-[85vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground m-0">
            {t("channel.configureConnect")} - {channel.name}
          </h3>
          <button className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-5">
          {channel.setupGuide && (
            <div className="bg-muted rounded-lg px-4 py-3 mb-4 text-xs text-muted-foreground leading-relaxed">
              {channel.setupGuide.split("\n").map((line, i) => (
                <p key={i} className="m-0">{line}</p>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {channel.configFields.map((field: ChannelConfigField) => (
              <div key={field.key} className="flex flex-col gap-1">
                <label className="text-[13px] text-muted-foreground font-medium">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  type={field.type === "password" ? "password" : "text"}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors h-10"
                  placeholder={field.placeholder}
                  value={formData[field.key] || ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                />
                {field.helpText && <div className="text-xs text-muted-foreground">{field.helpText}</div>}
              </div>
            ))}
          </div>

          {error && <div className="mt-3 px-3 py-2 bg-red-500/10 text-red-500 rounded-md text-sm">{error}</div>}
          {testResult && (
            <div
              className={`mt-3 px-3 py-2 rounded-md text-sm ${
                testResult.includes(t("channel.testSuccess"))
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              }`}
            >
              {testResult}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            className="px-3.5 py-1.5 border border-border rounded-md text-xs font-medium cursor-pointer bg-transparent text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? t("channel.testing") : t("channel.testConnection")}
          </button>
          <button
            className="px-3.5 py-1.5 border-none rounded-md text-xs font-medium cursor-pointer bg-primary text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t("channel.saving") : t("channel.save")}
          </button>
          <button
            className="px-3.5 py-1.5 border border-border rounded-md text-xs font-medium cursor-pointer bg-transparent text-foreground transition-colors hover:bg-muted"
            onClick={onClose}
          >
            {t("channel.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
