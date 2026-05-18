import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "@contexts/I18nContext";
import { useVirtualizer } from "@tanstack/react-virtual";
import ConversationList from "@components/chat/ConversationList";
import MessageBubble from "@components/chat/MessageBubble";
import StreamingIndicator from "@components/chat/StreamingIndicator";
import MessageInput from "@components/chat/MessageInput";
import type { Conversation, Message, HermesConfigData } from "@core/types";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  sendMessage: (
    attachedFiles?: string,
    model?: string,
    provider?: string,
    image?: string,
    forceKbRetrieve?: boolean,
    kbIds?: string[],
    voiceInfo?: { audioPath: string; audioDuration: number },
    contentOverride?: string
  ) => Promise<{ conversationId: string; userMsgId: string } | undefined>;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
  toolProgress: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  streamVoiceResponse: (
    conversationId: string,
    userMsgId: string,
    sttText: string,
    audioPath: string,
    audioDuration?: number
  ) => Promise<void>;
}

function ChatPanel({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  messages,
  input,
  setInput,
  sendMessage,
  isStreaming,
  isThinking,
  thinkingContent,
  streamedContent,
  toolProgress,
  messagesEndRef,
  streamVoiceResponse,
}: ChatPanelProps) {
  const { t } = useI18n();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [kbGlobalAutoRetrieve, setKbGlobalAutoRetrieve] = useState(false);
  const [kbList, setKbList] = useState<
    { id: string; name: string; icon: string; status: string }[]
  >([]);
  const [pendingKbIds, setPendingKbIds] = useState<string[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const messagesListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<HermesConfigData>("get_hermes_config")
      .then((cfg) => {
        setTtsEnabled(cfg.tts_enabled);
        setVoiceEnabled(cfg.voice_enabled);
      })
      .catch(() => {});
  }, []);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messagesListRef.current,
    estimateSize: (index) => {
      const msg = messages[index];
      if (!msg) return 80;
      const contentLen = msg.content?.length ?? 0;
      if (contentLen > 2000) return 400;
      if (contentLen > 500) return 200;
      return 80;
    },
    overscan: 5,
  });

  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, virtualizer]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        messagesListRef.current?.scrollTo({
          top: messagesListRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [isStreaming, isThinking, streamedContent, toolProgress, messages.length]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await invoke<Record<string, unknown>>("get_knowledge_config");
        setKbGlobalAutoRetrieve(!!cfg.globalAutoRetrieve);
      } catch (err) {
// console.warn("Failed to load kb config:", err);
      }
      try {
        const kbs =
          await invoke<{ id: string; name: string; icon: string; status: string }[]>(
            "list_knowledge_bases"
          );
        setKbList(kbs);
      } catch (err) {
// console.warn("Failed to load kb list:", err);
      }
    })();
  }, []);

  useEffect(() => {
    const conv = conversations.find((c) => c.id === currentConversationId);
    const ids: string[] = conv?.kbIds ? JSON.parse(conv.kbIds) : [];
    setPendingKbIds(ids);
  }, [currentConversationId, conversations]);

  const pendingVoiceRef = useRef<{ conversationId: string; userMsgId: string } | null>(null);

  const handleSend = useCallback(
    async (params: {
      content?: string;
      filesJson?: string;
      model?: string;
      provider?: string;
      imagePath?: string;
      forceKbRetrieve?: boolean;
      kbIds?: string[];
      voiceInfo?: { audioPath: string; audioDuration: number };
    }) => {
// console.log("[ChatPanel] handleSend, params:", { content: params.content, voiceInfo: params.voiceInfo });
      const result = await sendMessage(
        params.filesJson,
        params.model,
        params.provider,
        params.imagePath,
        params.forceKbRetrieve,
        params.kbIds,
        params.voiceInfo,
        params.content
      );
// console.log("[ChatPanel] handleSend result:", result);
      if (result && params.voiceInfo && !params.content) {
        pendingVoiceRef.current = result;
      }
    },
    [sendMessage]
  );

  const handleSttComplete = useCallback(
    async (text: string, audioPath: string, audioDuration?: number) => {
      const pending = pendingVoiceRef.current;
      if (!pending) return;
      pendingVoiceRef.current = null;
      await streamVoiceResponse(pending.conversationId, pending.userMsgId, text, audioPath, audioDuration);
    },
    [streamVoiceResponse]
  );

  const shouldUseVirtual = messages.length > 50;

  return (
    <div className={styles.chatLayout}>
      <ConversationList
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={onSelectConversation}
        onNewConversation={onNewConversation}
        onDeleteConversation={onDeleteConversation}
        onRenameConversation={onRenameConversation}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className={styles.chatMain}>
        <div className={styles.messagesList} ref={messagesListRef}>
          {messages.length === 0 && !isStreaming && (
            <div className={styles.emptyChat}>
              <span>{t("chat.emptyChat")}</span>
            </div>
          )}
          {shouldUseVirtual ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const msg = messages[virtualItem.index];
                return (
                  <div
                    key={msg.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <MessageBubble message={msg} ttsEnabled={ttsEnabled} />
                  </div>
                );
              })}
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} ttsEnabled={ttsEnabled} />)
          )}
          <StreamingIndicator
            isStreaming={isStreaming}
            isThinking={isThinking}
            thinkingContent={thinkingContent}
            streamedContent={streamedContent}
            toolProgress={toolProgress}
          />
          <div ref={messagesEndRef} />
        </div>
        <MessageInput
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onSttComplete={handleSttComplete}
          isStreaming={isStreaming}
          voiceEnabled={voiceEnabled}
          kbGlobalAutoRetrieve={kbGlobalAutoRetrieve}
          kbList={kbList}
          pendingKbIds={pendingKbIds}
          setPendingKbIds={setPendingKbIds}
        />
      </div>
    </div>
  );
}

export default ChatPanel;
