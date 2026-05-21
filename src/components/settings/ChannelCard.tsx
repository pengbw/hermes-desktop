import { useState } from "react";
import type { ChannelMeta, ChannelStatus } from "@constants/channels";
import PlatformIcon from "./PlatformIcon";

interface ChannelCardProps {
  meta: ChannelMeta;
  status?: ChannelStatus;
  onSetupQr: (channelType: string) => void;
  onSetupToken: (channelType: string) => void;
  onDisconnect: (channelType: string) => void;
  onSetHome: (channelType: string) => void;
  t: (key: string) => string;
}

export default function ChannelCard({
  meta,
  status,
  onSetupQr,
  onSetupToken,
  onDisconnect,
  onSetHome,
  t,
}: ChannelCardProps) {
  const [disconnecting, setDisconnecting] = useState(false);

  const connectionStatus = status?.status || "disconnected";
  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";
  const isError = connectionStatus === "error";

  const statusDotClass = isConnected
    ? "bg-green-500 shadow-[0_0_6px_rgba(76,175,80,0.4)]"
    : isConnecting
      ? "bg-amber-500 animate-pulse"
      : isError
        ? "bg-red-500"
        : "bg-muted-foreground/40";

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await onDisconnect(meta.id);
    } finally {
      setDisconnecting(false);
    }
  };

  const capabilityLabels = [
    meta.capability.voice && { key: "voice", label: t("channel.cap.voice") },
    meta.capability.image && { key: "image", label: t("channel.cap.image") },
    meta.capability.file && { key: "file", label: t("channel.cap.file") },
    meta.capability.groupChat && { key: "groupChat", label: t("channel.cap.groupChat") },
    meta.capability.streamOutput && { key: "stream", label: t("channel.cap.stream") },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <div
      className={`bg-card border border-border rounded-xl p-4 flex flex-col gap-2.5 transition-all hover:border-primary hover:shadow-md ${
        isConnected ? "border-green-500/30 bg-green-500/[0.04]" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <PlatformIcon channelId={meta.id} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{meta.name}</div>
          <div className="text-[11px] text-muted-foreground mt-px">{meta.nameEn}</div>
        </div>
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
      </div>

      <div className="flex flex-wrap gap-1">
        {capabilityLabels.map((cap) => (
          <span key={cap.key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {cap.label}
          </span>
        ))}
      </div>

      {isError && status?.errorMessage && (
        <div className="text-[11px] text-red-500 px-2 py-1 bg-red-500/8 rounded-md">
          {status.errorMessage}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap mt-auto">
        {!isConnected &&
          !isConnecting &&
          (meta.setupMode === "qr" || meta.setupMode === "both") && (
            <button
              className="px-3.5 py-1.5 border-none rounded-md text-xs font-medium cursor-pointer bg-primary text-white transition-opacity hover:opacity-90 disabled:bg-border disabled:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => onSetupQr(meta.id)}
              disabled={meta.id !== "weixin" && meta.id !== "qqbot"}
              title={meta.id !== "weixin" && meta.id !== "qqbot" ? "暂不可用" : ""}
            >
              {t("channel.scanToConnect")}
            </button>
          )}
        {!isConnected &&
          !isConnecting &&
          (meta.setupMode === "token" ||
            meta.setupMode === "server" ||
            meta.setupMode === "both") && (
            <button
              className="px-3.5 py-1.5 border-none rounded-md text-xs font-medium cursor-pointer bg-primary text-white transition-opacity hover:opacity-90 disabled:bg-border disabled:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => onSetupToken(meta.id)}
              disabled={meta.id !== "weixin" && meta.id !== "qqbot"}
              title={meta.id !== "weixin" && meta.id !== "qqbot" ? "暂不可用" : ""}
            >
              {t("channel.configureConnect")}
            </button>
          )}
        {isConnecting && (
          <button
            className="px-3.5 py-1.5 border-none rounded-md text-xs font-medium cursor-not-allowed bg-muted text-muted-foreground flex items-center gap-1.5"
            disabled
          >
            <span className="inline-block w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />
            {t("channel.connecting")}
          </button>
        )}
        {isConnected && (
          <>
            <button
              className="px-3.5 py-1.5 border border-red-500/30 rounded-md text-xs font-medium cursor-pointer bg-red-500/[0.08] text-red-500 transition-colors hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? t("channel.disconnecting") : t("channel.disconnect")}
            </button>
            {!status?.isHome && (
              <button
                className="px-3.5 py-1.5 border border-border rounded-md text-xs font-medium cursor-pointer bg-transparent text-foreground transition-colors hover:bg-muted"
                onClick={() => onSetHome(meta.id)}
              >
                {t("channel.setHome")}
              </button>
            )}
            {status?.isHome && (
              <span className="text-[11px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-500 font-medium">
                🏠 Home
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
