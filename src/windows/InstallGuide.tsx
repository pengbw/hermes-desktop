import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./InstallGuide.css";

interface InstallProgress {
  line: string;
  done: boolean;
  success: boolean;
}

export default function InstallGuidePanel({ onInstalled }: { onInstalled: () => void }) {
  const [installing, setInstalling] = useState(false);
  const [method, setMethod] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    const platform = navigator.platform || navigator.userAgent;
    setIsWindows(platform.includes("Win"));

    const unlisten = listen<InstallProgress>("install-progress", (event) => {
      const payload = event.payload;
      setLogs((prev) => [...prev, payload.line]);

      if (payload.done) {
        setInstalling(false);
        if (payload.success) {
          setInstallSuccess(true);
        } else {
          setInstallError("安装失败，请查看日志或尝试其他方式");
        }
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleInstall = async (selectedMethod: string) => {
    setInstalling(true);
    setMethod(selectedMethod);
    setLogs([]);
    setInstallSuccess(false);
    setInstallError(null);

    try {
      const success = await invoke<boolean>("install_hermes_agent", { method: selectedMethod });
      if (success) {
        setInstallSuccess(true);
        await invoke<string>("start_hermes_agent");
        setTimeout(() => {
          onInstalled();
        }, 1500);
      }
    } catch (err) {
      setInstallError(String(err));
      setInstalling(false);
    }
  };

  const handleRetry = () => {
    setInstalling(false);
    setMethod(null);
    setLogs([]);
    setInstallSuccess(false);
    setInstallError(null);
  };

  return (
    <div className="ig">
      <div className="ig-bg">
        <div className="ig-orb ig-orb-1" />
        <div className="ig-orb ig-orb-2" />
        <div className="ig-orb ig-orb-3" />
      </div>

      <div className="ig-card">
        <div className="ig-header">
          <div className="ig-logo-ring">
            <img src="/bot.svg" alt="Hermes" className="ig-logo" />
          </div>
          <h1>Hermes Desktop</h1>
          <p className="ig-desc">
            安装 Hermes Agent 核心引擎以启用 AI 对话能力
          </p>
        </div>

        {!installing && !installSuccess && !installError && (
          <div className="ig-methods">
            <button className="ig-method ig-method--primary" onClick={() => handleInstall("curl")}>
              <div className="ig-method-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="ig-method-info">
                <span className="ig-method-name">一键安装</span>
                <span className="ig-method-desc">
                  {isWindows ? "WSL2 · 官方脚本" : "官方脚本 · 推荐"}
                </span>
              </div>
              <svg className="ig-method-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            <button className="ig-method ig-method--secondary" onClick={() => handleInstall("pip")}>
              <div className="ig-method-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 7V5a4 4 0 00-8 0v2" />
                </svg>
              </div>
              <div className="ig-method-info">
                <span className="ig-method-name">pip 安装</span>
                <span className="ig-method-desc">全平台 · 需要 Python</span>
              </div>
              <svg className="ig-method-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            {isWindows && (
              <div className="ig-notice">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <span>一键安装需要 WSL2，未安装请先在 PowerShell 运行 <code>wsl --install</code></span>
              </div>
            )}

            <details className="ig-manual">
              <summary>手动安装</summary>
              <div className="ig-commands">
                <div className="ig-cmd">
                  <label>macOS / Linux</label>
                  <code>curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash</code>
                </div>
                <div className="ig-cmd">
                  <label>Windows (WSL2)</label>
                  <code>wsl bash -c 'curl -fsSL .../install.sh | bash'</code>
                </div>
                <div className="ig-cmd">
                  <label>pip</label>
                  <code>pip install hermes-agent</code>
                </div>
              </div>
            </details>
          </div>
        )}

        {installing && (
          <div className="ig-progress">
            <div className="ig-progress-head">
              <div className="ig-spinner" />
              <span>正在安装{method === "curl" ? "（官方脚本）" : "（pip）"}…</span>
            </div>
            <div className="ig-terminal">
              {logs.map((log, i) => (
                <div key={i} className="ig-terminal-line">{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {installSuccess && (
          <div className="ig-result ig-result--success">
            <div className="ig-result-check">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3>安装完成</h3>
            <p>正在进入主界面…</p>
          </div>
        )}

        {installError && (
          <div className="ig-result ig-result--error">
            <div className="ig-result-x">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
            <h3>安装失败</h3>
            <p>{installError}</p>
            <div className="ig-terminal ig-terminal--error">
              {logs.map((log, i) => (
                <div key={i} className="ig-terminal-line">{log}</div>
              ))}
            </div>
            <button className="ig-retry" onClick={handleRetry}>重新尝试</button>
          </div>
        )}
      </div>
    </div>
  );
}
