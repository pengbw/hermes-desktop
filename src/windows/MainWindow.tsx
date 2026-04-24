import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./MainWindow.css";

type Tab = "home" | "chat" | "settings" | "skills";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  timestamp: number;
}

const DEFAULT_TAB = "home";

export default function MainWindow() {
  const [activeTab, setActiveTab] = useState<Tab>(DEFAULT_TAB);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingContent, setThinkingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // 从 URL 读取 tab 参数
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Tab | null;
    if (tab && ["home", "chat", "settings", "skills"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setIsThinking(true);
    setThinkingContent("");

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const response = await invoke<string>("chat_with_hermes", {
        message: userMsg.content,
      });
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `错误: ${err}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      setThinkingContent("");
    }
  };

  return (
    <div className="main-window">
      {/* 标题栏 */}
      <div className="title-bar" data-tauri-drag-region>
        <span className="title-text">Hi 主人您好，我是你的助理 小跃</span>
        <div className="window-controls">
          <button
            className="win-btn minimize"
            onClick={() => getCurrentWindow().minimize()}
          >
            ─
          </button>
          <button
            className="win-btn maximize"
            onClick={() => getCurrentWindow().toggleMaximize()}
          >
            □
          </button>
          <button
            className="win-btn close"
            onClick={() => getCurrentWindow().close()}
          >
            ×
          </button>
        </div>
      </div>

      {/* Tab 导航 */}
      <nav className="tab-nav">
        {(["home", "chat", "settings", "skills"] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </nav>

      {/* 内容区 */}
      <div className="content-area">
        {activeTab === "home" && <HomePanel />}
        {activeTab === "chat" && (
          <ChatPanel
            messages={messages}
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            isStreaming={isStreaming}
            isThinking={isThinking}
            thinkingContent={thinkingContent}
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

// ── 首页 ──
function HomePanel() {
  return (
    <div className="panel home-panel">
      <div className="home-avatar">
        <div className="home-avatar-circle">
          <span className="home-avatar-emoji">🎭</span>
        </div>
        <h2>小跃</h2>
        <p>你的 AI 助理，随时待命</p>
      </div>
      <div className="home-quick-actions">
        <button className="quick-action-btn" onClick={() => window.location.search = "?tab=chat"}>
          🗨️ 开始对话
        </button>
        <button className="quick-action-btn" onClick={() => window.location.search = "?tab=settings"}>
          ⚙️ 模型设置
        </button>
        <button className="quick-action-btn" onClick={() => window.location.search = "?tab=skills"}>
          📦 技能中心
        </button>
      </div>
      <div className="home-stats">
        <div className="stat-card">
          <span className="stat-num">v0.1.0</span>
          <span className="stat-label">版本</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">●</span>
          <span className="stat-label">Agent 状态</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">-</span>
          <span className="stat-label">会话数</span>
        </div>
      </div>
    </div>
  );
}

// ── 对话 ──
interface ChatPanelProps {
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  sendMessage: () => void;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
}

function ChatPanel({ messages, input, setInput, sendMessage, isStreaming, isThinking, thinkingContent }: ChatPanelProps) {
  return (
    <div className="panel chat-panel">
      <div className="messages-list">
        {messages.length === 0 && (
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
      </div>
      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
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
  );
}

// ── 设置 ──
function SettingsPanel() {
  const [model, setModel] = useState("deepseek-v4-flash");
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [temperature, setTemperature] = useState(0.7);

  return (
    <div className="panel settings-panel">
      <h2>⚙️ 模型配置</h2>
      <div className="settings-form">
        <div className="form-group">
          <label>Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama">Ollama (本地)</option>
          </select>
        </div>
        <div className="form-group">
          <label>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </div>
        <div className="form-group">
          <label>API Endpoint</label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.deepseek.com"
          />
        </div>
        <div className="form-group">
          <label>Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-v4-flash"
          />
        </div>
        <div className="form-group">
          <label>Temperature: {temperature}</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
          />
        </div>
        <button className="save-btn">保存配置</button>
      </div>
    </div>
  );
}

// ── 技能中心 ──
function SkillsPanel() {
  return (
    <div className="panel skills-panel">
      <h2>📦 技能中心</h2>
      <div className="skills-grid">
        <div className="skill-card">
          <span className="skill-icon">🗂️</span>
          <h3>代码助手</h3>
          <p>编程问题解答、代码审查、调试支持</p>
        </div>
        <div className="skill-card">
          <span className="skill-icon">📝</span>
          <h3>写作润色</h3>
          <p>文章润色、语法纠正、文风优化</p>
        </div>
        <div className="skill-card">
          <span className="skill-icon">🌐</span>
          <h3>翻译助手</h3>
          <p>多语言翻译、语境理解</p>
        </div>
        <div className="skill-card">
          <span className="skill-icon">📊</span>
          <h3>数据分析</h3>
          <p>数据清洗、统计分析、可视化</p>
        </div>
      </div>
      <button className="add-skill-btn">+ 添加技能</button>
    </div>
  );
}
