# Hermes Desktop — 产品规格说明书

> 版本：v0.1.0（草案）
> 最后更新：2026-04-24

---

## 1. 产品概述

**产品名称：** Hermes Desktop
**类型：** 开源跨平台 AI 助手桌面客户端
**开源协议：** Apache License 2.0
**仓库：** https://github.com/pengbw/hermes-desktop

### 核心理念

Hermes Desktop 以 **3D VRM 数字人**作为 AI 助手的外观载体，赋予对话式 AI 一个"形象"。用户不是在和一个无形的聊天框对话，而是和一个有表情、有动作的数字人互动。整体风格追求：**白色主题、简洁、时尚、科技感**。

### 目标用户

- AI 爱好者 / 开发者
- 开源社区贡献者
- 希望桌面端拥有"有温度"AI 交互体验的用户
- 技术极客（偏好自我托管、可定制）

---

## 2. 技术架构

### 2.1 交互模式

Hermes Desktop 有两种交互形态：

#### 形态一：悬浮数字人（默认 / 启动后）

```
┌──────────────────────────────────────┐
│            桌面                       │
│                                     │
│      ╭──────────────────╮           │
│      │                  │           │
│      │   🎭 小跃数字人    │  ← 悬浮窗口（可拖动）
│      │   "Hi 主人您好"   │    透明背景，无边框
│      │                  │    右键弹出菜单
│      ╰──────────────────╯           │
│                                     │
└──────────────────────────────────────┘
```

- 启动后默认进入此形态
- 窗口**无标题栏、无边框**，背景透明，漂浮在桌面上
- 数字人持续展示 idle 动画（呼吸/眨眼）
- 首次启动：数字人播放打招呼动画 + 语音："Hi 主人您好，我是你的助理小跃"

#### 右键菜单

| 菜单项 | 功能 |
|--------|------|
| 🏠 **首页** | 打开主界面，定位到首页 |
| 🗨️ **对话** | 打开主界面，定位到对话页面 |
| ⚙️ **设置** | 打开主界面，定位到设置页面 |
| 📦 **技能中心** | 打开主界面，定位到技能中心 |
| ─ | 分隔线 |
| 🔄 **重启 Agent** | 重启本地 Hermes Agent 子进程 |
| 📋 **查看日志** | 打开日志目录 |
| ─ | 分隔线 |
| ❌ **退出** | 关闭应用 |

- **左键双击**：快速打开主对话界面
- **拖动**：可自由拖动数字人位置，位置记忆

#### 形态二：主界面（全功能窗口）

通过菜单"首页"或左键双击数字人进入：

```
┌─────────────────────────────────────────┐
│  Hi 主人 您好 我是你的助理 小跃  [—][□][×] │ ← 原生标题栏
├─────────────────────────────────────────┤
│                                         │
│      数字人形象区域（缩小展示）            │ ← 可交互（点击说话）
│                                         │
├─────────────────────────────────────────┤
│  [首页]  [对话]  [设置]  [技能中心]       │ ← Tab 导航
├─────────────────────────────────────────┤
│                                         │
│           对话 / 设置 / 技能内容           │
│                                         │
└─────────────────────────────────────────┘
```

---

### 2.2 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 桌面框架 | **Tauri 2.x** | 轻量级，比 Electron 小 10x，原生性能 |
| 前端 | **React 19 + TypeScript** | 组件化，生态成熟 |
| 样式 | **Tailwind CSS** | 原子化 CSS，快速构建白色主题 |
| 数字人 | **Three.js + @pixiv/three-vrm** | VRM 3D数字人，成熟 VRM 标准支持 |
| 语音合成 | **Web Speech API / 第三方 TTS** | 数字人说话时的口型驱动 |
| 对话内核 | **Hermes Agent** | 通过子进程调用，接管 Agent 逻辑 |
| 状态管理 | **Zustand** | 轻量，无样板代码 |
| 构建工具 | **Vite 7** | 快 |

### 2.2 架构图

```
┌─────────────────────────────────────────────┐
│              Hermes Desktop                  │
├──────────────┬──────────────────────────────┤
│   UI Layer   │   React + Tailwind (白色主题) │
├──────────────┼──────────────────────────────┤
│  数字人层    │   Three.js + @pixiv/three-vrm  │
├──────────────┼──────────────────────────────┤
│  Tauri IPC   │   invoke() Rust commands      │
├──────────────┼──────────────────────────────┤
│  Rust Backend│   Hermes Agent 子进程管理      │
│              │   文件系统 / 进程调用           │
└──────────────┴──────────────────────────────┘
                       │
                       ▼
              Hermes Agent (CLI)
              (对话、记忆、Skills)
```

### 2.3 目录结构

```
hermes-desktop/
├── src/                         # React 前端
│   ├── components/
│   │   ├── Chat/                # 对话相关组件
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ThinkingPanel.tsx
│   │   │   └── InputBar.tsx
│   │   ├── Avatar/                # 数字人组件
│   │   │   ├── DigitalAvatar.tsx
│   │   │   └── MotionController.ts
│   │   ├── Settings/            # 设置面板
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── ModelConfig.tsx
│   │   │   ├── MemoryManager.tsx
│   │   │   ├── SkillsCenter.tsx
│   │   │   ├── MCPServer.tsx
│   │   │   └── PlatformConnect.tsx
│   │   └── Layout/
│   │       ├── Sidebar.tsx
│   │       └── Header.tsx
│   ├── hooks/                   # 自定义 hooks
│   ├── stores/                  # Zustand stores
│   ├── styles/                  # 全局样式 / Tailwind
│   └── utils/                   # 工具函数
├── src-tauri/                   # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs              # 入口
│   │   ├── lib.rs               # 命令定义
│   │   ├── commands/
│   │   │   ├── hermes.rs        # Hermes Agent 调用
│   │   │   └── system.rs        # 系统信息 / 文件操作
│   │   └── models.rs            # 数据模型
│   ├── Cargo.toml
│   └── tauri.conf.json
├── public/
│   └── vrm/                      # VRM 模型文件 (.vrm)
└── package.json
```

---

## 3. 功能模块

## 3. 数字人模块（VRM Avatar）

**目标：** 在窗口左侧或中央展示 VRM 3D 数字人形象，说话时有口型动画。

#### 功能点

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 模型加载 | 加载 VRM 模型（.vrm） | P0 |
| 待机动作 | 数字人待机时播放 idle 动画（呼吸/眨眼） | P0 |
| 说话口型 | 根据 TTS 音频驱动口型同步 | P1 |
| 表情切换 | 根据对话情绪（开心/思考/抱歉）切换表情 | P1 |
| 点击交互 | 点击数字人触发随机动作 | P2 |
| 模型切换 | 设置界面可切换不同数字人模型 | P2 |

#### 视觉规范

- 数字人区域背景：**透明**（融入主界面）
- 数字人大小：占左侧区域 **60%高度**，居中展示
- 白色主题 UI 下的数字人：浅色系 VRM 模型更合适（避免深色）
- 推荐默认模型：**二次元邻家女孩风格**

---

### 3.2 对话模块（Chat）

**目标：** 提供类 ChatGPT 的对话体验，支持流式输出和 Agent 思考过程展示。

#### 功能点

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 流式响应 | Agent 回复实时打字机效果展示 | P0 |
| 思考过程 | Agent 思考过程折叠展示，可展开/收起 | P0 |
| 多会话 | 支持新建/切换/删除对话会话 | P0 |
| 历史记录 | 对话历史持久化存储（SQLite） | P0 |
| 消息复制 | 一键复制单条消息内容 | P1 |
| 消息删除 | 删除单条消息或清空当前会话 | P1 |
| 输入方式 | 支持回车发送 / Shift+Enter 换行 | P1 |

#### 界面布局

```
┌─────────────────────────────────────────┐
│  ≡  Hermes Desktop           [—][□][×]  │ ← 标题栏
├─────────┬───────────────────────────────┤
│         │                               │
│ 对话列表 │      数字人形象区域             │ ← 数字人 Live2D Canvas
│         │                               │
│ [新对话] ├───────────────────────────────┤
│ 会话 1  │  🤖 思考过程（可折叠）           │
│ 会话 2  │  ─────────────────────────────  │
│ 会话 3  │  🤖 Agent 回复消息气泡            │
│         │                               │
│         │  👤 用户消息气泡                 │
│         │                               │
│         ├───────────────────────────────┤
│         │  [ 输入框...        ] [发送]   │
└─────────┴───────────────────────────────┘
```

---

### 3.3 设置模块（Settings）

**目标：** 提供完整的 Hermes Agent 配置能力。

#### 3.3.1 模型配置（Model Config）

| 配置项 | 类型 | 说明 |
|--------|------|------|
| Provider | 下拉选择 | OpenAI / Anthropic / DeepSeek / Ollama / 自定义 |
| API Key | 密码输入 | 加密存储 |
| API Endpoint | URL 输入 | Provider 不支持自定义域名时使用 |
| Model Name | 文本输入 | 如 `deepseek-v4-flash` |
| Temperature | 滑块 | 0.0 ~ 2.0，默认 0.7 |
| Max Tokens | 数字输入 | 最大输出 token 数 |
| System Prompt | 多行文本 | 系统角色设定 |

#### 3.3.2 记忆管理（Memory Manager）

| 功能 | 描述 |
|------|------|
| 查看记忆 | 以卡片列表展示当前持久化记忆 |
| 编辑记忆 | 点击编辑单条记忆内容 |
| 添加记忆 | 手动添加新记忆条目 |
| 删除记忆 | 删除单条记忆 |
| 导入/导出 | JSON 格式批量导出/导入 |

#### 3.3.3 技能中心（Skills Center）

| 功能 | 描述 |
|------|------|
| 技能列表 | 卡片展示所有已加载的 Skills |
| 技能详情 | 查看技能的描述、触发条件、使用次数 |
| 新建技能 | 引导式创建新 Skill（YAML 格式） |
| 编辑技能 | 修改现有 Skill 代码 |
| 删除技能 | 删除技能（需确认） |
| 技能市场 | 未来扩展：从远程仓库安装社区技能 |

#### 3.3.4 MCP Server 管理

| 功能 | 描述 |
|------|------|
| Server 列表 | 展示已配置的 MCP Servers |
| 添加 Server | 配置新的 MCP Server（stdio / HTTP） |
| 连接测试 | 测试 MCP Server 连通性 |
| 启用/禁用 | 快速开关单个 Server |
| 日志查看 | 查看 MCP Server 通信日志（调试用） |

#### 3.3.5 平台连接（Platform Connect）

| 平台 | 接入状态 |
|------|----------|
| Telegram | 待接入 |
| Discord | 待接入 |
| WeChat | 已支持（leapgo-wechat-mcp）|
| Slack | 待接入 |
| 邮件 (SMTP/IMAP) | 已集成（himalaya）|

#### 3.3.6 安全沙盒（Security）

| 功能 | 描述 |
|------|------|
| 命令审批 | 执行系统命令前需用户确认 |
| 沙盒隔离 | 命令在隔离环境执行 |
| 日志级别 | Debug / Info / Warning / Error |
| API Key 加密 | 本地加密存储密钥 |

---

## 4. UI 设计规范

### 4.1 视觉风格

| 属性 | 规范 |
|------|------|
| 主题色 | 白色 `#FFFFFF`，背景灰 `#F5F5F7` |
| 强调色 | 科技蓝 `#4FC3F7` |
| 文字主色 | `#1A1A1A` |
| 文字次色 | `#666666` |
| 圆角 | 卡片 `12px`，按钮 `8px`，输入框 `8px` |
| 阴影 | `0 2px 8px rgba(0,0,0,0.06)` |
| 字体 | 系统字体栈：`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif` |
| 图标库 | Lucide React（线性风格，简洁） |

### 4.2 窗口规范

| 属性 | 规范 |
|------|------|
| 默认尺寸 | 1024 × 720 px |
| 最小尺寸 | 800 × 600 px |
| 窗口控制 | 原生标题栏（macOS  Traffic Light / Windows 经典控件）|
| 缩放 | 支持系统 DPI 缩放 |

---

## 5. 数据存储

| 数据类型 | 存储方式 | 路径 |
|---------|---------|------|
| 对话历史 | SQLite | `~/.hermes-desktop/chat_history.db` |
| 应用配置 | JSON | `~/.hermes-desktop/config.json` |
| 记忆数据 | JSON / SQLite | `~/.hermes/memory.json` |
| 技能文件 | 文件系统 | `~/.hermes/skills/` |
| MCP 配置 | YAML | `~/.hermes-desktop/mcp_config.yaml` |
| 日志文件 | 文本 | `~/.hermes-desktop/logs/` |

---

## 6. 开发计划

### Phase 1 — 基础框架（P0）
- [x] Tauri + React + TypeScript 项目初始化
- [ ] Tailwind CSS 白色主题配置
- [ ] 基础布局框架（侧边栏 + 主内容区）
- [ ] 窗口配置（尺寸/标题/最小化）

### Phase 2 — 对话功能（P0）
- [ ] ChatWindow UI 组件
- [ ] 消息气泡组件
- [ ] 流式响应（调用 Hermes Agent CLI）
- [ ] 思考过程折叠面板
- [ ] 会话管理（新建/切换/删除）

### Phase 3 — 数字人集成（P0）
- [x] Three.js + @pixiv/three-vrm 接入
- [x] VRM 模型加载
- [x] 待机 idle 动画
- [ ] TTS 语音合成接入
- [ ] 口型动画驱动

### Phase 4 — 设置模块（P1）
- [ ] 模型配置面板
- [ ] 记忆管理 UI
- [ ] 技能中心 UI
- [ ] MCP Server 管理 UI
- [ ] 安全设置面板

### Phase 5 — 跨平台构建（P1）
- [ ] macOS .app 构建测试
- [ ] Windows .exe 构建测试
- [ ] 代码签名（如需要）

### Phase 6 — 体验打磨（P2）
- [ ] 数字人表情切换
- [ ] 点击数字人触发动作
- [ ] 平台连接（WeChat/Telegram/Discord）
- [ ] 技能市场（远端安装）

---

## 7. 参考资料

- [Tauri 2.x 官方文档](https://tauri.app/)
- [Three.js](https://threejs.org/)
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- [Hermes Agent GitHub](https://github.com/NousResearch/hermes-agent)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)

---

## 8. 命名规范

| 命名 | 规范 | 示例 |
|------|------|------|
| React 组件 | PascalCase | `ChatWindow.tsx` |
| Hooks | camelCase，use 前缀 | `useChatStream.ts` |
| Store | camelCase，Store 后缀 | `chatStore.ts` |
| Rust 模块 | snake_case | `hermes.rs` |
| CSS 类名 | Tailwind 原子类优先 | `className="p-4 rounded-lg"` |
| 配置文件 | camelCase | `mcpConfig.yaml` |

---

*本规格将随开发进展持续更新。*
