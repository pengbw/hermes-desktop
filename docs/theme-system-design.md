# Hermes Desktop 主题系统设计方案

## 1. 概述

基于 [uitest](https://github.com/joshhu/uitest) 57 种 UI 风格参考，为 Hermes Desktop 设计一套可扩展的主题系统。用户可以在不改变组件布局的前提下，自由切换视觉风格，包括配色、阴影、边框、特效等。

## 2. 设计目标

| 目标         | 说明                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| **布局不变** | 主题切换仅影响视觉样式（颜色、阴影、圆角、特效），不改变任何组件布局和 DOM 结构 |
| **零侵入**   | 现有组件代码无需修改，仅通过 CSS 变量驱动样式变化                               |
| **可扩展**   | 新增主题只需添加一个 CSS 文件 + 一条注册记录，无需改动业务代码                  |
| **性能优先** | 主题切换无闪烁，CSS 变量切换即时生效，无需重新渲染组件                          |
| **持久化**   | 用户选择的主题保存到 localStorage，下次启动自动恢复                             |
| **系统适配** | 保留 `system` 模式，跟随操作系统明暗偏好                                        |

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                  用户界面层                       │
│  ThemePicker 组件 → 用户选择主题                  │
└──────────────────┬──────────────────────────────┘
                   │ setTheme(name)
┌──────────────────▼──────────────────────────────┐
│              ThemeContext (React)                 │
│  - theme: string (主题名)                        │
│  - colorMode: 'light' | 'dark'                  │
│  - setTheme(name) → 更新 data-theme 属性         │
│  - 持久化到 localStorage                         │
└──────────────────┬──────────────────────────────┘
                   │ document.documentElement.setAttribute('data-theme', name)
┌──────────────────▼──────────────────────────────┐
│              CSS 变量层                           │
│  [data-theme="glassmorphism"] {                  │
│    --color-bg: ...; --color-surface: ...;        │
│    --effect-glass: ...;  ← 主题特有变量          │
│  }                                               │
└──────────────────┬──────────────────────────────┘
                   │ var(--color-bg), var(--effect-glass)
┌──────────────────▼──────────────────────────────┐
│              组件样式层                           │
│  CSS Modules / index.css 引用 CSS 变量           │
│  组件无需感知当前主题                             │
└─────────────────────────────────────────────────┘
```

### 3.2 主题模型

```typescript
type ColorMode = "light" | "dark";

interface ThemeDefinition {
  name: string; // 唯一标识，如 'glassmorphism'
  label: string; // 显示名称，如 '玻璃拟态'
  icon: string; // 主题图标 emoji
  colorMode: ColorMode; // 明暗模式分类
  preview: {
    // 主题预览色（用于主题选择器）
    primary: string;
    bg: string;
    surface: string;
  };
}
```

### 3.3 主题命名规范

CSS `data-theme` 属性值采用 `{colorMode}-{styleName}` 格式：

| 主题     | data-theme 值        | 说明         |
| -------- | -------------------- | ------------ |
| 默认亮色 | `light`              | 现有默认主题 |
| 默认暗色 | `dark`               | 现有暗色主题 |
| 玻璃拟态 | `dark-glassmorphism` | 毛玻璃效果   |
| 新拟态   | `light-neumorphism`  | 柔和阴影凸起 |
| 赛博朋克 | `dark-cyberpunk`     | 霓虹发光     |
| 极光     | `dark-aurora`        | 梦幻渐变     |
| 复古暖调 | `light-retro`        | 暖色怀旧     |
| 电子墨水 | `light-eink`         | 纸张质感     |

## 4. 文件结构

```
src/
├── styles/
│   ├── index.css                    # 全局基础样式（不变）
│   ├── themes.css                   # 现有 light/dark 主题（保留兼容）
│   └── themes/                      # 新增：主题目录
│       ├── glassmorphism.css        # 玻璃拟态主题
│       ├── neumorphism.css          # 新拟态主题
│       ├── cyberpunk.css            # 赛博朋克主题
│       ├── aurora.css               # 极光主题
│       ├── retro.css                # 复古暖调主题
│       └── eink.css                 # 电子墨水主题
├── themes/                          # 新增：主题注册表
│   ├── registry.ts                  # 主题定义注册表
│   └── types.ts                     # 主题类型定义
├── contexts/
│   └── ThemeContext.tsx              # 扩展：支持多主题
├── components/
│   └── settings/
│       └── ThemePicker.tsx          # 新增：主题选择器组件
```

## 5. 核心实现

### 5.1 CSS 变量体系

每个主题必须定义以下完整变量集（基于现有 themes.css 扩展）：

```css
[data-theme="dark-glassmorphism"] {
  /* ── 基础色 ── */
  --color-bg: ...;
  --color-surface: ...;
  --color-text: ...;
  --color-text-secondary: ...;
  --color-border: ...;

  /* ── 侧边栏 ── */
  --color-sidebar-bg: ...;
  --color-sidebar-border: ...;

  /* ── 输入框 ── */
  --color-input-bg: ...;

  /* ── 交互 ── */
  --color-hover: ...;
  --hover-bg: ...;
  --color-primary: ...;
  --color-primary-hover: ...;

  /* ── 消息气泡 ── */
  --color-msg-user-bg: ...;
  --color-msg-user-text: ...;
  --color-msg-assistant-bg: ...;
  --color-msg-assistant-text: ...;

  /* ── 导航 ── */
  --color-nav-bg: ...;
  --color-nav-hover: ...;
  --color-nav-active: ...;
  --color-nav-text: ...;
  --color-nav-text-active: ...;

  /* ── 其他 ── */
  --color-section-bg: ...;
  --color-shadow: ...;
  --color-toolbar-bg: ...;
  --color-toolbar-border: ...;
  --card-bg: ...;
  --text-primary: ...;
  --text-secondary: ...;
  --text-tertiary: ...;
  --border-color: ...;
  --input-bg: ...;
  --bg-primary: ...;
  --bg-secondary: ...;
  --bg-tertiary: ...;
  --bg-hover: ...;
  --primary: ...;
  --color-bg-secondary: ...;
  --color-text-primary: ...;

  /* ── 主题特有变量（可选）── */
  --effect-glass-blur: 20px;
  --effect-glass-opacity: 0.15;
  --effect-glass-border-opacity: 0.2;
  --effect-neon-glow: 0 0 10px rgba(0, 255, 255, 0.5);
  --effect-gradient: linear-gradient(135deg, #667eea, #764ba2);
}
```

### 5.2 主题特有效效类

某些主题需要特殊视觉效果（如毛玻璃、霓虹发光），通过额外的 CSS 类实现：

```css
/* 玻璃拟态效果 - 仅 glassmorphism 主题激活 */
[data-theme="dark-glassmorphism"] .glass-effect {
  background: rgba(255, 255, 255, var(--effect-glass-opacity));
  backdrop-filter: blur(var(--effect-glass-blur));
  -webkit-backdrop-filter: blur(var(--effect-glass-blur));
  border: 1px solid rgba(255, 255, 255, var(--effect-glass-border-opacity));
}

/* 霓虹发光效果 - 仅 cyberpunk 主题激活 */
[data-theme="dark-cyberpunk"] .neon-effect {
  box-shadow: var(--effect-neon-glow);
  text-shadow: var(--effect-neon-glow);
}
```

组件可以选择性使用这些特效类来增强视觉效果，但不使用也不影响基本功能。

### 5.3 ThemeContext 扩展

```typescript
type ThemeMode = "light" | "dark" | "system";
type ThemeName = string; // 'light' | 'dark' | 'dark-glassmorphism' | ...

interface ThemeContextValue {
  themeMode: ThemeMode; // 明暗模式偏好
  themeName: ThemeName; // 当前完整主题名
  colorMode: "light" | "dark"; // 解析后的实际明暗模式
  setThemeMode: (mode: ThemeMode) => void;
  setThemeName: (name: ThemeName) => void;
}
```

### 5.4 主题选择器 UI

在设置页面中替换现有的三按钮主题选择器，改为分组卡片式选择器：

```
┌─────────────────────────────────────────────────────┐
│  ☀️ 亮色主题                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  默认     │  │ 新拟态   │  │ 复古暖调 │          │
│  │ ■ ■ ■   │  │ ■ ■ ■   │  │ ■ ■ ■   │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                      │
│  🌙 暗色主题                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  默认     │  │ 玻璃拟态 │  │ 赛博朋克 │          │
│  │ ■ ■ ■   │  │ ■ ■ ■   │  │ ■ ■ ■   │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                      │
│  🖥️ 跟随系统                                        │
│  ┌──────────────────────────────────────┐           │
│  │  自动匹配操作系统明暗偏好              │           │
│  └──────────────────────────────────────┘           │
└─────────────────────────────────────────────────────┘
```

## 6. 推荐主题列表

参考 uitest 57 种风格，精选适合桌面 AI 助手应用的主题：

| #   | 主题名   | data-theme           | 风格来源          | 适合场景   |
| --- | -------- | -------------------- | ----------------- | ---------- |
| 1   | 默认亮色 | `light`              | 现有              | 日常使用   |
| 2   | 默认暗色 | `dark`               | 现有              | 夜间使用   |
| 3   | 玻璃拟态 | `dark-glassmorphism` | #03 Glassmorphism | 高端现代感 |
| 4   | 新拟态   | `light-neumorphism`  | #02 Neumorphism   | 柔和舒适   |
| 5   | 赛博朋克 | `dark-cyberpunk`     | #41 Cyberpunk     | 科技感     |
| 6   | 极光     | `dark-aurora`        | #07 Aurora UI     | 梦幻氛围   |
| 7   | 复古暖调 | `light-retro`        | #08 Retro/Vintage | 怀旧温暖   |
| 8   | 电子墨水 | `light-eink`         | #56 E-Ink/Paper   | 护眼阅读   |
| 9   | 霓虹发光 | `dark-neon`          | #15 Neon Glow     | 夜间炫酷   |
| 10  | 黏土拟态 | `light-claymorphism` | #06 Claymorphism  | 可爱立体   |

## 7. 实施步骤

### Phase 1：基础架构（1-2 天）

1. 创建 `src/themes/types.ts` 类型定义
2. 创建 `src/themes/registry.ts` 主题注册表
3. 扩展 `ThemeContext.tsx` 支持多主题
4. 修改 `index.html` 防闪烁脚本适配新主题

### Phase 2：主题文件（2-3 天）

5. 创建 `src/styles/themes/` 目录
6. 迁移现有 light/dark 到新结构
7. 实现 4 个示例主题（Glassmorphism、Neumorphism、Cyberpunk、Aurora）
8. 在 `index.css` 中 import 所有主题文件

### Phase 3：UI 集成（1-2 天）

9. 创建 `ThemePicker` 组件
10. 修改 `SystemSettings` 集成新主题选择器
11. 添加 i18n 翻译键

### Phase 4：优化与测试（1 天）

12. 主题切换性能测试
13. 各主题下所有页面视觉检查
14. 添加主题预览功能

## 8. 兼容性考虑

- **现有组件零修改**：所有现有 CSS Module 中已使用 `var(--xxx)` 的样式无需任何改动
- **硬编码颜色**：部分组件中存在硬编码颜色值（如 `#4fc3f7`、`#e5e5e5`），需逐步替换为 CSS 变量
- **Tailwind @theme**：`index.css` 中的 `@theme` 块定义了部分颜色，需与主题变量保持同步
- **Tauri 标题栏**：`invoke("set_titlebar_theme", { dark })` 需根据 colorMode 传值
- **防闪烁**：`index.html` 中的内联脚本需适配新主题名格式

## 9. 扩展指南

### 添加新主题的步骤

1. 在 `src/styles/themes/` 下创建 `{themeName}.css`
2. 定义完整的 CSS 变量集（复制现有主题作为模板）
3. 在 `src/themes/registry.ts` 中注册主题元数据
4. 在 `src/styles/index.css` 中 import 新主题文件
5. 在 i18n 文件中添加主题显示名称翻译

### 主题 CSS 模板

```css
[data-theme="{colorMode}-{styleName}"] {
  --color-bg: ;
  --color-surface: ;
  --color-text: ;
  --color-text-secondary: ;
  --color-border: ;
  --color-sidebar-bg: ;
  --color-sidebar-border: ;
  --color-input-bg: ;
  --color-hover: ;
  --hover-bg: ;
  --color-section-bg: ;
  --color-shadow: ;
  --color-toolbar-bg: ;
  --color-toolbar-border: ;
  --color-msg-user-bg: ;
  --color-msg-user-text: ;
  --color-msg-assistant-bg: ;
  --color-msg-assistant-text: ;
  --color-nav-bg: ;
  --color-nav-hover: ;
  --color-nav-active: ;
  --color-nav-text: ;
  --color-nav-text-active: ;
  --color-toast-success-bg: ;
  --color-toast-success-text: ;
  --color-toast-error-bg: ;
  --color-toast-error-text: ;
  --color-dirty-badge-bg: ;
  --color-dirty-badge-text: ;
  --color-primary: ;
  --color-primary-hover: ;
  --color-file-tag-bg: ;
  --color-file-tag-text: ;
  --color-file-tag-hover: ;
  --color-provider-item-bg: ;
  --color-provider-item-border: ;
  --color-provider-builtin-bg: ;
  --color-provider-builtin-text: ;
  --color-skill-hub-bg: ;
  --color-skill-hub-text: ;
  --color-about-text-secondary: ;
  --color-voice-user-bg: ;
  --color-voice-user-border: ;
  --color-voice-user-text: ;
  --color-voice-assistant-bg: ;
  --color-voice-assistant-border: ;
  --card-bg: ;
  --text-primary: ;
  --text-secondary: ;
  --text-tertiary: ;
  --border-color: ;
  --input-bg: ;
  --bg-secondary: ;
  --bg-primary: ;
  --bg-tertiary: ;
  --bg-hover: ;
  --primary: ;
  --color-bg-secondary: ;
  --color-text-primary: ;
}
```
