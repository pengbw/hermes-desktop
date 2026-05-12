import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Conversation, Message } from "@core/types";

export function useConversation() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesMapRef = useRef<Map<string, Message[]>>(new Map());
  const currentConversationIdRef = useRef<string | null>(null);

  const loadConversations = async () => {
    try {
      const result = await invoke<Conversation[]>("list_conversations");
      setConversations(result);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const result = await invoke<Message[]>("list_messages", { conversationId });
      messagesMapRef.current.set(conversationId, result);
      setMessages(result);
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (currentConversationId) {
      const cachedMessages = messagesMapRef.current.get(currentConversationId);
      if (cachedMessages) {
        setMessages(cachedMessages);
      } else {
        loadMessages(currentConversationId);
      }
    } else {
      setMessages([]);
    }
  }, [currentConversationId]);

  const createNewConversation = async (title: string) => {
    try {
      const result = await invoke<Conversation>("create_conversation", {
        req: { title },
      });
      setConversations((prev) => [result, ...prev]);
      setCurrentConversationId(result.id);
      currentConversationIdRef.current = result.id;
      setMessages([]);
      return result.id;
    } catch (err) {
      console.error("Failed to create conversation:", err);
      return null;
    }
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
    currentConversationIdRef.current = id;
  };

  const deleteConversation = async (id: string) => {
    try {
      await invoke("delete_conversation", { id });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        currentConversationIdRef.current = null;
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const renameConversation = async (id: string, title: string) => {
    try {
      await invoke("rename_conversation", { id, title });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  };

  const updateConversationKbIds = async (id: string, kbIds: string) => {
    try {
      await invoke("update_conversation_kb_ids", { id, kbIds });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, kbIds } : c)));
    } catch (err) {
      console.error("Failed to save kb_ids:", err);
    }
  };

  const addMessageToCache = (convId: string, message: Message) => {
    const cached = messagesMapRef.current.get(convId) || [];
    const updated = [...cached, message];
    messagesMapRef.current.set(convId, updated);
    if (convId === currentConversationIdRef.current) {
      setMessages(updated);
    }
  };

  const setMessagesForConversation = (convId: string, updater: (prev: Message[]) => Message[]) => {
    const prev = messagesMapRef.current.get(convId) || [];
    const next = updater(prev);
    messagesMapRef.current.set(convId, next);
    if (convId === currentConversationIdRef.current) {
      setMessages(next);
    }
  };

  const setCurrentConversation = (id: string) => {
    setCurrentConversationId(id);
    currentConversationIdRef.current = id;
  };

  return {
    conversations,
    setConversations,
    currentConversationId,
    currentConversationIdRef,
    messages,
    messagesMapRef,
    loadConversations,
    createNewConversation,
    handleSelectConversation,
    deleteConversation,
    renameConversation,
    updateConversationKbIds,
    addMessageToCache,
    setMessagesForConversation,
    setCurrentConversation,
  };
}
