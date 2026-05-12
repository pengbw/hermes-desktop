# Tauri 2.x + React + Three.js + VRM 项目开发规范

## 目录

1. [项目目录结构规范](#一项目目录结构规范)
2. [文件命名规范](#二文件命名规范)
3. [代码分层架构](#三代码分层架构)
4. [数据库层规范](#四数据库层规范)
5. [函数设计规范](#五函数设计规范)
6. [类设计规范](#六类设计规范)
7. [React 组件设计规范](#七react-组件设计规范)
8. [TypeScript 类型规范](#八typescript-类型规范)
9. [错误处理规范](#九错误处理规范)
10. [性能优化规范](#十性能优化规范)
11. [测试规范](#十一测试规范)
12. [代码检查清单](#十二代码检查清单)

---

## 一、项目目录结构规范

### 1.1 完整目录结构

```
my-tauri-app/
├── src-tauri/                          # Tauri 后端代码
│   ├── src/
│   │   ├── commands/                   # Tauri 命令模块
│   │   │   ├── database.rs
│   │   │   ├── file_system.rs
│   │   │   └── mod.rs
│   │   ├── models/                     # Rust 数据模型
│   │   ├── database/                   # Rust 数据库操作
│   │   └── main.rs
│   └── Cargo.toml
│
├── src/                                # 前端源代码
│   ├── main.tsx                        # 应用入口
│   ├── App.tsx                         # 根组件
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
│   │   │   ├── context/                # 上下文管理
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
│   │   │   ├── migrations/             # SQL 迁移文件
│   │   │   │   ├── 001_initial.sql
│   │   │   │   ├── 002_add_tables.sql
│   │   │   │   └── migrationRunner.ts
│   │   │   ├── repositories/           # 数据访问层
│   │   │   │   ├── BaseRepository.ts
│   │   │   │   ├── ConversationRepository.ts
│   │   │   │   ├── MessageRepository.ts
│   │   │   │   └── SettingsRepository.ts
│   │   │   ├── entities/               # 数据实体
│   │   │   │   ├── ConversationEntity.ts
│   │   │   │   ├── MessageEntity.ts
│   │   │   │   └── index.ts
│   │   │   └── types.ts
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
│   │   │   └── useLipSync.ts
│   │   ├── chat/
│   │   │   ├── useChat.ts
│   │   │   ├── useConversation.ts
│   │   │   └── useMessageHandler.ts
│   │   ├── database/
│   │   │   ├── useDatabase.ts
│   │   │   └── useQuery.ts
│   │   └── common/
│   │       ├── useDebounce.ts
│   │       ├── useThrottle.ts
│   │       └── useLocalStorage.ts
│   │
│   ├── components/                     # UI 组件
│   │   ├── ui/                         # 基础 UI 组件（shadcn/ui 风格）
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
│   │   │   └── TypingIndicator.tsx
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
│   │   │   └── index.ts
│   │   ├── ModelLoader/
│   │   └── Settings/
│   │
│   ├── stores/                         # 状态管理 (Zustand)
│   │   ├── vrmStore.ts
│   │   ├── chatStore.ts
│   │   ├── agentStore.ts
│   │   ├── uiStore.ts
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
│   │   ├── routes.ts
│   │   └── events.ts
│   │
│   ├── styles/                         # 全局样式
│   │   ├── globals.css
│   │   ├── variables.css
│   │   ├── animations.css
│   │   └── utilities.css
│   │
│   └── assets/                         # 静态资源
│       ├── models/                     # VRM 模型
│       ├── textures/                   # 贴图
│       ├── fonts/                      # 字体
│       ├── sounds/                     # 音效
│       └── icons/                      # 图标
│
├── public/                             # 公共资源
├── tests/                              # 测试文件
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .eslintrc.json                      # ESLint 配置
├── .prettierrc                         # Prettier 配置
├── vite.config.ts                      # Vite 配置
├── tsconfig.json                       # TypeScript 配置
├── vitest.config.ts                    # Vitest 配置
└── package.json
```

### 1.2 路径别名配置

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@services": path.resolve(__dirname, "./src/services"),
      "@hooks": path.resolve(__dirname, "./src/hooks"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@stores": path.resolve(__dirname, "./src/stores"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@constants": path.resolve(__dirname, "./src/constants"),
      "@types": path.resolve(__dirname, "./src/@types"),
      "@assets": path.resolve(__dirname, "./src/assets"),
    },
  },
});
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@core/*": ["./src/core/*"],
      "@services/*": ["./src/services/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@components/*": ["./src/components/*"],
      "@pages/*": ["./src/pages/*"],
      "@stores/*": ["./src/stores/*"],
      "@utils/*": ["./src/utils/*"],
      "@constants/*": ["./src/constants/*"],
      "@types/*": ["./src/@types/*"],
      "@assets/*": ["./src/assets/*"]
    }
  }
}
```

---

## 二、文件命名规范

### 2.1 命名规则表

| 类型       | 命名规则                       | 示例                    | 说明                       |
| ---------- | ------------------------------ | ----------------------- | -------------------------- |
| React 组件 | PascalCase                     | `ChatWindow.tsx`        | 组件名即文件名             |
| 组件文件夹 | PascalCase                     | `ChatWindow/`           | 组件相关文件放在同一文件夹 |
| Hook 文件  | camelCase + `use` 前缀         | `useChat.ts`            | 必须以 use 开头            |
| 类文件     | PascalCase                     | `VrmManager.ts`         | 类名与文件名一致           |
| 服务文件   | PascalCase + `Service` 后缀    | `AudioInputService.ts`  | 明确标识为服务             |
| 工具函数   | camelCase                      | `formatDate.ts`         | 纯函数文件                 |
| 常量文件   | camelCase                      | `animationConstants.ts` | 导出常量对象               |
| 类型定义   | PascalCase + `.d.ts`           | `vrm.d.ts`              | 全局类型声明               |
| Store 文件 | camelCase + `Store` 后缀       | `chatStore.ts`          | Zustand store              |
| 实体文件   | PascalCase + `Entity` 后缀     | `MessageEntity.ts`      | 数据库实体                 |
| Repository | PascalCase + `Repository` 后缀 | `MessageRepository.ts`  | 数据访问类                 |
| 测试文件   | 原文件名 + `.test.ts`          | `utils.test.ts`         | 单元测试                   |
| 样式文件   | 原文件名 + `.module.css`       | `Button.module.css`     | CSS Modules                |

### 2.2 导出规范

```typescript
// ========== 组件导出规范 ==========
// components/ui/Button/index.ts
export { Button } from './Button'
export type { ButtonProps } from './Button'

// components/ui/Button/Button.tsx
import { ComponentPropsWithoutRef } from 'react'

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return <button className={`btn btn-${variant} btn-${size} ${className}`} {...props} />
}

// ========== 模块导出规范 ==========
// core/database/repositories/index.ts
export { BaseRepository } from './BaseRepository'
export { ConversationRepository } from './ConversationRepository'
export { MessageRepository } from './MessageRepository'
export type { IRepository, FindOptions } from './types'

// ========== 工具函数导出规范 ==========
// utils/format/date.ts
export function formatDate(timestamp: number): string { ... }
export function formatRelativeTime(date: Date): string { ... }

// 默认导出只用于单一主要功能
// utils/format/index.ts
import * as dateUtils from './date'
import * as stringUtils from './string'

export { dateUtils, stringUtils }

// ❌ 禁止：混合导出方式
export default function Button() {}
export const Button2 = () => {}

// ✅ 推荐：统一使用命名导出
export function Button() {}
export function ButtonGroup() {}
```

### 2.3 导入顺序规范

```typescript
// 1. React 核心库
import React, { useState, useEffect, useCallback, useMemo } from "react";

// 2. 第三方 UI 库
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";

// 3. 内部类型
import type { Message, Conversation } from "@types";

// 4. 内部模块（按层级从高到低）
import { useChat } from "@hooks/chat/useChat";
import { MessageRepository } from "@core/database/repositories";
import { formatDate } from "@utils/format/date";
import { Button } from "@components/ui/Button";

// 5. 相对路径导入（仅同一目录）
import { helper } from "./helper";

// 6. 样式文件（最后）
import styles from "./ChatWindow.module.css";
import "./ChatWindow.css";

// 7. 常量（按需）
import { DEFAULT_MODEL_CONFIG } from "@constants/config";
```

---

## 三、代码分层架构

### 3.1 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        PAGES (页面层)                        │
│  职责：路由匹配、页面布局、组合组件                              │
│  规则：不包含业务逻辑，只做组件组合                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     COMPONENTS (UI层)                        │
│  职责：纯展示组件，接收props，不依赖业务状态                      │
│  规则：无副作用，可独立测试，样式封装                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       HOOKS (逻辑复用层)                       │
│  职责：封装状态逻辑、副作用、集成服务层                           │
│  规则：每个hook只做一件事，可组合使用                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SERVICES (服务层)                        │
│  职责：封装外部依赖（Three.js、Tauri、IndexedDB）              │
│  规则：单一实例，错误处理完善，可独立测试                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       CORE (核心层)                           │
│  职责：纯业务逻辑，零框架依赖，可移植                            │
│  规则：无React/Tauri依赖，纯TypeScript                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATABASE (数据层)                       │
│  职责：数据持久化、Repository模式、SQLite操作                   │
│  规则：Repository封装所有数据库操作                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 各层代码示例

#### Core 层（零依赖）

```typescript
// core/vrm/VrmExpressionController.ts
// 没有任何框架导入，纯 TypeScript 逻辑

export interface ExpressionState {
  name: string;
  weight: number;
  duration: number;
}

export class VrmExpressionController {
  private expressions: Map<string, number> = new Map();
  private activeExpressions: ExpressionState[] = [];

  setExpression(name: string, weight: number): void {
    // 约束权重范围
    const clampedWeight = Math.max(0, Math.min(1, weight));
    this.expressions.set(name, clampedWeight);
  }

  getExpressionWeight(name: string): number {
    return this.expressions.get(name) ?? 0;
  }

  fadeToExpression(name: string, targetWeight: number, duration: number): void {
    const startWeight = this.getExpressionWeight(name);
    const startTime = performance.now();

    this.activeExpressions.push({
      name,
      weight: startWeight,
      duration,
    });
    // 动画逻辑...
  }

  update(currentTime: number): void {
    // 更新所有活跃表情
    for (const expr of this.activeExpressions) {
      const progress = Math.min(1, (currentTime - expr.weight) / expr.duration);
      // 插值逻辑...
    }
  }

  resetAll(): void {
    this.expressions.clear();
    this.activeExpressions = [];
  }
}
```

#### Services 层（封装外部依赖）

```typescript
// services/three/SceneManager.ts
import * as THREE from "three";
import { VrmExpressionController } from "@core/vrm/VrmExpressionController";

export interface SceneConfig {
  backgroundColor: string;
  fogEnabled: boolean;
  shadowMapEnabled: boolean;
}

export class SceneManager {
  private static instance: SceneManager | null = null;
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private expressionController: VrmExpressionController;
  private animationFrameId: number | null = null;

  private constructor() {
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.expressionController = new VrmExpressionController();
    this.setupDefaultLighting();
  }

  static getInstance(): SceneManager {
    if (!SceneManager.instance) {
      SceneManager.instance = new SceneManager();
    }
    return SceneManager.instance;
  }

  initialize(container: HTMLElement): void {
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.startRenderLoop();
  }

  private setupDefaultLighting(): void {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    // 主光源
    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(5, 10, 7);
    mainLight.castShadow = true;
    this.scene.add(mainLight);

    // 补光
    const fillLight = new THREE.PointLight(0x4040ff, 0.3);
    fillLight.position.set(-2, 3, 4);
    this.scene.add(fillLight);
  }

  private startRenderLoop(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      // 更新表情
      const now = performance.now();
      this.expressionController.update(now);

      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  dispose(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer.dispose();
    SceneManager.instance = null;
  }
}
```

#### Hooks 层（React 集成）

```typescript
// hooks/vrm/useVrm.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { SceneManager } from "@services/three/SceneManager";
import { VrmLoader } from "@core/vrm/VrmLoader";
import type { VRM } from "@pixiv/three-vrm";

interface UseVrmOptions {
  autoLoad?: boolean;
  onLoad?: (vrm: VRM) => void;
  onError?: (error: Error) => void;
}

export function useVrm(options: UseVrmOptions = {}) {
  const { autoLoad = true, onLoad, onError } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const vrmRef = useRef<VRM | null>(null);
  const sceneManager = useRef<SceneManager | null>(null);

  // 初始化场景管理器
  useEffect(() => {
    sceneManager.current = SceneManager.getInstance();

    return () => {
      // 清理逻辑（可选）
    };
  }, []);

  // 加载 VRM 模型
  const loadModel = useCallback(
    async (url: string) => {
      if (!sceneManager.current) return;

      setIsLoading(true);
      setError(null);

      try {
        const loader = new VrmLoader();
        const vrm = await loader.load(url);

        vrmRef.current = vrm;
        sceneManager.current.getScene().add(vrm.scene);
        setIsLoaded(true);
        onLoad?.(vrm);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to load VRM");
        setError(error);
        onError?.(error);
      } finally {
        setIsLoading(false);
      }
    },
    [onLoad, onError]
  );

  // 设置表情
  const setExpression = useCallback((name: string, weight: number) => {
    vrmRef.current?.expressionManager?.setValue(name, weight);
  }, []);

  // 自动加载
  useEffect(() => {
    if (autoLoad) {
      // 从配置获取模型URL
      const modelUrl = localStorage.getItem("vrm_model_url") ?? "/models/default.vrm";
      loadModel(modelUrl);
    }
  }, [autoLoad, loadModel]);

  return {
    vrm: vrmRef.current,
    isLoading,
    isLoaded,
    error,
    loadModel,
    setExpression,
  };
}
```

#### Components 层（UI 组件）

```typescript
// components/vrm/VrmViewer/VrmViewer.tsx
import { useEffect, useRef } from 'react'
import { useVrm } from '@hooks/vrm/useVrm'
import { LoadingSpinner } from '@components/ui/LoadingSpinner'
import styles from './VrmViewer.module.css'

interface VrmViewerProps {
  modelUrl?: string
  className?: string
  onLoad?: () => void
  autoLoad?: boolean
}

export function VrmViewer({
  modelUrl,
  className = '',
  onLoad,
  autoLoad = true
}: VrmViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isLoading, isLoaded, error, loadModel, setExpression } = useVrm({
    autoLoad,
    onLoad: () => onLoad?.()
  })

  useEffect(() => {
    if (modelUrl && autoLoad) {
      loadModel(modelUrl)
    }
  }, [modelUrl, autoLoad, loadModel])

  if (isLoading) {
    return (
      <div className={`${styles.container} ${className}`}>
        <LoadingSpinner text="加载模型中..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${styles.container} ${styles.error} ${className}`}>
        <p>加载失败: {error.message}</p>
        <button onClick={() => modelUrl && loadModel(modelUrl)}>重试</button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`${styles.container} ${className}`}>
      {!isLoaded && <div className={styles.placeholder}>等待模型加载</div>}
    </div>
  )
}
```

---

## 四、数据库层规范

### 4.1 实体定义

```typescript
// core/database/entities/ConversationEntity.ts

export type ConversationStatus = "active" | "archived" | "deleted";

export interface ConversationEntity {
  id: string;
  title: string;
  agentId: string | null;
  status: ConversationStatus;
  createdAt: string; // ISO 8601 格式
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
  isPinned: boolean;
  metadata: string | null; // JSON 字符串
}

// 实体工厂函数
export function createConversation(params: Partial<ConversationEntity> = {}): ConversationEntity {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: params.title ?? "新对话",
    agentId: params.agentId ?? null,
    status: params.status ?? "active",
    createdAt: params.createdAt ?? now,
    updatedAt: now,
    lastMessageAt: now,
    messageCount: 0,
    isPinned: params.isPinned ?? false,
    metadata: params.metadata ?? null,
  };
}
```

### 4.2 Repository 实现

```typescript
// core/database/repositories/BaseRepository.ts

import { DatabaseManager } from "../DatabaseManager";
import type { Database } from "@tauri-apps/plugin-sql";

export interface FindOptions<T = any> {
  where?: Partial<T>;
  orderBy?: { column: keyof T; direction: "ASC" | "DESC" };
  limit?: number;
  offset?: number;
}

export interface IRepository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findAll(options?: FindOptions<T>): Promise<T[]>;
  create(entity: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T>;
  update(id: string, entity: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  count(where?: Partial<T>): Promise<number>;
}

export abstract class BaseRepository<T extends { id: string }> implements IRepository<T> {
  protected abstract tableName: string;
  protected abstract columns: (keyof T)[];

  protected get db(): Database {
    return DatabaseManager.getInstance().getDb();
  }

  async findById(id: string): Promise<T | null> {
    const result = await this.db.select<T[]>(
      `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result[0] || null;
  }

  async findAll(options: FindOptions<T> = {}): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (options.where) {
      for (const [key, value] of Object.entries(options.where)) {
        if (value !== undefined) {
          sql += ` AND ${key} = $${params.length + 1}`;
          params.push(value);
        }
      }
    }

    if (options.orderBy) {
      sql += ` ORDER BY ${String(options.orderBy.column)} ${options.orderBy.direction}`;
    }

    if (options.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);

      if (options.offset) {
        sql += ` OFFSET $${params.length + 1}`;
        params.push(options.offset);
      }
    }

    return await this.db.select<T[]>(sql, params);
  }

  async create(entity: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const entries = Object.entries(entity);
    const columns = ["id", "created_at", "updated_at", ...entries.map(([k]) => k)];
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const values = [id, now, now, ...entries.map(([, v]) => v)];

    await this.db.execute(
      `INSERT INTO ${this.tableName} (${columns.join(", ")}) 
       VALUES (${placeholders})`,
      values
    );

    return (await this.findById(id)) as T;
  }

  async update(id: string, entity: Partial<T>): Promise<T | null> {
    const entries = Object.entries(entity);
    if (entries.length === 0) return this.findById(id);

    const setClause = entries.map(([key], i) => `${key} = $${i + 2}`).join(", ");

    await this.db.execute(
      `UPDATE ${this.tableName} 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [id, ...entries.map(([, v]) => v)]
    );

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
    return result.rowsAffected === 1;
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.db.select<[{ count: number }]>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result[0]?.count > 0;
  }

  async count(where: Partial<T> = {}): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    for (const [key, value] of Object.entries(where)) {
      if (value !== undefined) {
        sql += ` AND ${key} = $${params.length + 1}`;
        params.push(value);
      }
    }

    const result = await this.db.select<[{ count: number }]>(sql, params);
    return result[0]?.count ?? 0;
  }
}
```

### 4.3 具体 Repository 实现

```typescript
// core/database/repositories/ConversationRepository.ts

import { BaseRepository, FindOptions } from "./BaseRepository";
import { ConversationEntity, createConversation } from "../entities/ConversationEntity";

export class ConversationRepository extends BaseRepository<ConversationEntity> {
  protected tableName = "conversations";
  protected columns: (keyof ConversationEntity)[] = [
    "id",
    "title",
    "agent_id",
    "status",
    "created_at",
    "updated_at",
    "last_message_at",
    "message_count",
    "is_pinned",
    "metadata",
  ];

  async findRecent(limit: number = 20): Promise<ConversationEntity[]> {
    return this.findAll({
      orderBy: { column: "last_message_at", direction: "DESC" },
      limit,
    });
  }

  async findPinned(): Promise<ConversationEntity[]> {
    return this.findAll({
      where: { isPinned: true } as Partial<ConversationEntity>,
      orderBy: { column: "last_message_at", direction: "DESC" },
    });
  }

  async updateLastMessageTime(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE ${this.tableName} 
       SET last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  }

  async incrementMessageCount(id: string, delta: number = 1): Promise<void> {
    await this.db.execute(
      `UPDATE ${this.tableName} 
       SET message_count = message_count + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [delta, id]
    );
  }

  async archive(id: string): Promise<boolean> {
    const result = await this.db.execute(
      `UPDATE ${this.tableName} 
       SET status = 'archived', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [id]
    );
    return result.rowsAffected === 1;
  }

  async deleteOldConversations(daysOld: number): Promise<number> {
    const result = await this.db.execute(
      `DELETE FROM ${this.tableName} 
       WHERE status = 'archived' 
       AND julianday('now') - julianday(updated_at) > $1`,
      [daysOld]
    );
    return result.rowsAffected;
  }
}

// core/database/repositories/MessageRepository.ts

import { BaseRepository, FindOptions } from "./BaseRepository";
import { MessageEntity, MessageRole, createMessage } from "../entities/MessageEntity";

export class MessageRepository extends BaseRepository<MessageEntity> {
  protected tableName = "messages";
  protected columns: (keyof MessageEntity)[] = [
    "id",
    "conversation_id",
    "role",
    "content",
    "expression",
    "gesture",
    "agent_thinking",
    "tokens",
    "created_at",
  ];

  async findByConversationId(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<MessageEntity[]> {
    const options: FindOptions<MessageEntity> = {
      where: { conversationId } as Partial<MessageEntity>,
      orderBy: { column: "created_at", direction: "ASC" },
    };

    if (limit) options.limit = limit;
    if (offset) options.offset = offset;

    return this.findAll(options);
  }

  async getLastMessage(conversationId: string): Promise<MessageEntity | null> {
    const messages = await this.findAll({
      where: { conversationId } as Partial<MessageEntity>,
      orderBy: { column: "created_at", direction: "DESC" },
      limit: 1,
    });
    return messages[0] || null;
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    const result = await this.db.execute(
      `DELETE FROM ${this.tableName} WHERE conversation_id = $1`,
      [conversationId]
    );
    return result.rowsAffected;
  }

  async searchMessages(keyword: string, limit: number = 50): Promise<MessageEntity[]> {
    return await this.db.select<MessageEntity[]>(
      `SELECT * FROM ${this.tableName} 
       WHERE content LIKE $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [`%${keyword}%`, limit]
    );
  }
}
```

---

## 五、函数设计规范

### 5.1 函数长度与复杂度

```typescript
// ✅ 推荐：短函数（不超过 20 行）
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
  return emailRegex.test(email);
}

function formatMessageContent(content: string, maxLength: number = 2000): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength) + "...";
}

// ❌ 避免：长函数（超过 30 行）
function processUserMessage(message: string, user: User, context: Context) {
  // 50+ 行代码...
}

// ✅ 重构：拆分为小函数
function processUserMessage(message: string, user: User, context: Context) {
  const validatedMessage = validateMessage(message);
  const enrichedContext = enrichContext(user, context);
  const response = generateResponse(validatedMessage, enrichedContext);
  const formattedResponse = formatResponse(response);
  return saveToDatabase(formattedResponse);
}
```

### 5.2 参数规范

```typescript
// ❌ 避免：参数过多（超过 3 个）
function createConversation(title: string, agentId: string, model: string,
                            temperature: number, maxTokens: number,
                            systemPrompt: string, userId: string) { ... }

// ✅ 推荐：使用对象参数
interface CreateConversationParams {
  title: string
  agentId?: string
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  userId: string
}

function createConversation(params: CreateConversationParams) { ... }

// ✅ 更优：使用 Builder 模式（复杂对象）
class ConversationBuilder {
  private params: Partial<CreateConversationParams> = {}

  setTitle(title: string): this {
    this.params.title = title
    return this
  }

  setAgent(agentId: string): this {
    this.params.agentId = agentId
    return this
  }

  setModelConfig(config: ModelConfig): this {
    this.params.model = config.model
    this.params.temperature = config.temperature
    this.params.maxTokens = config.maxTokens
    return this
  }

  build(): CreateConversationParams {
    if (!this.params.title) throw new Error('Title is required')
    if (!this.params.userId) throw new Error('UserId is required')
    return this.params as CreateConversationParams
  }
}

// 使用
const params = new ConversationBuilder()
  .setTitle('AI 对话')
  .setAgent('hermes-1')
  .setModelConfig({ model: 'gpt-4', temperature: 0.7, maxTokens: 2048 })
  .build()
```

### 5.3 返回值规范

```typescript
// ✅ 推荐：使用 Result 类型（错误处理）
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

async function fetchConversation(id: string): Promise<Result<Conversation>> {
  try {
    const data = await api.getConversation(id)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

// 使用
const result = await fetchConversation('123')
if (result.success) {
  console.log(result.data)
} else {
  console.error(result.error.message)
}

// ✅ 推荐：返回有意义的默认值
function getMessageCount(conversation: Conversation | null): number {
  return conversation?.messages?.length ?? 0
}

// ❌ 避免：返回 null/undefined 造成 NullPointer
function findUser(id: string): User | undefined { ... }
// 使用者容易忘记检查 undefined
```

### 5.4 纯函数与副作用

```typescript
// ✅ 纯函数：相同输入总是相同输出，无副作用
function calculateTokenCount(text: string): number {
  // 纯计算，不修改外部状态
  return text.split(/\s+/).length;
}

function transformMessage(message: Message, format: "json" | "text"): string {
  if (format === "json") return JSON.stringify(message);
  return `${message.role}: ${message.content}`;
}

// ✅ 副作用隔离：明确标识和放置位置
class UserService {
  private cache = new Map<string, User>();

  // 副作用：修改内部状态，但对外透明
  async getUser(id: string): Promise<User> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const user = await this.fetchFromDB(id);
    this.cache.set(id, user); // 副作用
    return user;
  }

  private async fetchFromDB(id: string): Promise<User> {
    // I/O 副作用
    return await db.users.findOne({ id });
  }
}
```

### 5.5 提前返回（Early Return）

```typescript
// ❌ 避免：嵌套过深
async function sendMessage(message: string, conversationId: string) {
  if (message) {
    if (message.trim()) {
      if (conversationId) {
        const conversation = await getConversation(conversationId);
        if (conversation) {
          if (conversation.status === "active") {
            // 实际业务逻辑
            await saveMessage(message, conversationId);
          }
        }
      }
    }
  }
}

// ✅ 推荐：提前返回
async function sendMessage(message: string, conversationId: string) {
  if (!message?.trim()) return;
  if (!conversationId) return;

  const conversation = await getConversation(conversationId);
  if (!conversation) return;
  if (conversation.status !== "active") return;

  // 实际业务逻辑
  await saveMessage(message, conversationId);
}
```

---

## 六、类设计规范

### 6.1 单一职责原则（SRP）

```typescript
// ❌ 坏：一个类做太多事
class VrmManager {
  loadModel() { ... }
  updateExpression() { ... }
  playAnimation() { ... }
  saveToDatabase() { ... }
  uploadToCloud() { ... }
  renderUI() { ... }
}

// ✅ 好：职责分离
class VrmLoader {
  async load(url: string): Promise<VRM> { ... }
}

class VrmExpressionController {
  setExpression(name: string, weight: number): void { ... }
  blendExpressions(expressions: BlendShape[]): void { ... }
}

class VrmAnimationController {
  play(animation: AnimationClip, duration: number): void { ... }
  stop(): void { ... }
}

class VrmPersistenceService {
  constructor(private repo: VrmRepository) {}
  async save(vrm: VRM): Promise<void> { ... }
}

// 门面模式组合使用
class VrmFacade {
  constructor(
    private loader: VrmLoader,
    private expressionCtrl: VrmExpressionController,
    private animationCtrl: VrmAnimationController
  ) {}

  async initialize(url: string): Promise<void> {
    const vrm = await this.loader.load(url)
    this.expressionCtrl.setVrm(vrm)
    this.animationCtrl.setVrm(vrm)
  }
}
```

### 6.2 依赖倒置原则（DIP）

```typescript
// 定义抽象接口
// core/interfaces/IMessageRepository.ts
export interface IMessageRepository {
  save(message: Message): Promise<void>;
  findByConversation(conversationId: string): Promise<Message[]>;
  delete(id: string): Promise<boolean>;
}

// core/interfaces/IAgentClient.ts
export interface IAgentClient {
  send(content: string, context: Context): Promise<AgentResponse>;
  stream(content: string, onChunk: (chunk: string) => void): Promise<void>;
}

// 高级模块依赖抽象
// core/chat/ChatService.ts
import type { IMessageRepository } from "../interfaces/IMessageRepository";
import type { IAgentClient } from "../interfaces/IAgentClient";

export class ChatService {
  constructor(
    private messageRepo: IMessageRepository,
    private agentClient: IAgentClient
  ) {}

  async sendMessage(content: string, conversationId: string): Promise<void> {
    // 不依赖具体实现
    const response = await this.agentClient.send(content, { conversationId });
    await this.messageRepo.save(response.message);
  }
}

// 具体实现
// infrastructure/repositories/SQLiteMessageRepository.ts
import { IMessageRepository } from "@core/interfaces/IMessageRepository";

export class SQLiteMessageRepository implements IMessageRepository {
  async save(message: Message): Promise<void> {
    // SQLite 实现
  }
  // ...
}

// 测试时可以注入 Mock
const mockRepo: IMessageRepository = {
  save: vi.fn(),
  findByConversation: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockResolvedValue(true),
};
```

### 6.3 开闭原则（OCP）

```typescript
// ✅ 对扩展开放，对修改关闭
// 策略接口
interface MessageFormatter {
  format(message: Message): string;
}

// 具体策略
class JsonFormatter implements MessageFormatter {
  format(message: Message): string {
    return JSON.stringify(message);
  }
}

class MarkdownFormatter implements MessageFormatter {
  format(message: Message): string {
    return `**${message.role}**: ${message.content}`;
  }
}

class PlainTextFormatter implements MessageFormatter {
  format(message: Message): string {
    return `${message.role}: ${message.content}`;
  }
}

// 使用策略的类
class MessageExporter {
  private formatter: MessageFormatter;

  constructor(formatter: MessageFormatter) {
    this.formatter = formatter;
  }

  setFormatter(formatter: MessageFormatter): void {
    this.formatter = formatter;
  }

  export(messages: Message[]): string {
    return messages.map((m) => this.formatter.format(m)).join("\n");
  }
}

// 扩展新格式时，不需要修改 MessageExporter
class XMLFormatter implements MessageFormatter {
  format(message: Message): string {
    return `<message role="${message.role}">${message.content}</message>`;
  }
}
```

### 6.4 单例模式（Singleton）

```typescript
// services/database/DatabaseManager.ts
export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private db: Database | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async initialize(dbPath: string): Promise<void> {
    // 避免重复初始化
    if (this.isInitialized) return;

    // 避免并发初始化
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize(dbPath);
    return this.initializationPromise;
  }

  private async doInitialize(dbPath: string): Promise<void> {
    try {
      this.db = await Database.load(dbPath);
      await this.runMigrations();
      this.isInitialized = true;
    } finally {
      this.initializationPromise = null;
    }
  }

  getDb(): Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}
```

---

## 七、React 组件设计规范

### 7.1 组件分类

```typescript
// ========== 1. 展示组件（Presentational Component）==========
// 职责：只负责 UI 呈现，不包含业务逻辑
// 特点：接收 props，可能包含内部状态（UI 状态），可独立测试

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  className?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  children,
  className = ''
}: ButtonProps) {
  const buttonClass = clsx(
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    { 'btn-loading': loading, 'btn-disabled': disabled },
    className
  )

  return (
    <button
      className={buttonClass}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}

// ========== 2. 容器组件（Container Component）==========
// 职责：负责数据获取、状态管理、逻辑处理
// 特点：连接 Store 或 Service，将数据传递给展示组件

interface ConversationContainerProps {
  conversationId: string
}

export function ConversationContainer({ conversationId }: ConversationContainerProps) {
  // 数据获取
  const { data: conversation, isLoading, error } = useConversation(conversationId)
  const { messages, sendMessage, isSending } = useMessages(conversationId)
  const { user } = useAuth()

  // 事件处理
  const handleSendMessage = useCallback(async (content: string) => {
    if (!user) return
    await sendMessage({ content, userId: user.id })
  }, [sendMessage, user])

  const handleRetry = useCallback(() => {
    refetchConversation()
  }, [])

  // 加载状态
  if (isLoading) return <ConversationSkeleton />

  // 错误状态
  if (error) return <ErrorView error={error} onRetry={handleRetry} />

  // 渲染展示组件
  return (
    <ConversationView
      conversation={conversation!}
      messages={messages}
      isSending={isSending}
      onSendMessage={handleSendMessage}
    />
  )
}

// ========== 3. 受控组件 vs 非受控组件 ==========
// 受控组件（推荐）：状态由父组件管理
interface ControlledInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function ControlledInput({ value, onChange, placeholder }: ControlledInputProps) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

// 非受控组件（简单场景）：状态内部管理
interface UncontrolledInputProps {
  defaultValue?: string
  onBlur?: (value: string) => void
}

function UncontrolledInput({ defaultValue = '', onBlur }: UncontrolledInputProps) {
  const [value, setValue] = useState(defaultValue)

  return (
    <input
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onBlur?.(value)}
    />
  )
}
```

### 7.2 Hooks 封装规范

```typescript
// hooks/chat/useChat.ts
import { useState, useCallback, useRef } from "react";
import { ChatService } from "@services/chat/ChatService";
import type { Message, Conversation } from "@types";

interface UseChatOptions {
  conversationId?: string;
  onMessageReceived?: (message: Message) => void;
  onError?: (error: Error) => void;
}

interface UseChatReturn {
  messages: Message[];
  conversation: Conversation | null;
  isSending: boolean;
  error: Error | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  retry: () => void;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { conversationId, onMessageReceived, onError } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const chatServiceRef = useRef<ChatService | null>(null);

  // 初始化服务
  useEffect(() => {
    chatServiceRef.current = new ChatService();

    if (conversationId) {
      loadConversation(conversationId);
    }

    return () => {
      chatServiceRef.current?.dispose();
    };
  }, [conversationId]);

  const loadConversation = useCallback(
    async (id: string) => {
      try {
        const conv = await chatServiceRef.current?.getConversation(id);
        setConversation(conv || null);

        const msgs = await chatServiceRef.current?.getMessages(id);
        setMessages(msgs || []);
      } catch (err) {
        setError(err as Error);
        onError?.(err as Error);
      }
    },
    [onError]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isSending) return;

      setIsSending(true);
      setError(null);

      // 添加用户消息（乐观更新）
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await chatServiceRef.current?.sendMessage(content, conversation?.id);

        if (response) {
          setMessages((prev) => [...prev, response.message]);
          onMessageReceived?.(response.message);
        }
      } catch (err) {
        setError(err as Error);
        onError?.(err as Error);
        // 移除用户消息（回滚）
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      } finally {
        setIsSending(false);
      }
    },
    [isSending, conversation, onMessageReceived, onError]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const retry = useCallback(() => {
    if (conversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId, loadConversation]);

  return {
    messages,
    conversation,
    isSending,
    error,
    sendMessage,
    clearMessages,
    retry,
  };
}
```

### 7.3 组件优化规范

```typescript
// ========== 使用 React.memo 避免不必要的重渲染 ==========
interface MessageBubbleProps {
  message: Message
  isOwn: boolean
  onCopy?: (content: string) => void
}

// ✅ 使用 memo
export const MessageBubble = React.memo(function MessageBubble({
  message,
  isOwn,
  onCopy
}: MessageBubbleProps) {
  return (
    <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
      <div className="message-content">{message.content}</div>
      <button onClick={() => onCopy?.(message.content)}>复制</button>
    </div>
  )
})

// 自定义比较函数
export const MessageList = React.memo(
  function MessageList({ messages, onMessageClick }: MessageListProps) {
    return (
      <div className="message-list">
        {messages.map(msg => (
          <MessageItem key={msg.id} message={msg} onClick={onMessageClick} />
        ))}
      </div>
    )
  },
  (prevProps, nextProps) => {
    // 只有 messages 长度或最后一条消息变化时才重渲染
    if (prevProps.messages.length !== nextProps.messages.length) return false
    if (prevProps.messages.length === 0) return true

    const lastPrev = prevProps.messages[prevProps.messages.length - 1]
    const lastNext = nextProps.messages[nextProps.messages.length - 1]

    return lastPrev.id === lastNext.id && lastPrev.content === lastNext.content
  }
)

// ========== 使用 useCallback 稳定函数引用 ==========
function ChatWindow({ conversationId }: { conversationId: string }) {
  const { messages, sendMessage } = useChat({ conversationId })

  // ✅ 使用 useCallback
  const handleSend = useCallback((content: string) => {
    sendMessage(content)
  }, [sendMessage])

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content)
  }, [])

  return (
    <div>
      <MessageList messages={messages} onCopy={handleCopy} />
      <MessageInput onSend={handleSend} />
    </div>
  )
}

// ========== 使用 useMemo 缓存计算结果 ==========
function ConversationStats({ messages }: { messages: Message[] }) {
  // ✅ 使用 useMemo 缓存复杂计算
  const stats = useMemo(() => {
    const totalMessages = messages.length
    const userMessages = messages.filter(m => m.role === 'user').length
    const assistantMessages = messages.filter(m => m.role === 'assistant').length
    const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0)

    return { totalMessages, userMessages, assistantMessages, totalTokens }
  }, [messages])

  return (
    <div className="stats">
      <span>总消息: {stats.totalMessages}</span>
      <span>用户: {stats.userMessages}</span>
      <span>助手: {stats.assistantMessages}</span>
      <span>Token: {stats.totalTokens}</span>
    </div>
  )
}
```

---

## 八、TypeScript 类型规范

### 8.1 类型定义规范

```typescript
// ========== 接口 vs 类型别名 ==========
// ✅ 使用 interface 定义对象类型（可扩展）
interface User {
  id: string
  name: string
  email: string
}

// ✅ 使用 type 定义联合类型、元组、工具类型
type MessageRole = 'user' | 'assistant' | 'system'
type Coordinates = [number, number, number]
type Nullable<T> = T | null

// ========== 泛型使用 ==========
// ✅ 合理使用泛型提高复用性
interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>
  findAll(): Promise<T[]>
  save(entity: T): Promise<T>
  delete(id: ID): Promise<boolean>
}

class UserRepository implements Repository<User> {
  async findById(id: string): Promise<User | null> { ... }
  // ...
}

// ========== 工具类型 ==========
// 使用 TypeScript 内置工具类型
type PartialUser = Partial<User>           // 所有属性可选
type ReadonlyUser = Readonly<User>         // 所有属性只读
type UserWithoutId = Omit<User, 'id'>      // 排除 id
type UserWithOptionalName = Pick<User, 'id' | 'email'> & { name?: string }

// ========== 类型守卫 ==========
function isMessage(obj: unknown): obj is Message {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'role' in obj &&
    'content' in obj
  )
}

// 使用类型守卫
function processMessage(data: unknown) {
  if (isMessage(data)) {
    console.log(data.content)  // TypeScript 知道 data 是 Message
  }
}
```

### 8.2 严格类型检查

```typescript
// tsconfig.json 严格模式
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}

// ✅ 明确处理 null/undefined
function getUserName(user: User | null): string {
  // 使用可选链和空值合并
  return user?.name ?? '匿名用户'
}

// ✅ 使用 const 断言
const appConfig = {
  name: 'VRM Chat',
  version: '1.0.0',
  features: ['vrm', 'voice', 'chat'] as const
} as const

// 类型推断为：
// {
//   readonly name: "VRM Chat";
//   readonly version: "1.0.0";
//   readonly features: readonly ["vrm", "voice", "chat"];
// }
```

---

## 九、错误处理规范

### 9.1 错误类型定义

```typescript
// @types/errors.ts

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "DATABASE_ERROR", 500, context);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, context);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, "NOT_FOUND", 404, { resource, id });
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "NETWORK_ERROR", 503, context);
  }
}
```

### 9.2 错误处理模式

```typescript
// ========== Result 类型模式 ==========
type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E }

// 使用 Result 类型
async function findConversation(id: string): Promise<Result<Conversation>> {
  try {
    const conversation = await db.conversations.findOne({ id })
    if (!conversation) {
      return {
        success: false,
        error: new NotFoundError('Conversation', id)
      }
    }
    return { success: true, data: conversation }
  } catch (error) {
    return {
      success: false,
      error: new DatabaseError('Failed to find conversation', { id, error })
    }
  }
}

// 使用 Result
const result = await findConversation('123')
if (result.success) {
  console.log(result.data)
} else {
  // 类型安全的结果处理
  switch (result.error.code) {
    case 'NOT_FOUND':
      // 处理未找到
      break
    case 'DATABASE_ERROR':
      // 处理数据库错误
      break
  }
}

// ========== 错误边界组件 ==========
// components/common/ErrorBoundary.tsx
import React from 'react'

interface ErrorBoundaryProps {
  fallback?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by boundary:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary">
          <h2>出错了</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// ========== 异步错误处理 ==========
// hooks/common/useAsync.ts
interface UseAsyncOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  immediate?: boolean
}

export function useAsync<T>(
  asyncFn: () => Promise<T>,
  options: UseAsyncOptions<T> = {}
) {
  const { onSuccess, onError, immediate = false } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await asyncFn()
      setData(result)
      onSuccess?.(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      onError?.(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [asyncFn, onSuccess, onError])

  useEffect(() => {
    if (immediate) {
      execute()
    }
  }, [execute, immediate])

  return { data, loading, error, execute, setData }
}

// 使用示例
function ConversationLoader({ id }: { id: string }) {
  const { data, loading, error, execute } = useAsync(
    () => fetchConversation(id),
    {
      immediate: true,
      onError: (err) => console.error('Failed to load:', err)
    }
  )

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} onRetry={execute} />
  if (!data) return null

  return <ConversationView conversation={data} />
}
```

---

## 十、性能优化规范

### 10.1 渲染优化

```typescript
// ========== 虚拟滚动（长列表）==========
// components/chat/VirtualMessageList.tsx
import { useVirtualizer } from '@tanstack/react-virtual'

interface VirtualMessageListProps {
  messages: Message[]
  height: number
  itemHeight?: number
}

export function VirtualMessageList({
  messages,
  height,
  itemHeight = 80
}: VirtualMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5
  })

  return (
    <div ref={parentRef} style={{ height, overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <MessageBubble message={messages[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ========== 代码分割 ==========
// 路由级别的代码分割
import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'

const HomePage = lazy(() => import('@pages/Home/HomePage'))
const ChatPage = lazy(() => import('@pages/Chat/ChatPage'))
const ModelLoaderPage = lazy(() => import('@pages/ModelLoader/ModelLoaderPage'))

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <HomePage />
      </Suspense>
    )
  },
  {
    path: '/chat/:id',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <ChatPage />
      </Suspense>
    )
  }
])

// 组件级别的代码分割
const VrmViewer = lazy(() => import('@components/vrm/VrmViewer'))

function App() {
  const [showVrm, setShowVrm] = useState(false)

  return (
    <div>
      <button onClick={() => setShowVrm(true)}>显示 VRM</button>
      {showVrm && (
        <Suspense fallback={<div>加载 VRM 组件...</div>}>
          <VrmViewer />
        </Suspense>
      )}
    </div>
  )
}
```

### 10.2 资源加载优化

```typescript
// ========== 图片懒加载 ==========
// components/common/LazyImage.tsx
import { useState, useEffect, useRef } from 'react'

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  placeholder?: string
}

export function LazyImage({ src, placeholder, alt, ...props }: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState(placeholder)
  const [isLoaded, setIsLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const img = new Image()
          img.src = src
          img.onload = () => {
            setImageSrc(src)
            setIsLoaded(true)
          }
          observer.disconnect()
        }
      },
      { rootMargin: '50px' }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [src])

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      className={`lazy-image ${isLoaded ? 'loaded' : 'loading'}`}
      {...props}
    />
  )
}

// ========== 预加载关键资源 ==========
// utils/preload.ts
export function preloadResources() {
  // 预加载字体
  const fontLink = document.createElement('link')
  fontLink.rel = 'preload'
  fontLink.as = 'font'
  fontLink.href = '/fonts/Inter.woff2'
  fontLink.crossOrigin = 'anonymous'
  document.head.appendChild(fontLink)

  // 预连接 API
  const preconnect = document.createElement('link')
  preconnect.rel = 'preconnect'
  preconnect.href = 'https://api.example.com'
  document.head.appendChild(preconnect)

  // 预加载关键图片
  const images = ['/logo.png', '/background.jpg']
  images.forEach(src => {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = src
    document.head.appendChild(link)
  })
}
```

### 10.3 内存管理

```typescript
// ========== 清理 Three.js 资源 ==========
// hooks/vrm/useVrmCleanup.ts
import { useEffect } from "react";

export function useVrmCleanup(vrm: VRM | null) {
  useEffect(() => {
    return () => {
      if (vrm) {
        // 清理动画
        vrm.animationMixer?.stopAllAction();

        // 清理材质
        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else {
                obj.material.dispose();
              }
            }
          }
        });

        // 清理纹理
        vrm.scene.traverse((obj) => {
          if (obj.isMesh && obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.forEach((material) => {
              Object.values(material).forEach((value) => {
                if (value?.isTexture) {
                  value.dispose();
                }
              });
            });
          }
        });

        // 从场景中移除
        vrm.scene.removeFromParent();
      }
    };
  }, [vrm]);
}

// ========== 清理定时器和事件监听 ==========
// hooks/common/useInterval.ts
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => savedCallback.current(), delay);

    return () => clearInterval(id);
  }, [delay]);
}

// ========== 清理 WebSocket 连接 ==========
// services/websocket/WebSocketService.ts
export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;

  connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.onclose = () => {
      this.handleDisconnect();
    };
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectTimer = setTimeout(
        () => {
          this.reconnectAttempts++;
          this.connect(this.ws!.url);
        },
        1000 * Math.pow(2, this.reconnectAttempts)
      );
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }
}
```

---

## 十一、测试规范

### 11.1 单元测试

```typescript
// core/vrm/VrmExpressionController.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { VrmExpressionController } from './VrmExpressionController'

describe('VrmExpressionController', () => {
  let controller: VrmExpressionController

  beforeEach(() => {
    controller = new VrmExpressionController()
  })

  describe('setExpression', () => {
    it('should set expression weight correctly', () => {
      controller.setExpression('happy', 0.8)
      expect(controller.getExpressionWeight('happy')).toBe(0.8)
    })

    it('should clamp weight to [0, 1] range', () => {
      controller.setExpression('happy', 1.5)
      expect(controller.getExpressionWeight('happy')).toBe(1)

      controller.setExpression('sad', -0.5)
      expect(controller.getExpressionWeight('sad')).toBe(0)
    })

    it('should override existing expression value', () => {
      controller.setExpression('happy', 0.5)
      controller.setExpression('happy', 0.9)
      expect(controller.getExpressionWeight('happy')).toBe(0.9)
    })
  })

  describe('resetAll', () => {
    it('should clear all expressions', () => {
      controller.setExpression('happy', 0.8)
      controller.setExpression('sad', 0.6)
      controller.resetAll()

      expect(controller.getExpressionWeight('happy')).toBe(0)
      expect(controller.getExpressionWeight('sad')).toBe(0)
    })
  })
})

// components/ui/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('should render children correctly', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeDefined()
  })

  it('should handle click events', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click me</Button>)

    fireEvent.click(screen.getByText('Click me'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('should be disabled when loading', () => {
    render(<Button loading>Click me</Button>)
    const button = screen.getByRole('button')
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('should apply variant classes correctly', () => {
    const { container } = render(<Button variant="primary">Click</Button>)
    expect(container.firstChild).toHaveClass('btn-primary')
  })
})
```

### 11.2 集成测试

```typescript
// tests/integration/chat.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatPage } from '@pages/Chat/ChatPage'

// Mock 依赖
vi.mock('@hooks/chat/useChat', () => ({
  useChat: vi.fn(() => ({
    messages: [
      { id: '1', role: 'user', content: 'Hello', createdAt: '2024-01-01' },
      { id: '2', role: 'assistant', content: 'Hi there!', createdAt: '2024-01-01' }
    ],
    isSending: false,
    sendMessage: vi.fn(),
    error: null
  }))
}))

describe('Chat Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display messages correctly', () => {
    render(<ChatPage />)

    expect(screen.getByText('Hello')).toBeDefined()
    expect(screen.getByText('Hi there!')).toBeDefined()
  })

  it('should send new message when user submits', async () => {
    const mockSend = vi.fn()
    vi.mocked(useChat).mockImplementation(() => ({
      messages: [],
      isSending: false,
      sendMessage: mockSend,
      error: null
    }))

    render(<ChatPage />)

    const input = screen.getByPlaceholderText('输入消息...')
    const button = screen.getByText('发送')

    await userEvent.type(input, 'Test message')
    await userEvent.click(button)

    expect(mockSend).toHaveBeenCalledWith('Test message')
  })
})
```

---

## 十二、代码检查清单

### 12.1 提交前检查清单

```markdown
## 代码质量检查

- [ ] 没有 TypeScript 类型错误
- [ ] 没有 ESLint 警告
- [ ] 所有函数都有明确的类型定义
- [ ] 没有使用 `any` 类型（除非有充分理由）
- [ ] 所有异步操作都有错误处理
- [ ] 没有 console.log 调试代码

## 性能检查

- [ ] 大列表使用了虚拟滚动
- [ ] 使用了 React.memo 避免不必要的重渲染
- [ ] 使用了 useCallback/useMemo 优化函数和计算
- [ ] 组件代码分割（lazy loading）
- [ ] 及时清理了事件监听和定时器

## 代码结构检查

- [ ] 函数不超过 30 行
- [ ] 组件不超过 200 行
- [ ] 参数不超过 3 个（或使用对象参数）
- [ ] 没有深层嵌套（使用早期返回）
- [ ] 遵循了目录结构规范

## 命名检查

- [ ] 文件命名符合规范
- [ ] 变量名清晰表意
- [ ] 函数名使用动词开头（如 get, set, handle, send）
- [ ] 布尔变量使用 is/has/can 前缀
- [ ] 常量使用全大写加下划线命名

## 文档检查

- [ ] 复杂函数有 JSDoc 注释
- [ ] 公共 API 有类型定义
- [ ] 新增功能更新了 README

## 测试检查

- [ ] 核心逻辑有单元测试
- [ ] 关键路径有集成测试
- [ ] 测试覆盖率达到 80% 以上
```

### 12.2 代码审查要点

```markdown
## 代码审查重点

### 功能正确性

- [ ] 代码是否实现了需求？
- [ ] 边界情况是否处理？
- [ ] 错误处理是否完善？

### 可维护性

- [ ] 代码是否易于理解？
- [ ] 是否有重复代码（DRY）？
- [ ] 是否有过度设计（YAGNI）？

### 安全性

- [ ] 是否有 XSS 风险？
- [ ] SQL 查询是否使用参数化？
- [ ] 敏感信息是否硬编码？

### 代码可读性

- [ ] 代码是否符合 Prettier 格式化规范？
- [ ] 代码是否使用了注释？
- [ ] 代码是否使用了空行？
- [ ] 代码是否使用了缩进？
- [ ] 代码是否使用行注释？

### 可扩展性

- [ ] 是否遵循开闭原则？
- [ ] 是否依赖抽象而非具体？
- [ ] 是否为未来扩展留有余地？

### 团队规范

- [ ] 是否遵循命名规范？
- [ ] 是否遵循目录结构？
- [ ] 是否使用统一的代码格式化？
```

---

## 附录

### A. 工具配置

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

```yaml
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

pnpm lint-staged
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,scss}": ["prettier --write"]
  }
}
```

---

**文档版本**: 1.0.0  
**最后更新**: 2024-01-01  
**维护者**: 开发团队
