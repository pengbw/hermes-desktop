# Hermes Desktop

一款开源跨平台 AI 助手桌面客户端，以 2.5D Live2D 数字人形象呈现，集成对话交互与完整系统配置功能。

[English](./README_EN.md) | 简体中文

---

## ✨ 特性

### 🗨️ 智能对话
- 实时流式响应，打字机效果
- Agent 思考过程可见可追溯
- 多会话管理，历史记录持久化

### 🎭 数字人交互
- Live2D 纸片人形象，说话时口型动画驱动
- 白色主题，简洁时尚科技感
- 支持自定义数字人模型

### ⚙️ 完整配置中心
- **模型配置** — Provider / API Key / Endpoint / Temperature
- **记忆管理** — 查看/编辑持久化上下文
- **技能中心** — 浏览/创建/编辑 Skills
- **MCP Server** — 管理 MCP 工具和服务
- **平台连接** — 消息通道配置
- **安全沙盒** — 命令审批与隔离

### 🖥️ 跨平台
- ✅ macOS（Apple Silicon + Intel）
- ✅ Windows（x64）

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 前端 | React + TypeScript + Tailwind CSS |
| 数字人 | Live2D Cubism SDK |
| 对话内核 | Hermes Agent |

---

## 📦 快速开始

### 前置依赖

- Node.js ≥ 18
- Rust ≥ 1.70
- npm 或 yarn

### 安装

```bash
# Clone
git clone https://github.com/pengbw/hermes-desktop.git
cd hermes-desktop

# 安装前端依赖
npm install

# 运行开发版
npm run tauri dev
```

### 构建

```bash
# 构建安装包
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/` 目录下。

---

## 📄 开源协议

Apache License 2.0
