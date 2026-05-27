import { useState, useEffect, useCallback } from "react";
import { TauriCommands } from "@services/tauri/TauriCommands";
import type { McpServerInfo } from "@core/tauri/types";

interface McpSettingsProps {
  t: (key: string) => string;
}

function McpServerModal({
  t,
  server,
  onClose,
  onSave,
}: {
  t: (key: string) => string;
  server: McpServerInfo | null;
  onClose: () => void;
  onSave: (originalName: string, data: McpServerInfo) => void;
}) {
  const isEdit = !!server;
  const [name, setName] = useState(server?.name || "");
  const [transport, setTransport] = useState<string>(server?.transport || "stdio");
  const [command, setCommand] = useState(server?.command || "");
  const [args, setArgs] = useState(server?.args?.join(" ") || "");
  const [url, setUrl] = useState(server?.url || "");
  const [auth, setAuth] = useState(server?.auth || "");
  const [envText, setEnvText] = useState(
    server?.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join("\n") : ""
  );
  const [headersText, setHeadersText] = useState(
    server?.headers ? Object.entries(server.headers).map(([k, v]) => `${k}=${v}`).join("\n") : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(`${t("mcp.name")} ${t("mcp.required")}`);
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      setError(`${t("mcp.command")} ${t("mcp.required")}`);
      return;
    }
    if ((transport === "http" || transport === "sse") && !url.trim()) {
      setError(`${t("mcp.url")} ${t("mcp.required")}`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const envObj: Record<string, string> = {};
      if (envText.trim()) {
        for (const line of envText.split("\n")) {
          const idx = line.indexOf("=");
          if (idx > 0) {
            envObj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          }
        }
      }

      const headersObj: Record<string, string> = {};
      if (headersText.trim()) {
        for (const line of headersText.split("\n")) {
          const idx = line.indexOf("=");
          if (idx > 0) {
            headersObj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          }
        }
      }

      const data: McpServerInfo = {
        name: name.trim(),
        transport: transport as "stdio" | "http" | "sse",
        command: transport === "stdio" ? command.trim() : undefined,
        args: transport === "stdio" && args.trim()
          ? args.trim().split(/\s+/)
          : undefined,
        url: (transport === "http" || transport === "sse") ? url.trim() : undefined,
        enabled: server?.enabled ?? true,
        auth: auth.trim() || undefined,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
        headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
      };

      onSave(isEdit ? server!.name : "", data);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card rounded-xl border border-border shadow-xl w-[480px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-10 px-3 border-b border-border">
          <h3 className="text-base font-semibold text-foreground m-0">
            {isEdit ? t("mcp.edit") : t("mcp.add")}
          </h3>
          <button
            className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div className="text-[12px] text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</div>
          )}

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">{t("mcp.name")}</label>
            <input
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("mcp.namePlaceholder")}
              disabled={isEdit}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">{t("mcp.transport")}</label>
            <select
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary"
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
            >
              <option value="stdio">stdio</option>
              <option value="http">HTTP / StreamableHTTP</option>
              <option value="sse">SSE</option>
            </select>
          </div>

          {transport === "stdio" && (
            <>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1 block">{t("mcp.command")}</label>
                <input
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder={t("mcp.commandPlaceholder")}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1 block">{t("mcp.args")}</label>
                <input
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder={t("mcp.argsPlaceholder")}
                />
              </div>
            </>
          )}

          {(transport === "http" || transport === "sse") && (
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">{t("mcp.url")}</label>
              <input
                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("mcp.urlPlaceholder")}
              />
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">{t("mcp.auth")}</label>
            <input
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary"
              value={auth}
              onChange={(e) => setAuth(e.target.value)}
              placeholder={t("mcp.authPlaceholder")}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">{t("mcp.env")}</label>
            <textarea
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary resize-y min-h-[60px]"
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder={t("mcp.envPlaceholder")}
              rows={3}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">{t("mcp.headers")}</label>
            <textarea
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary resize-y min-h-[60px]"
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder={t("mcp.headersPlaceholder")}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="px-4 py-2 bg-transparent border border-border rounded-lg text-[13px] cursor-pointer text-muted-foreground hover:bg-muted transition-colors"
              onClick={onClose}
            >
              {t("mcp.cancel")}
            </button>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground border-0 rounded-lg text-[13px] cursor-pointer hover:bg-primary/90 transition-colors disabled:opacity-50"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? t("mcp.saving") : t("mcp.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function McpSettings({ t }: McpSettingsProps) {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerInfo | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    try {
      const list = await TauriCommands.mcpListServers();
      setServers(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleAdd = () => {
    setEditingServer(null);
    setShowModal(true);
  };

  const handleEdit = (server: McpServerInfo) => {
    setEditingServer(server);
    setShowModal(true);
  };

  const handleSave = async (originalName: string, data: McpServerInfo) => {
    try {
      if (originalName) {
        await TauriCommands.mcpUpdateServer(originalName, data);
      } else {
        await TauriCommands.mcpAddServer(data);
      }
      setShowModal(false);
      setEditingServer(null);
      loadServers();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleRemove = async (name: string) => {
    if (!confirm(t("mcp.confirmRemove"))) return;
    try {
      await TauriCommands.mcpRemoveServer(name);
      loadServers();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleTest = async (name: string) => {
    setTesting(name);
    setTestResult(null);
    try {
      const result = await TauriCommands.mcpTestServer(name);
      setTestResult(result);
    } catch (e) {
      setTestResult(`Error: ${e}`);
    } finally {
      setTesting(null);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await TauriCommands.mcpEnableServer(name, enabled);
      loadServers();
    } catch (e) {
      alert(String(e));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        {t("mcp.loading")}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-foreground m-0">{t("mcp.title")}</h2>
        <button
          className="px-3 py-1.5 bg-primary text-primary-foreground border-0 rounded-lg text-[12px] cursor-pointer hover:bg-primary/90 transition-colors"
          onClick={handleAdd}
        >
          + {t("mcp.add")}
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {t("mcp.empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map((server) => (
            <div
              key={server.name}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{server.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {server.transport}
                  </span>
                  {!server.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600">
                      {t("mcp.disabled")}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {server.transport === "stdio"
                    ? `${server.command || ""} ${(server.args || []).join(" ")}`
                    : server.url || ""}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  className={`px-2 py-1 border-0 rounded text-[11px] cursor-pointer transition-colors ${
                    server.enabled
                      ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => handleToggle(server.name, !server.enabled)}
                  title={server.enabled ? t("mcp.disable") : t("mcp.enable")}
                >
                  {server.enabled ? t("mcp.enabled") : t("mcp.disabled")}
                </button>
                <button
                  className="px-2 py-1 bg-blue-500/10 text-blue-600 border-0 rounded text-[11px] cursor-pointer hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  onClick={() => handleTest(server.name)}
                  disabled={testing === server.name}
                >
                  {testing === server.name ? "..." : t("mcp.test")}
                </button>
                <button
                  className="px-2 py-1 bg-muted text-muted-foreground border-0 rounded text-[11px] cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => handleEdit(server)}
                >
                  {t("mcp.edit")}
                </button>
                <button
                  className="px-2 py-1 bg-red-500/10 text-red-500 border-0 rounded text-[11px] cursor-pointer hover:bg-red-500/20 transition-colors"
                  onClick={() => handleRemove(server.name)}
                >
                  {t("mcp.remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {testResult && (
        <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-muted-foreground">{t("mcp.testResult")}</span>
            <button
              className="bg-transparent border-0 text-muted-foreground text-[11px] cursor-pointer hover:text-foreground"
              onClick={() => setTestResult(null)}
            >
              ✕
            </button>
          </div>
          <pre className="text-[11px] text-foreground whitespace-pre-wrap break-all m-0 max-h-[200px] overflow-y-auto">
            {testResult}
          </pre>
        </div>
      )}

      {showModal && (
        <McpServerModal
          t={t}
          server={editingServer}
          onClose={() => { setShowModal(false); setEditingServer(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
