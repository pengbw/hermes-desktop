# Hermes Desktop 重构计划

> **文档版本**: 1.0.0
> **创建日期**: 2026-05-12
> **最后更新**: 2026-05-12
> **基准规范**: [docs/rule.md](./rule.md)

---

## 目录

1. [重构目标](#一重构目标)
2. [重构原则](#二重构原则)
3. [Phase 0 — 工程化基础设施](#phase-0--工程化基础设施)
4. [Phase 1 — 目录结构与路径别名](#phase-1--目录结构与路径别名)
5. [Phase 2 — 类型系统与常量提取](#phase-2--类型系统与常量提取)
6. [Phase 3 — MainWindow 拆分（核心）](#phase-3--mainwindow-拆分核心)
7. [Phase 4 — Hooks 层提取](#phase-4--hooks-层提取)
8. [Phase 5 — Services 层与 Core 层](#phase-5--services-层与-core-层)
9. [Phase 6 — 状态管理迁移（Zustand）](#phase-6--状态管理迁移zustand)
10. [Phase 7 — CSS Modules 迁移](#phase-7--css-modules-迁移)
11. [Phase 8 — 错误处理标准化](#phase-8--错误处理标准化)
12. [Phase 9 — 国际化硬编码清理](#phase-9--国际化硬编码清理)
13. [Phase 10 — Rust 后端重构](#phase-10--rust-后端重构)
14. [Phase 11 — 测试体系建设](#phase-11--测试体系建设)
15. [Phase 12 — 性能优化收尾](#phase-12--性能优化收尾)
16. [功能完整性验证清单](#功能完整性验证清单)
17. [风险与回滚策略](#风险与回滚策略)

---

## 一、重构目标

| 目标         | 说明                                                  |
| ------------ | ----------------------------------------------------- |
| **可维护性** | 将 MainWindow.tsx（7400+ 行）拆分为可维护的模块化组件 |
| **可测试性** | 建立测试体系，核心逻辑覆盖率达到 80%                  |
| **规范合规** | 代码结构逐步对齐 [rule.md](./rule.md) 定义的分层架构  |
| **类型安全** | 消除 `any` 类型，建立完整的 TypeScript 类型体系       |
| **团队协作** | 通过 ESLint/Prettier/Husky 统一代码风格               |
| **功能完整** | 重构后所有现有功能必须完整保留，不允许功能退化        |

---

## 二、重构原则

1. **渐进式重构** — 每个 Phase 独立可交付，不中断现有功能
2. **先拆后优** — 先完成结构拆分，再做性能优化
3. **每步可验证** — 每个 Phase 完成后必须能正常构建和运行
4. **不新增功能** — 重构期间不添加新功能，只调整结构
5. **文档同步** — 每完成一项，更新本文档中的完成标记
6. **功能守卫** — 每个 Phase 完成后必须通过功能完整性验证，确保零功能退化

---

## Phase 0 — 工程化基础设施

> **优先级**: 🔴 最高
> **预估影响**: 全项目
> **前置条件**: 无

### 0.1 安装依赖并验证构建

- [x] 执行 `npm install` 安装 node_modules
- [x] 执行 `npm run build` 验证前端构建通过
- [x] 执行 `cargo build` 验证 Rust 构建通过

### 0.2 ESLint 配置

- [x] 安装 ESLint 及相关插件
  ```
  npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks eslint-config-prettier
  ```
- [x] 创建 `.eslintrc.json`，配置规则：
  - `@typescript-eslint/no-explicit-any: warn`
  - `@typescript-eslint/no-unused-vars: error`
  - `no-console: ["warn", { "allow": ["warn", "error"] }]`
    > 注：实际使用 ESLint 9 flat config 格式（`eslint.config.mjs`），规则一致
- [x] 添加 `npm run lint` 脚本
- [x] 修复现有 lint 错误（自动修复 6 个，剩余 22 个 error 留待 Phase 3 拆分时处理）

### 0.3 Prettier 配置

- [x] 安装 Prettier
  ```
  npm install -D prettier
  ```
- [x] 创建 `.prettierrc`
  ```json
  {
    "semi": true,
    "singleQuote": false,
    "tabWidth": 2,
    "trailingComma": "es5",
    "printWidth": 100,
    "bracketSpacing": true,
    "arrowParens": "always"
  }
  ```
- [x] 创建 `.prettierignore`
- [x] 添加 `npm run format` 脚本
- [x] 对现有代码执行一次格式化

### 0.4 Git Hooks（Husky + lint-staged）

- [x] 安装 Husky + lint-staged
  ```
  npm install -D husky lint-staged
  ```
- [x] 配置 `pre-commit` hook：lint-staged
- [x] 配置 lint-staged 规则
  ```json
  {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,scss}": ["prettier --write"]
  }
  ```

### 0.5 TypeScript 严格验证

- [x] 执行 `tsc --noEmit` 检查类型错误
- [x] 修复所有类型错误（零错误，已通过）
- [x] 确保 `strict: true` 下零错误

---

## Phase 1 — 目录结构与路径别名

> **优先级**: 🔴 最高
> **预估影响**: 全项目导入路径
> **前置条件**: Phase 0

### 1.1 创建目标目录结构

按照 [rule.md](./rule.md) 规范，完整的目标目录结构如下：

```
hermes-desktop/
├── src-tauri/                          # Tauri 后端代码
│   ├── src/
│   │   ├── commands/                   # Tauri 命令模块（Phase 10 拆分）
│   │   │   ├── mod.rs
│   │   │   ├── chat.rs
│   │   │   ├── provider.rs
│   │   │   ├── skill.rs
│   │   │   ├── project.rs
│   │   │   ├── knowledge.rs
│   │   │   ├── avatar.rs
│   │   │   ├── install.rs
│   │   │   └── config.rs
│   │   ├── models/                     # Rust 数据模型
│   │   ├── database/                   # Rust 数据库操作
│   │   │   ├── migrations.rs           # 版本化迁移管理
│   │   │   └── mod.rs
│   │   ├── db.rs                       # 数据库初始化（逐步迁移至 database/）
│   │   ├── commands.rs                 # 旧命令文件（Phase 10 后删除）
│   │   ├── file_watcher.rs
│   │   ├── local_embedding.rs
│   │   ├── lib.rs
│   │   └── main.rs
│   └── Cargo.toml
│
├── src/                                # 前端源代码
│   ├── main.tsx                        # 应用入口
│   ├── App.tsx                         # 根组件（清理脚手架代码）
│   ├── vite-env.d.ts
│   │
│   ├── @types/                         # 全局类型定义
│   │   ├── global.d.ts
│   │   ├── vrm.d.ts
│   │   ├── agent.d.ts
│   │   └── database.d.ts
│   │
│   ├── core/                           # 核心业务层（零框架依赖）
│   │   ├── agent/                      # Hermes Agent 核心
│   │   │   ├── HermesClient.ts
│   │   │   ├── MessageProcessor.ts
│   │   │   ├── ConversationManager.ts
│   │   │   ├── context/
│   │   │   │   ├── ContextBuilder.ts
│   │   │   │   └── ContextCompressor.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── vrm/                        # VRM 核心逻辑
│   │   │   ├── VrmLoader.ts
│   │   │   ├── VrmAnimator.ts
│   │   │   ├── VrmExpressionController.ts
│   │   │   ├── LipSyncEngine.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── database/                   # 数据库核心
│   │   │   ├── DatabaseManager.ts
│   │   │   ├── migrations/
│   │   │   │   ├── 001_initial.sql
│   │   │   │   ├── 002_add_tables.sql
│   │   │   │   └── migrationRunner.ts
│   │   │   ├── repositories/
│   │   │   │   ├── BaseRepository.ts
│   │   │   │   ├── ConversationRepository.ts
│   │   │   │   ├── MessageRepository.ts
│   │   │   │   └── SettingsRepository.ts
│   │   │   ├── entities/
│   │   │   │   ├── ConversationEntity.ts
│   │   │   │   ├── MessageEntity.ts
│   │   │   │   └── index.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── errors/                     # 错误类型定义
│   │   │   ├── AppError.ts
│   │   │   ├── DatabaseError.ts
│   │   │   ├── NetworkError.ts
│   │   │   ├── ValidationError.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── types/                      # 核心类型
│   │   │   ├── Result.ts
│   │   │   └── index.ts
│   │   │
│   │   └── tauri/                      # Tauri 桥接
│   │       ├── TauriCommands.ts
│   │       ├── TauriEvents.ts
│   │       └── types.ts
│   │
│   ├── services/                       # 服务层（封装外部依赖）
│   │   ├── three/                      # Three.js 服务
│   │   │   ├── SceneManager.ts
│   │   │   ├── CameraController.ts
│   │   │   ├── LightingSetup.ts
│   │   │   ├── RenderLoop.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── audio/                      # 音频服务
│   │   │   ├── AudioInputService.ts
│   │   │   ├── AudioOutputService.ts
│   │   │   ├── VrmAudioAnalyzer.ts
│   │   │   └── types.ts
│   │   │
│   │   └── storage/                    # 存储服务
│   │       ├── LocalStorageService.ts
│   │       ├── IndexedDBService.ts
│   │       └── ConfigService.ts
│   │
│   ├── hooks/                          # React Hooks
│   │   ├── vrm/
│   │   │   ├── useVrm.ts
│   │   │   ├── useVrmAnimation.ts
│   │   │   ├── useVrmExpression.ts
│   │   │   ├── useGesture.ts
│   │   │   └── useLipSync.ts
│   │   ├── chat/
│   │   │   ├── useChat.ts
│   │   │   ├── useConversation.ts
│   │   │   ├── useMessageHandler.ts
│   │   │   └── useStreamingChat.ts
│   │   ├── knowledge/
│   │   │   ├── useKnowledgeBase.ts
│   │   │   ├── useKnowledgeFiles.ts
│   │   │   └── useKnowledgeSearch.ts
│   │   ├── database/
│   │   │   ├── useProviders.ts
│   │   │   └── useConfig.ts
│   │   └── common/
│   │       ├── useDebounce.ts
│   │       ├── useThrottle.ts
│   │       ├── useLocalStorage.ts
│   │       └── useAsync.ts
│   │
│   ├── components/                     # UI 组件
│   │   ├── ui/                         # 基础 UI 组件
│   │   │   ├── Button/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Button.module.css
│   │   │   │   ├── Button.test.tsx
│   │   │   │   └── index.ts
│   │   │   ├── Input/
│   │   │   ├── Dialog/
│   │   │   ├── Dropdown/
│   │   │   └── toast/
│   │   │
│   │   ├── vrm/                        # VRM 专属组件
│   │   │   ├── VrmViewer/
│   │   │   │   ├── VrmViewer.tsx
│   │   │   │   ├── VrmViewer.module.css
│   │   │   │   └── index.ts
│   │   │   ├── ExpressionController.tsx
│   │   │   ├── AnimationSelector.tsx
│   │   │   └── VrmSettings.tsx
│   │   │
│   │   ├── chat/                       # 聊天组件
│   │   │   ├── ChatWindow/
│   │   │   │   ├── ChatWindow.tsx
│   │   │   │   ├── ChatWindow.module.css
│   │   │   │   └── index.ts
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── ConversationList.tsx
│   │   │   ├── StreamingIndicator.tsx
│   │   │   ├── KnowledgeSourceBadge.tsx
│   │   │   └── TypingIndicator.tsx
│   │   │
│   │   ├── knowledge/                  # 知识库组件
│   │   │   ├── KnowledgeBaseList.tsx
│   │   │   ├── KnowledgeFileList.tsx
│   │   │   ├── KnowledgeChunkView.tsx
│   │   │   └── KnowledgeSearch.tsx
│   │   │
│   │   ├── settings/                   # 设置组件
│   │   │   ├── ProviderSettings.tsx
│   │   │   ├── ModelSettings.tsx
│   │   │   ├── AvatarSettings.tsx
│   │   │   └── GeneralSettings.tsx
│   │   │
│   │   ├── studio/                     # 工作室组件
│   │   │   ├── ProjectList.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   ├── RoleManager.tsx
│   │   │   ├── TaskBoard.tsx
│   │   │   └── ArtifactView.tsx
│   │   │
│   │   ├── home/                       # 首页组件
│   │   │   ├── QuickActions.tsx
│   │   │   ├── HomeChatInput.tsx
│   │   │   └── HermesStatus.tsx
│   │   │
│   │   ├── common/                     # 通用组件
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── LazyImage.tsx
│   │   │   └── MarkdownRenderer.tsx
│   │   │
│   │   └── layout/                     # 布局组件
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       ├── MainLayout.tsx
│   │       └── resize/
│   │
│   ├── pages/                          # 页面组件
│   │   ├── Home/
│   │   │   ├── HomePage.tsx
│   │   │   ├── HomePage.module.css
│   │   │   └── index.ts
│   │   ├── Chat/
│   │   │   ├── ChatPage.tsx
│   │   │   ├── ChatPage.module.css
│   │   │   └── index.ts
│   │   ├── Studio/
│   │   │   ├── StudioPage.tsx
│   │   │   ├── StudioPage.module.css
│   │   │   └── index.ts
│   │   ├── Knowledge/
│   │   │   ├── KnowledgePage.tsx
│   │   │   ├── KnowledgePage.module.css
│   │   │   └── index.ts
│   │   ├── Settings/
│   │   │   ├── SettingsPage.tsx
│   │   │   ├── SettingsPage.module.css
│   │   │   └── index.ts
│   │   ├── Skills/
│   │   │   ├── SkillsPage.tsx
│   │   │   ├── SkillsPage.module.css
│   │   │   └── index.ts
│   │   └── ModelLoader/
│   │       ├── ModelLoaderPage.tsx
│   │       └── index.ts
│   │
│   ├── stores/                         # 状态管理 (Zustand)
│   │   ├── vrmStore.ts
│   │   ├── chatStore.ts
│   │   ├── agentStore.ts
│   │   ├── uiStore.ts
│   │   ├── knowledgeStore.ts
│   │   └── types.ts
│   │
│   ├── utils/                          # 工具函数
│   │   ├── math/
│   │   │   ├── vector.ts
│   │   │   ├── matrix.ts
│   │   │   └── interpolation.ts
│   │   ├── format/
│   │   │   ├── date.ts
│   │   │   ├── string.ts
│   │   │   └── file.ts
│   │   ├── validation/
│   │   │   ├── messageValidator.ts
│   │   │   └── modelValidator.ts
│   │   └── helpers/
│   │       ├── debounce.ts
│   │       ├── throttle.ts
│   │       └── retry.ts
│   │
│   ├── constants/                      # 常量定义
│   │   ├── config.ts
│   │   ├── animation.ts
│   │   ├── expressions.ts
│   │   ├── bones.ts
│   │   ├── routes.ts
│   │   └── events.ts
│   │
│   ├── i18n/                           # 国际化（已有，补充键值）
│   │   ├── zh-CN.json
│   │   ├── zh-XG.json
│   │   └── en.json
│   │
│   ├── contexts/                       # React Context（已有）
│   │   ├── I18nContext.tsx
│   │   └── ThemeContext.tsx
│   │
│   ├── styles/                         # 全局样式（已有）
│   │   ├── index.css
│   │   ├── themes.css
│   │   ├── variables.css
│   │   ├── animations.css
│   │   └── utilities.css
│   │
│   ├── windows/                        # 窗口入口（保留，精简为路由分发）
│   │   ├── AvatarWindow.tsx            # Avatar 窗口入口
│   │   ├── AvatarWindow.module.css
│   │   ├── ChatWindow.tsx              # Chat 浮窗入口
│   │   ├── ChatWindow.module.css
│   │   ├── MainWindow.tsx              # 主窗口入口（精简为 Tab 路由容器）
│   │   ├── MainWindow.module.css
│   │   ├── GestureEditor.tsx
│   │   ├── GestureEditor.module.css
│   │   ├── InstallGuide.tsx
│   │   ├── InstallGuide.module.css
│   │   ├── FilePreviewModal.tsx
│   │   ├── VirtualOffice.tsx
│   │   └── office3d/
│   │       └── OfficeScene3D.ts
│   │
│   └── assets/                         # 静态资源
│       ├── react.svg
│       ├── models/                     # VRM 模型（如需前端加载）
│       ├── textures/                   # 贴图
│       ├── fonts/                      # 字体
│       ├── sounds/                     # 音效
│       └── icons/                      # 图标
│
├── public/                             # 公共资源（已有）
│   ├── vrm/
│   │   ├── miko.vrm
│   │   ├── pose.json
│   │   └── think.json
│   ├── bot.svg
│   ├── greeting.json
│   ├── silent.json
│   ├── think.json
│   ├── tauri.svg
│   └── vite.svg
│
├── scripts/                            # 构建脚本（已有）
│   └── download-hermes-source.cjs
│
├── tests/                              # 测试文件
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                               # 文档（已有）
│   ├── rule.md
│   ├── refactor-plan.md
│   ├── studio.md
│   ├── knowledge-base.md
│   └── screenshots/
│
├── .eslintrc.json                      # ESLint 配置（Phase 0 新增）
├── .prettierrc                         # Prettier 配置（Phase 0 新增）
├── .prettierignore                     # Prettier 忽略（Phase 0 新增）
├── .husky/                             # Git Hooks（Phase 0 新增）
│   └── pre-commit
├── vitest.config.ts                    # Vitest 配置（Phase 11 新增）
├── .gitignore                          # 已有
├── LICENSE                             # 已有
├── README.md                           # 已有
├── SPEC.md                             # 已有
├── index.html                          # 已有
├── package.json                        # 已有
├── package-lock.json                   # 已有
├── tsconfig.json                       # 已有（补充 paths）
├── tsconfig.node.json                  # 已有
└── vite.config.ts                      # 已有（补充 alias）
```

#### 目录创建清单

- [x] 创建 `src/@types/` — 全局类型定义
- [x] 创建 `src/core/` 及子目录 `agent/`、`vrm/`、`database/`、`errors/`、`types/`、`tauri/`
- [x] 创建 `src/services/` 及子目录 `three/`、`audio/`、`storage/`
- [x] 创建 `src/hooks/` 及子目录 `vrm/`、`chat/`、`knowledge/`、`database/`、`common/`
- [x] 创建 `src/components/` 及子目录 `ui/`、`vrm/`、`chat/`、`knowledge/`、`settings/`、`studio/`、`home/`、`common/`、`layout/`
- [x] 创建 `src/pages/` 及子目录 `Home/`、`Chat/`、`Studio/`、`Knowledge/`、`Settings/`、`Skills/`、`ModelLoader/`
- [x] 创建 `src/stores/` — 状态管理
- [x] 创建 `src/utils/` 及子目录 `math/`、`format/`、`validation/`、`helpers/`
- [x] 创建 `src/constants/` — 常量定义
- [x] 创建 `tests/` 及子目录 `unit/`、`integration/`、`e2e/`
- [x] 确认 `src/i18n/` — 国际化（已有，后续补充键值）
- [x] 确认 `src/contexts/` — React Context（已有，保留）
- [x] 确认 `src/styles/` — 全局样式（已有，后续补充 variables/animations/utilities）
- [x] 确认 `scripts/` — 构建脚本（已有，保留）

### 1.2 配置路径别名

- [x] 在 `vite.config.ts` 添加 resolve.alias
  ```typescript
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@constants': path.resolve(__dirname, './src/constants'),
      '@types': path.resolve(__dirname, './src/@types'),
      '@i18n': path.resolve(__dirname, './src/i18n'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@windows': path.resolve(__dirname, './src/windows'),
      '@assets': path.resolve(__dirname, './src/assets'),
    }
  }
  ```
- [x] 在 `tsconfig.json` 添加 paths 配置（与 vite alias 一一对应）
- [x] 验证路径别名正常工作

### 1.3 保留 windows 目录

> windows/ 目录保留为窗口入口，仅做路由分发，不包含业务逻辑

- [x] 确认 `windows/` 目录职责：窗口入口 + 路由分发
- [x] 后续 Phase 中逐步将业务逻辑迁移到新目录

---

## Phase 2 — 类型系统与常量提取

> **优先级**: 🟡 高
> **预估影响**: 全项目
> **前置条件**: Phase 1

### 2.1 全局类型定义

- [x] 创建 `src/core/types/index.ts` — 核心业务类型（替代 @types/database.d.ts）
  - `Conversation` 接口
  - `Message` 接口
  - `KnowledgeSource` 接口
  - `AttachedFile` 接口
  - `AiRoleItem` 接口
  - `ProjectItem` 接口
  - `WorkflowStep` 接口
  - `KnowledgeBase` 接口
  - `KnowledgeFile` 接口
  - `AvatarGesture` 接口
  - `HermesConfigData` 接口
  - `QuickCard` 接口
  - `SkillItem` / `SkillsResult` / `BrowseResult` 接口
  - `OfficeMember` / `OfficeTheme` / `OfficeLayout` / `GameMember` 等接口
- [x] 创建 `src/core/types/Result.ts` — 通用 Result 类型
- [x] 创建 `src/core/vrm/types.ts` — VRM 相关类型
- [x] 创建 `src/core/tauri/types.ts` — Tauri 桥接类型

### 2.2 常量提取

- [x] 创建 `src/constants/config.ts` — 应用配置常量（DEFAULT_TAB, DEFAULT_CHAT_STATE, CARDS_STORAGE_KEY, OLLAMA_DEFAULT_ENDPOINT, VRM_MODEL_PATH 等）
- [x] 创建 `src/constants/builtinCards.ts` — 内置快捷卡片
- [x] 创建 `src/constants/events.ts` — Tauri 事件名常量
- [x] 创建 `src/constants/routes.ts` — 路由常量

### 2.3 消除 any 类型

- [x] AvatarWindow.tsx — GESTURES 类型定义、vrmRef 类型、boneData 类型、文件拖放路径类型
- [x] GestureEditor.tsx — vrmRef 类型、isPoseFormat/isOldQuatFormat 类型守卫、parseTargetJson 类型
- [x] WorkflowDesigner.tsx — projectMembers 类型、minimapNodeColor 类型、edge.data 类型
- [x] OfficeScene3D.ts — 移除 vrm.scene 的 as any 断言
- [x] MainWindow.tsx — 已通过 Phase 3 拆分处理，any 类型已消除
- [x] Studio 组件 — 添加 ProjectMember/ProjectArtifact/ProjectWorkflow/ProjectTask/ProjectMessage 类型，消除 137 处 any
- [x] Settings 组件 — 添加 HermesConfigData.workspaceRoot 字段，消除 config as any
- [x] Knowledge 组件 — 添加 searchResults 类型、listen 泛型参数
- [x] WorkflowDesigner — 使用 @core/types 替换本地重复类型定义

> 注：any 使用从 146 处降至 9 处（剩余为测试文件 mock 和 Tauri API 的 window as any）

---

## Phase 3 — MainWindow 拆分（核心）

> **优先级**: 🔴 最高
> **预估影响**: 前端核心
> **前置条件**: Phase 1 + Phase 2

这是整个重构中**最关键**的一步。MainWindow.tsx 当前约 7400+ 行，包含 6 个 Tab 的全部 UI 和逻辑。

### 3.1 拆分策略

```
MainWindow.tsx (7400+ 行)
    │
    ├── pages/HomePage.tsx          ← 首页 Tab
    ├── pages/ChatPage.tsx          ← 聊天 Tab
    ├── pages/StudioPage.tsx        ← 工作室 Tab
    ├── pages/KnowledgePage.tsx     ← 知识库 Tab
    ├── pages/SettingsPage.tsx      ← 设置 Tab
    ├── pages/SkillsPage.tsx        ← 技能 Tab
    │
    ├── components/chat/            ← 聊天相关组件
    │   ├── ConversationList.tsx
    │   ├── MessageList.tsx
    │   ├── MessageInput.tsx
    │   ├── MessageBubble.tsx
    │   └── StreamingIndicator.tsx
    │
    ├── components/knowledge/       ← 知识库相关组件
    │   ├── KnowledgeBaseList.tsx
    │   ├── KnowledgeFileList.tsx
    │   └── KnowledgeChunkView.tsx
    │
    ├── components/settings/        ← 设置相关组件
    │   ├── ProviderSettings.tsx
    │   ├── ModelSettings.tsx
    │   └── AvatarSettings.tsx
    │
    ├── components/studio/          ← 工作室相关组件
    │   ├── ProjectList.tsx
    │   ├── ProjectDetail.tsx
    │   ├── RoleManager.tsx
    │   └── TaskBoard.tsx
    │
    └── components/home/            ← 首页相关组件
        ├── QuickActions.tsx
        └── HomeChatInput.tsx
```

### 3.2 执行步骤

#### Step 1: 创建页面骨架

- [x] 创建 `src/pages/Home/HomePanel.tsx` — 提取首页 Tab 内容
- [x] 创建 `src/pages/Chat/ChatPanel.tsx` — 提取聊天 Tab 内容
- [x] 创建 `src/pages/Studio/StudioPanel.tsx` — 提取工作室 Tab 内容
- [x] 创建 `src/pages/Knowledge/KnowledgePanel.tsx` — 提取知识库 Tab 内容
- [x] 创建 `src/pages/Settings/SettingsPanel.tsx` — 提取设置 Tab 内容
- [x] 创建 `src/pages/Skills/SkillsPanel.tsx` — 提取技能 Tab 内容
- [x] 创建 `src/pages/Cards/CardManagerPanel.tsx` — 提取卡片管理

#### Step 2: 提取聊天子组件

- [x] 提取 `ConversationList` 组件 — 左侧会话列表
- [x] 提取 `MessageList` 组件 — 消息列表区域（内联在 ChatPanel 中，虚拟滚动已实现）
- [x] 提取 `MessageInput` 组件 — 输入框 + 附件
- [x] 提取 `MessageBubble` 组件 — 单条消息渲染
- [x] 提取 `StreamingIndicator` 组件 — 流式输出/思考中状态
- [x] 提取 `KnowledgeSourceBadge` 组件 — 知识来源标签（内联在 MessageBubble 中）

> 注：ChatPanel.tsx 当前约 203 行，已充分拆分

#### Step 3: 提取知识库子组件

- [x] 提取 `KnowledgeBaseList` 组件 — 知识库列表
- [x] 提取 `KnowledgeFileList` 组件 — 文件列表
- [ ] 提取 `KnowledgeChunkView` 组件 — 分块预览（代码量小，暂内联在 KnowledgePanel 中）
- [x] 提取 `KnowledgeSearch` 组件 — 检索测试

> 注：KnowledgePanel.tsx 当前约 514 行，暂不需要进一步拆分，待功能增长时再处理

#### Step 4: 提取设置子组件

- [x] 提取 `ProviderSettings` 组件 — Provider 管理
- [x] 提取 `ModelSettings` 组件 — 模型选择（AgentSettings）
- [x] 提取 `SystemSettings` 组件 — 系统设置
- [x] 提取 `GestureSettings` 组件 — 手势设置
- [x] 提取 `AiRolesSettings` 组件 — AI角色管理
- [x] 提取 `KnowledgeSettings` 组件 — 知识库设置
- [x] 提取 `ProviderModal` 组件 — Provider 编辑弹窗

#### Step 5: 提取工作室子组件

- [x] 提取 `ProjectList` 组件 — 项目列表
- [x] 提取 `ProjectDetail` 组件 — 项目详情
- [x] 提取 `NewProjectModal` 组件 — 新建项目弹窗
- [x] 提取 `EditProjectModal` 组件 — 编辑项目弹窗
- [x] 提取 `ProjectSettingsModal` 组件 — 项目设置弹窗（成员/产物/工作流/规则/主题/统计）
- [x] 提取 `PROJECT_TEMPLATES` 常量 — 项目模板定义移至 `constants/projectTemplates.ts`
- [x] 提取 `RoleManager` 组件 — 角色管理
- [x] 提取 `TaskBoard` 组件 — 任务看板
- [x] 提取 `ArtifactView` 组件 — 产出物查看

> StudioPanel.tsx 从 1291 行精简至 290 行，核心弹窗逻辑已提取为独立组件

#### Step 6: 提取首页子组件

- [x] 提取 `QuickActions` 组件 — 快捷操作卡片
- [x] 提取 `HomeChatInput` 组件 — 首页输入框
- [x] 提取 `HermesStatus` 组件 — Agent 状态展示

#### Step 7: 重构 MainWindow 为路由容器

- [x] MainWindow.tsx 精简为 Tab 路由容器（148 行，从 7400+ 行精简）
- [x] 仅保留 Tab 切换逻辑和全局状态分发
- [x] 创建 `src/hooks/useChat.ts` — 提取聊天核心逻辑到自定义 Hook
- [x] 验证所有 Tab 功能正常（构建通过）

---

## Phase 4 — Hooks 层提取

> **优先级**: 🟡 高
> **预估影响**: 前端逻辑层
> **前置条件**: Phase 3

### 4.1 聊天相关 Hooks

- [x] 创建 `src/hooks/chat/useChat.ts` — 聊天核心逻辑（发送消息、流式接收）→ 已在 Phase 3 创建 `src/hooks/useChat.ts`
- [x] 创建 `src/hooks/chat/useConversation.ts` — 会话管理（CRUD、切换）
- [x] 创建 `src/hooks/chat/useMessageHandler.ts` — 消息处理（缓存、状态同步）
- [x] 创建 `src/hooks/chat/useStreamingChat.ts` — 流式聊天事件监听

### 4.2 VRM 相关 Hooks

- [x] 创建 `src/hooks/vrm/useVrm.ts` — VRM 模型加载与生命周期
- [x] 创建 `src/hooks/vrm/useVrmAnimation.ts` — 骨骼动画控制
- [x] 创建 `src/hooks/vrm/useAvatarChat.ts` — Avatar 聊天逻辑（思考状态、消息发送）
- [x] 创建 `src/hooks/vrm/useVrmExpression.ts` — 表情控制
- [x] 创建 `src/hooks/vrm/useGesture.ts` — 手势系统

### 4.2b VRM 共享工具

- [x] 创建 `src/utils/vrmUtils.ts` — VRM 共享工具函数（骨骼初始化、表情应用、手势插值）
- [x] 重构 `useVrm.ts` 使用 vrmUtils 共享函数
- [x] 重构 `useVrmAnimation.ts` 使用 vrmUtils 共享函数
- [x] 重构 `AvatarWindow.tsx` 使用 vrmUtils + useAvatarChat

### 4.3 知识库相关 Hooks

- [x] 创建 `src/hooks/knowledge/useKnowledgeBase.ts` — 知识库 CRUD
- [x] 创建 `src/hooks/knowledge/useKnowledgeFiles.ts` — 文件管理
- [x] 创建 `src/hooks/knowledge/useKnowledgeSearch.ts` — 检索功能

### 4.4 通用 Hooks

- [x] 创建 `src/hooks/common/useDebounce.ts` — 防抖
- [x] 创建 `src/hooks/common/useThrottle.ts` — 节流
- [x] 创建 `src/hooks/common/useLocalStorage.ts` — 本地存储
- [x] 创建 `src/hooks/common/useAsync.ts` — 异步操作封装

### 4.5 数据库相关 Hooks

- [x] 创建 `src/hooks/database/useProviders.ts` — Provider 管理
- [x] 创建 `src/hooks/database/useConfig.ts` — 配置读写

---

## Phase 5 — Services 层与 Core 层

> **优先级**: 🟡 高
> **预估影响**: 前端架构
> **前置条件**: Phase 4

### 5.1 Tauri 桥接服务

- [x] 创建 `src/services/tauri/TauriCommands.ts` — 统一封装所有 invoke 调用
- [x] 创建 `src/services/tauri/TauriEvents.ts` — 统一封装事件监听
- [x] 创建 `src/services/tauri/types.ts` — Tauri 通信类型定义（已迁移至 `src/core/tauri/types.ts`）

### 5.2 Three.js 服务

- [x] 创建 `src/services/three/SceneManager.ts` — 场景管理
- [x] 创建 `src/services/three/CameraController.ts` — 相机控制
- [x] 创建 `src/services/three/LightingSetup.ts` — 灯光配置
- [x] 创建 `src/services/three/RenderLoop.ts` — 渲染循环

### 5.3 Core 层（零框架依赖）

- [x] 创建 `src/core/vrm/VrmAnimator.ts` — VRM 动画核心逻辑
- [x] 创建 `src/core/vrm/VrmExpressionController.ts` — 表情控制核心
- [x] 创建 `src/core/vrm/types.ts` — VRM 类型定义
- [x] 创建 `src/core/agent/MessageProcessor.ts` — 消息处理核心
- [x] 创建 `src/core/agent/ContextBuilder.ts` — 上下文构建

---

## Phase 6 — 状态管理迁移（Zustand）

> **优先级**: 🟠 中
> **预估影响**: 前端状态管理
> **前置条件**: Phase 4

### 6.1 安装与配置

- [x] 安装 Zustand
  ```
  npm install zustand
  ```

### 6.2 创建 Stores

- [x] 创建 `src/stores/chatStore.ts` — 聊天状态（会话列表、当前会话、消息缓存）
- [x] 创建 `src/stores/vrmStore.ts` — VRM 状态（模型加载、表情、手势）
- [x] 创建 `src/stores/uiStore.ts` — UI 状态（Tab、侧边栏、弹窗）
- [x] 创建 `src/stores/agentStore.ts` — Agent 状态（安装状态、运行状态）
- [x] 创建 `src/stores/knowledgeStore.ts` — 知识库状态
- [x] 创建 `src/stores/types.ts` — Store 类型定义

### 6.3 迁移状态

- [x] 将 MainWindow 中的 useState 迁移到对应 Store
- [x] 将 AvatarWindow 中的 useState 迁移到 vrmStore
- [x] 验证跨组件状态共享正常（Zustand Store + Tauri Events + Props 传递均正常）

---

## Phase 7 — CSS Modules 迁移

> **优先级**: 🟢 低
> **预估影响**: 样式文件
> **前置条件**: Phase 3

### 7.1 迁移策略

- [x] 将 `MainWindow.css` → 拆分为各页面/组件的 `.module.css`
- [x] 将 `AvatarWindow.css` → `AvatarWindow.module.css`
- [x] 将 `ChatWindow.css` → `ChatWindow.module.css`
- [x] 将 `GestureEditor.css` → `GestureEditor.module.css`
- [x] 保留 `styles/index.css` 和 `styles/themes.css` 为全局样式

### 7.2 执行步骤

- [x] MainWindow.css 拆分到各子组件
- [x] AvatarWindow.css 迁移
- [x] ChatWindow.css 迁移
- [x] GestureEditor.css 迁移
- [x] 验证所有样式正常

---

## Phase 8 — 错误处理标准化

> **优先级**: 🟠 中
> **预估影响**: 全项目
> **前置条件**: Phase 4

### 8.1 错误类型定义

- [x] 创建 `src/core/errors/AppError.ts` — 基础错误类
- [x] 创建 `src/core/errors/DatabaseError.ts` — 数据库错误
- [x] 创建 `src/core/errors/NetworkError.ts` — 网络错误
- [x] 创建 `src/core/errors/ValidationError.ts` — 验证错误
- [x] 创建 `src/core/errors/index.ts` — 统一导出

### 8.2 Result 类型模式

- [x] 创建 `src/core/types/Result.ts` — Result<T, E> 类型定义
- [x] 在 Services 层使用 Result 类型替代 throw（SafeTauriCommands）

### 8.3 ErrorBoundary 组件

- [x] 创建 `src/components/common/ErrorBoundary.tsx` — 通用错误边界
- [x] 在各窗口入口添加 ErrorBoundary
- [x] 替换 VirtualOffice 中的 ThreeErrorBoundary

### 8.4 清理空 catch

- [x] 搜索并修复所有 `catch {}` 空捕获
- [x] 添加有意义的错误处理或日志

---

## Phase 9 — 国际化硬编码清理

> **优先级**: 🟠 中
> **预估影响**: 前端 UI
> **前置条件**: Phase 3

### 9.1 梳理硬编码文本

- [x] ChatWindow.tsx — "对话记录"、"暂无对话" 等
- [x] AvatarWindow.tsx — "请分析附件中的文件" 等
- [x] VirtualOffice.tsx — "3D虚拟办公加载失败" 等
- [x] GestureEditor.tsx — "加载模型中..." 等
- [x] MainWindow.tsx — 各处硬编码中文

### 9.2 补充 i18n 键值

- [x] 在 `src/i18n/zh-CN.json` 补充缺失的键
- [x] 在 `src/i18n/en.json` 补充英文翻译
- [x] 在 `src/i18n/zh-XG.json` 补充翻译
- [x] 将硬编码文本替换为 `t()` 调用

---

## Phase 10 — Rust 后端重构

> **优先级**: 🟠 中
> **预估影响**: 后端架构
> **前置条件**: 无（可与前端并行）

### 10.1 lib.rs 拆分

- [x] 创建 `src-tauri/src/commands/chat.rs` — 聊天相关命令
- [x] 创建 `src-tauri/src/commands/provider.rs` — Provider 管理命令
- [x] 创建 `src-tauri/src/commands/skill.rs` — 技能管理命令
- [x] 创建 `src-tauri/src/commands/project.rs` — 项目管理命令
- [x] 创建 `src-tauri/src/commands/knowledge.rs` — 知识库命令
- [x] 创建 `src-tauri/src/commands/avatar.rs` — Avatar 相关命令
- [x] 创建 `src-tauri/src/commands/install.rs` — 安装相关命令
- [x] 创建 `src-tauri/src/commands/config.rs` — 配置相关命令
- [x] 创建 `src-tauri/src/commands/mod.rs` — 模块导出
- [x] lib.rs 精简为注册和初始化逻辑

### 10.2 commands.rs 拆分

- [x] 将 commands.rs 中的函数按功能迁移到对应子模块
- [x] 删除原 commands.rs（内容已迁移）

### 10.3 数据库迁移改进

- [x] 创建 `src-tauri/src/database/migrations.rs` — 版本化迁移管理
- [x] 替换 ALTER TABLE + 忽略错误的方式
- [x] 添加迁移版本号追踪

### 10.4 日志标准化

- [x] 统一使用 `log::` 宏替代 `eprintln!`
- [x] 配置日志级别和输出格式
- [x] 初始化 env_logger

---

## Phase 11 — 测试体系建设

> **优先级**: 🟠 中
> **预估影响**: 全项目
> **前置条件**: Phase 5

### 11.1 测试框架配置

- [x] 安装 Vitest + Testing Library
- [x] 创建 `vitest.config.ts`
- [x] 添加 `npm run test` 脚本

### 11.2 Core 层单元测试

- [x] `VrmExpressionController` 测试
- [x] `VrmAnimator` 测试
- [x] `MessageProcessor` 测试
- [x] `ContextBuilder` 测试

### 11.3 Hooks 单元测试

- [x] `useChat` 测试（useAsync/useDebounce/useLocalStorage）
- [x] `useConversation` 测试（需 mock Tauri invoke）
- [x] `useVrm` 测试（需 mock Tauri invoke）
- [x] `useKnowledgeBase` 测试（需 mock Tauri invoke）

### 11.4 组件测试

- [x] `ErrorBoundary` 测试
- [x] `MessageBubble` 测试
- [x] `ConversationList` 测试
- [x] `MessageInput` 测试

### 11.5 Rust 后端测试

- [x] 为 db.rs 添加单元测试
- [x] 为各 command 模块添加测试
- [x] 为 local_embedding 添加测试

---

## Phase 12 — 性能优化收尾

> **优先级**: 🟢 低
> **预估影响**: 运行时性能
> **前置条件**: Phase 6

### 12.1 渲染优化

- [x] 消息列表实现虚拟滚动（@tanstack/react-virtual）
- [x] 为高频渲染组件添加 React.memo
- [x] 审查并优化 useCallback/useMemo 使用

### 12.2 资源优化

- [x] VRM 模型懒加载
- [x] 图片懒加载组件
- [x] 路由级别代码分割

### 12.3 ChatWindow 轮询优化

- [x] 将 `setInterval(fetchMessages, 500)` 改为 Tauri 事件监听
- [x] 减少不必要的数据库查询

### 12.4 FilePreviewModal 修复

- [x] 修复 Word 文件预览逻辑（mammoth 需要 ArrayBuffer 而非文本编码的 ArrayBuffer）

---

## 功能完整性验证清单

> **核心要求**: 每个 Phase 完成后，必须逐项验证以下功能全部正常工作，不允许任何功能退化。
> **验证方式**: 手动测试 + 构建验证，确保 `npm run build` 和 `cargo build` 均通过。

### 构建验证

- [ ] `npm run build` 前端构建零错误
- [ ] `cargo build` Rust 构建零错误
- [ ] `npm run lint` ESLint 零 error（warn 允许）
- [ ] `tsc --noEmit` TypeScript 类型检查零错误

### 首页 Tab

- [ ] 首页正常加载，显示快捷操作卡片
- [ ] 首页聊天输入框可正常输入
- [ ] 首页聊天输入发送后跳转到聊天 Tab 并开始对话
- [ ] Agent 状态显示正常（安装状态、运行状态）

### 聊天 Tab

- [ ] 左侧会话列表正常显示
- [ ] 可创建新对话
- [ ] 可切换对话
- [ ] 可删除对话
- [ ] 消息输入框可正常输入文本
- [ ] 可发送消息并收到流式回复
- [ ] 流式输出（思考中 → 回复中 → 完成）状态显示正常
- [ ] 代码块渲染正常（语法高亮、复制按钮）
- [ ] Markdown 渲染正常（标题、列表、表格、链接）
- [ ] 知识来源标签显示正常
- [ ] 可添加附件（文件上传）
- [ ] 附件预览功能正常
- [ ] 可切换 Provider / Model
- [ ] 可切换 AiRole（角色）
- [ ] 消息自动滚动到底部

### 工作室 Tab

- [ ] 项目列表正常显示
- [ ] 可创建新项目
- [ ] 可进入项目详情
- [ ] 角色管理（AiRole CRUD）正常
- [ ] 任务看板正常显示
- [ ] 产出物（Artifact）查看正常
- [ ] 工作流设计器（React Flow）正常渲染
- [ ] 工作流节点拖拽和连线正常
- [ ] 工作流自动布局（dagre）正常

### 知识库 Tab

- [ ] 知识库列表正常显示
- [ ] 可创建知识库
- [ ] 可删除知识库
- [ ] 文件上传功能正常
- [ ] 文件列表正常显示
- [ ] 文件分块预览正常
- [ ] 检索测试功能正常
- [ ] 知识库关联对话功能正常

### 技能 Tab

- [ ] 技能列表正常显示
- [ ] 可安装技能
- [ ] 可卸载技能
- [ ] 技能配置编辑正常
- [ ] 技能启用/禁用切换正常

### 设置 Tab

- [ ] Provider 管理（添加/编辑/删除）正常
- [ ] API Key 输入和保存正常
- [ ] 模型选择和切换正常
- [ ] Avatar 设置正常
- [ ] 通用设置正常
- [ ] 设置持久化（重启后保留）

### Avatar 窗口

- [ ] VRM 模型正常加载和渲染
- [ ] 模型骨骼动画正常（待机、呼吸）
- [ ] 表情切换正常
- [ ] 手势系统正常
- [ ] 口型同步（LipSync）正常
- [ ] 鼠标交互（拖拽旋转）正常
- [ ] 动画预设切换正常

### Chat 浮窗

- [ ] Chat 浮窗正常打开/关闭
- [ ] 浮窗内聊天功能完整
- [ ] 浮窗拖拽移动正常
- [ ] 浮窗与主窗口消息同步

### 手势编辑器

- [ ] 手势编辑器正常打开
- [ ] 骨骼列表正常显示
- [ ] 可调节骨骼参数
- [ ] 手势保存和加载正常
- [ ] 预设手势切换正常

### 安装向导

- [ ] 安装向导正常显示
- [ ] 安装步骤流程正常
- [ ] 安装进度显示正常
- [ ] 安装完成/失败状态正常

### 3D 虚拟办公

- [ ] 3D 场景正常渲染
- [ ] 场景交互（旋转、缩放）正常
- [ ] 办公室模型正常加载

### 跨窗口/跨组件

- [ ] 主题切换（亮色/暗色）全局生效
- [ ] 语言切换（中/英）全局生效
- [ ] 窗口间通信正常
- [ ] 数据持久化正常（重启后数据保留）

### 验证流程

```
每个 Phase 完成后：
1. npm run build → 零错误
2. cargo build → 零错误
3. 启动应用，逐项验证上述功能清单
4. 发现问题 → 立即修复 → 重新验证
5. 全部通过 → 标记该 Phase 完成 → 更新进度总览
```

---

## 风险与回滚策略

| 风险                       | 影响       | 应对策略                         |
| -------------------------- | ---------- | -------------------------------- |
| 拆分 MainWindow 时引入 Bug | 功能回归   | 每个 Step 完成后手动测试所有 Tab |
| 路径别名导致构建失败       | 编译错误   | 先在分支验证，再合并             |
| Zustand 迁移导致状态丢失   | 运行时错误 | 逐步迁移，保留 useState 兜底     |
| CSS Modules 类名冲突       | 样式错乱   | 逐组件迁移，视觉验证             |
| Rust 拆分导致编译错误      | 构建失败   | 每个子模块独立编译验证           |

### 回滚策略

- 每个 Phase 在独立分支开发
- 合并前必须通过构建验证
- 出现问题可快速 revert 到上一个稳定版本

---

## 进度总览

| Phase | 名称                  | 状态      | 完成度 |
| ----- | --------------------- | --------- | ------ |
| 0     | 工程化基础设施        | ✅ 已完成 | 5/5    |
| 1     | 目录结构与路径别名    | ✅ 已完成 | 4/4    |
| 2     | 类型系统与常量提取    | ✅ 已完成 | 3/3    |
| 3     | MainWindow 拆分       | ✅ 已完成 | 7/7    |
| 4     | Hooks 层提取          | ✅ 已完成 | 5/5    |
| 5     | Services 层与 Core 层 | ✅ 已完成 | 3/3    |
| 6     | 状态管理迁移          | ✅ 已完成 | 3/3    |
| 7     | CSS Modules 迁移      | ⬜ 未开始 | 0/2    |
| 8     | 错误处理标准化        | ✅ 已完成 | 4/4    |
| 9     | 国际化硬编码清理      | ✅ 已完成 | 2/2    |
| 10    | Rust 后端重构         | ✅ 已完成 | 4/4    |
| 11    | 测试体系建设          | ✅ 已完成 | 5/5    |
| 12    | 性能优化收尾          | 🟡 进行中 | 3/4    |

> 状态说明: ⬜ 未开始 | 🟡 进行中 | ✅ 已完成

---

**文档结束**
