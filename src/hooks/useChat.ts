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
    return conv.createNewConversation(t("chat.newConversation"));
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
    kbIds?: string[]
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
        };
        try {
          await invoke("create_message", {
            req: {
              conversationId: convId,
              role: "user",
              content: userMsg.content,
              thinking: null,
              files: filesJson || null,
            },
          });
        } catch (err) {
          console.error("Failed to save user message (home):", err);
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
          },
          (assistantMsg) => {
            conv.setMessagesForConversation(convId, (prev) => [...prev, assistantMsg]);
          },
          () => {
            conv.loadConversations();
          }
        );
      } catch (err) {
        console.error("Failed to start chat from home:", err);
      }
    }, 50);
  };

  const sendMessage = async (
    attachedFiles?: string,
    model?: string,
    provider?: string,
    image?: string,
    forceKbRetrieve?: boolean,
    kbIds?: string[]
  ) => {
    if ((!input.trim() && !attachedFiles) || stream.isStreaming) return;

    let conversationId = conv.currentConversationId;

    if (!conversationId) {
      try {
        const conversation = await invoke<Conversation>("create_conversation", {
          req: {
            title:
              input.trim().slice(0, 30) ||
              (attachedFiles ? t("chat.fileConversation") : t("chat.newConversation")),
          },
        });
        conversationId = conversation.id;
        conv.setConversations((prev) => [conversation, ...prev]);
        conv.setCurrentConversation(conversation.id);
        stream.setActiveConversation(conversation.id);
      } catch (err) {
        console.error("Failed to create conversation:", err);
        return;
      }
    }

    if (kbIds && kbIds.length > 0) {
      const kbIdsJson = JSON.stringify(kbIds);
      await conv.updateConversationKbIds(conversationId, kbIdsJson);
    }

    const messageContent = input.trim() || (attachedFiles ? "请分析附件中的文件" : "");
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
      } catch (err) {
        console.warn("Failed to parse attached files:", err);
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
      files: attachedFiles,
      timestamp: Date.now(),
    };

    try {
      await invoke("create_message", {
        req: {
          conversationId: conversationId!,
          role: "user",
          content: userMsg.content,
          thinking: null,
          files: attachedFiles || null,
        },
      });
    } catch (err) {
      console.error("Failed to save user message:", err);
    }

    conv.addMessageToCache(conversationId!, userMsg);
    setInput("");

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
      },
      (assistantMsg) => {
        conv.setMessagesForConversation(conversationId!, (prev) => [...prev, assistantMsg]);
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
  };
}
