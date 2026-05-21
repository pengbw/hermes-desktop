# Hermes Desktop 主题系统设计方案（shadcn/ui 版）

## 1. 设计目标

- 全面迁移至 shadcn/ui 生态（组件 + 图标）
- 建立一套可扩展、易维护的主题系统
- 支持 15 种风格化主题色系
- 每种主题同时支持 Light / Dark 两种基础色模式
- 统一 UI 组件视觉规范，标准组件全部使用 shadcn/ui
- 特殊组件（3D/VRM/音频等）保留自研，但 UI 控件使用 shadcn/ui
- 主题切换实时生效，无需刷新

---

## 2. 技术栈

| 层级 | 包名 | 用途 |
|------|------|------|
| UI 组件 | `shadcn/ui` | 完整组件库（Button, Card, Dialog 等 50+ 组件） |
| 图标 | `lucide-react` | shadcn/ui 默认图标库（1000+ 图标） |
| 基础原语 | `@radix-ui/*` | shadcn/ui 底层依赖（无样式组件） |
| 样式框架 | `tailwindcss` v4 | 已集成，shadcn/ui 基于 Tailwind |
| 主题变量 | CSS Variables | shadcn/ui 主题系统基于 CSS 自定义属性 |

### 安装命令

```bash
# 初始化 shadcn/ui（配置 Tailwind、路径别名、CSS 变量）
npx shadcn@latest init

# 安装基础组件
npx shadcn@latest add button card dialog input label tabs switch select table

# 安装扩展组件
npx shadcn@latest add dropdown-menu checkbox radio-group textarea
npx shadcn@latest add badge avatar separator skeleton tooltip
npx shadcn@latest add scroll-area collapsible accordion

# 图标库已包含在 shadcn/ui 依赖中
# lucide-react 会自动安装
```

---

## 3. 架构设计

### 3.1 三层架构

```
┌─────────────────────────────────────────────┐
│  基础色模式 (Base Color Mode)                  │
│  ├─ Light  (亮色模式)                         │
│  ├─ Dark   (暗色模式)                         │
│  └─ System (跟随系统，自动切换 Light/Dark)      │
├─────────────────────────────────────────────┤
│  主题色系 (Color Theme)                        │
│  ├─ classic      (经典标准)                   │
│  ├─ vivid        (鲜艳活力)                   │
│  ├─ subtle       (柔和优雅)                   │
│  ├─ warm         (暖色温馨)                   │
│  ├─ cool         (冷色专业)                   │
│  ├─ nature       (自然清新)                   │
│  ├─ modern       (现代简约)                   │
│  ├─ vibrant      (活力四射)                   │
│  ├─ professional (商务专业)                   │
│  ├─ soft         (梦幻柔美)                   │
│  ├─ bold         (大胆醒目)                   │
│  ├─ calm         (平静舒缓)                   │
│  ├─ candy        (糖果色彩)                   │
│  ├─ deep         (深邃神秘)                   │
│  └─ light        (清新淡雅)                   │
├─────────────────────────────────────────────┤
│  UI 风格 (UI Style)                            │
│  ├─ vega   (经典标准)                         │
│  ├─ nova   (紧凑高效)                         │
│  ├─ maia   (柔和圆润)                         │
│  ├─ lyra   (清晰结构化)                       │
│  ├─ mira   (高密度产品型)                     │
│  ├─ luma   (柔和流畅)                         │
│  └─ sera   (编辑排版型)                       │
└─────────────────────────────────────────────┘
```

### 3.2 shadcn/ui 主题配置

shadcn/ui 通过 CSS 变量实现主题系统：

```css
/* 每套主题对应一组 CSS 变量 */
@theme {
  --color-background: #ffffff;
  --color-foreground: #0a0a0a;
  --color-card: #ffffff;
  --color-card-foreground: #0a0a0a;
  --color-primary: #171717;
  --color-primary-foreground: #fafafa;
  --color-secondary: #f5f5f5;
  --color-secondary-foreground: #171717;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #737373;
  --color-accent: #f5f5f5;
  --color-accent-foreground: #171717;
  --color-border: #e5e5e5;
  --color-input: #e5e5e5;
  --color-ring: #a3a3a3;
  --radius: 0.5rem;
}
```

### 3.3 主题映射策略

| 我们的主题 | primary | secondary | accent | muted | 风格描述 |
|-----------|---------|-----------|--------|-------|---------|
| **classic** | #3B82F6 | #F1F5F9 | #EFF6FF | #F8FAFC | 经典标准，中性蓝 |
| **vivid** | #F97316 | #FFF7ED | #FFEDD5 | #FFFBEB | 鲜艳活力，橙红高饱和 |
| **subtle** | #8B7E8E | #F5F3F7 | #EDE9F2 | #FAF9FB | 柔和优雅，莫兰迪紫灰 |
| **warm** | #F59E0B | #FEF3C7 | #FDE68A | #FFFBEB | 暖色温馨，琥珀暖调 |

| **cool** | #0EA5E9 | #E0F2FE | #BAE6FD | #F0F9FF | 冷色专业，科技蓝 |
| **nature** | #22C55E | #DCFCE7 | #BBF7D0 | #F0FDF4 | 自然清新，草木绿 |
| **modern** | #6366F1 | #E0E7FF | #C7D2FE | #EEF2FF | 现代简约，靛蓝现代 |
| **vibrant** | #EF4444 | #FEE2E2 | #FECACA | #FEF2F2 | 活力四射，能量红 |
| **professional** | #475569 | #F1F5F9 | #E2E8F0 | #F8FAFC | 商务专业，深蓝稳重 |
| **soft** | #EC4899 | #FCE7F3 | #FBCFE8 | #FDF2F8 | 梦幻柔美，粉紫柔和 |
| **bold** | #18181B | #F4F4F5 | #E4E4E7 | #FFFFFF | 大胆醒目，高对比黑白 |
| **calm** | #6B8F71 | #E8F5E9 | #C8E6C9 | #F6F7F6 | 平静舒缓，灰青低饱和 |
| **candy** | #E11D48 | #FFE4E6 | #FECDD3 | #FFF1F2 | 糖果色彩，明快可爱 |
| **deep** | #7C3AED | #EDE9FE | #DDD6FE | #1E1B4B | 深邃神秘，深紫暗调 |
| **light** | #94A3B8 | #F1F5F9 | #E2E8F0 | #FFFFFF | 清新淡雅，极简浅灰 |

### 3.4 职责分离

| 层级 | 控制内容 | CSS 变量 |
|------|---------|---------|
| **基础色模式** | 背景色阶、文字色阶、边框、阴影深度 | `--background`, `--foreground`, `--border` |
| **主题色系** | 强调色、主色、状态色 | `--primary`, `--secondary`, `--accent` |
| **UI 风格** | 间距、圆角、阴影、边框宽度、组件密度 | `--spacing-*`, `--radius-*`, `--shadow-*`, `--border-width`, `--component-density` |
| **全局样式** | 圆角、字体 | `--radius`, `--font-*`, `--line-height-*` |

---

## 4. 15 个主题色系详细配置

### 4.1 配置总览

每个主题定义为一个配置对象：

```typescript
interface ThemeConfig {
  name: string;           // 英文标识
  label: string;          // 中文名称
  description: string;    // 风格描述
  variables: {
    light: ThemeVariables;
    dark: ThemeVariables;
  };
  radius: string;         // 圆角偏好
  preview: {
    accent: string;       // 主色预览（Hex）
    bg: string;           // 背景预览（Hex）
    text: string;         // 文字预览（Hex）
  };
}

interface ThemeVariables {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
}
```

### 4.2 各主题详细配置

#### classic（经典标准）
```typescript
{
  name: "classic",
  label: "经典标准",
  description: "最常见的组合，适用于大多数场景",
  radius: "0.5rem",
  variables: {
    light: {
      background: "#FFFFFF",
      foreground: "#0F172A",
      card: "#FFFFFF",
      cardForeground: "#0F172A",
      primary: "#3B82F6",
      primaryForeground: "#FFFFFF",
      secondary: "#F1F5F9",
      secondaryForeground: "#0F172A",
      muted: "#F8FAFC",
      mutedForeground: "#64748B",
      accent: "#EFF6FF",
      accentForeground: "#1D4ED8",
      border: "#E2E8F0",
      input: "#E2E8F0",
      ring: "#3B82F6"
    },
    dark: {
      background: "#0F172A",
      foreground: "#F8FAFC",
      card: "#1E293B",
      cardForeground: "#F8FAFC",
      primary: "#60A5FA",
      primaryForeground: "#0F172A",
      secondary: "#1E293B",
      secondaryForeground: "#F8FAFC",
      muted: "#334155",
      mutedForeground: "#94A3B8",
      accent: "#1E3A5F",
      accentForeground: "#93C5FD",
      border: "#334155",
      input: "#334155",
      ring: "#60A5FA"
    }
  }
}
```

#### vivid（鲜艳活力）
```typescript
{
  name: "vivid",
  label: "鲜艳活力",
  description: "高饱和度，适合年轻化产品和创意应用",
  radius: "0.75rem",
  variables: {
    light: {
      background: "#FFFBEB",
      foreground: "#431407",
      card: "#FFFFFF",
      cardForeground: "#431407",
      primary: "#F97316",
      primaryForeground: "#FFFFFF",
      secondary: "#FFF7ED",
      secondaryForeground: "#9A3412",
      muted: "#FFEDD5",
      mutedForeground: "#C2410C",
      accent: "#FDBA74",
      accentForeground: "#7C2D12",
      border: "#FED7AA",
      input: "#FED7AA",
      ring: "#F97316"
    },
    dark: {
      background: "#431407",
      foreground: "#FFEDD5",
      card: "#7C2D12",
      cardForeground: "#FFEDD5",
      primary: "#FB923C",
      primaryForeground: "#431407",
      secondary: "#9A3412",
      secondaryForeground: "#FFEDD5",
      muted: "#7C2D12",
      mutedForeground: "#FDBA74",
      accent: "#C2410C",
      accentForeground: "#FED7AA",
      border: "#9A3412",
      input: "#9A3412",
      ring: "#FB923C"
    }
  }
}
```

> 其他 13 个主题配置类似，详见 `src/themes/configs/` 目录下的独立文件。

---

## 5. UI 组件设计规范（shadcn/ui）

### 5.1 按钮 (Button)

使用 shadcn/ui `Button` 组件：

```tsx
import { Button } from "@/components/ui/button";
import { Plus, Save, Trash2 } from "lucide-react";

// 主要按钮
<Button>保存</Button>

// 次要按钮
<Button variant="secondary">取消</Button>

// 幽灵按钮
<Button variant="ghost">更多</Button>

// 描边按钮
<Button variant="outline">备选</Button>

// 危险操作
<Button variant="destructive"><Trash2 /> 删除</Button>

// 带图标
<Button><Plus /> 新建</Button>

// 不同尺寸
<Button size="sm">小</Button>
<Button size="default">默认</Button>
<Button size="lg">大</Button>
<Button size="icon"><Save /></Button>
```

**样式规范：**

| 类型 | variant | 用途 |
|------|---------|------|
| 主要 | `default` | 主操作、保存、确认 |
| 次要 | `secondary` | 次要操作、取消 |
| 幽灵 | `ghost` | 低优先级、工具栏 |
| 描边 | `outline` | 备选操作 |
| 危险 | `destructive` | 删除、危险操作 |
| 链接 | `link` | 文字链接 |

### 5.2 卡片 (Card)

使用 shadcn/ui `Card` 组件：

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>卡片标题</CardTitle>
    <CardDescription>卡片描述文字</CardDescription>
  </CardHeader>
  <CardContent>
    <p>内容区域</p>
  </CardContent>
  <CardFooter>
    <Button>操作</Button>
  </CardFooter>
</Card>
```

### 5.3 输入框 (Input)

使用 shadcn/ui `Input` 组件：

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

<div className="grid w-full max-w-sm items-center gap-1.5">
  <Label htmlFor="email">邮箱</Label>
  <Input type="email" id="email" placeholder="请输入邮箱" />
</div>
```

### 5.4 对话框 (Dialog)

使用 shadcn/ui `Dialog` 组件：

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

<Dialog>
  <DialogTrigger asChild>
    <Button>打开对话框</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>确认删除</DialogTitle>
      <DialogDescription>
        此操作不可撤销，确定要删除吗？
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="secondary">取消</Button>
      <Button variant="destructive">删除</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 5.5 标签页 (Tabs)

使用 shadcn/ui `Tabs` 组件：

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

<Tabs defaultValue="general">
  <TabsList>
    <TabsTrigger value="general">常规</TabsTrigger>
    <TabsTrigger value="appearance">外观</TabsTrigger>
    <TabsTrigger value="advanced">高级</TabsTrigger>
  </TabsList>
  <TabsContent value="general">常规设置内容</TabsContent>
  <TabsContent value="appearance">外观设置内容</TabsContent>
  <TabsContent value="advanced">高级设置内容</TabsContent>
</Tabs>
```

### 5.6 下拉选择 (Select)

使用 shadcn/ui `Select` 组件：

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

<Select>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="选择主题" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="classic">经典标准</SelectItem>
    <SelectItem value="vivid">鲜艳活力</SelectItem>
    <SelectItem value="subtle">柔和优雅</SelectItem>
  </SelectContent>
</Select>
```

### 5.7 开关 (Switch)

使用 shadcn/ui `Switch` 组件：

```tsx
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

<div className="flex items-center space-x-2">
  <Switch id="airplane-mode" />
  <Label htmlFor="airplane-mode">飞行模式</Label>
</div>
```

### 5.8 表格 (Table)

使用 shadcn/ui `Table` 组件：

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

<Table>
  <TableCaption>知识库文件列表</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead>文件名</TableHead>
      <TableHead>类型</TableHead>
      <TableHead>大小</TableHead>
      <TableHead>操作</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>document.pdf</TableCell>
      <TableCell>PDF</TableCell>
      <TableCell>2.5MB</TableCell>
      <TableCell><Button variant="ghost" size="sm">删除</Button></TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### 5.9 图标使用

使用 Lucide Icons（shadcn/ui 默认）：

```tsx
import { 
  Sun, 
  Moon, 
  Settings, 
  Home,
  User,
  Plus,
  X,
  Check,
  ChevronDown,
  Search,
  Trash2,
  Edit,
  Copy,
  Download,
  Upload,
  Mic,
  Send,
  Paperclip,
  Bot,
  Sparkles,
  BookOpen,
  MessageSquare,
  Wand2,
  LayoutGrid,
  PanelLeft
} from "lucide-react";

<Sun className="h-4 w-4" />
<Settings className="h-5 w-5" />
```

**常用图标映射：**

| 用途 | 图标名 |
|------|--------|
| 浅色模式 | `Sun` |
| 深色模式 | `Moon` |
| 系统设置 | `Settings` |
| 首页 | `Home` |
| 用户 | `User` |
| 添加 | `Plus` |
| 关闭 | `X` |
| 确认 | `Check` |
| 下拉 | `ChevronDown` |
| 搜索 | `Search` |
| 删除 | `Trash2` |
| 编辑 | `Edit` |
| 复制 | `Copy` |
| 下载 | `Download` |
| 上传 | `Upload` |
| 语音 | `Mic` |
| 发送 | `Send` |
| 附件 | `Paperclip` |
| AI/机器人 | `Bot` |
| 魔法/技能 | `Sparkles`, `Wand2` |
| 知识库 | `BookOpen` |
| 聊天 | `MessageSquare` |
| 工作室 | `LayoutGrid` |
| 侧边栏 | `PanelLeft` |

---

## 6. 主题选择器 UI 设计

### 6.1 布局结构

```
┌─────────────────────────────────────────────┐
│  主题设置                                      │
├─────────────────────────────────────────────┤
│                                              │
│  基础色模式                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │   ☀️     │ │   🌙     │ │   🖥️     │    │
│  │  浅色    │ │  深色    │ │  跟随系统 │    │
│  │ [选中]   │ │          │ │          │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  ─────────────────────────────────────────  │
│                                              │
│  主题色系                                      │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ 🎨         │ │ 🎨         │ │ 🎨       │ │
│  │ classic    │ │ vivid      │ │ subtle   │ │
│  │ 经典标准   │ │ 鲜艳活力   │ │ 柔和优雅 │ │
│  │ [●───────]│ │ [●───────]│ │          │ │
│  └────────────┘ └────────────┘ └──────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ ...        │ │ ...        │ │ ...      │ │
│  └────────────┘ └────────────┘ └──────────┘ │
│                                              │
└─────────────────────────────────────────────┘
```

### 6.2 主题卡片设计

```
┌────────────────────────┐
│  ┌──────────────────┐  │
│  │  主色预览色块     │  │  ← 圆角矩形，展示 primary 色
│  │  #3B82F6         │  │
│  └──────────────────┘  │
│                        │
│  🎨 classic            │  ← 图标 + 英文名
│  经典标准               │  ← 中文描述
│                        │
│  ┌────┐ ┌────┐        │  ← 3 个迷你色块：
│  │primary│ │bg   │        │     primary / bg / text
│  └────┘ └────┘        │
│                        │
│  [当前使用]            │  ← 选中状态标识
└────────────────────────┘
```

### 6.3 交互状态

| 状态 | 样式 |
|------|------|
| 默认 | `border: 1px solid hsl(var(--border))` |
| 悬停 | `border-color: hsl(var(--primary))`, `shadow-md` |
| 选中 | `border: 2px solid hsl(var(--primary))`, `ring-2 ring-primary` |
| 禁用 | `opacity: 50`, `cursor: not-allowed` |

---

## 7. 文件结构规划

```
src/
├── components/
│   └── ui/                    # shadcn/ui 组件目录（CLI 自动生成）
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── tabs.tsx
│       ├── switch.tsx
│       ├── select.tsx
│       ├── table.tsx
│       ├── dropdown-menu.tsx
│       ├── checkbox.tsx
│       ├── radio-group.tsx
│       ├── textarea.tsx
│       ├── badge.tsx
│       ├── avatar.tsx
│       ├── separator.tsx
│       ├── skeleton.tsx
│       ├── tooltip.tsx
│       ├── scroll-area.tsx
│       ├── collapsible.tsx
│       ├── accordion.tsx
│       └── ...                # 其他组件
│
├── components/
│   └── settings/
│       ├── ThemePicker.tsx    # 主题选择器组件（使用 shadcn/ui）
│       └── ...                # 其他设置组件
│
├── themes/
│   ├── types.ts               # 类型定义
│   ├── registry.ts            # 主题注册表（15个主题配置）
│   ├── configs/               # 各主题独立配置文件
│   │   ├── classic.ts
│   │   ├── vivid.ts
│   │   ├── subtle.ts
│   │   └── ...
│   └── index.ts               # 统一导出
│
├── contexts/
│   └── ThemeContext.tsx       # 主题上下文（管理 mode + themeName）
│
├── styles/
│   ├── index.css              # 全局样式 + Tailwind 配置
│   └── themes.css             # 主题变量定义
│
├── lib/
│   └── utils.ts               # shadcn/ui 工具函数（cn 等）
│
└── pages/
    ├── settings/
    │   └── SettingsPanel.tsx  # 设置页面（使用 shadcn/ui 重构）
    ├── home/
    │   └── HomePanel.tsx      # 首页（使用 shadcn/ui 重构）
    ├── chat/
    │   └── ChatPanel.tsx      # 聊天页（使用 shadcn/ui 重构）
    ├── studio/
    │   └── StudioPanel.tsx    # 工作室（使用 shadcn/ui 重构）
    ├── knowledge/
    │   └── KnowledgePanel.tsx # 知识库（使用 shadcn/ui 重构）
    └── ...
```

---

## 8. TypeScript 类型设计

```typescript
// src/themes/types.ts

export type BaseMode = "light" | "dark" | "system";

export interface ThemeVariables {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
}

export interface ThemePreview {
  accent: string;
  bg: string;
  text: string;
}

export interface ThemeDefinition {
  name: string;
  label: string;
  description: string;
  radius: string;
  variables: {
    light: ThemeVariables;
    dark: ThemeVariables;
  };
  preview: ThemePreview;
}

export interface ThemeContextValue {
  baseMode: BaseMode;
  themeName: string;
  resolvedMode: "light" | "dark";  // 实际生效的模式（system 会被解析）
  currentTheme: ThemeDefinition;    // 当前主题配置
  setBaseMode: (mode: BaseMode) => void;
  setThemeName: (name: string) => void;
}
```

---

## 9. ThemeContext 设计

```tsx
// src/contexts/ThemeContext.tsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import { themes, getThemeByName, getDefaultTheme } from '../themes/registry';
import type { BaseMode, ThemeContextValue, ThemeDefinition } from '../themes/types';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [baseMode, setBaseMode] = useState<BaseMode>(() => {
    return (localStorage.getItem('hermes-base-mode') as BaseMode) || 'system';
  });
  
  const [themeName, setThemeName] = useState(() => {
    return localStorage.getItem('hermes-theme-name') || 'classic';
  });

  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">("light");

  const currentTheme = getThemeByName(themeName) || getDefaultTheme();

  // 解析 system 模式
  useEffect(() => {
    if (baseMode === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedMode(media.matches ? 'dark' : 'light');
      
      const handler = (e: MediaQueryListEvent) => {
        setResolvedMode(e.matches ? 'dark' : 'light');
      };
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    } else {
      setResolvedMode(baseMode);
    }
  }, [baseMode]);

  // 应用 CSS 变量
  useEffect(() => {
    const vars = currentTheme.variables[resolvedMode];
    const root = document.documentElement;
    
    root.style.setProperty('--background', vars.background);
    root.style.setProperty('--foreground', vars.foreground);
    root.style.setProperty('--card', vars.card);
    root.style.setProperty('--card-foreground', vars.cardForeground);
    root.style.setProperty('--primary', vars.primary);
    root.style.setProperty('--primary-foreground', vars.primaryForeground);
    root.style.setProperty('--secondary', vars.secondary);
    root.style.setProperty('--secondary-foreground', vars.secondaryForeground);
    root.style.setProperty('--muted', vars.muted);
    root.style.setProperty('--muted-foreground', vars.mutedForeground);
    root.style.setProperty('--accent', vars.accent);
    root.style.setProperty('--accent-foreground', vars.accentForeground);
    root.style.setProperty('--border', vars.border);
    root.style.setProperty('--input', vars.input);
    root.style.setProperty('--ring', vars.ring);
    root.style.setProperty('--radius', currentTheme.radius);
    
    // 设置 data-theme 属性用于特定选择器
    root.setAttribute('data-theme', themeName);
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedMode);
  }, [currentTheme, resolvedMode, themeName]);

  // 持久化
  useEffect(() => {
    localStorage.setItem('hermes-base-mode', baseMode);
    localStorage.setItem('hermes-theme-name', themeName);
  }, [baseMode, themeName]);

  const value: ThemeContextValue = {
    baseMode,
    themeName,
    resolvedMode,
    currentTheme,
    setBaseMode,
    setThemeName,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
```

---

## 10. 实施阶段（结合项目功能分步完成）

### 阶段 1：环境准备（约 2h）✅ 已完成

**目标**：初始化 shadcn/ui，建立主题系统基础设施

**修改列表**：
- [x] ~~运行 `npx shadcn@latest init` 初始化配置~~（CLI 安装失败，改为手动创建核心组件）
- [x] ~~安装基础组件：`button`, `card`, `dialog`, `input`, `label`, `tabs`, `switch`, `select`~~（手动创建 Button、Card、Badge、Tooltip 等组件）
- [x] 创建 `src/themes/types.ts` 类型定义文件（包含 FontConfig、UIStyleConfig 扩展）
- [x] 创建 `src/themes/configs/` 目录，编写 15 个主题配置文件（含字体配置）
- [x] 创建 `src/themes/ui-styles.ts` 7 种 UI 风格配置
- [x] 创建 `src/themes/registry.ts` 主题注册表
- [x] 创建 `src/contexts/ThemeContext.tsx` 主题上下文（支持 baseMode + themeName + uiStyle）
- [x] 更新 `src/styles/index.css`，添加 CSS 变量和暗色回退值
- [x] 在 `src/App.tsx` 中包裹 `ThemeProvider`
- [x] 验证主题切换功能正常

**项目功能影响**：无，仅添加基础设施

---

### 阶段 2：主题选择器重构（约 3h）✅ 已完成

**目标**：重构设置页面的主题选择器，使用 shadcn/ui 组件

**修改列表**：
- [x] 重构 `src/components/settings/ThemePicker.tsx`
  - 使用 Tailwind 工具类实现主题卡片网格布局
  - 实现 Tab 导航（主题/风格/模式三栏切换）
  - 添加 UI 风格选择支持（7 种风格）
  - 添加键盘导航支持（Escape 关闭）
  - 删除 `ThemePicker.module.css`
- [x] 重构 `src/components/settings/SystemSettings.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 保留自研 Switch 组件（与 shadcn/ui Switch 功能等效）
- [x] 更新 `src/pages/settings/SettingsPanel.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 删除 `SettingsPanel.module.css`

**项目功能影响**：设置页面 UI 升级，功能保持不变

---

### 阶段 3：首页重构（约 4h）✅ 已完成

**目标**：重构首页，使用 shadcn/ui 组件

**修改列表**：
- [x] 检查 `src/pages/home/HomePanel.tsx`
  - 已经是现代化实现，使用 Tailwind 工具类
  - 无 CSS Module 依赖
- [x] 检查 `src/components/home/QuickActions.tsx`
  - 使用 shadcn/ui `Card`、`Button`
  - 使用 Lucide `RefreshCw` 图标
  - 使用 Tailwind 工具类
- [x] 检查 `src/components/home/HermesStatus.tsx`
  - 使用 shadcn/ui `Avatar`、`Card`
  - 使用 Tailwind 工具类
- [x] 检查 `src/components/home/HomeChatInput.tsx`
  - 使用 shadcn/ui `Textarea`、`Button`
  - 使用 Lucide `Send`, `Mic`, `Paperclip` 图标
  - 使用 Tailwind 工具类

**项目功能影响**：首页已经是现代化实现，无需重构

---

### 阶段 4：聊天页面重构（约 5h）✅ 已完成

**目标**：重构聊天页面，使用 shadcn/ui 组件

**修改列表**：
- [x] 检查 `src/pages/chat/ChatPanel.tsx`
  - 已经是现代化实现，使用 Tailwind 工具类
  - 无 CSS Module 依赖
- [x] 检查 `src/components/chat/MessageBubble.tsx`
  - 已经是现代化实现，使用 Tailwind 工具类
  - 使用 Lucide 图标
- [x] 检查 `src/components/chat/MessageInput.tsx`
  - 使用 shadcn/ui `Textarea`、`Button`
  - 使用 Tailwind 工具类
  - 删除未引用的 `MessageInput.module.css`
- [x] 检查 `src/components/chat/ConversationList.tsx`
  - 使用 shadcn/ui `Button`、`Input`、`Badge`
  - 使用 Tailwind 工具类
  - 删除未引用的 `ConversationList.module.css`
- [x] 重构 `src/components/chat/AudioPlayer.tsx`
  - 移除 CSS Module，使用 Tailwind 工具类
  - 删除 `AudioPlayer.module.css`
- [x] 检查 `src/components/chat/StreamingIndicator.tsx`
  - 已经是现代化实现，使用 Tailwind 工具类

**项目功能影响**：聊天页面 UI 升级，功能保持不变

---

### 阶段 5：设置页面完整重构（约 4h）✅ 已完成

**目标**：完成设置页面所有子模块的重构

**修改列表**：
- [x] 重构 `src/components/settings/ProviderSettings.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 删除 `ProviderSettings.module.css`
- [x] 重构 `src/components/settings/ProviderModal.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 删除 `ProviderModal.module.css`
- [x] 重构 `src/components/settings/AgentSettings.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 删除 `AgentSettings.module.css`
- [x] 重构 `src/components/settings/AiRolesSettings.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 移除 `studioStyles` 跨页面依赖
- [x] 重构 `src/components/settings/KnowledgeSettings.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 删除 `KnowledgeSettings.module.css`
- [x] 重构 `src/components/settings/GestureSettings.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 删除 `GestureSettings.module.css`
- [x] 重构 `src/components/settings/ChannelSettings.tsx`
  - 使用 Tailwind 工具类替换 CSS Module
  - 重构 `ChannelCard.tsx`, `ChannelQrModal.tsx`, `ChannelConfigModal.tsx`
  - 删除 `ChannelSettings.module.css`, `ChannelCard.module.css`, `ChannelQrModal.module.css`, `ChannelConfigModal.module.css`

**项目功能影响**：设置页面完整 UI 升级，功能保持不变

---

### 阶段 6：工作室页面重构（约 5h）✅ 已完成（部分）

**目标**：重构工作室页面，移除跨页面 CSS Module 依赖

**修改列表**：
- [x] 重构 `src/pages/studio/StudioPanel.tsx`
  - 移除 `styles` 引用，使用 Tailwind 工具类
  - 保留 `StudioPanel.module.css` 供工作室子组件内部使用
- [x] 重构 `src/components/settings/AiRolesSettings.tsx`
  - 移除 `studioStyles` 跨页面依赖
  - 使用 Tailwind 工具类替换所有工作室样式引用
- [ ] 重构工作室子组件（ProjectList、TaskBoard 等）- 待后续迭代
  - 当前保留 `StudioPanel.module.css` 作为工作室页面内部共享样式

**项目功能影响**：设置页面与工作室页面解耦，功能保持不变

---

### 阶段 7：知识库页面重构（约 3h）✅ 已完成（部分）

**目标**：移除知识库页面的跨页面 CSS Module 依赖

**修改列表**：
- [x] 重构 `src/pages/knowledge/KnowledgePanel.tsx`
  - 移除 `cardStyles`（CardManagerPanel.module.css）跨页面依赖
  - 使用 Tailwind 工具类替换按钮样式
- [x] 重构 `src/components/knowledge/KnowledgeBaseList.tsx`
  - 移除 `cardStyles` 跨页面依赖
  - 使用 Tailwind 工具类替换按钮样式
- [ ] 重构知识库子组件 - 待后续迭代
  - 当前保留 `KnowledgePanel.module.css` 作为知识库页面内部共享样式

**项目功能影响**：知识库页面与卡片管理页面解耦，功能保持不变

---

### 阶段 8：技能页面和卡片管理重构（约 3h）✅ 已完成（部分）

**目标**：移除技能页面的跨页面 CSS Module 依赖

**修改列表**：
- [x] 重构 `src/pages/skills/SkillsPanel.tsx`
  - 移除 `cardStyles`（CardManagerPanel.module.css）跨页面依赖
  - 使用 Tailwind 工具类替换按钮样式
- [ ] 重构 `src/pages/cards/CardManagerPanel.tsx` - 待后续迭代

**项目功能影响**：技能页面与卡片管理页面解耦，功能保持不变

---

### 阶段 9：全局组件和样式清理（约 3h）✅ 已完成

**目标**：统一全局组件，清理跨页面 CSS Module 依赖

**修改列表**：
- [x] 扫描全项目 CSS Module 引用
  - 确认已无跨页面 CSS Module 依赖
  - 27 处剩余引用均为页面/组件内部自用，架构合理
- [x] 清理已删除组件的 CSS Module
  - `ThemePicker.module.css` ✅ 已删除
  - `SettingsPanel.module.css` ✅ 已删除
  - `AgentSettings.module.css` ✅ 已删除
  - `ProviderSettings.module.css` ✅ 已删除
  - `ProviderModal.module.css` ✅ 已删除
  - `KnowledgeSettings.module.css` ✅ 已删除
  - `GestureSettings.module.css` ✅ 已删除
  - `ChannelSettings.module.css` ✅ 已删除
  - `ChannelCard.module.css` ✅ 已删除
  - `ChannelQrModal.module.css` ✅ 已删除
  - `ChannelConfigModal.module.css` ✅ 已删除
- [ ] 保留的 CSS Module（页面内部共享）
  - `StudioPanel.module.css` - 工作室页面内部 15+ 子组件共享
  - `KnowledgePanel.module.css` - 知识库页面内部 3 个子组件共享
  - `SkillsPanel.module.css` - 技能页面自用
  - `CardManagerPanel.module.css` - 卡片管理页面自用
  - `MainWindow.module.css` - 主窗口自用
  - `ChatWindow.module.css` - 聊天窗口自用
  - `AvatarWindow.module.css` - 头像窗口自用
  - ~~`AudioPlayer.module.css`~~ ✅ 已删除
  - `GestureEditor.module.css` - 手势编辑器自用
  - `InstallGuide.module.css` - 安装向导自用

**项目功能影响**：全局 UI 统一，跨页面依赖已清理

---

### 阶段 10：特殊组件适配（约 2h）✅ 已完成

**目标**：确保主题系统与全局样式兼容

**修改列表**：
- [x] 适配全局样式
  - 更新 `src/styles/index.css`，添加暗色回退值（避免页面初始加载闪白）
  - 添加字体 CSS 变量（`--font-family`, `--font-size-*`, `--font-weight-*`, `--line-height-*`）
  - 添加 UI 风格 CSS 变量（`--spacing-*`, `--radius-*`, `--shadow-*`, `--border-width`, `--component-density`）
  - 添加密度工具类（`.density-compact`, `.density-normal`, `.density-spacious`）
- [x] 验证主题系统完整性
  - 15 个主题配置完整
  - 7 种 UI 风格配置完整
  - 字体模板复用正常
  - 主题切换实时生效
- [ ] 适配 Markdown 渲染器 - 待后续迭代
- [ ] 适配音频播放器 - 待后续迭代
- [ ] 适配 3D/VR 场景 - 待后续迭代
- [ ] 适配 VRM 模型查看器 - 待后续迭代

**项目功能影响**：主题系统基础设施完整，特殊组件核心逻辑保留

---

## 11. 组件使用策略

### 11.1 使用 shadcn/ui 的组件（标准 UI）

| 组件类别 | shadcn/ui 组件 | 用途 |
|---------|---------------|------|
| 基础 | `Button`, `Card`, `Input`, `Label`, `Textarea` | 表单、按钮、卡片 |
| 布局 | `Tabs`, `Separator`, `ScrollArea`, `Resizable` | 页面布局 |
| 反馈 | `Dialog`, `AlertDialog`, `Toast`, `Skeleton`, `Progress` | 弹窗、加载、提示 |
| 数据 | `Table`, `Select`, `Checkbox`, `RadioGroup`, `Switch` | 数据展示、表单 |
| 导航 | `DropdownMenu`, `Command`, `NavigationMenu` | 菜单、命令面板 |
| 展示 | `Badge`, `Avatar`, `Tooltip`, `Accordion`, `Collapsible` | 状态、头像、折叠 |

### 11.2 保留自研的组件（特殊功能）

| 组件 | 保留原因 | UI 控件使用 shadcn/ui |
|------|---------|---------------------|
| `MarkdownRenderer` | 复杂的 Markdown 渲染逻辑 | 是（包裹容器、按钮） |
| `AudioPlayer` | 音频播放核心逻辑 | 是（控制按钮、进度条） |
| `OfficeScene3D` | Three.js 3D 场景 | 是（控制面板 UI） |
| `VRMViewer` | VRM 模型渲染 | 是（控制面板 UI） |
| `StreamingIndicator` | 流式响应动画 | 是（容器、图标） |
| `MessageBubble` | 消息布局逻辑 | 是（Card、Avatar、Button） |

---

## 12. 样式迁移指南

### 12.1 CSS Modules → Tailwind + shadcn/ui

**迁移前（CSS Modules）：**
```tsx
import styles from "./Button.module.css";

<button className={styles.primary}>保存</button>
```

**迁移后（shadcn/ui）：**
```tsx
import { Button } from "@/components/ui/button";

<Button>保存</Button>
```

### 12.2 自定义样式 → Tailwind 工具类

**迁移前：**
```css
.customCard {
  padding: 16px;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

**迁移后：**
```tsx
<Card className="p-4 rounded-lg shadow-md">
  内容
</Card>
```

### 12.3 主题变量使用

```tsx
// 使用 CSS 变量
<div className="bg-background text-foreground border-border">
  自适应主题的内容
</div>

// 使用 primary 色
<Button className="bg-primary text-primary-foreground">
  主色按钮
</Button>
```

---

## 13. 风险与注意事项

### 13.1 React 19 兼容性

- shadcn/ui 官方支持 React 18，React 19 可能需要测试
- 如遇问题，可考虑降级到 React 18

### 13.2 Tailwind v4 兼容性

- 项目当前使用 Tailwind v4，shadcn/ui 已支持
- 注意 `@import "tailwindcss"` 和 `@theme` 语法

### 13.3 性能考虑

- shadcn/ui 组件代码在本地，不会增加包体积
- CSS 变量切换性能优秀，无闪烁
- 建议按需安装组件，不要一次性安装全部

### 13.4 回滚方案

- 每个阶段独立，可单独回滚
- 保留 Git 提交记录，方便回溯
- 建议在功能分支上开发，测试通过后合并

---

## 14. 参考资源

- shadcn/ui 官方文档：https://ui.shadcn.com/
- shadcn/ui 组件列表：https://ui.shadcn.com/docs/components
- shadcn/ui 主题系统：https://ui.shadcn.com/docs/theming
- Tailwind CSS v4 文档：https://tailwindcss.com/docs
- Lucide Icons：https://lucide.dev/icons/
- Radix UI Primitives：https://www.radix-ui.com/
