import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Message, Conversation, AttachedFile } from "@core/types";
import { useConversation } from "./chat/useConversation";
import { useStreamingChat } from "./chat/useStreamingChat";
import { useUiStore } from "../stores/uiStore";

export function useChat(t: (key: string, params?: Record<string, string | number>) => string) {
  const [input, setInput] = useState("");
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  const conv = useConversation();
  const stream = useStreamingChat();

  const handleSelectConversation = (id: string) => {
    conv.handleSelectConversation(id);
    stream.setActiveConversation(id);
  };

  const createNewConversation = async () => {
    const id = await conv.createNewConversation(t("chat.newConversation"));
    if (id) {
      stream.setActiveConversation(id);
    }
    return id;
  };

  const deleteConversation = async (id: string) => {
    await conv.deleteConversation(id);
    if (conv.currentConversationId === id) {
      stream.setActiveConversation(null);
    }
  };

  const sendMessageFromHome = async (
    cardPrompt: string,
    userText: string,
    homeFiles?: AttachedFile[],
    kbIds?: string[],
    voiceInfo?: { audioPath: string; audioDuration: number }
  ) => {
    if (stream.isStreaming) return;
    const fullText = cardPrompt ? `${cardPrompt}\n\n${userText}` : userText;
    const hasFiles = homeFiles && homeFiles.length > 0;
    if (!fullText.trim() && !hasFiles) return;
    const displayContent = fullText.trim() || (hasFiles ? "请分析附件中的文件" : "");

    let sendContent = fullText.trim();
    if (hasFiles) {
      const nonImageFiles = homeFiles!.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return !["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext || "");
      });
      if (nonImageFiles.length > 0) {
        const fileList = nonImageFiles.map((f) => `- ${f.name}: ${f.path}`).join("\n");
        sendContent = `${sendContent}\n\n附件文件路径：\n${fileList}`;
      }
    }
    const firstImage = hasFiles
      ? homeFiles!.find((f) => {
          const ext = f.name.split(".").pop()?.toLowerCase();
          return ext && ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext);
        })
      : undefined;

    const filesJson = hasFiles ? JSON.stringify(homeFiles) : undefined;

    setTimeout(async () => {
      try {
        const conversation = await invoke<Conversation>("create_conversation", {
          req: { title: userText.trim().slice(0, 30) || displayContent.slice(0, 30) },
        });
        const convId = conversation.id;
        conv.setConversations((prev) => [conversation, ...prev]);
        conv.currentConversationIdRef.current = convId;
        conv.setCurrentConversation(convId);
        stream.setActiveConversation(convId);
        setActiveTab("chat");

        if (kbIds && kbIds.length > 0) {
          const kbIdsJson = JSON.stringify(kbIds);
          await conv.updateConversationKbIds(convId, kbIdsJson);
        }

        const userMsg: Message = {
          id: Date.now().toString(),
          role: "user",
          content: displayContent,
          files: filesJson,
          timestamp: Date.now(),
          audioPath: voiceInfo?.audioPath,
          audioDuration: voiceInfo?.audioDuration,
          messageType: voiceInfo ? "voice" : "text",
        };
        try {
          await invoke("create_message", {
            req: {
              conversationId: convId,
              role: "user",
              content: userMsg.content,
              thinking: null,
              files: filesJson || null,
              audioPath: voiceInfo?.audioPath ?? null,
              audioDuration: voiceInfo?.audioDuration ?? null,
              messageType: voiceInfo ? "voice" : "text",
            },
          });
        } catch {
          // console.error("Failed to save user message (home):", err);
        }

        conv.addMessageToCache(convId, userMsg);

        const eventId = `chat_stream_${convId}`;

        await stream.startStreaming(
          convId,
          {
            message: sendContent,
            sessionId: null,
            model: null,
            provider: null,
            image: firstImage?.path || null,
            eventId,
            forceKbRetrieve: !!(kbIds && kbIds.length > 0),
            conversationId: convId,
            isVoiceMessage: !!voiceInfo,
          },
          (assistantMsg) => {
            conv.setMessagesForConversation(convId, (prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === assistantMsg.id) {
                return [...prev.slice(0, -1), assistantMsg];
              }
              return [...prev, assistantMsg];
            });
          },
          () => {
            conv.loadConversations();
          }
        );
      } catch {
        // console.error("Failed to start chat from home:", err);
      }
    }, 50);
  };

  const sendMessage = async (
    attachedFiles?: string,
    model?: string,
    provider?: string,
    image?: string,
    forceKbRetrieve?: boolean,
    kbIds?: string[],
    voiceInfo?: { audioPath: string; audioDuration: number },
    contentOverride?: string
  ) => {
    const effectiveContent = contentOverride || input.trim();
    const isVoiceOnly = !!voiceInfo && !effectiveContent && !attachedFiles;
    // console.log("[sendMessage] effectiveContent:", JSON.stringify(effectiveContent), "isVoiceOnly:", isVoiceOnly, "voiceInfo:", voiceInfo, "attachedFiles:", attachedFiles, "isStreaming:", stream.isStreaming);
    if ((!effectiveContent && !attachedFiles && !isVoiceOnly) || stream.isStreaming) return;

    let conversationId = conv.currentConversationId;

    if (!conversationId) {
      try {
        const conversation = await invoke<Conversation>("create_conversation", {
          req: {
            title:
              effectiveContent.slice(0, 30) ||
              (attachedFiles ? t("chat.fileConversation") : t("chat.newConversation")),
          },
        });
        conversationId = conversation.id;
        conv.setConversations((prev) => [conversation, ...prev]);
        conv.setCurrentConversation(conversation.id);
        stream.setActiveConversation(conversation.id);
      } catch {
        // console.error("Failed to create conversation:", err);
        return;
      }
    }

    if (kbIds && kbIds.length > 0) {
      const kbIdsJson = JSON.stringify(kbIds);
      await conv.updateConversationKbIds(conversationId, kbIdsJson);
    }

    const messageContent = effectiveContent || (attachedFiles ? "请分析附件中的文件" : "");
    let sendContent = messageContent;

    if (attachedFiles) {
      try {
        const files: AttachedFile[] = JSON.parse(attachedFiles);
        const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
        const nonImageFiles = files.filter((f) => {
          const ext = f.name.split(".").pop()?.toLowerCase();
          return !imageExtensions.includes(ext || "");
        });
        if (nonImageFiles.length > 0) {
          const fileList = nonImageFiles.map((f) => `- ${f.name}: ${f.path}`).join("\n");
          sendContent = `${sendContent}\n\n附件文件路径：\n${fileList}`;
        }
      } catch {
        // console.warn("Failed to parse attached files:", err);
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
      files: attachedFiles,
      timestamp: Date.now(),
      audioPath: voiceInfo?.audioPath,
      audioDuration: voiceInfo?.audioDuration,
      messageType: voiceInfo ? "voice" : "text",
    };

    conv.addMessageToCache(conversationId!, userMsg);
    // console.log("[sendMessage] addMessageToCache called, convId:", conversationId, "userMsg:", { id: userMsg.id, content: userMsg.content, audioPath: userMsg.audioPath, audioDuration: userMsg.audioDuration, messageType: userMsg.messageType });
    setInput("");

    try {
      await invoke("create_message", {
        req: {
          conversationId: conversationId!,
          role: "user",
          content: userMsg.content,
          thinking: null,
          files: attachedFiles || null,
          audioPath: voiceInfo?.audioPath ?? null,
          audioDuration: voiceInfo?.audioDuration ?? null,
          messageType: voiceInfo ? "voice" : "text",
        },
      });
    } catch {
      // console.error("Failed to save user message:", err);
    }

    if (isVoiceOnly) {
      // console.log("[sendMessage] isVoiceOnly, returning early with convId:", conversationId, "userMsgId:", userMsg.id);
      return { conversationId: conversationId!, userMsgId: userMsg.id };
    }

    const eventId = `chat_stream_${conversationId}`;
    const currentConv = conv.conversations.find((c) => c.id === conversationId);
    const hermesSessionId = currentConv?.hermesSessionId;

    await stream.startStreaming(
      conversationId!,
      {
        message: sendContent,
        sessionId: hermesSessionId || null,
        model: model || null,
        provider: provider || null,
        image: image || null,
        eventId,
        forceKbRetrieve: forceKbRetrieve || false,
        conversationId: conversationId || null,
        isVoiceMessage: !!voiceInfo,
      },
      (assistantMsg) => {
        conv.setMessagesForConversation(conversationId!, (prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === assistantMsg.id) {
            return [...prev.slice(0, -1), assistantMsg];
          }
          return [...prev, assistantMsg];
        });
      },
      () => {
        conv.loadConversations();
      }
    );

    return { conversationId: conversationId!, userMsgId: userMsg.id };
  };

  const streamVoiceResponse = async (
    conversationId: string,
    userMsgId: string,
    sttText: string,
    audioPath: string,
    audioDuration?: number
  ) => {
    conv.setMessagesForConversation(conversationId, (prev) => {
      const idx = prev.findIndex((m) => m.id === userMsgId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        content: sttText,
        audioPath,
        audioDuration: audioDuration ?? updated[idx].audioDuration,
      };
      return updated;
    });

    try {
      await invoke("update_message", {
        req: {
          id: userMsgId,
          content: sttText,
          conversationId,
          audioPath,
          audioDuration: audioDuration ?? null,
          messageType: "voice",
        },
      });
    } catch {
      // console.warn("Failed to update voice message content:", err);
    }

    if (!sttText.trim()) return;

    const currentConv = conv.conversations.find((c) => c.id === conversationId);
    const hermesSessionId = currentConv?.hermesSessionId;
    const eventId = `chat_stream_${conversationId}`;

    await stream.startStreaming(
      conversationId,
      {
        message: sttText,
        sessionId: hermesSessionId || null,
        model: null,
        provider: null,
        image: null,
        eventId,
        forceKbRetrieve: false,
        conversationId,
        isVoiceMessage: true,
      },
      (assistantMsg) => {
        conv.setMessagesForConversation(conversationId, (prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === assistantMsg.id) {
            return [...prev.slice(0, -1), assistantMsg];
          }
          return [...prev, assistantMsg];
        });
      },
      () => {
        conv.loadConversations();
      }
    );
  };

  return {
    conversations: conv.conversations,
    setConversations: conv.setConversations,
    currentConversationId: conv.currentConversationId,
    messages: conv.messages,
    input,
    setInput,
    isStreaming: stream.isStreaming,
    isThinking: stream.isThinking,
    thinkingContent: stream.thinkingContent,
    streamedContent: stream.streamedContent,
    toolProgress: stream.toolProgress,
    messagesEndRef: stream.messagesEndRef,
    handleSelectConversation,
    createNewConversation,
    deleteConversation,
    renameConversation: conv.renameConversation,
    sendMessage,
    sendMessageFromHome,
    streamVoiceResponse,
    stopStreaming: stream.stopStreaming,
  };
}
