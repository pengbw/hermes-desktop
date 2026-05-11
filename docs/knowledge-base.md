# Hermes Desktop 知识库功能设计文档

## 一、功能概述

知识库是 Hermes Desktop 的核心模块之一，允许用户将本地文档导入系统，通过 RAG（Retrieval-Augmented Generation）机制在 Agent 对话中自动或手动注入相关知识片段，提升对话的准确性和专业性。

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                       前端 (React)                            │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ KnowledgePanel│  │KnowledgeSettings│ │  对话面板 + 首页    │ │
│  │  (知识库管理)  │  │  (全局设置)     │ │ (知识库选择+检索)   │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘ │
│         │                 │                    │             │
└─────────┼─────────────────┼────────────────────┼─────────────┘
          │ invoke          │ invoke             │ invoke
          ▼                 ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                Tauri Commands (Rust)                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  CRUD 命令        │  索引命令     │  检索命令          │   │
│  │  list/create/     │  index_      │  retrieve_knowledge│   │
│  │  update/delete    │  knowledge   │  _internal         │   │
│  │  _knowledge_bases │  _base       │  (多策略检索)       │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                 │                │                 │
│         ▼                 ▼                ▼                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   SQLite     │  │ 文件系统扫描  │  │ 多策略检索引擎    │   │
│  │  (元数据+    │  │ (文档遍历+    │  │ 1.向量检索       │   │
│  │   向量存储)  │  │  文本分块+    │  │ 2.中文关键词搜索  │   │
│  │             │  │  向量嵌入)    │  │ 3.整句LIKE搜索   │   │
│  │             │  │              │  │ 4.文件名搜索      │   │
│  │             │  │              │  │ 5.知识库概览兜底   │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、数据模型

### 3.1 knowledge_bases 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 知识库名称 |
| description | TEXT | 描述 |
| icon | TEXT | 图标（默认 📚） |
| directories | TEXT | 监控目录列表，JSON 数组 `["/path/a", "/path/b"]` |
| embedding_model | TEXT | 嵌入模型：`local` / `openai` / `ollama` |
| retrieval_mode | TEXT | 检索模式：`off` / `auto` / `manual` / `hybrid` |
| max_context_chunks | INTEGER | 最大上下文块数（默认 8） |
| auto_retrieve | INTEGER | 是否自动检索（0/1） |
| status | TEXT | 状态：`ready` / `indexing` |
| file_count | INTEGER | 文件数量 |
| chunk_count | INTEGER | 文本块数量 |
| created_at | INTEGER | 创建时间戳 |
| updated_at | INTEGER | 更新时间戳 |

### 3.2 knowledge_files 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| knowledge_base_id | TEXT FK | 所属知识库 ID |
| file_path | TEXT | 文件完整路径 |
| file_name | TEXT | 文件名 |
| file_ext | TEXT | 扩展名 |
| file_size | INTEGER | 文件大小（字节） |
| chunk_count | INTEGER | 分块数量 |
| index_status | TEXT | 索引状态：`pending` / `indexed` / `error` |
| modified_at | INTEGER | 文件修改时间 |
| created_at | INTEGER | 创建时间戳 |
| updated_at | INTEGER | 更新时间戳 |

### 3.3 knowledge_chunks 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| knowledge_base_id | TEXT FK | 所属知识库 ID |
| knowledge_file_id | TEXT FK | 所属文件 ID |
| content | TEXT | 文本块内容 |
| chunk_index | INTEGER | 块序号 |
| embedding | BLOB | 向量嵌入（二进制存储） |
| created_at | INTEGER | 创建时间戳 |

### 3.4 conversations 表（知识库关联）

| 字段 | 类型 | 说明 |
|------|------|------|
| ... | ... | 原有对话字段 |
| kb_ids | TEXT | 关联知识库 ID 列表，JSON 数组 `["kb-id-1", "kb-id-2"]` |

### 3.5 app_config 表（全局设置）

key = `knowledge_settings`，value 为 JSON：

```json
{
  "defaultEmbeddingModel": "local",
  "defaultRetrievalMode": "off",
  "defaultMaxContextChunks": 8,
  "globalAutoRetrieve": false,
  "cloudProvider": "",
  "cloudEmbeddingModel": "text-embedding-3-small",
  "ollamaEndpoint": "http://localhost:11434",
  "ollamaModel": "nomic-embed-text"
}
```

---

## 四、后端命令清单

### 4.1 知识库 CRUD

| 命令 | 参数 | 说明 | 状态 |
|------|------|------|------|
| `list_knowledge_bases` | - | 列出所有知识库 | ✅ 已实现 |
| `create_knowledge_base` | `CreateKnowledgeBaseRequest` | 创建知识库 | ✅ 已实现 |
| `update_knowledge_base` | `UpdateKnowledgeBaseRequest` | 更新知识库 | ✅ 已实现 |
| `delete_knowledge_base` | `id: String` | 删除知识库（级联删除文件和块） | ✅ 已实现 |

### 4.2 文件管理

| 命令 | 参数 | 说明 | 状态 |
|------|------|------|------|
| `list_knowledge_files` | `knowledge_base_id: String` | 列出知识库下的文件 | ✅ 已实现 |

### 4.3 索引与检索

| 命令 | 参数 | 说明 | 状态 |
|------|------|------|------|
| `index_knowledge_base` | `id: String` | 扫描目录、文本分块、向量嵌入 | ✅ 已实现 |
| `search_knowledge_base` | `id, query, limit?` | 搜索知识库 | ✅ 已实现 |
| `retrieve_knowledge` | `id, query, limit?` | 检索知识块（用于注入对话） | ✅ 已实现 |
| `retrieve_knowledge_internal` | 内部函数 | 多策略检索引擎 | ✅ 已实现 |

### 4.4 对话知识库关联

| 命令 | 参数 | 说明 | 状态 |
|------|------|------|------|
| `update_conversation_kb_ids` | `id: String, kb_ids: String` | 更新对话关联的知识库 | ✅ 已实现 |

### 4.5 全局设置

| 命令 | 参数 | 说明 | 状态 |
|------|------|------|------|
| `get_knowledge_config` | - | 获取知识库全局设置 | ✅ 已实现 |
| `set_knowledge_config` | `config: JSON` | 保存知识库全局设置 | ✅ 已实现 |

### 4.6 模型管理

| 命令 | 参数 | 说明 | 状态 |
|------|------|------|------|
| `check_local_embedding_model` | - | 检查本地嵌入模型是否已下载 | ✅ 已实现 |
| `install_local_embedding_model` | `app: AppHandle` | 下载本地嵌入模型 all-MiniLM-L6-v2 | ✅ 已实现 |
| `test_cloud_embedding` | `app, provider, model` | 测试云端嵌入模型连接 | ✅ 已实现 |

---

## 五、前端界面

### 5.1 导航入口

主界面底部 Tab 栏：`首页 | 对话 | 工作室 | 知识库 | 技能 | 设置`

- 点击「知识库」Tab → 进入 KnowledgePanel（知识库管理面板）
- 点击「设置」Tab → 设置页中包含「知识库设置」区域
- 首页/对话输入框 → 知识库选择按钮（📚）

### 5.2 KnowledgePanel（知识库管理）

**布局**：左侧知识库列表 + 右侧详情

**左侧列表**：
- 知识库卡片列表，显示图标、名称、文件数、状态
- 顶部「+ 创建知识库」按钮
- 搜索框

**右侧详情**（选中知识库后显示）：
- 知识库基本信息（名称、描述、图标）
- 监控目录列表（仅文件夹选择按钮，已移除冗余的「+」按钮）
- 文件列表（文件名、大小、索引状态）
- 操作按钮：索引、搜索、编辑、删除

**创建/编辑弹窗**：
- 名称、描述、图标
- 监控目录（可添加多个本地路径）
- 嵌入模型、检索模式、最大上下文块数、自动检索开关

### 5.3 对话知识库选择器

**位置**：首页输入框和对话输入框的工具栏中

**交互流程**：
1. 点击📚按钮 → 弹出下拉列表，显示所有 `ready` 状态的知识库
2. 勾选知识库 → 按钮上显示选中数量徽章
3. 输入内容后点发送 → 自动带上选中的知识库进行检索

**全局自动检索模式**：
- 全局自动检索 ON → 📚按钮置灰，自动使用所有 ready 知识库
- 全局自动检索 OFF → 📚按钮可点击，手动选择知识库

**首页 → 对话跳转**：
- 首页选中知识库后发送消息，创建对话时自动保存 `kb_ids`
- 跳转到对话窗口后，知识库选中状态保持同步

### 5.4 KnowledgeSettingsSection（知识库设置）

位于设置面板中，包含三个区域：

**① 嵌入模型选择（Tab 切换器）**

| Tab | 详情面板内容 |
|-----|-------------|
| 💻 本地 | 模型名 all-MiniLM-L6-v2，状态指示（已就绪/未安装），下载按钮 |
| ☁️ OpenAI | 供应商下拉框（从已配置供应商中选择）、嵌入模型名称输入框、测试连接按钮 |
| 🦙 Ollama | Ollama 地址输入框、模型名称输入框 |

**② 检索注入策略（2×2 网格卡片）**

| 模式 | 图标 | 说明 |
|------|------|------|
| 关闭 | 🚫 | 不自动检索知识库内容 |
| 自动 | ⚡ | 每次对话自动检索并注入相关知识 |
| 手动 | 👆 | 需要手动触发检索注入 |
| 混合 | 🔀 | 自动检索 + 可手动追加 |

**③ 高级设置**
- 最大上下文块数：滑块（1-32），右侧显示当前值
- 全局自动检索：开关 + 描述文字

---

## 六、核心流程

### 6.1 创建知识库流程

```
用户点击「创建知识库」
    │
    ▼
填写名称、描述、图标
    │
    ▼
添加监控目录（可多个本地路径）
    │
    ▼
选择嵌入模型（local/openai/ollama）
    │
    ▼
选择检索模式（off/auto/manual/hybrid）
    │
    ▼
调用 create_knowledge_base → 写入 SQLite
    │
    ▼
知识库状态 = ready，file_count = 0
```

### 6.2 索引流程

```
用户点击「索引」按钮
    │
    ▼
调用 index_knowledge_base(id)
    │
    ▼
状态更新为 indexing
    │
    ▼
遍历知识库的 directories 列表
    │
    ├── 读取目录下所有文件
    ├── 过滤支持的文件格式：
    │   md, txt, pdf, docx, json, csv,
    │   py, rs, ts, tsx, js, jsx, go, java,
    │   c, cpp, h, html, css, yaml, yml, toml, xml
    │
    ├── 检查文件是否已存在（按 file_path 去重）
    │   ├── 已存在 → 更新文件信息和 index_status = 'indexed'
    │   └── 不存在 → 插入新记录，index_status = 'indexed'
    │
    ├── 文本分块（按段落/固定长度切分）
    │
    ├── 向量嵌入（并发请求，事务批量写入）
    │   ├── cloud/ollama → 调用嵌入 API，并发度 5
    │   └── local → 当前未实现推理，降级到关键词搜索
    │
    ├── 将 chunks 和 embeddings 写入 knowledge_chunks 表
    │
    ├── 统计 total_files / total_chunks
    │
    ▼
状态更新为 ready，更新 file_count / chunk_count
```

> **性能优化**：索引过程使用 SQLite 事务批量写入、并发嵌入请求（futures-util + tokio），显著提升索引速度。

### 6.3 检索流程

```
用户在对话中发送消息
    │
    ▼
chat_with_hermes_api 判断是否需要知识库检索
    │
    ├── 全局自动检索 ON → should_retrieve = true
    │   └── target_kbs = 所有 ready 状态的知识库
    │
    ├── 全局自动检索 OFF + 用户选中知识库 → should_retrieve = true
    │   └── target_kbs = 用户选中的知识库
    │
    └── 其他 → should_retrieve = false，直接对话
    │
    ▼ should_retrieve = true
    对每个 target_kb 调用 retrieve_knowledge_internal(kb_id, query, limit)
    │
    ▼
    多策略检索引擎（按优先级依次尝试）：
    │
    ├── 1. 向量检索（cloud/ollama embedding 可用）
    │   └── 生成查询向量 → 余弦相似度排序 → 返回 top-k chunks
    │
    ├── 2. 中文关键词分词搜索
    │   └── 按非字母数字中文字符分词 → OR LIKE 匹配 content
    │
    ├── 3. 整句 LIKE 搜索
    │   └── content LIKE '%query%'
    │
    ├── 4. 文件名搜索
    │   └── file_name LIKE '%query%'
    │
    └── 5. 知识库概览兜底
        └── 返回文件列表 + chunk 数量 + 内容预览
    │
    ▼
    将检索到的知识内容注入到对话上下文（system prompt 中）
    │
    ▼
    AI 基于注入的知识内容回答用户问题
```

### 6.4 搜索流程

```
用户在知识库面板输入搜索关键词
    │
    ▼
调用 search_knowledge_base(id, query, limit)
    │
    ├── 优先使用 hermes CLI: workspace search
    │   └── 返回语义搜索结果
    │
    └── 降级到 SQL LIKE 模糊匹配
        └── 在 file_name / file_path 中匹配关键词
```

### 6.5 对话知识库关联流程

```
用户在首页/对话窗口选择知识库
    │
    ▼
前端记录 pendingKbIds（选中的知识库 ID 列表）
    │
    ├── 首页发送 → 创建对话时调用 update_conversation_kb_ids 保存
    └── 对话窗口发送 → 直接使用 pendingKbIds
    │
    ▼
发送消息时传递 forceKbRetrieve=true + kbIds
    │
    ▼
后端 chat_with_hermes_api 根据 kbIds 检索对应知识库
    │
    ▼
切换对话时，从 conversations.kbIds 恢复选中状态
```

---

## 七、嵌入模型说明

### 7.1 本地模型（local）

- 模型：`all-MiniLM-L6-v2`
- 大小：约 90MB
- 存储路径：`{LocalAppData}/hermes-desktop/models/all-MiniLM-L6-v2/`
- 下载文件：`model.safetensors`、`config.json`、`tokenizer.json`、`special_tokens_map.json`
- 下载源：HuggingFace (sentence-transformers/all-MiniLM-L6-v2)
- 优点：无需网络，隐私安全，无 API 费用
- 缺点：检索质量不如大模型
- 当前状态：模型下载功能已实现，本地推理尚未实现（需集成 ONNX/safetensors 推理）
- 降级方案：使用中文关键词分词搜索 + LIKE 搜索 + 知识库概览兜底
- 流程：在设置页面选择本地 Tab → 自动检查模型状态 → 未安装则点击「下载模型」按钮安装

### 7.2 云端模型（openai）

- 支持：所有在「供应商」中配置了 API Key 的供应商
- 默认模型：`text-embedding-3-small`
- 优点：检索质量高，支持多种嵌入模型
- 缺点：需要网络，产生 API 费用
- 当前状态：✅ 已完整实现（索引时嵌入 + 检索时向量搜索）
- 流程：选择 OpenAI Tab → 选择供应商 → 输入模型名 → 测试连接

### 7.3 Ollama 模型

- 默认端点：`http://localhost:11434`
- 默认模型：`nomic-embed-text`
- 优点：本地运行，支持多种开源嵌入模型
- 缺点：需先安装 Ollama 并拉取模型
- 当前状态：✅ 已完整实现（索引时嵌入 + 检索时向量搜索）
- 流程：选择 Ollama Tab → 输入端点地址 → 输入模型名

---

## 八、待实现功能

当前无待实现功能，所有规划功能已完成。

---

## 九、已实现功能清单

| 功能 | 说明 | 完成状态 |
|------|------|----------|
| 知识库 CRUD | 创建、列表、更新、删除 | ✅ |
| 文件扫描与入库 | 遍历目录、文件元数据入库 | ✅ |
| 文本分块 | 按段落/固定长度切分文档 | ✅ |
| 云端/ollama 向量嵌入 | 索引时调用 API 生成向量，并发批量写入 | ✅ |
| 向量检索 | 余弦相似度排序，返回 top-k chunks | ✅ |
| 多策略检索引擎 | 向量→关键词→LIKE→文件名→概览，逐级降级 | ✅ |
| 全局自动检索 | 开启后所有对话自动使用全部 ready 知识库 | ✅ |
| 对话级知识库选择 | 关闭全局自动检索后，可按对话选择知识库 | ✅ |
| 首页知识库选择 | 首页输入框支持选择知识库，跳转后保持选中 | ✅ |
| 知识库选中状态持久化 | conversations.kb_ids 存储，切换对话时恢复 | ✅ |
| 索引性能优化 | SQLite 事务批量写入 + 并发嵌入请求 | ✅ |
| 本地嵌入模型下载 | 下载 all-MiniLM-L6-v2 模型文件 | ✅ |
| 本地嵌入模型推理 | Candle + BERT 推理，mean pooling + L2 归一化 | ✅ |
| 检索结果可视化 | 对话中显示知识来源（文件名、相似度、内容预览） | ✅ |
| 文件变更监听 | notify crate 监控目录变化，自动触发增量索引 | ✅ |
| 索引进度显示 | 进度条 + 百分比 + 当前处理文件名 | ✅ |
| 文件预览 | 知识库面板中预览文件内容和分块 | ✅ |
| 知识库导入/导出 | 导出 JSON 配置+数据，导入创建新知识库 | ✅ |

---

## 十、关键文件索引

| 文件 | 说明 |
|------|------|
| `src-tauri/src/db.rs` | 数据模型定义（KnowledgeBase, KnowledgeFile, KnowledgeChunk, 请求结构体） |
| `src-tauri/src/commands.rs` | Tauri 命令实现（CRUD, 索引, 检索, 设置, 多策略检索引擎, 导入/导出, 文件预览） |
| `src-tauri/src/local_embedding.rs` | 本地嵌入模型推理（Candle + BERT, mean pooling, L2 归一化） |
| `src-tauri/src/file_watcher.rs` | 文件变更监听（notify crate, 自动增量索引） |
| `src-tauri/src/lib.rs` | 命令注册（invoke_handler）+ chat_with_hermes_api 知识库检索集成 |
| `src/windows/MainWindow.tsx` | 前端组件（KnowledgePanel, KnowledgeSettingsSection, HomePanel, ChatPanel 知识库选择器, 文件预览） |
| `src/windows/MainWindow.css` | 知识库相关样式（选择器下拉框、徽章、按钮、预览面板等） |
| `src/i18n/zh-CN.json` | 中文翻译 |
| `src/i18n/en.json` | 英文翻译 |
| `src/i18n/zh-XG.json` | 繁体中文翻译 |
