import { useState } from "react";
import type { ChannelMeta, ChannelStatus } from "@constants/channels";
import PlatformIcon from "./PlatformIcon";
import channelStyles from "./ChannelSettings.module.css";

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
    ? channelStyles.statusDotConnected
    : isConnecting
      ? channelStyles.statusDotConnecting
      : isError
        ? channelStyles.statusDotError
        : channelStyles.statusDotDisconnected;

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
      className={`${channelStyles.channelCard} ${isConnected ? channelStyles.channelCardConnected : ""}`}
    >
      <div className={channelStyles.cardHeader}>
        <PlatformIcon channelId={meta.id} size={40} />
        <div className={channelStyles.cardTitleWrap}>
          <div className={channelStyles.cardTitle}>{meta.name}</div>
          <div className={channelStyles.cardSubtitle}>{meta.nameEn}</div>
        </div>
        <span className={`${channelStyles.statusDot} ${statusDotClass}`} />
      </div>

      <div className={channelStyles.cardCapabilities}>
        {capabilityLabels.map((cap) => (
          <span key={cap.key} className={channelStyles.capTag}>
            {cap.label}
          </span>
        ))}
      </div>

      {isError && status?.errorMessage && (
        <div className={channelStyles.cardError}>{status.errorMessage}</div>
      )}

      <div className={channelStyles.cardActions}>
        {!isConnected &&
          !isConnecting &&
          (meta.setupMode === "qr" || meta.setupMode === "both") && (
            <button
              className={channelStyles.btnPrimary}
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
              className={channelStyles.btnPrimary}
              onClick={() => onSetupToken(meta.id)}
              disabled={meta.id !== "weixin" && meta.id !== "qqbot"}
              title={meta.id !== "weixin" && meta.id !== "qqbot" ? "暂不可用" : ""}
            >
              {t("channel.configureConnect")}
            </button>
          )}
        {isConnecting && (
          <button className={channelStyles.btnConnecting} disabled>
            <span className={channelStyles.spinner} />
            {t("channel.connecting")}
          </button>
        )}
        {isConnected && (
          <>
            <button
              className={channelStyles.btnDanger}
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? t("channel.disconnecting") : t("channel.disconnect")}
            </button>
            {!status?.isHome && (
              <button className={channelStyles.btnSecondary} onClick={() => onSetHome(meta.id)}>
                {t("channel.setHome")}
              </button>
            )}
            {status?.isHome && <span className={channelStyles.homeBadge}>🏠 Home</span>}
          </>
        )}
      </div>
    </div>
  );
}
