import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Message } from "@core/types";

interface UseMessageHandlerOptions {
  currentConversationIdRef: React.RefObject<string | null>;
  messagesMapRef: React.RefObject<Map<string, Message[]>>;
  onMessagesUpdate: (messages: Message[]) => void;
}

export function useMessageHandler({
  currentConversationIdRef,
  messagesMapRef,
  onMessagesUpdate,
}: UseMessageHandlerOptions) {
  const loadMessages = useCallback(
    async (conversationId: string) => {
      try {
        const result = await invoke<Message[]>("list_messages", { conversationId });
        messagesMapRef.current.set(conversationId, result);
        if (conversationId === currentConversationIdRef.current) {
          onMessagesUpdate(result);
        }
        return result;
      } catch {
        // console.error("Failed to load messages:", err);
        return [];
      }
    },
    [messagesMapRef, currentConversationIdRef, onMessagesUpdate]
  );

  const addMessageToCache = useCallback(
    (convId: string, message: Message) => {
      const cached = messagesMapRef.current.get(convId) || [];
      const updated = [...cached, message];
      messagesMapRef.current.set(convId, updated);
      if (convId === currentConversationIdRef.current) {
        onMessagesUpdate(updated);
      }
    },
    [messagesMapRef, currentConversationIdRef, onMessagesUpdate]
  );

  const updateCachedMessage = useCallback(
    (convId: string, messageId: string, updater: (msg: Message) => Message) => {
      const cached = messagesMapRef.current.get(convId) || [];
      const updated = cached.map((m) => (m.id === messageId ? updater(m) : m));
      messagesMapRef.current.set(convId, updated);
      if (convId === currentConversationIdRef.current) {
        onMessagesUpdate(updated);
      }
    },
    [messagesMapRef, currentConversationIdRef, onMessagesUpdate]
  );

  const appendStreamedContent = useCallback(
    (convId: string, messageId: string, chunk: string) => {
      const cached = messagesMapRef.current.get(convId) || [];
      const existing = cached.find((m) => m.id === messageId);
      if (existing) {
        const updated = cached.map((m) =>
          m.id === messageId ? { ...m, content: m.content + chunk } : m
        );
        messagesMapRef.current.set(convId, updated);
        if (convId === currentConversationIdRef.current) {
          onMessagesUpdate(updated);
        }
      }
    },
    [messagesMapRef, currentConversationIdRef, onMessagesUpdate]
  );

  const getCachedMessages = useCallback(
    (convId: string): Message[] => {
      return messagesMapRef.current.get(convId) || [];
    },
    [messagesMapRef]
  );

  const clearCache = useCallback(
    (convId?: string) => {
      if (convId) {
        messagesMapRef.current.delete(convId);
        if (convId === currentConversationIdRef.current) {
          onMessagesUpdate([]);
        }
      } else {
        messagesMapRef.current.clear();
        onMessagesUpdate([]);
      }
    },
    [messagesMapRef, currentConversationIdRef, onMessagesUpdate]
  );

  return {
    loadMessages,
    addMessageToCache,
    updateCachedMessage,
    appendStreamedContent,
    getCachedMessages,
    clearCache,
  };
}
