import { useState, useEffect, useCallback } from "react";
import { CHANNEL_GROUPS, getChannelsByGroup, getChannelMeta } from "@constants/channels";
import type { ChannelMeta, ChannelStatus } from "@constants/channels";
import type { ChannelStatusResult } from "@core/tauri/types";
import { TauriCommands } from "@services/tauri/TauriCommands";
import ChannelCard from "./ChannelCard";
import ChannelQrModal from "./ChannelQrModal";
import ChannelConfigModal from "./ChannelConfigModal";
import styles from "@pages/settings/SettingsPanel.module.css";
import channelStyles from "./ChannelSettings.module.css";

interface ChannelSettingsProps {
  t: (key: string) => string;
}

export default function ChannelSettings({ t }: ChannelSettingsProps) {
  const [statuses, setStatuses] = useState<Record<string, ChannelStatus>>({});
  const [activeQrChannel, setActiveQrChannel] = useState<ChannelMeta | null>(null);
  const [activeConfigChannel, setActiveConfigChannel] = useState<ChannelMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatuses = useCallback(async () => {
    try {
      const result = await TauriCommands.listChannelStatuses();
      const map: Record<string, ChannelStatus> = {};
      result.forEach((s: ChannelStatusResult) => {
        map[s.channelType] = {
          id: s.id,
          channelType: s.channelType,
          displayName: s.displayName,
          status: s.status,
          isHome: s.isHome,
          errorMessage: s.errorMessage,
          connectedAt: s.connectedAt,
          configJson: s.configJson,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        };
      });
      setStatuses(map);
    } catch {
      // console.error("Failed to load channel statuses:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const handleSetupQr = (channelType: string) => {
    const meta = getChannelMeta(channelType);
    if (meta) setActiveQrChannel(meta);
  };

  const handleSetupToken = (channelType: string) => {
    const meta = getChannelMeta(channelType);
    if (meta) setActiveConfigChannel(meta);
  };

  const handleDisconnect = async (channelType: string) => {
    try {
      await TauriCommands.channelDisconnect(channelType);
    } catch {
      // console.error("Failed to disconnect channel:", e);
    } finally {
      await loadStatuses();
    }
  };

  const handleSetHome = async (channelType: string) => {
    try {
      await TauriCommands.channelSetHome(channelType);
      await loadStatuses();
    } catch {
      // console.error("Failed to set home channel:", e);
    }
  };

  const handleConnected = () => {
    loadStatuses();
  };

  const connectedCount = Object.values(statuses).filter((s) => s.status === "connected").length;

  const groupOrder: Array<keyof typeof CHANNEL_GROUPS> = ["domestic", "international", "other"];

  return (
    <div className={styles.settingsSectionCard}>
      <div className={styles.settingsSection}>
        <div className={channelStyles.channelHeader}>
          <h2>{t("channel.title")}</h2>
          <div className={channelStyles.channelStats}>
            {connectedCount} {t("channel.connected")}
          </div>
        </div>

        {loading ? (
          <div className={channelStyles.loadingState}>
            <span className={channelStyles.spinner} />
            <p>{t("channel.loading")}</p>
          </div>
        ) : (
          <>
            {connectedCount > 0 && (
              <div className={channelStyles.connectedSection}>
                <h3 className={channelStyles.groupTitle}>
                  {t("channel.connectedChannels")} ({connectedCount})
                </h3>
                <div className={channelStyles.channelGrid}>
                  {Object.values(statuses)
                    .filter((s) => s.status === "connected")
                    .map((s) => {
                      const meta = getChannelMeta(s.channelType);
                      if (!meta) return null;
                      return (
                        <ChannelCard
                          key={meta.id}
                          meta={meta}
                          status={s}
                          onSetupQr={handleSetupQr}
                          onSetupToken={handleSetupToken}
                          onDisconnect={handleDisconnect}
                          onSetHome={handleSetHome}
                          t={t}
                        />
                      );
                    })}
                </div>
              </div>
            )}

            {groupOrder.map((group) => {
              const channels = getChannelsByGroup(group);
              if (channels.length === 0) return null;
              return (
                <div key={group} className={channelStyles.channelGroup}>
                  <h3 className={channelStyles.groupTitle}>{CHANNEL_GROUPS[group]}</h3>
                  <div className={channelStyles.channelGrid}>
                    {channels.map((meta) => (
                      <ChannelCard
                        key={meta.id}
                        meta={meta}
                        status={statuses[meta.id]}
                        onSetupQr={handleSetupQr}
                        onSetupToken={handleSetupToken}
                        onDisconnect={handleDisconnect}
                        onSetHome={handleSetHome}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {activeQrChannel && (
        <ChannelQrModal
          channel={activeQrChannel}
          onClose={() => setActiveQrChannel(null)}
          onConnected={handleConnected}
          t={t}
        />
      )}

      {activeConfigChannel && (
        <ChannelConfigModal
          channel={activeConfigChannel}
          onClose={() => setActiveConfigChannel(null)}
          onConnected={handleConnected}
          t={t}
        />
      )}
    </div>
  );
}
