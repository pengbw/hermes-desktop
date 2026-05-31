import { useState, useRef, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { KnowledgeSource, Message } from "@core/types";

interface ChatSessionState {
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
  toolProgress: string;
}

const DEFAULT_CHAT_STATE: ChatSessionState = {
  isStreaming: false,
  isThinking: false,
  thinkingContent: "",
  streamedContent: "",
  toolProgress: "",
};

export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingContent, setThinkingContent] = useState("");
  const [streamedContent, setStreamedContent] = useState("");
  const [toolProgress, setToolProgress] = useState("");
  const streamedContentRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatStatesRef = useRef<Map<string, ChatSessionState>>(new Map());
  const activeConvIdRef = useRef<string | null>(null);
  const currentEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamedContent]);

  const setActiveConversation = (convId: string | null) => {
    activeConvIdRef.current = convId;
    if (convId) {
      const savedState = chatStatesRef.current.get(convId) || DEFAULT_CHAT_STATE;
      setIsStreaming(savedState.isStreaming);
      setIsThinking(savedState.isThinking);
      setThinkingContent(savedState.thinkingContent);
      setStreamedContent(savedState.streamedContent);
      streamedContentRef.current = savedState.streamedContent;
      setToolProgress(savedState.toolProgress);
    } else {
      setIsStreaming(false);
      setIsThinking(false);
      setStreamedContent("");
      streamedContentRef.current = "";
      setToolProgress("");
    }
  };

  const updateChatState = (convId: string, update: Partial<ChatSessionState>) => {
    const current = chatStatesRef.current.get(convId) || { ...DEFAULT_CHAT_STATE };
    const next = { ...current, ...update };
    chatStatesRef.current.set(convId, next);
    if (convId === activeConvIdRef.current) {
      if (update.isStreaming !== undefined) setIsStreaming(update.isStreaming);
      if (update.isThinking !== undefined) setIsThinking(update.isThinking);
      if (update.thinkingContent !== undefined) setThinkingContent(update.thinkingContent);
      if (update.toolProgress !== undefined) setToolProgress(update.toolProgress);
      if (update.streamedContent !== undefined) {
        setStreamedContent(update.streamedContent);
        streamedContentRef.current = update.streamedContent;
      }
    }
  };

  const startStreaming = async (
    convId: string,
    invokeParams: {
      message: string;
      sessionId: string | null;
      model: string | null;
      provider: string | null;
      image: string | null;
      eventId: string;
      forceKbRetrieve: boolean;
      conversationId: string | null;
      isVoiceMessage?: boolean;
    },
    onMessage: (message: Message) => void,
    onDone: () => void
  ) => {
    updateChatState(convId, {
      isStreaming: true,
      isThinking: true,
      thinkingContent: "",
      streamedContent: "",
      toolProgress: "",
    });

    const { eventId } = invokeParams;
    currentEventIdRef.current = eventId;
    const isVoiceMessage = invokeParams.isVoiceMessage || false;
    let fullContent = "";
    let pendingSources: KnowledgeSource[] = [];

    const unlistenSources = await listen<KnowledgeSource[]>(
      `${eventId}_knowledge_sources`,
      (event) => {
        pendingSources = event.payload;
      }
    );

    const unlisten = await listen<{
      chunk: string;
      done: boolean;
      event_type?: string;
      tool_name?: string;
      tool_label?: string;
    }>(eventId, (event) => {
      const { chunk, done, event_type, tool_label } = event.payload;
      if (done) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: (event.payload as { cancelled?: boolean }).cancelled ? "" : fullContent,
          timestamp: Date.now(),
          knowledgeSources: pendingSources.length > 0 ? [...pendingSources] : undefined,
          messageType: isVoiceMessage ? "voice" : "text",
        };

        if ((event.payload as { cancelled?: boolean }).cancelled) {
          onMessage(assistantMsg);
          updateChatState(convId, { isStreaming: false, isThinking: false, toolProgress: "" });
          unlisten();
          unlistenSources();
          onDone();
          return;
        }

        if (isVoiceMessage) {
          updateChatState(convId, {
            isStreaming: true,
            isThinking: true,
            thinkingContent: "",
            streamedContent: "",
            toolProgress: "",
          });
          (async () => {
            try {
              let audioPath: string | undefined;
              let audioDuration: number | undefined;

              if (fullContent.trim()) {
                try {
                  const ttsResult = await invoke<{
                    success: boolean;
                    audioPath: string | null;
                    audioDuration: number | null;
                    error: string | null;
                  }>("text_to_speech_file", {
                    req: { text: fullContent, voice: null },
                  });
                  if (ttsResult.success && ttsResult.audioPath) {
                    audioPath = ttsResult.audioPath;
                    audioDuration = ttsResult.audioDuration ?? undefined;
                  }
                } catch (ttsErr) {
                  console.error("[startStreaming] TTS generation failed:", ttsErr);
                }
              }

              const voiceMsg: Message = {
                ...assistantMsg,
                audioPath,
                audioDuration,
                messageType: "voice",
              };
              onMessage(voiceMsg);

              await invoke("create_message", {
                req: {
                  conversationId: convId,
                  role: "assistant",
                  content: fullContent,
                  thinking: null,
                  audioPath: audioPath ?? null,
                  audioDuration: audioDuration ?? null,
                  messageType: "voice",
                },
              });
            } catch (err) {
              console.error("[startStreaming] Failed to save voice assistant message:", err);
              onMessage(assistantMsg);
            }
            updateChatState(convId, { isStreaming: false, isThinking: false, toolProgress: "" });
            unlisten();
            unlistenSources();
            onDone();
          })();
        } else {
          onMessage(assistantMsg);
          updateChatState(convId, { isStreaming: false, isThinking: false, toolProgress: "" });
          (async () => {
            try {
              await invoke("create_message", {
                req: {
                  conversationId: convId,
                  role: "assistant",
                  content: fullContent,
                  thinking: null,
                  audioPath: null,
                  audioDuration: null,
                  messageType: "text",
                },
              });
            } catch (err) {
              console.error("[startStreaming] Failed to save assistant message:", err);
            }
          })();
          unlisten();
          unlistenSources();
          onDone();
        }
      } else if (event_type === "tool_progress") {
        updateChatState(convId, { toolProgress: tool_label || chunk, isThinking: true });
      } else if (event_type === "error") {
        fullContent += chunk;
        updateChatState(convId, {
          streamedContent: fullContent,
          isThinking: false,
          toolProgress: "",
        });
      } else {
        fullContent += chunk;
        if (!isVoiceMessage) {
          updateChatState(convId, {
            streamedContent: fullContent,
            isThinking: false,
            toolProgress: "",
          });
        }
      }
    });

    try {
      await invoke("chat_with_hermes_api", invokeParams);
    } catch (err) {
      console.error("[startStreaming] chat_with_hermes_api failed:", err);
      const errorContent = fullContent || `⚠️ 请求失败`;
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: errorContent,
        timestamp: Date.now(),
      };
      onMessage(assistantMsg);
      updateChatState(convId, { isStreaming: false, isThinking: false, toolProgress: "" });
      unlisten();
      onDone();
    }
  };

  const stopStreaming = useCallback(async () => {
    const eventId = currentEventIdRef.current;
    if (eventId) {
      await invoke("stop_chat_stream", { eventId });
    }
  }, []);

  return {
    isStreaming,
    isThinking,
    thinkingContent,
    streamedContent,
    toolProgress,
    messagesEndRef,
    setActiveConversation,
    updateChatState,
    startStreaming,
    stopStreaming,
  };
}
