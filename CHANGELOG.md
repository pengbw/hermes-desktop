# Changelog

All notable changes to Hermes Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-06-08

### Added

- 🤖 **Toast 通知组件** (`ToastContext` + `.hermes-toast*` 样式) — 替代浏览器原生 `alert()`，在 Tauri 窗口中正确显示
- 🧪 **自动化测试套件** (`test/` 目录) — 60 个测试文件，453 个用例，100% 通过
  - 核心层：AppError / DatabaseError / NetworkError / ValidationError / Result / ContextBuilder / MessageProcessor
  - 状态管理：uiStore / chatStore / vrmStore / agentStore / knowledgeStore / projectStore 全覆盖
  - Hooks：useDebounce / useThrottle / useAsync / useLocalStorage
  - Contexts：I18n / Theme / Toast
  - Services：TauriCommands / SafeTauriCommands（含错误归类）
  - Utils：cn / vrmUtils (lerp, easeInOut, slerpPose)
  - Themes：registry / ui-styles
  - i18n：三语言文案一致性校验
  - UI 组件：Button / Input / Badge / Avatar / Card / Textarea / Separator
  - 业务组件：ErrorBoundary / ProjectList / NewProjectModal / EditProjectModal
  - 页面：CardManagerPanel
  - 集成：Theme+I18n+Toast 联动 / Tauri 桥接 / 持久化
- 📝 **README 截图修正** — 路径更新到实际存在的 `.png` 文件

### Changed

- 🔒 **删除项目确认弹窗** — 替换原生 `confirm()` 为自定义确认弹窗
- 🎨 **i18n 校验** — en / zh-CN 文案 key 严格同步

### Fixed

- 🐛 `.gitignore` 临时文件遗漏 — 忽略 `hermes.db` (含 wal/shm/journal) 和 `src-tauri/.git.hermes-agent.backup/`
- 🐛 10 个 chat 测试断言与组件实现不同步（locale、stop indicator、drop zone class、context menu 触发器等）
- 🐛 测试环境 Tauri mock 缺失 `transformCallback` 导致 18 个测试抛错
- 🐛 WorkflowDesigner.tsx react-hooks/refs lint 错误
- 🐛 ONNX 模型空文件问题，添加文件有效性检查
- 🐛 知识库设置 `globalAutoRetrieve` 默认值改为 `false`
- 🐛 修复测试结果分析师节点重复创建产物的问题
- 🐛 Windows 平台多项 bug 修复及前端错误日志增强

### Removed

- ❌ 25 处 `alert()` 调用 — 全部替换为 Toast
- ❌ 麦克风按钮从 Virtual Office 控件中移除

### Build

- 🏗️ **完整 release 打包** — `Hermes Desktop.app` (275 MB) + `Hermes-Desktop-0.4.0_aarch64.dmg` (193 MB)
- 🏗️ **前端 Vite build** — 47 个 chunk，主包 1.5 MB（gzip 484 KB）
- 🏗️ **Tauri 2.11** + **Rust 1.95** + **React 19.1** + **Vite 7.0**

### Notes

- ⚠️ 仅提供 **aarch64 (Apple Silicon)** 构建。x86_64 (Intel) 构建因 `ort-sys` 库未提供 macOS x86_64 的预编译 ONNX Runtime 二进制而失败（上游限制）
- ⚠️ DMG 由 `hdiutil` 替代 Tauri 自带 `bundle_dmg.sh` 生成（后者失败：缺少 `osascript`/`create-dmg` 工具）

---

## [0.3.x] - Earlier

参见 [git log](https://github.com/pengbw/hermes-desktop/commits/main) 早期提交历史。
