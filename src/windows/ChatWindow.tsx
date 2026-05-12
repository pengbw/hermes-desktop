import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ChatWindow.module.css";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  files?: string;
}

interface AttachedFile {
  name: string;
  path: string;
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchMessages = async () => {
      try {
        const history =
          await invoke<
            Array<{ id: string; role: string; content: string; timestamp: number; files?: string }>
          >("get_avatar_messages");
        const msgs: ChatMessage[] = history.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: m.timestamp,
          files: m.files,
        }));
        if (msgs.length !== lastCountRef.current) {
          lastCountRef.current = msgs.length;
          setMessages(msgs);
        }
      } catch {
        // ignore
      }
    };

    const startPolling = () => {
      if (timer) return;
      fetchMessages();
      timer = setInterval(fetchMessages, 2000);
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const unlistenPromise = listen("chat_stream_done", () => {
      fetchMessages();
    });

    startPolling();

    const onFocus = () => {
      startPolling();
    };
    const onBlur = () => {
      stopPolling();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      stopPolling();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      unlistenPromise.then((f) => f());
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  };

  const handleClose = () => {
    invoke("close_chat_window");
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (closeBtnRef.current && closeBtnRef.current.contains(e.target as Node)) return;
    getCurrentWindow().startDragging();
  };

  return (
    <div className={styles.chatWindow}>
      <div className={styles.chatHeader} onMouseDown={handleHeaderMouseDown}>
        <span className={styles.chatHeaderTitle}>对话记录</span>
        <button
          ref={closeBtnRef}
          className={styles.chatCloseBtn}
          onClick={handleClose}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className={styles.chatMessages}>
        {messages.length === 0 && <div className={styles.chatEmpty}>暂无对话</div>}
        {messages.map((msg) => {
          const msgFiles: AttachedFile[] = msg.files
            ? (() => {
                try {
                  return JSON.parse(msg.files);
                } catch {
                  return [];
                }
              })()
            : [];
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`${styles.chatMsg} ${isUser ? styles.chatMsgUser : styles.chatMsgAssistant}`}
            >
              <div className={styles.chatMsgAvatar}>
                {isUser ? (
                  "👤"
                ) : (
                  <img
                    src="/bot.svg"
                    alt="bot"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
              </div>
              <div
                className={`${styles.chatMsgContent} ${isUser ? styles.chatMsgContentUser : styles.chatMsgContentAssistant}`}
              >
                <div
                  className={`${styles.chatMsgBubble} ${isUser ? styles.chatMsgBubbleUser : styles.chatMsgBubbleAssistant}`}
                >
                  {msgFiles.length > 0 && (
                    <div className={styles.chatMsgFiles}>
                      {msgFiles.map((f, i) => (
                        <div
                          key={i}
                          className={`${styles.chatMsgFileItem} ${isUser ? styles.chatMsgFileItemUser : styles.chatMsgFileItemAssistant}`}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                            <polyline points="13 2 13 9 20 9" />
                          </svg>
                          <span className={styles.chatMsgFileName}>{f.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.content}
                </div>
                <div className={styles.chatMsgTime}>{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
