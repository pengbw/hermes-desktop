import { useState, useEffect, useRef, useCallback } from "react";
import type { ChannelMeta } from "@constants/channels";
import { TauriCommands } from "@services/tauri/TauriCommands";

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
  const [confirming, setConfirming] = useState(false);
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
          setScanning(false);
          setConfirming(true);
          try {
            await TauriCommands.channelConfirmQr(channel.id);
            onConnected();
            onClose();
          } catch (e) {
            console.error("[ChannelQrModal] confirm/restart failed:", e);
            setConfirming(false);
            setError(String(e));
          }
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-[90%] max-w-[520px] max-h-[85vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground m-0">
            {t("channel.scanToConnect")} - {channel.name}
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

          {loading && (
            <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
              <span className="inline-block w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
              <p className="text-sm">{t("channel.generatingQr")}</p>
            </div>
          )}

          {error && (
            <div className="text-center py-5 text-red-500">
              <p className="text-sm m-0 mb-3">{error}</p>
              <button
                className="px-3.5 py-1.5 border-none rounded-md text-xs font-medium cursor-pointer bg-primary text-white transition-opacity hover:opacity-90"
                onClick={generateQr}
              >
                {t("channel.retry")}
              </button>
            </div>
          )}

          {!loading && !error && qrData && (
            <div className="flex flex-col items-center gap-4">
              {qrType === "url" ? (
                <div className="relative inline-block">
                  <img
                    className="w-64 h-64 rounded-lg border border-border"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrData)}`}
                    alt="QR Code"
                  />
                  {confirming && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-lg text-white gap-2">
                      <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="text-sm">{t("channel.connecting")}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative inline-block">
                  <pre className="bg-muted rounded-lg p-4 text-xs text-foreground overflow-auto max-w-full border border-border">{qrData}</pre>
                  {confirming && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-lg text-white gap-2">
                      <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="text-sm">{t("channel.connecting")}</span>
                    </div>
                  )}
                </div>
              )}
              {scanning && countdown > 0 && !confirming && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>{t("channel.waitingForScan")}</span>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                {confirming ? (
                  <span>⏳ {t("channel.saving")}</span>
                ) : countdown > 0 ? (
                  <span>
                    ⏱ {t("channel.qrExpiresIn")} {formatCountdown(countdown)}
                  </span>
                ) : (
                  <span className="text-red-500">{t("channel.qrExpired")}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            className="px-3.5 py-1.5 border border-border rounded-md text-xs font-medium cursor-pointer bg-transparent text-foreground transition-colors hover:bg-muted"
            onClick={generateQr}
          >
            {t("channel.refreshQr")}
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
