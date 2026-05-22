import { useState, useEffect, useCallback } from "react";
import { CHANNEL_GROUPS, getChannelsByGroup, getChannelMeta } from "@constants/channels";
import type { ChannelMeta, ChannelStatus } from "@constants/channels";
import type { ChannelStatusResult } from "@core/tauri/types";
import { TauriCommands } from "@services/tauri/TauriCommands";
import ChannelCard from "./ChannelCard";
import ChannelQrModal from "./ChannelQrModal";
import ChannelConfigModal from "./ChannelConfigModal";

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
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[15px] font-semibold text-foreground m-0">{t("channel.title")}</h2>
        <div className="text-[13px] text-muted-foreground bg-muted px-3 py-1 rounded-xl">
          {connectedCount} {t("channel.connected")}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
          <span className="inline-block w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm">{t("channel.loading")}</p>
        </div>
      ) : (
        <>
          {connectedCount > 0 && (
            <div className="mb-6 p-4 bg-green-500/[0.06] border border-green-500/15 rounded-xl">
              <h3 className="text-sm font-semibold text-muted-foreground m-0 mb-3 pb-2 border-b border-border">
                {t("channel.connectedChannels")} ({connectedCount})
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
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
              <div key={group} className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground m-0 mb-3 pb-2 border-b border-border">
                  {CHANNEL_GROUPS[group]}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
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
