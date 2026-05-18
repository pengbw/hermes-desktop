import { useEffect, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../contexts/I18nContext";
import InstallGuidePanel from "./InstallGuide";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { HomePanel } from "@pages/home";
import { ChatPanel } from "@pages/chat";
import { useChat } from "../hooks/useChat";
import { useUiStore } from "../stores/uiStore";
import { useAgentStore } from "../stores/agentStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import type { Tab } from "../stores/types";
import styles from "./MainWindow.module.css";
import "./MainWindow.css";

const SkillsPanel = lazy(() => import("@pages/skills").then((m) => ({ default: m.SkillsPanel })));
const KnowledgePanel = lazy(() =>
  import("@pages/knowledge").then((m) => ({ default: m.KnowledgePanel }))
);
const SettingsPanel = lazy(() =>
  import("@pages/settings").then((m) => ({ default: m.SettingsPanel }))
);
const StudioPanel = lazy(() => import("@pages/studio").then((m) => ({ default: m.StudioPanel })));

export default function MainWindow() {
  const { t } = useI18n();
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const showAvatar = useUiStore((s) => s.showAvatar);
  const setShowAvatar = useUiStore((s) => s.setShowAvatar);
  const hermesInstalled = useAgentStore((s) => s.installed);
  const setHermesInstalled = useAgentStore((s) => s.setInstalled);

  const chat = useChat(t);

  useEffect(() => {
    const checkInstall = async () => {
      try {
        const result = await invoke<{ installed: boolean; version: string; python: string }>(
          "check_hermes_installed"
        );
        setHermesInstalled(result.installed);
      } catch {
        setHermesInstalled(false);
      }
    };
    checkInstall();
  }, []);

  const handleInstalled = () => {
    setHermesInstalled(true);
  };

  const toggleAvatarWindow = async () => {
    try {
      const visible = await invoke<boolean>("toggle_avatar_window");
      setShowAvatar(visible);
    } catch (err) {
// console.error("Failed to toggle avatar window:", err);
    }
  };

  useEffect(() => {
    const unlisten = listen("navigate-to-tab", (event) => {
      const tab = (event.payload as { tab: string }).tab as Tab;
      if (["home", "chat", "settings", "skills"].includes(tab)) {
        setActiveTab(tab);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const setIndexProgress = useKnowledgeStore.getState().setIndexProgress;
    const setIndexingKbId = useKnowledgeStore.getState().setIndexingKbId;
    const unlisten = listen<{
      status: string;
      current: number;
      total: number;
      file?: string;
      chunk?: number;
      chunkTotal?: number;
    }>("kb-index-progress", (event) => {
      const p = event.payload;
      setIndexProgress({
        status: p.status,
        current: p.current,
        total: p.total,
        file: p.file || "",
        chunk: p.chunk,
        chunkTotal: p.chunkTotal,
      });
      if (p.status === "done") {
        setIndexingKbId(null);
        setTimeout(() => setIndexProgress(null), 2000);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Tab | null;
    if (tab && ["home", "chat", "settings", "skills"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  return (
    <ErrorBoundary title={t("main.loadError")}>
      <div className={styles.mainWindow}>
        {hermesInstalled === null ? (
          <div className={styles.loadingScreen}>
            <div className={styles.spinner} />
            <p>{t("main.checkingAgent")}</p>
          </div>
        ) : !hermesInstalled ? (
          <InstallGuidePanel onInstalled={handleInstalled} />
        ) : (
          <>
            <div className={styles.toolbar}>
              <nav className={styles.toolbarNav}>
                {(["home", "chat", "studio", "knowledge", "skills", "settings"] as Tab[]).map(
                  (tab) => (
                    <button
                      key={tab}
                      className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ""}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab === "home" && t("tabs.home")}
                      {tab === "chat" && t("tabs.chat")}
                      {tab === "studio" && t("tabs.studio")}
                      {tab === "knowledge" && t("tabs.knowledge")}
                      {tab === "skills" && t("tabs.skills")}
                      {tab === "settings" && t("tabs.settings")}
                    </button>
                  )
                )}
              </nav>
              <button
                className={`${styles.avatarToggleBtn} ${showAvatar ? styles.avatarToggleActive : ""}`}
                onClick={toggleAvatarWindow}
                title={t("main.openAvatar")}
              >
                <img src="/bot.svg" alt={t("main.avatar")} className={styles.toolbarAvatarIcon} />
              </button>
            </div>

            <div className={styles.contentArea}>
              {activeTab === "home" && (
                <HomePanel
                  t={t}
                  sendMessage={chat.sendMessageFromHome}
                  isStreaming={chat.isStreaming}
                />
              )}
              {activeTab === "chat" && (
                <ChatPanel
                  conversations={chat.conversations}
                  setConversations={chat.setConversations}
                  currentConversationId={chat.currentConversationId}
                  onSelectConversation={chat.handleSelectConversation}
                  onNewConversation={chat.createNewConversation}
                  onDeleteConversation={chat.deleteConversation}
                  onRenameConversation={chat.renameConversation}
                  messages={chat.messages}
                  input={chat.input}
                  setInput={chat.setInput}
                  sendMessage={chat.sendMessage}
                  isStreaming={chat.isStreaming}
                  isThinking={chat.isThinking}
                  thinkingContent={chat.thinkingContent}
                  streamedContent={chat.streamedContent}
                  toolProgress={chat.toolProgress}
                  messagesEndRef={chat.messagesEndRef}
                  streamVoiceResponse={chat.streamVoiceResponse}
                />
              )}
              {activeTab === "settings" && (
                <Suspense
                  fallback={
                    <div className={styles.tabLoading}>
                      <div className={styles.spinner} />
                    </div>
                  }
                >
                  <SettingsPanel />
                </Suspense>
              )}
              {activeTab === "studio" && (
                <Suspense
                  fallback={
                    <div className={styles.tabLoading}>
                      <div className={styles.spinner} />
                    </div>
                  }
                >
                  <StudioPanel />
                </Suspense>
              )}
              {activeTab === "knowledge" && (
                <Suspense
                  fallback={
                    <div className={styles.tabLoading}>
                      <div className={styles.spinner} />
                    </div>
                  }
                >
                  <KnowledgePanel t={t} />
                </Suspense>
              )}
              {activeTab === "skills" && (
                <Suspense
                  fallback={
                    <div className={styles.tabLoading}>
                      <div className={styles.spinner} />
                    </div>
                  }
                >
                  <SkillsPanel t={t} />
                </Suspense>
              )}
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
