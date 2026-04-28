import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import GestureEditor from "./GestureEditor";
import InstallGuidePanel from "./InstallGuide";
import "./MainWindow.css";

type Tab = "home" | "chat" | "settings" | "skills";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  hermesSessionId?: string;
  status: string;
  lastActiveAt: number;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_TAB = "home";

// 每个会话独立的聊天状态
interface ChatSessionState {
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
}

const DEFAULT_CHAT_STATE: ChatSessionState = {
  isStreaming: false,
  isThinking: false,
  thinkingContent: "",
  streamedContent: "",
};

export default function MainWindow() {
  const [activeTab, setActiveTab] = useState<Tab>(DEFAULT_TAB);
  const [showAvatar, setShowAvatar] = useState(false);
  const [hermesInstalled, setHermesInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    const checkInstall = async () => {
      try {
        const result = await invoke<{ installed: boolean; version: string; python: string }>("check_hermes_installed");
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

  // 控制 Avatar 独立窗口
  const toggleAvatarWindow = async () => {
    try {
      const visible = await invoke<boolean>("toggle_avatar_window");
      setShowAvatar(visible);
    } catch (err) {
      console.error("Failed to toggle avatar window:", err);
    }
  };
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingContent, setThinkingContent] = useState("");
  const [streamedContent, setStreamedContent] = useState("");
  const streamedContentRef = useRef("");
  const currentConversationIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 每个会话独立的聊天状态存储
  const chatStatesRef = useRef<Map<string, ChatSessionState>>(new Map());
  // 每个会话独立的消息存储
  const messagesMapRef = useRef<Map<string, Message[]>>(new Map());

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    // 保存当前会话的聊天状态

    if (currentConversationId) {
      // 恢复目标会话的聊天状态
      const savedState = chatStatesRef.current.get(currentConversationId) || DEFAULT_CHAT_STATE;
      setIsStreaming(savedState.isStreaming);
      setIsThinking(savedState.isThinking);
      setThinkingContent(savedState.thinkingContent);
      setStreamedContent(savedState.streamedContent);
      streamedContentRef.current = savedState.streamedContent;

      // 恢复目标会话的消息（优先从缓存，否则从DB加载）
      const cachedMessages = messagesMapRef.current.get(currentConversationId);
      if (cachedMessages) {
        setMessages(cachedMessages);
      } else {
        loadMessages(currentConversationId);
      }
    } else {
      setIsStreaming(false);
      setIsThinking(false);
      setStreamedContent("");
      streamedContentRef.current = "";
      setMessages([]);
    }
  }, [currentConversationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedContent]);

  // Listen for tab navigation events from avatar window
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

  // Listen for URL tab param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Tab | null;
    if (tab && ["home", "chat", "settings", "skills"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

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

  const createNewConversation = async () => {
    try {
      const result = await invoke<Conversation>("create_conversation", {
        req: {
          title: "新对话",
        },
      });
      setConversations((prev) => [result, ...prev]);
      setCurrentConversationId(result.id);
      currentConversationIdRef.current = result.id;
      setMessages([]);
      setInput("");
      setActiveTab("chat");
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  };

  const handleSelectConversation = async (id: string) => {
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
      setConversations((prev) =>
        prev.map(c => c.id === id ? { ...c, title } : c)
      );
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    let conversationId = currentConversationId;

    // Create new conversation if none selected
    if (!conversationId) {
      try {
        const conv = await invoke<Conversation>("create_conversation", {
          req: {
            title: input.trim().slice(0, 30) || "新对话",
          },
        });
        conversationId = conv.id;
        setConversations((prev) => [conv, ...prev]);
        setCurrentConversationId(conv.id);
        currentConversationIdRef.current = conv.id;
      } catch (err) {
        console.error("Failed to create conversation:", err);
        return;
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    // Save user message to DB（失败不阻塞）
    try {
      await invoke("create_message", {
        req: {
          conversationId: conversationId,
          role: "user",
          content: userMsg.content,
          thinking: null,
        },
      });
    } catch (err) {
      console.error("Failed to save user message:", err);
    }

    // 辅助函数：更新指定会话的聊天状态
    const updateChatState = (convId: string, update: Partial<ChatSessionState>) => {
      const current = chatStatesRef.current.get(convId) || { ...DEFAULT_CHAT_STATE };
      const next = { ...current, ...update };
      chatStatesRef.current.set(convId, next);
      // 如果是当前会话，同步更新 React 状态（用 ref 避免闭包陈旧值）
      if (convId === currentConversationIdRef.current) {
        if (update.isStreaming !== undefined) setIsStreaming(update.isStreaming);
        if (update.isThinking !== undefined) setIsThinking(update.isThinking);
        if (update.thinkingContent !== undefined) setThinkingContent(update.thinkingContent);
        if (update.streamedContent !== undefined) {
          setStreamedContent(update.streamedContent);
          streamedContentRef.current = update.streamedContent;
        }
      }
    };

    // 辅助函数：更新指定会话的消息
    const updateChatMessages = (convId: string, updater: (prev: Message[]) => Message[]) => {
      const prev = messagesMapRef.current.get(convId) || [];
      const next = updater(prev);
      messagesMapRef.current.set(convId, next);
      if (convId === currentConversationIdRef.current) {
        setMessages(next);
      }
    };

    setMessages((prev) => [...prev, userMsg]);
    messagesMapRef.current.set(conversationId, [...(messagesMapRef.current.get(conversationId) || []), userMsg]);
    setInput("");
    updateChatState(conversationId, { isStreaming: true, isThinking: true, thinkingContent: "", streamedContent: "" });

    // Listen for stream events
    const eventId = `chat_stream_${conversationId}`;

    const unlisten = await listen<{ chunk: string; done: boolean }>(eventId, (event) => {
      if (event.payload.done) {
        updateChatState(conversationId, { isStreaming: false, isThinking: false });
        unlisten();
      } else {
        const newContent = (chatStatesRef.current.get(conversationId)?.streamedContent || "") + "\n" + event.payload.chunk;
        updateChatState(conversationId, { streamedContent: newContent.trim(), isThinking: false });
      }
    });

    try {
      // 获取当前会话的 hermes session_id 用于恢复上下文
      const currentConv = conversations.find(c => c.id === conversationId);
      const hermesSessionId = currentConv?.hermesSessionId;

      // 使用非流式对话获取回复
      const result = await invoke<{ content: string; thinking: string | null; sessionId?: string }>("chat_with_hermes", {
        message: userMsg.content,
        sessionId: hermesSessionId || null,
      });

      updateChatState(conversationId, { isStreaming: false, isThinking: false, streamedContent: "" });

      // 添加 assistant 消息到会话
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.content,
        thinking: result.thinking || undefined,
        timestamp: Date.now(),
      };
      updateChatMessages(conversationId, (prev) => [...prev, assistantMsg]);
      unlisten();

      // 保存 hermes session_id（用于上下文恢复）
      if (result.sessionId && result.sessionId !== hermesSessionId) {
        try {
          await invoke("update_conversation_session_id", {
            id: conversationId,
            hermesSessionId: result.sessionId,
          });
          setConversations((prev) =>
            prev.map(c => c.id === conversationId ? { ...c, hermesSessionId: result.sessionId } : c)
          );
        } catch (err) {
          console.error("Failed to save session_id:", err);
        }
      }

      // 保存 assistant 消息到 DB（失败不影响显示）
      try {
        await invoke("create_message", {
          req: {
            conversationId: conversationId,
            role: "assistant",
            content: result.content,
            thinking: result.thinking || null,
          },
        });
      } catch (saveErr) {
        console.error("Failed to save assistant message:", saveErr);
      }

      loadConversations();
    } catch (err) {
      console.error("Chat error:", err);
      updateChatState(conversationId, { isStreaming: false, isThinking: false });
      unlisten();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="main-window">
      {hermesInstalled === null ? (
        <div className="loading-screen">
          <div className="spinner" />
          <p>正在检测 Hermes Agent...</p>
        </div>
      ) : !hermesInstalled ? (
        <InstallGuidePanel onInstalled={handleInstalled} />
      ) : (
      <>
      {/* 工具栏：菜单 + 数字人按钮 */}
      <div className="toolbar">
        <nav className="toolbar-nav">
          {(["home", "chat", "skills", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </nav>
        <button
          className={`avatar-toggle-btn ${showAvatar ? "active" : ""}`}
          onClick={toggleAvatarWindow}
          title="打开数字人"
        >
          <img src="/bot.svg" alt="数字人" className="toolbar-avatar-icon" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="content-area">
        {activeTab === "home" && (
          <HomePanel onStartChat={() => setActiveTab("chat")} conversationCount={conversations.length} />
        )}
        {activeTab === "chat" && (
          <ChatPanel
            conversations={conversations}
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={createNewConversation}
            onDeleteConversation={deleteConversation}
            onRenameConversation={renameConversation}
            messages={messages}
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            isStreaming={isStreaming}
            isThinking={isThinking}
            thinkingContent={thinkingContent}
            streamedContent={streamedContent}
            onKeyDown={handleKeyDown}
            messagesEndRef={messagesEndRef}
          />
        )}
        {activeTab === "settings" && <SettingsPanel />}
        {activeTab === "skills" && <SkillsPanel />}
      </div>
      </>
      )}
    </div>
  );
}

const tabLabels: Record<Tab, string> = {
  home: "🏠 首页",
  chat: "🗨️ 对话",
  settings: "⚙️ 设置",
  skills: "📦 技能中心",
};

// ── Hermes Agent 信息类型 ──
interface HermesInfo {
  installed: boolean;
  running: boolean;
  version: string;
  python: string;
  model: string;
  provider: string;
  project_path: string;
  api_keys: { name: string; configured: boolean }[];
}

// ── 首页 ──
function HomePanel({ onStartChat, conversationCount }: { onStartChat: () => void; conversationCount: number }) {
  const [hermesInfo, setHermesInfo] = useState<HermesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHermesInfo = async () => {
    try {
      const info = await invoke<HermesInfo>("get_hermes_info");
      setHermesInfo(info);
    } catch (err) {
      console.error("Failed to get hermes info:", err);
      setHermesInfo(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHermesInfo();
    // 每 30s 自动刷新状态
    const timer = setInterval(loadHermesInfo, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadHermesInfo();
  };

  const isOnline = hermesInfo?.installed && hermesInfo?.running;
  const versionShort = hermesInfo?.version?.match(/v[\d.]+/)?.[0] || "-";
  const configuredKeys = hermesInfo?.api_keys?.filter(k => k.configured) || [];

  return (
    <div className="panel home-panel">
      <div className="home-avatar">
        <div className="home-avatar-circle">
          <img src="/bot.svg" alt="小跃" className="home-avatar-icon" />
        </div>
        <h2>小跃</h2>
        <p>你的 AI 助理，随时待命</p>
      </div>

      <div className="home-quick-actions">
        <button className="quick-action-btn" onClick={onStartChat}>
          🗨️ 开始对话
        </button>
        <button className="quick-action-btn" onClick={() => window.location.search = "?tab=settings"}>
          ⚙️ 模型设置
        </button>
        <button className="quick-action-btn" onClick={() => window.location.search = "?tab=skills"}>
          📦 技能中心
        </button>
      </div>

      {/* Agent 状态概览 */}
      <div className="home-stats">
        <div className="stat-card">
          <span className="stat-num">{loading ? "..." : versionShort}</span>
          <span className="stat-label">Agent 版本</span>
        </div>
        <div className="stat-card">
          <span className={`stat-num status-dot ${isOnline ? "online" : "offline"}`}>
            {loading ? "..." : isOnline ? "● 在线" : "● 离线"}
          </span>
          <span className="stat-label">Agent 状态</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{conversationCount}</span>
          <span className="stat-label">会话数</span>
        </div>
      </div>

      {/* Agent 详细信息卡片 */}
      {hermesInfo && hermesInfo.installed && (
        <div className="agent-info-section">
          <div className="agent-info-header">
            <h3>🤖 Hermes Agent</h3>
            <button
              className="refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? "刷新中..." : "🔄 刷新"}
            </button>
          </div>
          <div className="agent-info-grid">
            <div className="agent-info-item">
              <span className="info-label">版本</span>
              <span className="info-value">{hermesInfo.version || "-"}</span>
            </div>
            <div className="agent-info-item">
              <span className="info-label">模型</span>
              <span className="info-value highlight">{hermesInfo.model || "未配置"}</span>
            </div>
            <div className="agent-info-item">
              <span className="info-label">Provider</span>
              <span className="info-value">{hermesInfo.provider || "未配置"}</span>
            </div>
            <div className="agent-info-item">
              <span className="info-label">Python</span>
              <span className="info-value">{hermesInfo.python || "-"}</span>
            </div>
            <div className="agent-info-item full-width">
              <span className="info-label">项目路径</span>
              <span className="info-value mono">{hermesInfo.project_path || "-"}</span>
            </div>
          </div>

          {/* API Keys 状态 */}
          {hermesInfo.api_keys.length > 0 && (
            <div className="api-keys-section">
              <h4>🔑 API Keys ({configuredKeys.length}/{hermesInfo.api_keys.length})</h4>
              <div className="api-keys-grid">
                {hermesInfo.api_keys.map((key) => (
                  <div key={key.name} className={`api-key-badge ${key.configured ? "configured" : "missing"}`}>
                    <span className="key-indicator">{key.configured ? "✓" : "✗"}</span>
                    <span className="key-name">{key.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Agent 未安装提示 */}
      {hermesInfo && !hermesInfo.installed && (
        <div className="agent-not-found">
          <span className="warning-icon">⚠️</span>
          <h3>Hermes Agent 未安装</h3>
          <p>请先安装 Hermes Agent 以使用对话功能</p>
          <code>pip install hermes-agent</code>
        </div>
      )}
    </div>
  );
}

// ── 对话 ──
interface ChatPanelProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  sendMessage: () => void;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
  onKeyDown: (e: React.KeyboardEvent) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
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
  onKeyDown,
  messagesEndRef,
}: ChatPanelProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameConversation(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const renderConvItem = (conv: Conversation, extraClass: string = "") => {
    const isRenaming = renamingId === conv.id;
    return (
      <div
        key={conv.id}
        className={`conversation-item ${extraClass} ${conv.id === currentConversationId ? "active" : ""}`}
        onClick={() => !isRenaming && onSelectConversation(conv.id)}
        onDoubleClick={(e) => { e.stopPropagation(); startRename(conv); }}
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="conv-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenamingId(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="conv-title">{conv.title}</span>
        )}
        <button
          className="conv-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteConversation(conv.id);
          }}
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <div className="chat-layout">
      {/* 侧边栏 - 对话列表 */}
      <div className="chat-sidebar">
        <button className="new-chat-btn" onClick={onNewConversation}>
          + 新对话
        </button>
        <div className="conversation-list">
          {conversations.map((conv) => renderConvItem(conv))}
        </div>
      </div>

      {/* 主聊天区 */}
      <div className="chat-main">
        <div className="messages-list">
          {messages.length === 0 && !isStreaming && (
            <div className="empty-chat">
              <span>🗨️ 开始和小跃对话吧</span>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === "user" ? "👤" : <img src="/bot.svg" alt="bot" className="message-avatar-img" />}
              </div>
              <div className="message-bubble">
                {msg.thinking && (
                  <div className="thinking-block">
                    <span className="thinking-label thinking-label-done">思考过程</span>
                    <pre className="thinking-content">{msg.thinking}</pre>
                  </div>
                )}
                <div className="message-text">{msg.content}</div>
              </div>
            </div>
          ))}
          {isStreaming && streamedContent && (
            <div className="message-row assistant">
              <div className="message-avatar"><img src="/bot.svg" alt="bot" className="message-avatar-img" /></div>
              <div className="message-bubble">
                <div className="message-text">{streamedContent}</div>
                <span className="streaming-cursor">▊</span>
              </div>
            </div>
          )}
          {isThinking && (
            <div className="message-row assistant">
              <div className="message-avatar"><img src="/bot.svg" alt="bot" className="message-avatar-img" /></div>
              <div className="thinking-block">
                <span className="thinking-label">
                    思考中
                    <span className="thinking-dots">
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                    </span>
                  </span>
                {thinkingContent && <pre className="thinking-content">{thinkingContent}</pre>}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="chat-input-area">
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
            rows={1}
            disabled={isStreaming}
          />
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
          >
            {isStreaming ? "..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 设置 ──
interface HermesConfigData {
  model: string;
  provider: string;
  base_url: string;
  max_turns: number;
  personality: string;
  show_reasoning: boolean;
  timezone: string;
  terminal_backend: string;
  terminal_timeout: number;
  compression_enabled: boolean;
  memory_enabled: boolean;
  tts_provider: string;
  config_path: string;
  env_path: string;
}

interface AvatarGesture {
  id: string;
  name: string;
  duration: number;
  lookAtX: number;
  lookAtY: number;
  tilt: number;
  targetJson: string;
  source: string;
  createdAt: number;
  updatedAt: number;
}

function SettingsPanel() {
  const [config, setConfig] = useState<HermesConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // 可编辑字段的本地状态
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [maxTurns, setMaxTurns] = useState(90);
  const [personality, setPersonality] = useState("default");
  const [showReasoning, setShowReasoning] = useState(false);
  const [terminalBackend, setTerminalBackend] = useState("local");
  const [terminalTimeout, setTerminalTimeout] = useState(180);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [ttsProvider, setTtsProvider] = useState("edge");

  // 跟踪哪些字段被修改了
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  // 折叠状态
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // 供应商管理
  interface Provider {
    id: string;
    name: string;
    value: string;
    baseUrl: string;
    apiKeyEnv: string;
    apiKey: string;
    isBuiltin: boolean;
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
  }

  interface ModelItem {
    id: string;
    ownedBy?: string;
  }

  const [providers, setProviders] = useState<Provider[]>([]);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [providerForm, setProviderForm] = useState({ name: "", value: "", baseUrl: "", apiKeyEnv: "", apiKey: "" });
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelList, setModelList] = useState<ModelItem[]>([]);
  const [modelListLoading, setModelListLoading] = useState(false);

  const [gestures, setGestures] = useState<AvatarGesture[]>([]);
  const [showGestureModal, setShowGestureModal] = useState(false);
  const [editingGesture, setEditingGesture] = useState<AvatarGesture | null>(null);
  const [gestureReadOnly, setGestureReadOnly] = useState(false);
  const [gestureForm, setGestureForm] = useState({
    name: "", duration: 1000, lookAtX: 0, lookAtY: 0, tilt: 0, targetJson: "{}"
  });
  const gestureFileInputRef = useRef<HTMLInputElement>(null);

  const markDirty = (field: string) => {
    setDirtyFields((prev) => new Set(prev).add(field));
  };

  const loadProviders = async () => {
    try {
      const list = await invoke<Provider[]>("list_providers");
      setProviders(list);
    } catch (err) {
      console.error("Failed to load providers:", err);
    }
  };

  const fetchModelList = async (providerValue: string) => {
    setModelList([]);
    setModelListLoading(true);
    try {
      const list = await invoke<ModelItem[]>("list_models", { providerValue });
      setModelList(list);
    } catch (err) {
      console.error("Failed to fetch model list:", err);
      setModelList([]);
    } finally {
      setModelListLoading(false);
    }
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    markDirty("provider");
    const found = providers.find(p => p.value === newProvider);
    if (found) {
      setBaseUrl(found.baseUrl);
      markDirty("baseUrl");
    }
    fetchModelList(newProvider);
  };

  const handleSaveProvider = async () => {
    try {
      if (editingProvider && editingProvider.id) {
        await invoke("update_provider", {
          req: {
            id: editingProvider.id,
            name: providerForm.name,
            baseUrl: providerForm.baseUrl,
            apiKeyEnv: providerForm.apiKeyEnv,
            apiKey: providerForm.apiKey,
          }
        });
      } else {
        await invoke("create_provider", {
          req: {
            name: providerForm.name,
            value: providerForm.value,
            baseUrl: providerForm.baseUrl,
            apiKeyEnv: providerForm.apiKeyEnv,
            apiKey: providerForm.apiKey,
          }
        });
      }
      setShowProviderModal(false);
      setEditingProvider(null);
      loadProviders();
    } catch (e) {
      alert("保存供应商失败: " + String(e));
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm("确定删除该供应商吗？")) return;
    try {
      await invoke("delete_provider", { id });
      loadProviders();
    } catch (e) {
      alert("删除供应商失败: " + String(e));
    }
  };

  const openEditProvider = (p: Provider) => {
    setEditingProvider(p);
    setProviderForm({
      name: p.name,
      value: p.value,
      baseUrl: p.baseUrl,
      apiKeyEnv: p.apiKeyEnv,
      apiKey: p.apiKey,
    });
    setShowApiKey(false);
  };

  const openNewProvider = () => {
    setEditingProvider({ id: "", name: "", value: "", baseUrl: "", apiKeyEnv: "", apiKey: "", isBuiltin: false, sortOrder: 0, createdAt: 0, updatedAt: 0 });
    setProviderForm({ name: "", value: "", baseUrl: "", apiKeyEnv: "", apiKey: "" });
    setShowApiKey(false);
  };

  const closeProviderModal = () => {
    setShowProviderModal(false);
    setEditingProvider(null);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // 按分区定义字段归属
  const SECTION_FIELDS: Record<string, string[]> = {
    model: ["model", "provider", "baseUrl", "maxTurns"],
    display: ["personality", "showReasoning", "ttsProvider"],
    terminal: ["terminalBackend", "terminalTimeout", "compressionEnabled", "memoryEnabled"],
  };

  const sectionDirtyCount = (section: string) => {
    return (SECTION_FIELDS[section] || []).filter(f => dirtyFields.has(f)).length;
  };

  const saveSectionConfig = async (section: string) => {
    const sectionFields = SECTION_FIELDS[section] || [];
    const fieldsToSave = sectionFields.filter(f => dirtyFields.has(f));
    if (fieldsToSave.length === 0) {
      setSaveMessage({ text: "没有修改需要保存", type: "success" });
      setTimeout(() => setSaveMessage(null), 2000);
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      const configKeyMap: Record<string, string> = {
        model: "model.default",
        provider: "model.provider",
        baseUrl: "model.base_url",
        maxTurns: "agent.max_turns",
        personality: "display.personality",
        showReasoning: "display.show_reasoning",
        terminalBackend: "terminal.backend",
        terminalTimeout: "terminal.timeout",
        compressionEnabled: "compression.enabled",
        memoryEnabled: "memory.memory_enabled",
        ttsProvider: "tts.provider",
      };
      const fieldValueMap: Record<string, string> = {
        model, provider, baseUrl,
        maxTurns: String(maxTurns),
        personality,
        showReasoning: String(showReasoning),
        terminalBackend,
        terminalTimeout: String(terminalTimeout),
        compressionEnabled: String(compressionEnabled),
        memoryEnabled: String(memoryEnabled),
        ttsProvider,
      };

      for (const field of fieldsToSave) {
        const configKey = configKeyMap[field];
        const value = fieldValueMap[field];
        if (configKey && value !== undefined) {
          await invoke<string>("set_hermes_config", { key: configKey, value });
        }
      }

      setSaveMessage({ text: `已保存 ${fieldsToSave.length} 项配置`, type: "success" });
      setDirtyFields((prev) => {
        const next = new Set(prev);
        fieldsToSave.forEach(f => next.delete(f));
        return next;
      });
    } catch (err) {
      console.error("Failed to save config:", err);
      setSaveMessage({ text: `保存失败: ${err}`, type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  useEffect(() => {
    loadConfig();
    loadGestures();
    loadProviders();
  }, []);

  const loadGestures = async () => {
    try {
      const list = await invoke<AvatarGesture[]>("get_avatar_gestures");
      setGestures(list);
    } catch (err) {
      console.error("Failed to load gestures:", err);
    }
  };

  const handleImportGestureJson = async () => {
    const fileInput = gestureFileInputRef.current;
    if (!fileInput) return;
    fileInput.value = '';
    fileInput.accept = '.json';
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);

        let poseData: Record<string, { position: number[]; rotation: number[] }> = {};

        if (imported.pose && imported.vrmMetaVersion !== undefined) {
          poseData = imported.pose;
        } else {
          for (const [key, val] of Object.entries(imported)) {
            if (val && typeof val === 'object') {
              const v = val as any;
              if (Array.isArray(v.rotation) && v.rotation.length === 4) {
                poseData[key] = { position: v.position || [0, 0, 0], rotation: v.rotation };
              } else if (typeof v.w === 'number') {
                poseData[key] = { position: [0, 0, 0], rotation: [v.x ?? 0, v.y ?? 0, v.z ?? 0, v.w] };
              }
            }
          }
        }

        if (Object.keys(poseData).length === 0) {
          alert('未识别到有效的骨骼姿势数据，请检查 JSON 格式');
          return;
        }

        const gestureName = imported.name || file.name.replace(/\.json$/i, '') || '导入的动作';
        const duration = imported.duration || 5000;
        const lookAtX = imported.lookAtX ?? (imported.gages?.yaw ?? 0);
        const lookAtY = imported.lookAtY ?? (imported.gages?.pitch ?? 0);
        const tilt = imported.tilt ?? 0;
        const targetJson = JSON.stringify(poseData);

        await invoke("create_avatar_gesture", {
          req: { name: gestureName, targetJson, duration, lookAtX, lookAtY, tilt }
        });
        await loadGestures();
        alert(`成功导入动作: ${gestureName}`);
      } catch (e) {
        console.error('导入失败:', e);
        alert('导入失败: ' + String(e));
      }
    };
    fileInput.click();
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const result = await invoke<HermesConfigData>("get_hermes_config");
      setConfig(result);
      setModel(result.model);
      setProvider(result.provider);
      setBaseUrl(result.base_url);
      setMaxTurns(result.max_turns);
      setPersonality(result.personality);
      setShowReasoning(result.show_reasoning);
      setTerminalBackend(result.terminal_backend);
      setTerminalTimeout(result.terminal_timeout);
      setCompressionEnabled(result.compression_enabled);
      setMemoryEnabled(result.memory_enabled);
      setTtsProvider(result.tts_provider);
      setDirtyFields(new Set());
      if (result.provider) {
        fetchModelList(result.provider);
      }
    } catch (err) {
      console.error("Failed to load hermes config:", err);
    } finally {
      setLoading(false);
    }
  };



  if (loading) {
    return (
      <div className="panel settings-panel">
        <div className="skills-loading">
          <span className="loading-spinner">⏳</span>
          <p>正在加载配置...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel settings-panel">
      <div className="settings-header">
        <h2>⚙️ Hermes Agent 设置</h2>
        <div className="settings-actions">
          <button className="refresh-btn" onClick={loadConfig}>🔄 刷新</button>
        </div>
      </div>

      {/* 配置文件路径提示 */}
      {config && (
        <div className="config-path-info">
          <span className="path-label">配置文件:</span>
          <span className="path-value">{config.config_path}</span>
        </div>
      )}

      {/* 保存提示 */}
      {saveMessage && (
        <div className={`save-toast ${saveMessage.type}`}>
          {saveMessage.type === "success" ? "✅" : "❌"} {saveMessage.text}
        </div>
      )}

      <div className="settings-sections">
        {/* 模型配置 */}
        <div className={`settings-group ${collapsedSections.has("model") ? "collapsed" : ""}`}>
          <div className="settings-group-header" onClick={() => toggleSection("model")}>
            <h3>🤖 模型配置
              {sectionDirtyCount("model") > 0 && <span className="dirty-badge">{sectionDirtyCount("model")} 项已修改</span>}
            </h3>
            <span className="collapse-arrow">▾</span>
          </div>
          <div className="settings-group-body">
            <div className="settings-form">
              <div className="form-group">
                <label>
                  供应商
                  {dirtyFields.has("provider") && <span className="dirty-badge">已修改</span>}
                </label>
                <div className="provider-select-row">
                  <select value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
                    <option value="">请选择供应商</option>
                    {providers.map(p => (
                      <option key={p.id} value={p.value}>{p.name}</option>
                    ))}
                  </select>
                  <button type="button" className="provider-manage-btn" onClick={() => { setEditingProvider(null); setShowProviderModal(true); }} title="管理供应商">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>
                  模型名称
                  {dirtyFields.has("model") && <span className="dirty-badge">已修改</span>}
                </label>
                <div className="model-select-row">
                  {modelList.length > 0 ? (
                    <select value={model} onChange={(e) => { setModel(e.target.value); markDirty("model"); }}>
                      <option value="">请选择模型</option>
                      {model && !modelList.some(m => m.id === model) && (
                        <option value={model}>{model} (当前)</option>
                      )}
                      {modelList.map(m => (
                        <option key={m.id} value={m.id}>{m.id}{m.ownedBy ? ` (${m.ownedBy})` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => { setModel(e.target.value); markDirty("model"); }}
                      placeholder="选择供应商后加载模型列表，或手动输入模型ID"
                    />
                  )}
                  {modelListLoading && <span style={{ fontSize: '12px', color: '#999' }}>⏳ 加载模型列表中...</span>}
                  {modelList.length === 0 && !modelListLoading && provider && (
                    <button type="button" className="save-btn" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => fetchModelList(provider)}>刷新模型列表</button>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>
                  API Base URL
                  {dirtyFields.has("baseUrl") && <span className="dirty-badge">已修改</span>}
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  readOnly
                  placeholder="根据供应商自动填充"
                  style={{ background: '#F5F5F7', color: '#666' }}
                />
              </div>
              <div className="form-group">
                <label>
                  最大轮次 (Max Turns): {maxTurns}
                  {dirtyFields.has("maxTurns") && <span className="dirty-badge">已修改</span>}
                </label>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={maxTurns}
                  onChange={(e) => { setMaxTurns(parseInt(e.target.value)); markDirty("maxTurns"); }}
                />
              </div>
            </div>
            <div className="section-save-bar">
              <button
                className="section-save-btn"
                onClick={() => saveSectionConfig("model")}
                disabled={saving || sectionDirtyCount("model") === 0}
              >
                {saving ? "保存中..." : "💾 保存模型配置"}
              </button>
            </div>
          </div>
        </div>

        {/* 显示与交互 */}
        <div className={`settings-group ${collapsedSections.has("display") ? "collapsed" : ""}`}>
          <div className="settings-group-header" onClick={() => toggleSection("display")}>
            <h3>🎨 显示与交互
              {sectionDirtyCount("display") > 0 && <span className="dirty-badge">{sectionDirtyCount("display")} 项已修改</span>}
            </h3>
            <span className="collapse-arrow">▾</span>
          </div>
          <div className="settings-group-body">
            <div className="settings-form">
              <div className="form-group">
                <label>
                  人格风格
                  {dirtyFields.has("personality") && <span className="dirty-badge">已修改</span>}
                </label>
                <select value={personality} onChange={(e) => { setPersonality(e.target.value); markDirty("personality"); }}>
                  <option value="default">默认</option>
                  <option value="kawaii">Kawaii</option>
                  <option value="professional">专业</option>
                  <option value="pirate">海盗</option>
                  <option value="zen">禅意</option>
                </select>
              </div>
              <div className="form-group">
                <label className="toggle-label">
                  <span>
                    显示推理过程
                    {dirtyFields.has("showReasoning") && <span className="dirty-badge">已修改</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={showReasoning}
                    onChange={(e) => { setShowReasoning(e.target.checked); markDirty("showReasoning"); }}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  TTS 语音引擎
                  {dirtyFields.has("ttsProvider") && <span className="dirty-badge">已修改</span>}
                </label>
                <select value={ttsProvider} onChange={(e) => { setTtsProvider(e.target.value); markDirty("ttsProvider"); }}>
                  <option value="edge">Edge TTS</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="openai">OpenAI TTS</option>
                  <option value="xai">xAI</option>
                  <option value="mistral">Mistral</option>
                </select>
              </div>
            </div>
            <div className="section-save-bar">
              <button
                className="section-save-btn"
                onClick={() => saveSectionConfig("display")}
                disabled={saving || sectionDirtyCount("display") === 0}
              >
                {saving ? "保存中..." : "💾 保存显示配置"}
              </button>
            </div>
          </div>
        </div>

        {/* 终端 & 系统 */}
        <div className={`settings-group ${collapsedSections.has("terminal") ? "collapsed" : ""}`}>
          <div className="settings-group-header" onClick={() => toggleSection("terminal")}>
            <h3>🖥️ 终端与系统
              {sectionDirtyCount("terminal") > 0 && <span className="dirty-badge">{sectionDirtyCount("terminal")} 项已修改</span>}
            </h3>
            <span className="collapse-arrow">▾</span>
          </div>
          <div className="settings-group-body">
            <div className="settings-form">
              <div className="form-group">
                <label>
                  终端后端
                  {dirtyFields.has("terminalBackend") && <span className="dirty-badge">已修改</span>}
                </label>
                <select value={terminalBackend} onChange={(e) => { setTerminalBackend(e.target.value); markDirty("terminalBackend"); }}>
                  <option value="local">本地 (local)</option>
                  <option value="docker">Docker</option>
                  <option value="modal">Modal</option>
                  <option value="daytona">Daytona</option>
                </select>
              </div>
              <div className="form-group">
                <label>
                  命令超时 (秒): {terminalTimeout}
                  {dirtyFields.has("terminalTimeout") && <span className="dirty-badge">已修改</span>}
                </label>
                <input
                  type="range"
                  min="30"
                  max="600"
                  step="30"
                  value={terminalTimeout}
                  onChange={(e) => { setTerminalTimeout(parseInt(e.target.value)); markDirty("terminalTimeout"); }}
                />
              </div>
              <div className="form-group">
                <label className="toggle-label">
                  <span>
                    上下文压缩
                    {dirtyFields.has("compressionEnabled") && <span className="dirty-badge">已修改</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={compressionEnabled}
                    onChange={(e) => { setCompressionEnabled(e.target.checked); markDirty("compressionEnabled"); }}
                  />
                </label>
              </div>
              <div className="form-group">
                <label className="toggle-label">
                  <span>
                    记忆功能
                    {dirtyFields.has("memoryEnabled") && <span className="dirty-badge">已修改</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={memoryEnabled}
                    onChange={(e) => { setMemoryEnabled(e.target.checked); markDirty("memoryEnabled"); }}
                  />
                </label>
              </div>
            </div>
            <div className="section-save-bar">
              <button
                className="section-save-btn"
                onClick={() => saveSectionConfig("terminal")}
                disabled={saving || sectionDirtyCount("terminal") === 0}
              >
                {saving ? "保存中..." : "💾 保存终端配置"}
              </button>
            </div>
          </div>
        </div>

        <div className={`settings-group ${collapsedSections.has("gesture") ? "collapsed" : ""}`}>
          <div className="settings-group-header gesture-section-header" onClick={() => toggleSection("gesture")}>
            <h3>💃 数字人动作管理</h3>
            <div className="gesture-header-right">
              <button className="gesture-add-btn" onClick={(e) => {
                e.stopPropagation();
                setEditingGesture(null);
                setGestureForm({ name: "", duration: 1000, lookAtX: 0, lookAtY: 0, tilt: 0, targetJson: "{}" });
                setShowGestureModal(true);
              }}>
                <span className="gesture-add-icon">+</span>
                新增动作
              </button>
              <button className="gesture-add-btn gesture-import-btn" onClick={(e) => {
                e.stopPropagation();
                handleImportGestureJson();
              }} title="从 JSON 文件导入动作姿势数据">
                <span className="gesture-add-icon">📥</span>
                导入
              </button>
              <input type="file" ref={gestureFileInputRef} style={{ display: 'none' }} />
              <span className="collapse-arrow">▾</span>
            </div>
          </div>

          <div className="settings-group-body">
            {gestures.length === 0 && (
              <div className="gesture-empty">
                <span className="gesture-empty-icon">🎭</span>
                <p>暂无动作，点击上方按钮新增</p>
              </div>
            )}

            <div className="gesture-card-list">
              {gestures.map((g, index) => {
                const isSystem = g.source === "system";
                return (
                <div key={g.id} className="gesture-card" style={{ animationDelay: `${index * 0.05}s` }}>
                  <div className="gesture-card-left">
                    <div className="gesture-card-icon">
                      {g.name === "greeting" ? "👋" : g.name === "think" ? "🤔" : "🎭"}
                    </div>
                    <div className="gesture-card-info">
                      <div className="gesture-card-name-row">
                        <span className="gesture-card-name">{g.name}</span>
                        <span className={`gesture-source-tag ${isSystem ? "gesture-source-system" : "gesture-source-custom"}`}>
                          {isSystem ? "系统" : "自定义"}
                        </span>
                      </div>
                      <div className="gesture-card-tags">
                        <span className="gesture-tag gesture-tag-duration">⏱ {g.duration}ms</span>
                        {(g.lookAtX !== 0 || g.lookAtY !== 0) && (
                          <span className="gesture-tag gesture-tag-lookat">👁 {g.lookAtX},{g.lookAtY}</span>
                        )}
                        {g.tilt !== 0 && (
                          <span className="gesture-tag gesture-tag-tilt">↗ {g.tilt}</span>
                        )}
                        {(() => {
                          try {
                            const bones = JSON.parse(g.targetJson || "{}");
                            const activeBones = Object.entries(bones).filter(([, v]: [string, any]) => {
                              if (!v) return false;
                              if (Array.isArray(v.rotation) && v.rotation.length === 4) {
                                return v.rotation[0] !== 0 || v.rotation[1] !== 0 || v.rotation[2] !== 0 || v.rotation[3] !== 1;
                              }
                              if (typeof v.w === 'number') {
                                return v.x !== 0 || v.y !== 0 || v.z !== 0 || v.w !== 1;
                              }
                              return false;
                            });
                            return activeBones.map(([key]: [string, any]) => (
                              <span key={key} className="gesture-tag gesture-tag-bone">🦴 {key}</span>
                            ));
                          } catch { return null; }
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="gesture-card-actions">
                    <button className="gesture-action-btn gesture-action-view" onClick={() => {
                      setEditingGesture(g);
                      setGestureForm({ name: g.name, duration: g.duration, lookAtX: g.lookAtX, lookAtY: g.lookAtY, tilt: g.tilt, targetJson: g.targetJson });
                      setGestureReadOnly(true);
                      setShowGestureModal(true);
                    }} title="查看动作">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      查看
                    </button>
                    <button className="gesture-action-btn gesture-action-edit" disabled={isSystem} onClick={() => {
                      setEditingGesture(g);
                      setGestureForm({ name: g.name, duration: g.duration, lookAtX: g.lookAtX, lookAtY: g.lookAtY, tilt: g.tilt, targetJson: g.targetJson });
                      setGestureReadOnly(false);
                      setShowGestureModal(true);
                    }} title={isSystem ? "系统动作不可编辑" : "编辑动作"}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      编辑
                    </button>
                    <button className="gesture-action-btn gesture-action-delete" disabled={isSystem} onClick={async () => {
                      if (confirm(`删除动作「${g.name}」吗？`)) {
                        await invoke("delete_avatar_gesture", { id: g.id });
                        loadGestures();
                      }
                    }} title={isSystem ? "系统动作不可删除" : "删除动作"}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                      删除
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`settings-group ${collapsedSections.has("about") ? "collapsed" : ""}`}>
          <div className="settings-group-header" onClick={() => toggleSection("about")}>
            <h3>ℹ️ 关于</h3>
            <span className="settings-toggle-icon">{collapsedSections.has("about") ? "▸" : "▾"}</span>
          </div>
          <div className="settings-group-content">
            <div className="about-info">
              <div className="about-logo"><img src="/bot.svg" alt="Hermes" /></div>
              <div className="about-name">Hermes Desktop</div>
              <div className="about-version">版本 0.1.0</div>
              <div className="about-desc">AI 智能助手桌面客户端</div>
              <div className="about-meta">
                <div className="about-author">作者：西安跃行信息有限公司</div>
                <div className="about-email">邮箱：leapgo@yeah.net</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showGestureModal && (
        <GestureEditor
          gestureName={editingGesture ? gestureForm.name : ""}
          initialTargetJson={gestureForm.targetJson}
          duration={gestureForm.duration}
          lookAtX={gestureForm.lookAtX}
          lookAtY={gestureForm.lookAtY}
          tilt={gestureForm.tilt}
          readOnly={gestureReadOnly}
          onCancel={() => { setShowGestureModal(false); setGestureReadOnly(false); }}
          onSave={async (params) => {
            try {
              if (editingGesture) {
                await invoke("update_avatar_gesture", { req: { id: editingGesture.id, ...params } });
              } else {
                await invoke("create_avatar_gesture", { req: params });
              }
              setShowGestureModal(false);
              loadGestures();
            } catch (e) {
              alert("保存失败: " + String(e));
            }
          }}
        />
      )}

      {showProviderModal && (
        <div className="modal-overlay" onClick={closeProviderModal}>
          <div className="modal-content" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingProvider && editingProvider.id ? `编辑供应商: ${editingProvider.name}` : editingProvider ? "添加新供应商" : "供应商管理"}</h3>
              <button className="modal-close-btn" onClick={closeProviderModal}>✕</button>
            </div>

            {editingProvider ? (
              <div className="provider-form">
                <div className="form-group">
                  <label>名称</label>
                  <input type="text" value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} placeholder="如: OpenAI" />
                </div>
                {editingProvider.isBuiltin ? (
                  <div className="form-group">
                    <label>标识 (内置，不可修改)</label>
                    <input type="text" value={editingProvider.value} readOnly style={{ background: '#F5F5F7', color: '#999' }} />
                  </div>
                ) : (
                  <div className="form-group">
                    <label>标识 (value)</label>
                    <input type="text" value={providerForm.value} onChange={(e) => setProviderForm({ ...providerForm, value: e.target.value })} placeholder="如: openai" />
                  </div>
                )}
                <div className="form-group">
                  <label>API Base URL</label>
                  <input type="text" value={providerForm.baseUrl} onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
                </div>
                <div className="form-group">
                  <label>API Key 环境变量名</label>
                  <input type="text" value={providerForm.apiKeyEnv} onChange={(e) => setProviderForm({ ...providerForm, apiKeyEnv: e.target.value })} placeholder="OPENAI_API_KEY" />
                </div>
                <div className="form-group">
                  <label>API Key</label>
                  <div className="api-key-input-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={providerForm.apiKey}
                      onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                      placeholder="sk-..."
                    />
                    <button type="button" className="api-key-toggle-btn" onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
                <div className="provider-form-actions">
                  <button className="provider-cancel-btn" onClick={() => { setEditingProvider(null); }}>← 返回列表</button>
                  <button className="provider-save-btn" onClick={handleSaveProvider}>保存</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="provider-list">
                  {providers.map(p => (
                    <div key={p.id} className="provider-item">
                      <div className="provider-item-info">
                        <div className="provider-item-name">
                          {p.name}
                          {p.isBuiltin && <span style={{ fontSize: '10px', color: '#999', marginLeft: '4px' }}>[内置]</span>}
                          <span className={`api-key-badge ${p.apiKey ? 'configured' : 'missing'}`}>
                            {p.apiKey ? '密钥已配置' : '未配置密钥'}
                          </span>
                        </div>
                        <div className="provider-item-value">{p.value}</div>
                        {p.baseUrl && <div className="provider-item-url">{p.baseUrl}</div>}
                      </div>
                      <div className="provider-item-actions">
                        <button className="provider-edit-btn" onClick={() => openEditProvider(p)} title="编辑">✏️</button>
                        {!p.isBuiltin && (
                          <button className="provider-delete-btn" onClick={() => handleDeleteProvider(p.id)} title="删除">🗑️</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="provider-add-btn" onClick={() => { openNewProvider(); }}>
                  + 添加新供应商
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 技能中心 ──
interface SkillItem {
  name: string;
  category: string;
  source: string;
  trust: string;
}

interface SkillsResult {
  skills: SkillItem[];
  total: number;
  hub_installed: number;
  builtin: number;
  local: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  apple: "🍎",
  "autonomous-ai-agents": "🤖",
  creative: "🎨",
  "data-science": "📊",
  devops: "🔧",
  email: "📧",
  gaming: "🎮",
  github: "🐙",
  leisure: "🏖️",
  mcp: "🔌",
  media: "🎵",
  mlops: "⚡",
  "note-taking": "📝",
  productivity: "📋",
  "red-teaming": "🔴",
  research: "🔬",
  "smart-home": "🏠",
  "social-media": "📱",
  "software-development": "💻",
};

function SkillsPanel() {
  const [skillsResult, setSkillsResult] = useState<SkillsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const result = await invoke<SkillsResult>("list_hermes_skills");
      setSkillsResult(result);
      // 默认展开所有分类
      const categories = new Set(result.skills.map((s) => s.category || "未分类"));
      setExpandedCategories(categories);
    } catch (err) {
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // 过滤技能
  const filteredSkills = (skillsResult?.skills || []).filter((skill) => {
    const matchSearch =
      !searchQuery ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSource = filterSource === "all" || skill.source === filterSource;
    return matchSearch && matchSource;
  });

  // 按分类分组
  const groupedSkills: Record<string, SkillItem[]> = {};
  for (const skill of filteredSkills) {
    const cat = skill.category || "未分类";
    if (!groupedSkills[cat]) groupedSkills[cat] = [];
    groupedSkills[cat].push(skill);
  }

  const sortedCategories = Object.keys(groupedSkills).sort();

  return (
    <div className="panel skills-panel">
      <div className="skills-header">
        <h2>📦 技能中心</h2>
        <button className="refresh-btn" onClick={loadSkills} disabled={loading}>
          {loading ? "加载中..." : "🔄 刷新"}
        </button>
      </div>

      {/* 统计概览 */}
      {skillsResult && (
        <div className="skills-stats">
          <div className="skills-stat-badge total">
            <span className="stat-count">{skillsResult.total}</span>
            <span className="stat-text">全部</span>
          </div>
          <div className="skills-stat-badge builtin">
            <span className="stat-count">{skillsResult.builtin}</span>
            <span className="stat-text">内置</span>
          </div>
          <div className="skills-stat-badge local">
            <span className="stat-count">{skillsResult.local}</span>
            <span className="stat-text">本地</span>
          </div>
          <div className="skills-stat-badge hub">
            <span className="stat-count">{skillsResult.hub_installed}</span>
            <span className="stat-text">Hub</span>
          </div>
        </div>
      )}

      {/* 搜索和过滤 */}
      <div className="skills-toolbar">
        <input
          className="skills-search"
          type="text"
          placeholder="🔍 搜索技能名称或分类..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="skills-filter"
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        >
          <option value="all">全部来源</option>
          <option value="builtin">内置 (builtin)</option>
          <option value="local">本地 (local)</option>
          <option value="hub">Hub 安装</option>
        </select>
      </div>

      {/* 加载中 */}
      {loading && (
        <div className="skills-loading">
          <span className="loading-spinner">⏳</span>
          <p>正在加载技能列表...</p>
        </div>
      )}

      {/* 技能列表 - 按分类分组 */}
      {!loading && sortedCategories.length > 0 && (
        <div className="skills-categories">
          {sortedCategories.map((category) => (
            <div key={category} className="skill-category-group">
              <div
                className="category-header"
                onClick={() => toggleCategory(category)}
              >
                <div className="category-left">
                  <span className="category-icon">
                    {CATEGORY_ICONS[category] || "📂"}
                  </span>
                  <span className="category-name">{category}</span>
                  <span className="category-count">
                    {groupedSkills[category].length}
                  </span>
                </div>
                <span className={`category-arrow ${expandedCategories.has(category) ? "expanded" : ""}`}>
                  ▸
                </span>
              </div>

              {expandedCategories.has(category) && (
                <div className="category-skills">
                  {groupedSkills[category].map((skill) => (
                    <div key={skill.name} className="skill-item">
                      <div className="skill-info">
                        <span className="skill-name">{skill.name}</span>
                        <div className="skill-badges">
                          <span className={`source-badge ${skill.source}`}>
                            {skill.source}
                          </span>
                          {skill.trust !== skill.source && (
                            <span className={`trust-badge ${skill.trust}`}>
                              {skill.trust}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {!loading && filteredSkills.length === 0 && (
        <div className="skills-empty">
          <span>🔍</span>
          <p>{searchQuery ? "没有找到匹配的技能" : "暂无已安装技能"}</p>
        </div>
      )}
    </div>
  );
}
