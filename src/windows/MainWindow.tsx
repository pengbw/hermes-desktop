import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
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
      setMessages([]);
      setActiveTab("chat");
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  };

  const handleSelectConversation = async (id: string) => {
    setCurrentConversationId(id);
  };

  const deleteConversation = async (id: string) => {
    try {
      await invoke("delete_conversation", { id });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
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
      // 如果是当前会话，同步更新 React 状态
      if (convId === currentConversationId) {
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
      if (convId === currentConversationId) {
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
                {msg.role === "user" ? "👤" : "🤖"}
              </div>
              <div className="message-bubble">
                {msg.thinking && (
                  <div className="thinking-block">
                    <span className="thinking-label">🤔 思考中...</span>
                    <pre className="thinking-content">{msg.thinking}</pre>
                  </div>
                )}
                <div className="message-text">{msg.content}</div>
              </div>
            </div>
          ))}
          {isStreaming && streamedContent && (
            <div className="message-row assistant">
              <div className="message-avatar">🤖</div>
              <div className="message-bubble">
                <div className="message-text">{streamedContent}</div>
                <span className="streaming-cursor">▊</span>
              </div>
            </div>
          )}
          {isThinking && (
            <div className="message-row assistant">
              <div className="message-avatar">🤖</div>
              <div className="message-bubble">
                <div className="thinking-block">
                  <span className="thinking-label">🤔 思考中...</span>
                  <pre className="thinking-content">{thinkingContent || "..."}</pre>
                </div>
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

  const markDirty = (field: string) => {
    setDirtyFields((prev) => new Set(prev).add(field));
  };

  useEffect(() => {
    loadConfig();
  }, []);

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
    } catch (err) {
      console.error("Failed to load hermes config:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (dirtyFields.size === 0) {
      setSaveMessage({ text: "没有修改需要保存", type: "success" });
      setTimeout(() => setSaveMessage(null), 2000);
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      const fieldMap: Record<string, string> = {
        model: model,
        "model.provider": provider,
        "model.base_url": baseUrl,
        "agent.max_turns": String(maxTurns),
        "display.personality": personality,
        "display.show_reasoning": String(showReasoning),
        "terminal.backend": terminalBackend,
        "terminal.timeout": String(terminalTimeout),
        "compression.enabled": String(compressionEnabled),
        "memory.memory_enabled": String(memoryEnabled),
        "tts.provider": ttsProvider,
      };

      const configKeyMap: Record<string, string> = {
        model: "model",
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

      for (const field of dirtyFields) {
        const configKey = configKeyMap[field];
        const value = fieldMap[configKey];
        if (configKey && value !== undefined) {
          await invoke<string>("set_hermes_config", { key: configKey, value });
        }
      }

      setSaveMessage({ text: `已保存 ${dirtyFields.size} 项配置`, type: "success" });
      setDirtyFields(new Set());
      // 重新加载以确认
      await loadConfig();
    } catch (err) {
      console.error("Failed to save config:", err);
      setSaveMessage({ text: `保存失败: ${err}`, type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
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
        <div className="settings-section">
          <h3>🤖 模型配置</h3>
          <div className="settings-form">
            <div className="form-group">
              <label>
                模型名称
                {dirtyFields.has("model") && <span className="dirty-badge">已修改</span>}
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => { setModel(e.target.value); markDirty("model"); }}
                placeholder="anthropic/claude-sonnet-4"
              />
            </div>
            <div className="form-group">
              <label>
                Provider
                {dirtyFields.has("provider") && <span className="dirty-badge">已修改</span>}
              </label>
              <select value={provider} onChange={(e) => { setProvider(e.target.value); markDirty("provider"); }}>
                <option value="nvidia">NVIDIA NIM</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="nous">Nous</option>
                <option value="deepseek">DeepSeek</option>
                <option value="ollama">Ollama (本地)</option>
                <option value="minimax">MiniMax</option>
                <option value="minimax-cn">MiniMax (中国)</option>
                <option value="zai">Z.AI / GLM</option>
                <option value="kimi">Kimi</option>
              </select>
            </div>
            <div className="form-group">
              <label>
                API Base URL
                {dirtyFields.has("baseUrl") && <span className="dirty-badge">已修改</span>}
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); markDirty("baseUrl"); }}
                placeholder="https://api.openai.com/v1"
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
        </div>

        {/* 显示与交互 */}
        <div className="settings-section">
          <h3>🎨 显示与交互</h3>
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
        </div>

        {/* 终端 & 系统 */}
        <div className="settings-section">
          <h3>🖥️ 终端与系统</h3>
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
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="settings-save-bar">
        <span className="dirty-count">
          {dirtyFields.size > 0 ? `${dirtyFields.size} 项待保存` : "无修改"}
        </span>
        <button
          className="save-btn"
          onClick={saveConfig}
          disabled={saving || dirtyFields.size === 0}
        >
          {saving ? "保存中..." : "💾 保存配置"}
        </button>
      </div>
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
