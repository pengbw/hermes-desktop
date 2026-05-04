import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../contexts/ThemeContext";
import { useI18n } from "../contexts/I18nContext";
import GestureEditor from "./GestureEditor";
import InstallGuidePanel from "./InstallGuide";
import "./MainWindow.css";

type Tab = "home" | "chat" | "settings" | "skills";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  files?: string;
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
  toolProgress: string;
}

const DEFAULT_CHAT_STATE: ChatSessionState = {
  isStreaming: false,
  isThinking: false,
  thinkingContent: "",
  streamedContent: "",
  toolProgress: "",
};

export default function MainWindow() {
  const { t } = useI18n();
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
  const [toolProgress, setToolProgress] = useState("");
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
          title: t("chat.newConversation"),
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

  const sendMessageFromHome = async (cardPrompt: string, userText: string, homeFiles?: AttachedFile[]) => {
    if (isStreaming) return;
    const fullText = cardPrompt ? `${cardPrompt}\n\n${userText}` : userText;
    const hasFiles = homeFiles && homeFiles.length > 0;
    if (!fullText.trim() && !hasFiles) return;
    const displayContent = fullText.trim() || (hasFiles ? "请分析附件中的文件" : "");

    let sendContent = fullText.trim();
    if (hasFiles) {
      const nonImageFiles = homeFiles.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return !["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext || "");
      });
      if (nonImageFiles.length > 0) {
        const fileList = nonImageFiles.map((f) => `- ${f.name}: ${f.path}`).join("\n");
        sendContent = `${sendContent}\n\n附件文件路径：\n${fileList}`;
      }
    }
    const firstImage = hasFiles ? homeFiles.find((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext && ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext);
    }) : undefined;

    const filesJson = hasFiles ? JSON.stringify(homeFiles) : undefined;

    setActiveTab("chat");

    setTimeout(async () => {
      try {
        const conv = await invoke<Conversation>("create_conversation", {
          req: { title: userText.trim().slice(0, 30) || displayContent.slice(0, 30) },
        });
        const convId = conv.id;
        setConversations((prev) => [conv, ...prev]);
        currentConversationIdRef.current = convId;
        setCurrentConversationId(convId);

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
        } catch {}

        const cached = messagesMapRef.current.get(convId) || [];
        cached.push(userMsg);
        messagesMapRef.current.set(convId, cached);

        const updateChatState = (id: string, update: Partial<ChatSessionState>) => {
          const current = chatStatesRef.current.get(id) || { ...DEFAULT_CHAT_STATE };
          chatStatesRef.current.set(id, { ...current, ...update });
          if (id === currentConversationIdRef.current) {
            if (update.isStreaming !== undefined) setIsStreaming(update.isStreaming);
            if (update.isThinking !== undefined) setIsThinking(update.isThinking);
            if (update.thinkingContent !== undefined) setThinkingContent(update.thinkingContent);
            if (update.toolProgress !== undefined) setToolProgress(update.toolProgress);
            if (update.streamedContent !== undefined) { setStreamedContent(update.streamedContent); streamedContentRef.current = update.streamedContent; }
          }
        };

        const updateChatMessages = (id: string, updater: (prev: Message[]) => Message[]) => {
          const prev = messagesMapRef.current.get(id) || [];
          const next = updater(prev);
          messagesMapRef.current.set(id, next);
          if (id === currentConversationIdRef.current) {
            setMessages(next);
          }
        };

        setMessages(cached);
        updateChatState(convId, { isStreaming: true, isThinking: true, thinkingContent: "", streamedContent: "", toolProgress: "" });

        const eventId = `chat_stream_${convId}`;
        let fullContent = "";

        const unlisten = await listen<{
          chunk: string;
          done: boolean;
          event_type?: string;
          tool_name?: string;
          tool_label?: string;
        }>(eventId, (event) => {
          const { chunk, done, event_type, tool_label } = event.payload;

          if (done) {
            const assistantMsg: Message = {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: fullContent,
              timestamp: Date.now(),
            };
            updateChatMessages(convId, (prev) => [...prev, assistantMsg]);
            updateChatState(convId, { isStreaming: false, isThinking: false, toolProgress: "" });

            (async () => {
              try {
                await invoke("create_message", {
                  req: {
                    conversationId: convId,
                    role: "assistant",
                    content: fullContent,
                    thinking: null,
                  },
                });
                loadConversations();
              } catch (saveErr) {
                console.error("Failed to save assistant message:", saveErr);
              }
            })();

            unlisten();
          } else if (event_type === "tool_progress") {
            updateChatState(convId, { toolProgress: tool_label || chunk, isThinking: true });
          } else if (event_type === "error") {
            updateChatState(convId, { toolProgress: "", isThinking: false });
          } else {
            fullContent += chunk;
            updateChatState(convId, { streamedContent: fullContent, isThinking: false, toolProgress: "" });
          }
        });

        try {
          await invoke("chat_with_hermes_api", {
            message: sendContent,
            sessionId: null,
            model: null,
            provider: null,
            image: firstImage?.path || null,
            eventId: eventId,
          });
        } catch (err) {
          console.error("Chat API error:", err);
          updateChatState(convId, { isStreaming: false, isThinking: false, toolProgress: "" });
          unlisten();
        }
      } catch (err) {
        console.error("Failed to start chat from home:", err);
      }
    }, 50);
  };

  const sendMessage = async (attachedFiles?: string, model?: string, provider?: string, image?: string) => {
    if ((!input.trim() && !attachedFiles) || isStreaming) return;

    let conversationId = currentConversationId;

    // Create new conversation if none selected
    if (!conversationId) {
      try {
        const conv = await invoke<Conversation>("create_conversation", {
          req: {
            title: input.trim().slice(0, 30) || (attachedFiles ? t("chat.fileConversation") : t("chat.newConversation")),
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

    let messageContent = input.trim() || (attachedFiles ? "请分析附件中的文件" : "");
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
      } catch {}
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
      files: attachedFiles,
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
          files: attachedFiles || null,
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
        if (update.toolProgress !== undefined) setToolProgress(update.toolProgress);
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
    updateChatState(conversationId, { isStreaming: true, isThinking: true, thinkingContent: "", streamedContent: "", toolProgress: "" });

    const eventId = `chat_stream_${conversationId}`;
    let fullContent = "";

    const unlisten = await listen<{
      chunk: string;
      done: boolean;
      event_type?: string;
      tool_name?: string;
      tool_label?: string;
    }>(eventId, (event) => {
      const { chunk, done, event_type, tool_label } = event.payload;

      if (done) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: fullContent,
          timestamp: Date.now(),
        };
        updateChatMessages(conversationId, (prev) => [...prev, assistantMsg]);
        updateChatState(conversationId, { isStreaming: false, isThinking: false, toolProgress: "" });

        (async () => {
          try {
            await invoke("create_message", {
              req: {
                conversationId: conversationId,
                role: "assistant",
                content: fullContent,
                thinking: null,
              },
            });
            loadConversations();
          } catch (saveErr) {
            console.error("Failed to save assistant message:", saveErr);
          }
        })();

        unlisten();
      } else if (event_type === "tool_progress") {
        updateChatState(conversationId, { toolProgress: tool_label || chunk, isThinking: true });
      } else if (event_type === "error") {
        updateChatState(conversationId, { toolProgress: "", isThinking: false });
      } else {
        fullContent += chunk;
        updateChatState(conversationId, { streamedContent: fullContent, isThinking: false, toolProgress: "" });
      }
    });

    try {
      const currentConv = conversations.find(c => c.id === conversationId);
      const hermesSessionId = currentConv?.hermesSessionId;

      await invoke("chat_with_hermes_api", {
        message: sendContent,
        sessionId: hermesSessionId || null,
        model: model || null,
        provider: provider || null,
        image: image || null,
        eventId: eventId,
      });
    } catch (err) {
      console.error("Chat error:", err);
      updateChatState(conversationId, { isStreaming: false, isThinking: false, toolProgress: "" });
      unlisten();
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
              {tab === "home" && t("tabs.home")}
              {tab === "chat" && t("tabs.chat")}
              {tab === "skills" && t("tabs.skills")}
              {tab === "settings" && t("tabs.settings")}
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
          <HomePanel
            t={t}
            sendMessage={sendMessageFromHome}
            isStreaming={isStreaming}
          />
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
            toolProgress={toolProgress}
            messagesEndRef={messagesEndRef}
          />
        )}
        {activeTab === "settings" && <SettingsPanel />}
        {activeTab === "skills" && <SkillsPanel t={t} />}
      </div>
      </>
      )}
    </div>
  );
}

// ── 快捷对话卡片类型 ──
interface QuickCard {
  id: string;
  name: string;
  icon: string;
  prompt: string;
  source: "builtin" | "custom";
}

const BUILTIN_CARDS: QuickCard[] = [
  { id: "mindmap", name: "思维导图", icon: "🧠", prompt: "请帮我生成一个关于「主题」的思维导图，用markdown格式列出清晰的层级结构，包含中心主题、主要分支和细节要点。", source: "builtin" },
  { id: "weekly", name: "周报生成", icon: "📊", prompt: "请根据以下工作内容，帮我生成一份结构清晰的专业周报，包含本周完成事项（分类列出）、下周工作计划、遇到的风险和解决方案三个部分。", source: "builtin" },
  { id: "codereview", name: "代码审查", icon: "🔍", prompt: "请对以下代码进行详细审查，从以下几个方面分析：1.逻辑缺陷和潜在bug 2.性能瓶颈和优化建议 3.安全漏洞 4.代码可读性和维护性改进建议。", source: "builtin" },
  { id: "translator", name: "翻译助手", icon: "🌐", prompt: "请将以下内容翻译成英文，要求：1.保持专业严谨的技术术语 2.语句流畅自然，符合英文表达习惯 3.完整保留原文信息不遗漏。", source: "builtin" },
  { id: "summary", name: "文章总结", icon: "📝", prompt: "请用简洁精炼的语言总结以下文章的3-5个核心观点，每个观点用一句话概括，然后给出一个整体的摘要。请保留关键数据和结论。", source: "builtin" },
  { id: "brainstorm", name: "头脑风暴", icon: "💡", prompt: "请针对「项目/想法」进行头脑风暴，提供10个创意方向或改进思路，每个方向附带简要说明和可行性评估（高/中/低）。", source: "builtin" },
  { id: "explain", name: "通俗解释", icon: "🎓", prompt: "请用通俗易懂的方式向非专业人士解释以下概念。要求：1.使用生动的比喻 2.避免使用专业术语 3.分步骤说明 4.控制在500字以内。", source: "builtin" },
  { id: "social", name: "社交媒体", icon: "📱", prompt: "请为以下内容生成适合发布在微博/小红书/朋友圈的社交媒体文案。要求：1.风格活泼有吸引力 2.添加合适的emoji 3.包含2-3个版本供选择 4.附带合适的#话题标签。", source: "builtin" },
];

const CARDS_STORAGE_KEY = "hermes-custom-cards";

function loadCustomCards(): QuickCard[] {
  try {
    const stored = localStorage.getItem(CARDS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustomCards(cards: QuickCard[]) {
  localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
}

interface AttachedFile {
  name: string;
  path: string;
}

function HomePanel({
  t,
  sendMessage,
  isStreaming,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  sendMessage: (cardPrompt: string, userText: string, homeFiles?: AttachedFile[]) => Promise<void>;
  isStreaming: boolean;
}) {
  const [cardIndex, setCardIndex] = useState(0);
  const [homeInput, setHomeInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const customCards = loadCustomCards();
  const allCards = [...BUILTIN_CARDS, ...customCards];
  const cardsPerRow = 4;

  const processFiles = async (fileList: FileList): Promise<AttachedFile[]> => {
    const result: AttachedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      try {
        const buffer = await f.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        const tempPath = await invoke<string>("save_temp_file", {
          fileName: f.name,
          fileBytes: bytes,
        });
        result.push({ name: f.name, path: tempPath });
      } catch (e) {
        console.error("Failed to save temp file:", f.name, e);
      }
    }
    return result;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = await processFiles(files);
    if (newFiles.length > 0) setAttachedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = e.dataTransfer.files;
    const newFiles = await processFiles(files);
    if (newFiles.length > 0) setAttachedFiles((prev) => [...prev, ...newFiles]);
  };

  const visibleCards = allCards.slice(cardIndex * cardsPerRow, (cardIndex + 1) * cardsPerRow);

  const handleCardClick = (card: QuickCard) => {
    if (isStreaming) return;
    sendMessage(card.prompt, "");
  };

  const handleSend = () => {
    if ((!homeInput.trim() && attachedFiles.length === 0) || isStreaming) return;
    sendMessage("", homeInput.trim(), attachedFiles.length > 0 ? attachedFiles : undefined);
    setHomeInput("");
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRefresh = () => {
    const maxIndex = Math.floor((allCards.length - 1) / cardsPerRow);
    if (maxIndex <= 0) return;
    let next = cardIndex + 1;
    if (next > maxIndex) next = 0;
    setCardIndex(next);
  };

  return (
    <div className="panel home-panel">
      <div className="home-avatar">
        <div className="home-avatar-circle">
          <img src="/bot.svg" alt="小跃" className="home-avatar-icon" />
        </div>
        <h2>{t("home.welcome")}</h2>
        <p>{t("app.desc")}</p>
      </div>

      <div className="home-cards-section">
        <div className="home-cards-grid">
          {visibleCards.map((card, i) => (
            <div
              key={`${card.id}-${i}`}
              className={`home-card ${card.source}`}
              onClick={() => handleCardClick(card)}
            >
              <span className="home-card-icon">{card.icon}</span>
              <div className="home-card-info">
                <span className="home-card-name">{t(`home.card.${card.id}`) || card.name}</span>
                <span className="home-card-desc">{t(`home.card.${card.id}Desc`) || card.prompt.slice(0, 30)}</span>
              </div>
            </div>
          ))}
        </div>
        {allCards.length > cardsPerRow && (
          <button
            className="home-refresh-btn"
            onClick={handleRefresh}
            title={t("home.cardRefresh")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>{t("home.cardRefresh")}</span>
          </button>
        )}
      </div>

      <div
        className={`home-input-area ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drag-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{t("chat.dropFiles")}</span>
          </div>
        )}
        {attachedFiles.length > 0 && (
          <div className="file-display-area">
            <div className="file-display-list">
              {attachedFiles.map((f, i) => (
                <div key={i} className="file-display-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  <span className="file-display-name">{f.name}</span>
                  <button className="file-display-remove" onClick={() => removeFile(i)}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="chat-input-box home-input-box">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={homeInput}
            onChange={(e) => setHomeInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("home.cardInputPlaceholder")}
            rows={1}
            disabled={isStreaming}
          />
          <div className="chat-input-toolbar">
            <div className="toolbar-left">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
              <button
                className="toolbar-btn"
                onClick={() => fileInputRef.current?.click()}
                title="上传附件"
                disabled={isStreaming}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <button
                className="toolbar-btn mic-btn"
                title="语音输入（即将推出）"
                disabled
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            </div>
            <div className="toolbar-right">
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={isStreaming || (!homeInput.trim() && attachedFiles.length === 0)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
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
  sendMessage: (attachedFiles?: string, model?: string, provider?: string, image?: string) => void;
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
  toolProgress: string;
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
  toolProgress,
  messagesEndRef,
}: ChatPanelProps) {
  const { t } = useI18n();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelList, setModelList] = useState<{ id: string; ownedBy?: string }[]>([]);
  const [currentModel, setCurrentModel] = useState("");
  const [providers, setProviders] = useState<{ id: string; name: string; value: string; baseUrl: string; apiKey: string }[]>([]);
  const [currentProvider, setCurrentProvider] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const [convPage, setConvPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const list = await invoke<{ id: string; name: string; value: string; baseUrl: string; apiKey: string }[]>("list_providers");
        setProviders(list);
      } catch (e) {
        console.error("Failed to load providers:", e);
      }
    };
    const loadCurrentModel = async () => {
      try {
        const config = await invoke<{ model: string; provider: string }>("get_hermes_config");
        setCurrentModel(config.model);
        setCurrentProvider(config.provider);
      } catch (e) {
        console.error("Failed to load model config:", e);
      }
    };
    loadProviders();
    loadCurrentModel();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!currentProvider) {
      setModelList([]);
      return;
    }
    const loadModels = async () => {
      try {
        const list = await invoke<{ id: string; ownedBy?: string }[]>("list_models", { providerValue: currentProvider });
        setModelList(list);
      } catch (e) {
        console.error("Failed to load model list:", e);
        setModelList([]);
      }
    };
    loadModels();
  }, [currentProvider]);

  const processFiles = async (fileList: FileList): Promise<AttachedFile[]> => {
    const result: AttachedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      try {
        const buffer = await f.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        const tempPath = await invoke<string>("save_temp_file", {
          fileName: f.name,
          fileBytes: bytes,
        });
        result.push({ name: f.name, path: tempPath });
      } catch (e) {
        console.error("Failed to save temp file:", f.name, e);
      }
    }
    return result;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = await processFiles(files);
    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    const newFiles = await processFiles(files);
    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleSend = () => {
    if (!input.trim() && attachedFiles.length === 0) return;

    const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
    const firstImage = attachedFiles.find((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext && imageExtensions.includes(ext);
    });
    const imagePath = firstImage?.path;

    const filesJson = attachedFiles.length > 0 ? JSON.stringify(attachedFiles) : undefined;
    sendMessage(filesJson, currentModel || undefined, currentProvider || undefined, imagePath);
    setAttachedFiles([]);
  };

  const handleKeyDownLocal = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelSelect = (modelId: string) => {
    setCurrentModel(modelId);
    setShowModelDropdown(false);
  };

  const handleProviderChange = async (providerValue: string) => {
    setCurrentProvider(providerValue);
    setCurrentModel("");
  };

  const toggleModelDropdown = async () => {
    setShowModelDropdown(!showModelDropdown);
  };

  const parseMessageFiles = (filesStr?: string): AttachedFile[] => {
    if (!filesStr) return [];
    try {
      return JSON.parse(filesStr);
    } catch {
      return [];
    }
  };

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

  const groupConversations = (convs: Conversation[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const groups: { label: string; items: Conversation[] }[] = [];
    const todayItems: Conversation[] = [];
    const yesterdayItems: Conversation[] = [];
    const weekItems: Conversation[] = [];
    const earlierItems: Conversation[] = [];
    convs.forEach((c) => {
      const d = new Date(c.createdAt);
      if (d >= today) todayItems.push(c);
      else if (d >= yesterday) yesterdayItems.push(c);
      else if (d >= weekAgo) weekItems.push(c);
      else earlierItems.push(c);
    });
    if (todayItems.length) groups.push({ label: "chat.today", items: todayItems });
    if (yesterdayItems.length) groups.push({ label: "chat.yesterday", items: yesterdayItems });
    if (weekItems.length) groups.push({ label: "chat.thisWeek", items: weekItems });
    if (earlierItems.length) groups.push({ label: "chat.earlier", items: earlierItems });
    return groups;
  };

  const filteredConvs = conversations
    .filter((c) => convSearch ? c.title.toLowerCase().includes(convSearch.toLowerCase()) : true)
    .sort((a, b) => b.createdAt - a.createdAt);
  const totalFiltered = filteredConvs.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const paginatedConvs = filteredConvs.slice((convPage - 1) * PAGE_SIZE, convPage * PAGE_SIZE);
  const paginatedGroups = groupConversations(paginatedConvs);

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
          <span className="conv-icon">💬</span>
        )}
        {isRenaming ? null : (
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
      <div className={`chat-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="chat-sidebar-header">
          {!sidebarCollapsed && (
            <>
              <button className="new-chat-btn" onClick={onNewConversation}>
                {t("chat.newChat")}
              </button>
              <div className="chat-search-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="chat-search-input"
                  type="text"
                  placeholder={t("chat.search")}
                  value={convSearch}
                  onChange={(e) => { setConvSearch(e.target.value); setConvPage(1); }}
                />
              </div>
            </>
          )}
        </div>
        {!sidebarCollapsed && (
          <div className="conversation-list">
            {paginatedGroups.map((group) => (
              <div key={group.label} className="conv-group">
                <div className="conv-group-label">{t(group.label)}</div>
                {group.items.map((conv) => renderConvItem(conv))}
              </div>
            ))}
          </div>
        )}
        <div className="chat-sidebar-footer">
          {!sidebarCollapsed && (
            <div className="conv-pagination">
              <button className="page-nav-btn" disabled={convPage <= 1} onClick={() => setConvPage(1)}>
                {t("chat.firstPage")}
              </button>
              <button className="page-nav-btn" disabled={convPage <= 1} onClick={() => setConvPage((p) => Math.max(1, p - 1))}>
                {t("chat.prevPage")}
              </button>
              <button className="page-nav-btn" disabled={convPage >= totalPages} onClick={() => setConvPage((p) => Math.min(totalPages, p + 1))}>
                {t("chat.nextPage")}
              </button>
              <button className="page-nav-btn" disabled={convPage >= totalPages} onClick={() => setConvPage(totalPages)}>
                {t("chat.lastPage")}
              </button>
            </div>
          )}
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? t("chat.expand") : t("chat.collapse")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 主聊天区 */}
      <div className="chat-main">
        <div className="messages-list">
          {messages.length === 0 && !isStreaming && (
            <div className="empty-chat">
              <span>{t("chat.emptyChat")}</span>
            </div>
          )}
          {messages.map((msg) => {
            const msgFiles = parseMessageFiles(msg.files);
            return (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === "user" ? "👤" : <img src="/bot.svg" alt="bot" className="message-avatar-img" />}
                </div>
                <div className="message-bubble">
                  {msg.thinking && (
                    <div className="thinking-block">
                      <span className="thinking-label thinking-label-done">{t("chat.thinkingProcess")}</span>
                      <pre className="thinking-content">{msg.thinking}</pre>
                    </div>
                  )}
                  {msgFiles.length > 0 && (
                    <div className="message-files">
                      {msgFiles.map((f, i) => (
                        <div key={i} className="message-file-item">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                            <polyline points="13 2 13 9 20 9" />
                          </svg>
                          <span className="message-file-name">{f.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.content && <div className="message-text">{msg.content}</div>}
                </div>
              </div>
            );
          })}
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
                  {toolProgress || "思考中"}
                  {!toolProgress && (
                    <span className="thinking-dots">
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                    </span>
                  )}
                </span>
                {thinkingContent && <pre className="thinking-content">{thinkingContent}</pre>}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div
          className={`chat-input-area ${isDragging ? "dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="drag-overlay">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>{t("chat.dropFiles")}</span>
            </div>
          )}
          {attachedFiles.length > 0 && (
            <div className="file-display-area">
              <div className="file-display-list">
                {attachedFiles.map((f, i) => (
                  <div key={i} className="file-display-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                      <polyline points="13 2 13 9 20 9" />
                    </svg>
                    <span className="file-display-name">{f.name}</span>
                    <button className="file-display-remove" onClick={() => removeFile(i)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="chat-input-box">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDownLocal}
              placeholder={t("chat.inputPlaceholder")}
              rows={1}
              disabled={isStreaming}
            />
            <div className="chat-input-toolbar">
              <div className="toolbar-left">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
                <button
                  className="toolbar-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="上传附件"
                  disabled={isStreaming}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              </div>
              <div className="toolbar-right">
                <div className="model-selector" ref={modelDropdownRef}>
                  <button
                    className="toolbar-btn model-btn"
                    onClick={toggleModelDropdown}
                    title="切换模型"
                    disabled={isStreaming}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    <span className="model-btn-text">{currentModel || "模型"}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {showModelDropdown && (
                    <div className="model-dropdown">
                      <div className="model-dropdown-provider">
                        <select
                          value={currentProvider}
                          onChange={(e) => handleProviderChange(e.target.value)}
                        >
                          <option value="">选择供应商</option>
                          {providers.map(p => (
                            <option key={p.id} value={p.value}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="model-dropdown-list">
                        {modelList.length > 0 ? modelList.map(m => (
                          <button
                            key={m.id}
                            className={`model-dropdown-item ${m.id === currentModel ? "active" : ""}`}
                            onClick={() => handleModelSelect(m.id)}
                          >
                            {m.id}
                            {m.ownedBy && <span className="model-owned-by">{m.ownedBy}</span>}
                          </button>
                        )) : (
                          <div className="model-dropdown-empty">请先选择供应商</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="toolbar-btn mic-btn"
                  title="语音输入（即将推出）"
                  disabled
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={isStreaming || (!input.trim() && attachedFiles.length === 0)}
                >
                  {isStreaming ? "..." : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}

// ── 卡片管理 ──
function CardManagerPanel({ t }: { t: (key: string, params?: Record<string, string | number>) => string }) {
  const [cards, setCards] = useState<QuickCard[]>(loadCustomCards());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", icon: "📌", prompt: "" });

  const handleSave = () => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    const newCards = cards.slice();
    if (editId) {
      const idx = newCards.findIndex((c) => c.id === editId);
      if (idx >= 0) {
        newCards[idx] = { ...newCards[idx], name: form.name, icon: form.icon, prompt: form.prompt };
      }
    } else {
      newCards.push({
        id: `custom_${Date.now()}`,
        name: form.name,
        icon: form.icon,
        prompt: form.prompt,
        source: "custom",
      });
    }
    setCards(newCards);
    saveCustomCards(newCards);
    setShowForm(false);
    setEditId(null);
    setForm({ name: "", icon: "📌", prompt: "" });
  };

  const handleDelete = (id: string) => {
    const newCards = cards.filter((c) => c.id !== id);
    setCards(newCards);
    saveCustomCards(newCards);
  };

  const handleEdit = (card: QuickCard) => {
    setEditId(card.id);
    setForm({ name: card.name, icon: card.icon, prompt: card.prompt });
    setShowForm(true);
  };

  return (
    <div className="settings-section-card">
      <div className="settings-section">
        <div className="card-manager-header">
          <h3>{t("card.title")}</h3>
          <button
            className="card-add-btn"
            onClick={() => { setEditId(null); setForm({ name: "", icon: "📌", prompt: "" }); setShowForm(true); }}
          >
            {t("card.add")}
          </button>
        </div>

        {showForm && (
          <div className="card-form">
            <div className="card-form-row">
              <label>{t("card.name")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("card.nameHolder")}
              />
            </div>
            <div className="card-form-row">
              <label>{t("card.icon")}</label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder={t("card.iconHolder")}
                maxLength={4}
              />
            </div>
            <div className="card-form-row">
              <label>{t("card.prompt")}</label>
              <textarea
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                placeholder={t("card.promptHolder")}
                rows={3}
              />
            </div>
            <div className="card-form-actions">
              <button className="card-form-btn save" onClick={handleSave}>{t("card.save")}</button>
              <button className="card-form-btn cancel" onClick={() => { setShowForm(false); setEditId(null); }}>{t("modal.cancel")}</button>
            </div>
          </div>
        )}

        <div className="card-manager-builtin">
          <h4>{t("card.builtin")}</h4>
          <div className="card-manager-grid">
            {BUILTIN_CARDS.map((card) => (
              <div key={card.id} className="card-manager-item builtin">
                <span className="card-manager-icon">{card.icon}</span>
                <span className="card-manager-name">{t(`home.card.${card.id}`)}</span>
                <span className="card-manager-desc">{t(`home.card.${card.id}Desc`)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-manager-custom">
          <h4>{t("card.custom")}</h4>
          {cards.length === 0 ? (
            <div className="card-manager-empty">{t("card.empty")}</div>
          ) : (
            <div className="card-manager-grid">
              {cards.map((card) => (
                <div key={card.id} className="card-manager-item custom">
                  <span className="card-manager-icon">{card.icon}</span>
                  <span className="card-manager-name">{card.name}</span>
                  <span className="card-manager-desc">{card.prompt.slice(0, 50)}...</span>
                  <div className="card-manager-actions">
                    <button onClick={() => handleEdit(card)}>✏️</button>
                    <button onClick={() => handleDelete(card.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
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

  // 当前选中的设置分区
  const [activeSection, setActiveSection] = useState("agent");

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

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
  };

  // 按分区定义字段归属
  const SECTION_FIELDS: Record<string, string[]> = {
    model: ["model", "provider", "baseUrl", "maxTurns"],
    display: ["personality", "showReasoning", "ttsProvider"],
    terminal: ["terminalBackend", "terminalTimeout", "compressionEnabled", "memoryEnabled"],
    system: ["personality", "showReasoning", "ttsProvider", "terminalBackend", "terminalTimeout", "compressionEnabled", "memoryEnabled"],
  };

  const sectionDirtyCount = (section: string) => {
    return (SECTION_FIELDS[section] || []).filter(f => dirtyFields.has(f)).length;
  };

  const saveSectionConfig = async (section: string) => {
    const sectionFields = SECTION_FIELDS[section] || [];
    const fieldsToSave = sectionFields.filter(f => dirtyFields.has(f));
    if (fieldsToSave.length === 0) {
      setSaveMessage({ text: t("settings.noChange"), type: "success" });
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

      setSaveMessage({ text: t("settings.saved", { count: fieldsToSave.length }), type: "success" });
      setDirtyFields((prev) => {
        const next = new Set(prev);
        fieldsToSave.forEach(f => next.delete(f));
        return next;
      });
    } catch (err) {
      console.error("Failed to save config:", err);
      setSaveMessage({ text: `${t("settings.saveFailed")}: ${err}`, type: "error" });
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
    <div className="panel settings-panel-new">
      <div className="settings-sidebar">
        <div className="settings-sidebar-title">{t("settings.title")}</div>
        <nav className="settings-nav">
          {([
            { key: "agent", icon: "👾", labelKey: "nav.agent" as const, dirty: sectionDirtyCount("model") },
            { key: "provider", icon: "🔌", labelKey: "nav.provider" as const, dirty: 0 },
            { key: "gesture", icon: "💃", labelKey: "nav.gesture" as const, dirty: 0 },
            { key: "cardManager", icon: "🃏", labelKey: "nav.cardManager" as const, dirty: 0 },
            { key: "system", icon: "⚙️", labelKey: "nav.system" as const, dirty: sectionDirtyCount("system") },
            { key: "about", icon: "ℹ️", labelKey: "nav.about" as const, dirty: 0 },
          ] as const).map((item) => (
            <button
              key={item.key}
              className={`settings-nav-item ${activeSection === item.key ? "active" : ""}`}
              onClick={() => handleSectionChange(item.key)}
            >
              <span className="settings-nav-icon">{item.icon}</span>
              <span className="settings-nav-label">{t(item.labelKey)}</span>
              {item.dirty > 0 && <span className="dirty-badge nav-dirty-badge">{item.dirty}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="settings-content">
        <div className="settings-section-content">
          {/* Agent 设置 */}
          {activeSection === "agent" && (
            <div className="settings-section-card">
              <div className="settings-header">
                <h2>{t("agent.title")}</h2>
                <div className="settings-actions">
                  <button className="refresh-btn" onClick={loadConfig}>{t("settings.refresh")}</button>
                </div>
              </div>
              {config && (
                <div className="config-path-info">
                  <span className="path-label">{t("settings.configPath")}:</span>
                  <span className="path-value">{config.config_path}</span>
                </div>
              )}
              {saveMessage && (
                <div className={`save-toast ${saveMessage.type}`}>
                  {saveMessage.type === "success" ? "✅" : "❌"} {saveMessage.text}
                </div>
              )}
              <div className="settings-section">
                <h3>{t("agent.sectionTitle")}</h3>
                <div className="settings-form">
                  <div className="form-group">
                    <label>
                      {t("agent.provider")}
                      {dirtyFields.has("provider") && <span className="dirty-badge">{t("common.modified")}</span>}
                    </label>
                    <div className="provider-select-row">
                      <select value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
                        <option value="">{t("common.selectProvider")}</option>
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
                      {t("agent.model")}
                      {dirtyFields.has("model") && <span className="dirty-badge">{t("common.modified")}</span>}
                    </label>
                    <div className="model-select-row">
                      {modelList.length > 0 ? (
                        <select value={model} onChange={(e) => { setModel(e.target.value); markDirty("model"); }}>
                          <option value="">{t("common.selectModel")}</option>
                          {model && !modelList.some(m => m.id === model) && (
                            <option value={model}>{model} ({t("common.current")})</option>
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
                          placeholder={t("agent.modelPlaceholder")}
                        />
                      )}
                      {modelListLoading && <span style={{ fontSize: '12px', color: '#999' }}>{t("agent.loadingModels")}</span>}
                      {modelList.length === 0 && !modelListLoading && provider && (
                        <button type="button" className="save-btn" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => fetchModelList(provider)}>{t("agent.refreshModels")}</button>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>
                      {t("agent.baseUrl")}
                      {dirtyFields.has("baseUrl") && <span className="dirty-badge">{t("common.modified")}</span>}
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      readOnly
                      placeholder={t("agent.baseUrl")}
                      style={{ background: '#F5F5F7', color: '#666' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      {t("agent.maxTurns")}: {maxTurns}
                      {dirtyFields.has("maxTurns") && <span className="dirty-badge">{t("common.modified")}</span>}
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
                    {saving ? t("settings.saving") : t("agent.saveBtn")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 供应商设置 */}
          {activeSection === "provider" && (
            <div className="settings-section-card">
              <div className="settings-section">
                <h3>{t("provider.title")}</h3>
                <div className="settings-section providers-inline-section">
                  {providers.length === 0 && (
                    <div className="provider-empty">
                      <p style={{ color: '#999', textAlign: 'center', padding: '20px 0' }}>{t("provider.empty")}</p>
                    </div>
                  )}
                  <div className="provider-list">
                    {providers.map((p) => (
                      <div key={p.id} className="provider-item">
                        <div className="provider-info">
                          <span className="provider-name">{p.name}</span>
                          <span className="provider-value">{p.value}</span>
                          {p.baseUrl && <span className="provider-url">{p.baseUrl}</span>}
                          {p.isBuiltin && <span className="provider-builtin-tag">{t("provider.builtin")}</span>}
                        </div>
                        <div className="provider-item-actions">
                          <button className="provider-item-btn" onClick={() => openEditProvider(p)} disabled={p.isBuiltin} title={p.isBuiltin ? "内置供应商不可编辑" : "编辑"}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button className="provider-item-btn provider-delete-btn" onClick={() => handleDeleteProvider(p.id)} disabled={p.isBuiltin} title={p.isBuiltin ? "内置供应商不可删除" : "删除"}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="provider-add-bar">
                    <button className="section-save-btn" onClick={openNewProvider}>{t("provider.add")}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 系统设置 */}
          {activeSection === "system" && (
            <div className="settings-section-card">
              <div className="settings-header">
                <h2>{t("system.title")}</h2>
              </div>
              <div className="settings-section">
                <h3>{t("system.theme")}</h3>
                <div className="theme-options">
                  <button
                    className={`theme-option ${theme === "light" ? "active" : ""}`}
                    onClick={() => setTheme("light")}
                  >
                    <span className="theme-option-icon">☀️</span>
                    <span className="theme-option-label">{t("system.theme.light")}</span>
                  </button>
                  <button
                    className={`theme-option ${theme === "dark" ? "active" : ""}`}
                    onClick={() => setTheme("dark")}
                  >
                    <span className="theme-option-icon">🌙</span>
                    <span className="theme-option-label">{t("system.theme.dark")}</span>
                  </button>
                  <button
                    className={`theme-option ${theme === "system" ? "active" : ""}`}
                    onClick={() => setTheme("system")}
                  >
                    <span className="theme-option-icon">🖥️</span>
                    <span className="theme-option-label">{t("system.theme.system")}</span>
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <h3>{t("system.language")}</h3>
                <div className="language-options">
                  <button
                    className={`language-option ${locale === "zh-CN" ? "active" : ""}`}
                    onClick={() => setLocale("zh-CN")}
                  >
                    <span className="language-flag language-flag-cn"></span>
                    <span className="language-label">{t("system.language.zhCN")}</span>
                  </button>
                  <button
                    className={`language-option ${locale === "zh-XG" ? "active" : ""}`}
                    onClick={() => setLocale("zh-XG")}
                  >
                    <span className="language-flag language-flag-hk"></span>
                    <span className="language-label">{t("system.language.zhTW")}</span>
                  </button>
                  <button
                    className={`language-option ${locale === "en" ? "active" : ""}`}
                    onClick={() => setLocale("en")}
                  >
                    <span className="language-flag language-flag-us"></span>
                    <span className="language-label">{t("system.language.en")}</span>
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <h3>{t("system.display")}</h3>
                <div className="settings-form">
                  <div className="form-group">
                    <label>
                      {t("system.display.personality")}
                      {dirtyFields.has("personality") && <span className="dirty-badge">{t("common.modified")}</span>}
                    </label>
                    <select value={personality} onChange={(e) => { setPersonality(e.target.value); markDirty("personality"); }}>
                      <option value="default">{t("system.display.personalityDefault")}</option>
                      <option value="kawaii">{t("system.display.personalityKawaii")}</option>
                      <option value="professional">{t("system.display.personalityProfessional")}</option>
                      <option value="pirate">{t("system.display.personalityPirate")}</option>
                      <option value="zen">{t("system.display.personalityZen")}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="toggle-label">
                      <span>
                        {t("system.display.showReasoning")}
                        {dirtyFields.has("showReasoning") && <span className="dirty-badge">{t("common.modified")}</span>}
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
                      {t("system.display.ttsProvider")}
                      {dirtyFields.has("ttsProvider") && <span className="dirty-badge">{t("common.modified")}</span>}
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
              <div className="settings-section">
                <h3>{t("system.terminal")}</h3>
                <div className="settings-form">
                  <div className="form-group">
                    <label>
                      {t("system.terminal.backend")}
                      {dirtyFields.has("terminalBackend") && <span className="dirty-badge">{t("common.modified")}</span>}
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
                      {t("system.terminal.timeout")}: {terminalTimeout}
                      {dirtyFields.has("terminalTimeout") && <span className="dirty-badge">{t("common.modified")}</span>}
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
                        {t("system.terminal.compression")}
                        {dirtyFields.has("compressionEnabled") && <span className="dirty-badge">{t("common.modified")}</span>}
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
                        {t("system.terminal.memory")}
                        {dirtyFields.has("memoryEnabled") && <span className="dirty-badge">{t("common.modified")}</span>}
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
                    onClick={() => saveSectionConfig("system")}
                    disabled={saving || sectionDirtyCount("system") === 0}
                  >
                    {saving ? t("settings.saving") : t("system.saveBtn")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 动作管理 */}
          {activeSection === "gesture" && (
            <div className="settings-section-card">
              <div className="settings-section">
                <div className="gesture-section-header">
                  <h3>{t("gesture.title")}</h3>
                  <div className="gesture-header-right">
                    <button className="gesture-add-btn" onClick={() => {
                      setEditingGesture(null);
                      setGestureForm({ name: "", duration: 1000, lookAtX: 0, lookAtY: 0, tilt: 0, targetJson: "{}" });
                      setShowGestureModal(true);
                    }}>
                      <span className="gesture-add-icon">+</span>
                      {t("gesture.add")}
                    </button>
                    <button className="gesture-add-btn gesture-import-btn" onClick={() => handleImportGestureJson()} title={t("gesture.import")}>
                      <span className="gesture-add-icon">📥</span>
                      {t("gesture.import")}
                    </button>
                    <input type="file" ref={gestureFileInputRef} style={{ display: 'none' }} />
                  </div>
                </div>
                <div>
                  {gestures.length === 0 && (
                    <div className="gesture-empty">
                      <span className="gesture-empty-icon">🎭</span>
                      <p>{t("gesture.empty")}</p>
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
                                {isSystem ? t("gesture.system") : t("gesture.custom")}
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
                          }} title={t("gesture.view")}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                            {t("gesture.view")}
                          </button>
                          <button className="gesture-action-btn gesture-action-edit" disabled={isSystem} onClick={() => {
                            setEditingGesture(g);
                            setGestureForm({ name: g.name, duration: g.duration, lookAtX: g.lookAtX, lookAtY: g.lookAtY, tilt: g.tilt, targetJson: g.targetJson });
                            setGestureReadOnly(false);
                            setShowGestureModal(true);
                          }} title={isSystem ? "系统动作不可编辑" : t("gesture.edit")}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            {t("gesture.edit")}
                          </button>
                          <button className="gesture-action-btn gesture-action-delete" disabled={isSystem} onClick={async () => {
                            if (confirm(`删除动作「${g.name}」吗？`)) {
                              await invoke("delete_avatar_gesture", { id: g.id });
                              loadGestures();
                            }
                          }} title={isSystem ? "系统动作不可删除" : t("gesture.delete")}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            {t("gesture.delete")}
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 卡片管理 */}
          {activeSection === "cardManager" && (
            <CardManagerPanel t={t} />
          )}

          {/* 关于 */}
          {activeSection === "about" && (
            <div className="settings-section-card">
              <div className="settings-section">
                <h3>{t("about.title")}</h3>
                <div className="about-info">
                  <div className="about-logo"><img src="/bot.svg" alt="Hermes" /></div>
                  <div className="about-name">{t("app.name")}</div>
                  <div className="about-version">{t("about.version")}</div>
                  <div className="about-desc">{t("app.desc")}</div>
                  <div className="about-meta">
                    <div className="about-author">{t("about.author")}</div>
                    <div className="about-email">{t("about.email")}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
  enabled: boolean;
  description: string;
  version: string;
  tags: string[];
}

interface SkillCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  count: number;
}

interface SkillsResult {
  skills: SkillItem[];
  total: number;
  hub_installed: number;
  builtin: number;
  local: number;
  enabled_count: number;
  disabled_count: number;
  categories: SkillCategory[];
}

interface BrowseSkill {
  name: string;
  description: string;
  source: string;
  trust: string;
  identifier: string;
}

interface BrowseResult {
  skills: BrowseSkill[];
  page: number;
  total_pages: number;
  total_skills: number;
}

function SkillsPanel({ t }: { t: (key: string, params?: Record<string, string | number>) => string }) {
  const [skillsResult, setSkillsResult] = useState<SkillsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillItem | null>(null);
  const [detailContent, setDetailContent] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browsePage, setBrowsePage] = useState(1);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState("");

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    const handler = () => {
      if (menuOpen) setMenuOpen(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpen]);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const result = await invoke<SkillsResult>("list_hermes_skills");
      setSkillsResult(result);
    } catch (err) {
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadBrowse = async (page: number = 1) => {
    setBrowseLoading(true);
    try {
      const result = await invoke<BrowseResult>("browse_skills", { page, size: 20 });
      setBrowseResult(result);
      setBrowsePage(page);
    } catch (err) {
      console.error("Failed to browse skills:", err);
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleInstall = async (identifier: string) => {
    setInstalling(identifier);
    setInstallMsg("");
    try {
      await invoke("install_skill", { identifier });
      setInstallMsg(t("skills.installSuccess"));
      loadSkills();
      if (browseResult) loadBrowse(browsePage);
    } catch (err: any) {
      setInstallMsg(err?.toString() || t("skills.installFail"));
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (name: string) => {
    try {
      await invoke("uninstall_skill", { name });
      loadSkills();
      setMenuOpen(null);
    } catch (err) {
      console.error("Uninstall failed:", err);
    }
  };

  const handleInspect = async (skill: SkillItem) => {
    setDetailSkill(skill);
    setDetailLoading(true);
    setDetailContent("");
    try {
      const identifier = skill.category ? `${skill.category}/${skill.name}` : skill.name;
      const content = await invoke<string>("inspect_skill", { identifier });
      setDetailContent(content);
    } catch (err) {
      setDetailContent(t("skills.detailLoadFail"));
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredSkills = (skillsResult?.skills || []).filter((skill) => {
    const matchSearch =
      !searchQuery ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSource = filterSource === "all" || skill.source === filterSource;
    const matchCategory = activeCategory === "all" || skill.category === activeCategory;
    return matchSearch && matchSource && matchCategory;
  });

  const categories = skillsResult?.categories || [];

  const getSkillInitial = (name: string) => name.charAt(0).toUpperCase();

  const getCategoryIcon = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    return cat?.icon || "📂";
  };

  return (
    <div className="panel skills-panel">
      <div className="skills-header">
        <div className="skills-header-left">
          <h2>{t("skills.title")}</h2>
          <span className="skills-subtitle">{t("skills.subtitle")}</span>
        </div>
        <div className="skills-header-actions">
          <button className="refresh-btn" onClick={loadSkills} disabled={loading}>
            {loading ? "..." : t("skills.refresh")}
          </button>
          <button className="add-skill-btn" onClick={() => { setShowAddSkill(true); loadBrowse(1); }}>
            + {t("skills.addSkill")}
          </button>
        </div>
      </div>

      <div className="skills-toolbar">
        <input
          className="skills-search"
          type="text"
          placeholder={t("skills.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="skills-filter"
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        >
          <option value="all">{t("skills.allSources")}</option>
          <option value="builtin">{t("skills.builtinSources")}</option>
          <option value="local">{t("skills.localSources")}</option>
          <option value="hub">{t("skills.hubSources")}</option>
        </select>
      </div>

      <div className="skills-category-tabs">
        <button
          className={`category-tab ${activeCategory === "all" ? "active" : ""}`}
          onClick={() => setActiveCategory("all")}
        >
          {t("skills.all")} {skillsResult?.total ?? 0}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`category-tab ${activeCategory === cat.id ? "active" : ""}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.icon} {cat.name} {cat.count}
          </button>
        ))}
      </div>

      {loading && (
        <div className="skills-loading">
          <span className="loading-spinner">⏳</span>
          <p>{t("skills.loading")}</p>
        </div>
      )}

      {!loading && filteredSkills.length > 0 && (
        <div className="skills-grid">
          {filteredSkills.map((skill) => (
            <div key={skill.name} className="skill-card">
              <div className="skill-card-top">
                <div className="skill-card-icon" data-category={skill.category}>
                  <span className="skill-icon-emoji">{getCategoryIcon(skill.category)}</span>
                  <span className="skill-icon-letter">{getSkillInitial(skill.name)}</span>
                </div>
                <div className="skill-card-header">
                  <span className="skill-card-name">{skill.name}</span>
                  {skill.version && <span className="skill-version">v{skill.version}</span>}
                </div>
                <div className="skill-card-menu-wrap">
                  <button
                    className="skill-card-menu-btn"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === skill.name ? null : skill.name); }}
                  >
                    ⋮
                  </button>
                  {menuOpen === skill.name && (
                    <div className="skill-card-menu" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { handleInspect(skill); setMenuOpen(null); }}>
                        {t("skills.viewDetail")}
                      </button>
                      {skill.source === "hub" && (
                        <button onClick={() => { handleUninstall(skill.name); }}>
                          {t("skills.uninstall")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <p className="skill-card-desc">
                {skill.description || t("skills.noDesc")}
              </p>
              <div className="skill-card-bottom">
                <div className="skill-card-tags">
                  <span className={`source-badge ${skill.source}`}>{skill.source}</span>
                  <span className={`enabled-badge ${skill.enabled ? "enabled" : "disabled"}`}>
                    {skill.enabled ? t("skills.enabled") : t("skills.disabled")}
                  </span>
                  {skill.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="tag-badge">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredSkills.length === 0 && (
        <div className="skills-empty">
          <span>🔍</span>
          <p>{searchQuery ? t("skills.noResults") : t("skills.empty")}</p>
        </div>
      )}

      {detailSkill && (
        <div className="modal-overlay" onClick={() => setDetailSkill(null)}>
          <div className="modal-content skill-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{detailSkill.name}</h3>
              <button className="modal-close" onClick={() => setDetailSkill(null)}>×</button>
            </div>
            <div className="modal-body">
              {detailLoading ? (
                <p>{t("skills.loading")}</p>
              ) : (
                <pre className="skill-detail-content">{detailContent}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddSkill && (
        <div className="modal-overlay" onClick={() => setShowAddSkill(false)}>
          <div className="modal-content add-skill-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t("skills.addSkillTitle")}</h3>
              <button className="modal-close" onClick={() => setShowAddSkill(false)}>×</button>
            </div>
            <div className="modal-body">
              {browseLoading && <p>{t("skills.loading")}</p>}
              {browseResult && browseResult.skills.map((bs) => (
                <div key={bs.identifier || bs.name} className="browse-skill-item">
                  <div className="browse-skill-info">
                    <span className="browse-skill-name">{bs.name}</span>
                    <span className="browse-skill-desc">{bs.description}</span>
                    <div className="browse-skill-meta">
                      <span className={`source-badge ${bs.source}`}>{bs.source}</span>
                      <span className="trust-badge">{bs.trust}</span>
                    </div>
                  </div>
                  <button
                    className="install-btn"
                    disabled={installing === bs.identifier}
                    onClick={() => handleInstall(bs.identifier)}
                  >
                    {installing === bs.identifier ? "..." : t("skills.install")}
                  </button>
                </div>
              ))}
              {browseResult && browseResult.total_pages > 1 && (
                <div className="browse-pagination">
                  <button
                    disabled={browsePage <= 1}
                    onClick={() => loadBrowse(browsePage - 1)}
                  >
                    {t("skills.prevPage")}
                  </button>
                  <span>{browsePage} / {browseResult.total_pages}</span>
                  <button
                    disabled={browsePage >= browseResult.total_pages}
                    onClick={() => loadBrowse(browsePage + 1)}
                  >
                    {t("skills.nextPage")}
                  </button>
                </div>
              )}
              {installMsg && <p className="install-msg">{installMsg}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
