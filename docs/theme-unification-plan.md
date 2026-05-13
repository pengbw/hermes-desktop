# Hermes Desktop 全局主题统一方案

## 一、现状分析

### 1.1 当前主题体系

项目已有 `src/styles/themes.css` 定义了 light/dark 两套 CSS 变量，但**各页面使用方式不统一**：

| 变量来源                                   | 使用页面                                      | 问题                                  |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------- |
| `--color-*` (themes.css)                   | 设置页、聊天页、导航栏                        | 部分变量覆盖不完整                    |
| `--text-primary/secondary` (内联 fallback) | 工作室页                                      | 未注册到 themes.css，仅靠 fallback 值 |
| `--border-color` (内联 fallback)           | 工作室页                                      | 未注册到 themes.css                   |
| `--hover-bg` (内联 fallback)               | 工作室页                                      | 未注册到 themes.css                   |
| `--card-bg` (内联 fallback)                | 工作室页                                      | 未注册到 themes.css                   |
| `--input-bg` (内联 fallback)               | 工作室页                                      | 未注册到 themes.css                   |
| `--bg-secondary` (内联 fallback)           | 工作室页                                      | 未注册到 themes.css                   |
| 硬编码颜色值                               | 设置页(~39处)、工作室页(~60处)、窗口页(~30处) | 不跟随主题切换                        |

### 1.2 各页面硬编码颜色统计

| 页面/组件                | 硬编码颜色数量 | 典型硬编码值                                          |
| ------------------------ | -------------- | ----------------------------------------------------- |
| StudioPanel.module.css   | ~60            | `#e74c3c`, `#00b894`, `#e17055`, `#0984e3`, `#f39c12` |
| SettingsPanel.module.css | ~39            | `#4fc3f7`, `#039be5`, `#ab47bc`, `#ef5350`, `#4caf50` |
| MessageBubble.module.css | ~12            | `#4fc3f7`, `#7c8db5`, `#667eea`, `#5a6a8a`            |
| GestureEditor.module.css | ~20            | `#7c6fff`, `#5b4fd4`, `#0d9488`                       |
| ChatWindow.module.css    | ~5             | `#e2e8f0`                                             |
| ChatPanel.module.css     | 1              | `#999999`                                             |

### 1.3 核心问题

1. **CSS 变量体系不完整**：工作室使用 `--text-primary`、`--border-color`、`--hover-bg`、`--card-bg`、`--input-bg`、`--bg-secondary` 等变量，但这些变量**未在 themes.css 中注册**，仅靠 fallback 值工作，dark 模式下无法正确切换
2. **大量硬编码颜色**：各页面直接使用 `#xxx` 色值，无法跟随主题切换
3. **语义化不足**：颜色命名不统一，如 `--color-text` vs `--text-primary`，`--color-border` vs `--border-color`
4. **工作室是"事实标准"**：工作室页面的变量命名和视觉效果最好，应作为统一基准

---

## 二、目标

1. 以工作室主题为基准，统一全站视觉风格
2. 完善主题变量体系，确保 light/dark 模式下所有页面正确切换
3. 消除所有硬编码颜色，全部使用 CSS 变量
4. 统一变量命名规范

---

## 三、实施方案

### 阶段一：完善主题变量体系

#### 3.1 统一 CSS 变量命名规范

以工作室使用的变量名为基准，合并 themes.css 中已有的变量：

| 工作室变量名       | themes.css 现有变量      | 统一后变量名       | 说明         |
| ------------------ | ------------------------ | ------------------ | ------------ |
| `--text-primary`   | `--color-text`           | `--text-primary`   | 主文字色     |
| `--text-secondary` | `--color-text-secondary` | `--text-secondary` | 次要文字色   |
| `--border-color`   | `--color-border`         | `--border-color`   | 边框色       |
| `--hover-bg`       | `--color-hover`          | `--hover-bg`       | 悬停背景     |
| `--card-bg`        | 无                       | `--card-bg`        | 卡片背景     |
| `--input-bg`       | `--color-input-bg`       | `--input-bg`       | 输入框背景   |
| `--bg-secondary`   | 无                       | `--bg-secondary`   | 次要背景     |
| `--color-primary`  | `--color-primary`        | `--color-primary`  | 主题色(保持) |

#### 3.2 扩展 themes.css

在 themes.css 中补充缺失的变量，并添加语义化颜色变量：

```css
[data-theme="light"] {
  /* 基础色 */
  --color-primary: #4fc3f7;
  --color-primary-hover: #29b6f6;
  --color-primary-light: rgba(79, 195, 247, 0.08);

  /* 文字 */
  --text-primary: #333333;
  --text-secondary: #888888;
  --text-tertiary: #999999;
  --text-inverse: #ffffff;

  /* 背景 */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #fafafa;
  --hover-bg: rgba(0, 0, 0, 0.04);
  --card-bg: #ffffff;
  --input-bg: #ffffff;

  /* 边框 */
  --border-color: #e0e0e0;
  --border-light: #f0f0f0;

  /* 状态色 */
  --color-success: #00b894;
  --color-success-bg: #d4edda;
  --color-warning: #f39c12;
  --color-warning-bg: #fef9e7;
  --color-error: #e74c3c;
  --color-error-bg: #fee;
  --color-info: #0984e3;
  --color-info-bg: #eef;
}

[data-theme="dark"] {
  --color-primary: #4fc3f7;
  --color-primary-hover: #29b6f6;
  --color-primary-light: rgba(79, 195, 247, 0.12);

  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --text-tertiary: #888888;
  --text-inverse: #1a1a1a;

  --bg-primary: #1a1a2e;
  --bg-secondary: #2a2a4a;
  --bg-tertiary: #14142b;
  --hover-bg: rgba(255, 255, 255, 0.06);
  --card-bg: #1a1a2e;
  --input-bg: #1a1a2e;

  --border-color: #2a2a4a;
  --border-light: #3a3a5a;

  --color-success: #00b894;
  --color-success-bg: rgba(0, 184, 148, 0.15);
  --color-warning: #f39c12;
  --color-warning-bg: rgba(243, 156, 18, 0.15);
  --color-error: #e74c3c;
  --color-error-bg: rgba(231, 76, 60, 0.15);
  --color-info: #0984e3;
  --color-info-bg: rgba(9, 132, 227, 0.15);
}
```

#### 3.3 向后兼容

为避免一次性改动过大，保留旧变量名作为别名：

```css
[data-theme="light"],
[data-theme="dark"] {
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-border: var(--border-color);
  --color-surface: var(--card-bg);
  --color-input-bg: var(--input-bg);
  --color-hover: var(--hover-bg);
}
```

---

### 阶段二：各页面硬编码颜色替换

按优先级逐页替换硬编码颜色为 CSS 变量：

#### 2.1 设置页 (SettingsPanel.module.css) — ~39 处

| 硬编码值              | 替换为                                        | 用途          |
| --------------------- | --------------------------------------------- | ------------- |
| `#4fc3f7`             | `var(--color-primary)`                        | 按钮主色      |
| `#29b6f6`             | `var(--color-primary-hover)`                  | 按钮悬停      |
| `#039be5`             | `var(--color-primary)`                        | 链接色        |
| `#ab47bc`             | `var(--color-info)`                           | 标签色        |
| `#ef5350`             | `var(--color-error)`                          | 错误提示      |
| `#4caf50` / `#f44336` | `var(--color-success)` / `var(--color-error)` | 状态色        |
| `#d0d0d0`             | `var(--border-color)`                         | 禁用边框      |
| `#fff` / `#ffffff`    | `var(--text-inverse)` 或 `var(--bg-primary)`  | 白色文字/背景 |

#### 2.2 工作室页 (StudioPanel.module.css) — ~60 处

| 硬编码值              | 替换为                                             | 用途          |
| --------------------- | -------------------------------------------------- | ------------- |
| `#e74c3c`             | `var(--color-error)`                               | 错误/删除色   |
| `#00b894`             | `var(--color-success)`                             | 成功/完成色   |
| `#e17055`             | `var(--color-warning)`                             | 警告/进行中色 |
| `#0984e3`             | `var(--color-info)`                                | 信息色        |
| `#f39c12`             | `var(--color-warning)`                             | 警告色        |
| `#d63031`             | `var(--color-error)`                               | 严重错误      |
| `#fdcb6e`             | `var(--color-warning-bg)`                          | 警告背景      |
| `#d4edda` / `#155724` | `var(--color-success-bg)` / `var(--color-success)` | 成功提示      |
| `#fff3cd` / `#856404` | `var(--color-warning-bg)` / `var(--color-warning)` | 警告提示      |
| `#e2e3e5` / `#383d41` | `var(--bg-secondary)` / `var(--text-secondary)`    | 默认提示      |
| `#fee`                | `var(--color-error-bg)`                            | 错误背景      |
| `#eef`                | `var(--color-info-bg)`                             | 信息背景      |
| `#fef9e7`             | `var(--color-warning-bg)`                          | 警告背景      |

#### 2.3 消息气泡 (MessageBubble.module.css) — ~12 处

| 硬编码值  | 替换为                  | 用途       |
| --------- | ----------------------- | ---------- |
| `#4fc3f7` | `var(--color-primary)`  | 主题色引用 |
| `#7c8db5` | `var(--text-secondary)` | 次要文字   |
| `#667eea` | `var(--color-info)`     | 标签色     |
| `#5a6a8a` | `var(--text-secondary)` | 次要文字   |
| `#4caf50` | `var(--color-success)`  | 分数色     |
| `#8a94a6` | `var(--text-tertiary)`  | 预览文字   |
| `#2b7de9` | `var(--color-info)`     | 文件链接色 |

#### 2.4 手势编辑器 (GestureEditor.module.css) — ~20 处

| 硬编码值  | 替换为                                        | 用途       |
| --------- | --------------------------------------------- | ---------- |
| `#7c6fff` | `var(--color-primary)` (或保留为编辑器特色色) | 编辑器主色 |
| `#5b4fd4` | `var(--color-info)`                           | 数字色     |
| `#0d9488` | `var(--color-success)`                        | 字符串色   |
| `#e53935` | `var(--color-error)`                          | 错误色     |

#### 2.5 其他页面

- ChatWindow.module.css: `#e2e8f0` → `var(--text-secondary)`
- ChatPanel.module.css: `#999999` → `var(--text-tertiary)`

---

### 阶段三：统一组件视觉风格

#### 3.1 对齐工作室视觉规范

| 元素      | 当前(各页面不一致) | 统一后(工作室标准)                                                                 |
| --------- | ------------------ | ---------------------------------------------------------------------------------- |
| 卡片      | 白底+阴影          | `var(--card-bg)` + `1px solid var(--border-color)`                                 |
| 输入框    | 各异               | `var(--input-bg)` + `1px solid var(--border-color)` + focus `var(--color-primary)` |
| 按钮(主)  | `#4fc3f7`          | `var(--color-primary)`                                                             |
| 按钮(次)  | `#d0d0d0`          | `var(--border-color)` 背景                                                         |
| 标签/徽章 | 各色硬编码         | `var(--color-*-bg)` + `var(--color-*)`                                             |
| 分隔线    | `#e5e5e5` 等       | `var(--border-light)`                                                              |
| 悬停态    | 各异               | `var(--hover-bg)`                                                                  |

#### 3.2 统一间距和圆角

| 属性     | 工作室标准 | 需要调整的页面 |
| -------- | ---------- | -------------- |
| 卡片圆角 | 8px        | 设置页部分 6px |
| 按钮圆角 | 6px        | 部分页面 4px   |
| 内边距   | 8px-12px   | 部分页面 16px  |
| 间距     | 10px-12px  | 部分页面 16px  |

---

### 阶段四：验证与优化

1. **视觉回归测试**：逐页对比 light/dark 模式下的视觉效果
2. **暗色模式专项测试**：确保所有变量在 dark 模式下有合理值
3. **边界场景**：弹窗、Toast、下拉框等浮层组件的主题适配
4. **性能检查**：确保 CSS 变量不会导致渲染性能问题

---

## 四、执行优先级

| 优先级 | 任务                          | 影响范围      | 预估工作量 |
| ------ | ----------------------------- | ------------- | ---------- |
| P0     | 扩展 themes.css，补充缺失变量 | 全局          | 小         |
| P0     | 添加旧变量别名，确保向后兼容  | 全局          | 小         |
| P1     | 替换工作室页硬编码颜色        | StudioPanel   | 中         |
| P1     | 替换设置页硬编码颜色          | SettingsPanel | 中         |
| P1     | 替换消息气泡硬编码颜色        | MessageBubble | 小         |
| P2     | 替换手势编辑器硬编码颜色      | GestureEditor | 中         |
| P2     | 替换其他页面硬编码颜色        | ChatWindow 等 | 小         |
| P2     | 统一间距和圆角                | 全局          | 中         |
| P3     | 清理旧变量名(移除别名)        | 全局          | 小         |
| P3     | 视觉回归测试                  | 全局          | 中         |

---

## 五、注意事项

1. **渐进式替换**：每次只改一个页面，改完验证后再改下一个，避免大范围回归
2. **保留 fallback**：替换硬编码时，CSS 变量保留 fallback 值，如 `var(--color-primary, #4fc3f7)`
3. **手势编辑器特殊处理**：该页面使用 JSON 编辑器第三方组件，部分颜色通过 CSS 变量覆盖，需单独处理
4. **状态色语义化**：`#e17055` 在工作室中既用于"进行中"也用于"过期"，需根据上下文区分映射到 `--color-warning` 还是 `--color-error`
5. **国旗图标**：设置页中的国旗背景色(`#de2910`, `#ffde00`, `#3c3b6e`)属于图形元素，不建议替换为变量
