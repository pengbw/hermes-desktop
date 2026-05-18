import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface AttachedFile {
  name: string;
  path: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  emotion?: string;
  files?: string;
}

interface UseAvatarChatOptions {
  applyExpression: (name: string, val: number, duration?: number) => void;
  triggerGesture: (name: string) => void;
  gestures: React.RefObject<
    Array<{
      name: string;
      target: Record<string, { x: number; y: number; z: number; w: number }>;
      lookAt?: { x: number; y: number };
      tilt?: number;
      duration: number;
      greeting?: boolean;
    }>
  >;
  gestureStateRef: React.RefObject<{ index: number; start: number; active: boolean }>;
}

export function useAvatarChat({
  applyExpression,
  triggerGesture: _triggerGesture,
  gestures,
  gestureStateRef,
}: UseAvatarChatOptions) {
  const [isThinking, setIsThinking] = useState(false);
  const isThinkingRef = useRef(false);
  const [isWaitingResponse, setIsWaitingResponse] = useState(false);
  const avatarConvIdRef = useRef<string | null>(null);
  const hermesSessionIdRef = useRef<string | null>(null);

  const ensureConversation = useCallback(async () => {
    if (avatarConvIdRef.current) return avatarConvIdRef.current;

    try {
      const existing = await invoke<{ id: string; hermesSessionId: string | null } | null>(
        "get_avatar_conversation"
      );
      if (existing) {
        avatarConvIdRef.current = existing.id;
        hermesSessionIdRef.current = existing.hermesSessionId;
        return existing.id;
      }
      const conv = await invoke<{ id: string; hermesSessionId: string | null }>(
        "create_avatar_conversation"
      );
      avatarConvIdRef.current = conv.id;
      hermesSessionIdRef.current = conv.hermesSessionId;
      return conv.id;
    } catch {
      // console.error("[Avatar] 获取/创建会话失败:", e);
      return null;
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string, attachedFiles: AttachedFile[], onChatWindowOpen: () => void) => {
      if ((!text && attachedFiles.length === 0) || isWaitingResponse) return;

      const filesJson = attachedFiles.length > 0 ? JSON.stringify(attachedFiles) : undefined;

      const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
      const firstImage = attachedFiles.find((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ext && imageExtensions.includes(ext);
      });
      const imagePath = firstImage?.path;

      const messageContent = text || (filesJson ? "请分析附件中的文件" : "");
      let sendContent = messageContent;

      if (filesJson) {
        try {
          const files: AttachedFile[] = JSON.parse(filesJson);
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

      const convId = await ensureConversation();
      if (!convId) return;

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: messageContent,
        files: filesJson,
        timestamp: Date.now(),
      };

      setIsThinking(true);
      isThinkingRef.current = true;
      setIsWaitingResponse(true);

      try {
        await invoke("create_message", {
          req: {
            conversationId: convId,
            role: userMsg.role,
            content: userMsg.content,
            files: filesJson || null,
          },
        });
      } catch {
        // console.error("[Avatar] 保存用户消息失败:", e);
      }

      onChatWindowOpen();

      applyExpression("surprised", 0.5);

      const thinkIdx = gestures.current.findIndex((g) => g.name === "think");
      if (thinkIdx >= 0) {
        gestureStateRef.current = { index: thinkIdx, start: performance.now(), active: true };
      }

      try {
        const eventId = `avatar_chat_stream_${Date.now()}`;
        let fullContent = "";

        const unlisten = await listen<{
          chunk: string;
          done: boolean;
          event_type?: string;
          tool_name?: string;
          tool_label?: string;
        }>(eventId, (event) => {
          const { chunk, done, event_type } = event.payload;

          if (done) {
            setIsThinking(false);
            isThinkingRef.current = false;
            setIsWaitingResponse(false);
            applyExpression("happy", 0.8, 3000);

            (async () => {
              try {
                await invoke("create_message", {
                  req: {
                    conversationId: avatarConvIdRef.current,
                    role: "assistant",
                    content: fullContent,
                  },
                });
              } catch {
                // console.error("[Avatar] 保存AI消息失败:", e);
              }
            })();

            unlisten();
          } else if (event_type === "tool_progress") {
            applyExpression("surprised", 0.4);
          } else if (event_type === "error") {
            setIsThinking(false);
            isThinkingRef.current = false;
            setIsWaitingResponse(false);
            applyExpression("sad", 0.5, 2000);
          } else {
            fullContent += chunk;
          }
        });

        await invoke("chat_with_hermes_api", {
          message: sendContent,
          sessionId: hermesSessionIdRef.current,
          model: null,
          provider: null,
          image: imagePath || null,
          eventId: eventId,
          forceKbRetrieve: false,
          conversationId: convId,
        });
      } catch {
        // console.error("[Avatar] Chat error:", err);
        setIsThinking(false);
        isThinkingRef.current = false;
        setIsWaitingResponse(false);
        applyExpression("sad", 0.5, 2000);

        try {
          await invoke("create_message", {
            req: {
              conversationId: avatarConvIdRef.current,
              role: "assistant",
              content: "抱歉，出了点问题...",
            },
          });
        } catch {
          // console.error("[Avatar] 保存错误消息失败:", e);
        }
      }
    },
    [isWaitingResponse, applyExpression, ensureConversation, gestures, gestureStateRef]
  );

  return {
    isThinking,
    isThinkingRef,
    isWaitingResponse,
    setIsWaitingResponse,
    sendMessage,
  };
}
