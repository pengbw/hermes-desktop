import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import styles from "./InstallGuide.module.css";

interface InstallProgress {
  line: string;
  done: boolean;
  success: boolean;
}

export default function InstallGuidePanel({ onInstalled }: { onInstalled: () => void }) {
  const [installing, setInstalling] = useState(false);
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
          setInstallError("Installation failed, please check logs or try another method");
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
    } catch {
      setInstallError(String(err));
      setInstalling(false);
    }
  };

  const handleRetry = () => {
    setInstalling(false);
    setLogs([]);
    setInstallSuccess(false);
    setInstallError(null);
  };

  return (
    <div className={styles.ig}>
      <div className={styles.igBg}>
        <div className={styles.igOrb + " " + styles.igOrb1} />
        <div className={styles.igOrb + " " + styles.igOrb2} />
        <div className={styles.igOrb + " " + styles.igOrb3} />
      </div>

      <div className={styles.igCard}>
        <div className={styles.igHeader}>
          <div className={styles.igLogoRing}>
            <img src="/bot.svg" alt="Hermes" className={styles.igLogo} />
          </div>
          <h1>Hermes Desktop</h1>
          <p className={styles.igDesc}>
            Install Hermes Agent core engine to enable AI conversation capabilities
          </p>
        </div>

        {!installing && !installSuccess && !installError && (
          <div className={styles.igMethods}>
            <button
              className={styles.igMethod + " " + styles.igMethodPrimary}
              onClick={() => handleInstall("curl")}
            >
              <div className={styles.igMethodIcon}>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className={styles.igMethodInfo}>
                <span className={styles.igMethodName}>One-Click Install</span>
                <span className={styles.igMethodDesc}>
                  {isWindows ? "Windows Native" : "Official Script · Recommended"}
                </span>
              </div>
              <svg
                className={styles.igMethodArrow}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            {/*
            {isWindows && (
              <div className={styles.igNotice}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <span>一键安装需要 WSL2，未安装请先在 PowerShell 运行 <code>wsl --install</code></span>
              </div>
            )}
            */}
          </div>
        )}

        {installing && (
          <div className={styles.igProgress}>
            <div className={styles.igProgressHead}>
              <div className={styles.igSpinner} />
              <span>Installing...</span>
            </div>
            <div className={styles.igTerminal}>
              {logs.map((log, i) => (
                <div key={i} className={styles.igTerminalLine}>
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {installSuccess && (
          <div className={styles.igResult + " " + styles.igResultSuccess}>
            <div className={styles.igResultCheck}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3>Installation Complete</h3>
            <p>Entering main interface...</p>
          </div>
        )}

        {installError && (
          <div className={styles.igResult + " " + styles.igResultError}>
            <div className={styles.igResultX}>
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
            <h3>Installation Failed</h3>
            <p>{installError}</p>
            <div className={styles.igTerminal + " " + styles.igTerminalError}>
              {logs.map((log, i) => (
                <div key={i} className={styles.igTerminalLine}>
                  {log}
                </div>
              ))}
            </div>
            <button className={styles.igRetry} onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
