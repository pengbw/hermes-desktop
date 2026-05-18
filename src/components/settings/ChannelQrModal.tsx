import { useState, useEffect, useRef, useCallback } from "react";
import type { ChannelMeta } from "@constants/channels";
import { TauriCommands } from "@services/tauri/TauriCommands";
import channelStyles from "./ChannelSettings.module.css";

interface ChannelQrModalProps {
  channel: ChannelMeta;
  onClose: () => void;
  onConnected: () => void;
  t: (key: string) => string;
}

export default function ChannelQrModal({ channel, onClose, onConnected, t }: ChannelQrModalProps) {
  const [qrData, setQrData] = useState<string>("");
  const [qrType, setQrType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [countdown, setCountdown] = useState(480);
  const [scanning, setScanning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const generateQr = useCallback(async () => {
    setLoading(true);
    setError("");
    setScanning(false);
    try {
      const result = await TauriCommands.channelSetupQr(channel.id);
      if (!mountedRef.current) return;
      setQrData(result.qrData);
      setQrType(result.qrType);
      setCountdown(result.expiresIn || 480);
      setScanning(true);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [channel.id]);

  useEffect(() => {
    mountedRef.current = true;
    generateQr();
    return () => {
      mountedRef.current = false;
    };
  }, [generateQr]);

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setScanning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current || !scanning) return;
      try {
        const status = await TauriCommands.channelCheckStatus(channel.id);
        if (!mountedRef.current) return;
        if (status.status === "connected") {
          if (pollRef.current) clearInterval(pollRef.current);
          try {
            await TauriCommands.channelConfirmQr(channel.id);
          } catch {
            // console.error("[ChannelQrModal] channelConfirmQr failed:", e);
          }
          onConnected();
          onClose();
        } else if (status.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setScanning(false);
          setError(status.errorMessage || "Connection failed");
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [channel.id, scanning, onConnected, onClose]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className={channelStyles.modalOverlay} onClick={onClose}>
      <div className={channelStyles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={channelStyles.modalHeader}>
          <h3>
            {t("channel.scanToConnect")} - {channel.name}
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

          {loading && (
            <div className={channelStyles.qrLoading}>
              <span className={channelStyles.spinner} />
              <p>{t("channel.generatingQr")}</p>
            </div>
          )}

          {error && (
            <div className={channelStyles.qrError}>
              <p>{error}</p>
              <button className={channelStyles.btnPrimary} onClick={generateQr}>
                {t("channel.retry")}
              </button>
            </div>
          )}

          {!loading && !error && qrData && (
            <div className={channelStyles.qrArea}>
              {qrType === "url" ? (
                <>
                  <img
                    className={channelStyles.qrImage}
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrData)}`}
                    alt="QR Code"
                  />
                  {scanning && countdown > 0 && (
                    <div className={channelStyles.scanHint}>
                      <span className={channelStyles.pulseDot} />
                      <span>{t("channel.waitingForScan")}</span>
                    </div>
                  )}
                </>
              ) : (
                <pre className={channelStyles.qrText}>{qrData}</pre>
              )}
              <div className={channelStyles.qrCountdown}>
                {countdown > 0 ? (
                  <span>
                    ⏱ {t("channel.qrExpiresIn")} {formatCountdown(countdown)}
                  </span>
                ) : (
                  <span className={channelStyles.qrExpired}>{t("channel.qrExpired")}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={channelStyles.modalFooter}>
          <button className={channelStyles.btnSecondary} onClick={generateQr}>
            {t("channel.refreshQr")}
          </button>
          <button className={channelStyles.btnSecondary} onClick={onClose}>
            {t("channel.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
