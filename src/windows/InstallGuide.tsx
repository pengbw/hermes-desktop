import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import styles from "./InstallGuide.module.css";

interface InstallProgress {
  line: string;
  done: boolean;
  success: boolean;
  progress?: number;
  step?: string;
}

const STEP_LABELS: Record<string, string> = {
  detect: "Detecting environment",
  extract: "Extracting source code",
  python: "Configuring Python",
  uv: "Installing package manager",
  venv: "Creating virtual environment",
  pip: "Installing dependencies",
  deps: "Installing gateway dependencies",
  verify: "Verifying installation",
  config: "Configuring gateway",
  done: "Complete",
};

export default function InstallGuidePanel({ onInstalled }: { onInstalled: () => void }) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [currentLine, setCurrentLine] = useState("");
  const [installSuccess, setInstallSuccess] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    const platform = navigator.platform || navigator.userAgent;
    setIsWindows(platform.includes("Win"));

    const unlisten = listen<InstallProgress>("install-progress", (event) => {
      const payload = event.payload;

      if (payload.progress != null) {
        setProgress(payload.progress);
      }
      if (payload.step) {
        setCurrentStep(payload.step);
      }
      setCurrentLine(payload.line);

      if (payload.done) {
        setInstalling(false);
        if (payload.success) {
          setProgress(100);
          setInstallSuccess(true);
        } else {
          setInstallError(payload.line || "Installation failed, please try again");
        }
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleInstall = async (selectedMethod: string) => {
    setInstalling(true);
    setProgress(0);
    setCurrentStep("");
    setCurrentLine("");
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
    setProgress(0);
    setCurrentStep("");
    setCurrentLine("");
    setInstallSuccess(false);
    setInstallError(null);
  };

  const stepLabel = currentStep ? STEP_LABELS[currentStep] || currentStep : "";

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
          </div>
        )}

        {installing && (
          <div className={styles.igProgress}>
            <div className={styles.igProgressHead}>
              <div className={styles.igSpinner} />
              <span>Installing...</span>
            </div>
            <div className={styles.igProgressBarWrap}>
              <div className={styles.igProgressBarFill} style={{ width: `${progress}%` }} />
            </div>
            <div className={styles.igProgressInfo}>
              <span className={styles.igProgressPercent}>{progress}%</span>
              {stepLabel && <span className={styles.igProgressStep}>{stepLabel}</span>}
            </div>
            {currentLine && <div className={styles.igProgressLine}>{currentLine}</div>}
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
            <button className={styles.igRetry} onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
