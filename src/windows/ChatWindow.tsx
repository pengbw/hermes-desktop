import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./ChatWindow.css";

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

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const history = await invoke<Array<{ id: string; role: string; content: string; timestamp: number; files?: string }>>("get_avatar_messages");
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

    fetchMessages();
    const timer = setInterval(fetchMessages, 500);
    return () => clearInterval(timer);
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
    const target = e.target as HTMLElement;
    if (target.closest(".chat-close-btn")) return;
    getCurrentWindow().startDragging();
  };

  return (
    <div className="chat-window">
      <div className="chat-header" onMouseDown={handleHeaderMouseDown}>
        <span className="chat-header-title">对话记录</span>
        <button
          className="chat-close-btn"
          onClick={handleClose}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">暂无对话</div>
        )}
        {messages.map((msg) => {
          const msgFiles: AttachedFile[] = msg.files ? (() => { try { return JSON.parse(msg.files); } catch { return []; } })() : [];
          return (
            <div key={msg.id} className={`chat-msg ${msg.role}`}>
              <div className="chat-msg-avatar">
                {msg.role === "user" ? "👤" : <img src="/bot.svg" alt="bot" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div className="chat-msg-content">
                <div className="chat-msg-bubble">
                  {msgFiles.length > 0 && (
                    <div className="chat-msg-files">
                      {msgFiles.map((f, i) => (
                        <div key={i} className="chat-msg-file-item">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                            <polyline points="13 2 13 9 20 9" />
                          </svg>
                          <span className="chat-msg-file-name">{f.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.content}
                </div>
                <div className="chat-msg-time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
