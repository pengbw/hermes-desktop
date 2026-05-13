# Hermes Desktop 工作室功能完善计划

> 生成日期：2026-05-13
> 基于 Hermes Agent 上游代码与本地工作室代码的全面对比分析

---

## 一、当前功能现状

### 1.1 已完成功能

| 模块           | 功能点                                                                    | 关键文件                        |
| -------------- | ------------------------------------------------------------------------- | ------------------------------- |
| 项目管理       | 创建/编辑/删除/归档/收藏/导入导出                                         | `StudioPanel.tsx`, `project.rs` |
| 项目模板       | 6个预设模板（软件开发、内容创作、数据分析、营销策划、游戏开发、学术研究） | `projectTemplates.ts`           |
| 角色管理       | 角色列表/添加移除成员/精力值/心情状态/设备等级                            | `RoleManager.tsx`, `models.rs`  |
| 工作流设计器   | 可视化节点编辑/拖拽添加/条件节点/并行节点/合并节点/连线编辑               | `WorkflowDesigner.tsx`          |
| 任务看板       | 6列看板/拖拽状态变更/创建删除任务/分配角色                                | `TaskBoard.tsx`                 |
| 产物管理       | 看板+列表双视图/审批通过打回/文件预览                                     | `ArtifactView.tsx`              |
| 项目对话       | 单角色对话/多角色群聊/@提及/流式响应                                      | `ProjectDetail.tsx`             |
| 虚拟办公室     | 3D办公场景/角色状态可视化/产物交付动画/主题切换                           | `VirtualOffice.tsx`             |
| 项目设置       | 成员/产物/工作流/规则/主题/统计 六个标签页                                | `ProjectSettingsModal.tsx`      |
| 自动委派       | `auto_delegate_chat` 角色间自动传递任务                                   | `project.rs`                    |
| 工作流自动执行 | `run_workflow_auto_chat` 线性自动推送                                     | `project.rs`                    |

### 1.2 代码规模

- **前端组件**：8个工作室组件 + 1个工作流设计器 + 1个虚拟办公室
- **后端命令**：`project.rs` 约 1727 行，覆盖项目/成员/工作流/产物/消息/任务/委派
- **数据表**：7张核心表（projects, project_members, project_workflows, project_artifacts, project_messages, project_tasks, ai_roles）
- **类型定义**：`types/index.ts` 中 12 个工作室相关接口

---

## 二、Hermes Agent 上游能力对比

### 2.1 Kanban 系统（hermes_cli/kanban.py + kanban_db.py）

Hermes Agent 拥有完整的 15 动词 Kanban 系统：

| 操作        | 说明         | 工作室现状    |
| ----------- | ------------ | ------------- |
| `add`       | 创建任务     | ✅ 已有       |
| `list`      | 列出任务     | ✅ 已有       |
| `show`      | 任务详情     | ❌ 缺失       |
| `edit`      | 编辑任务     | ⚠️ 仅状态变更 |
| `status`    | 变更状态     | ✅ 已有       |
| `claim`     | 认领任务     | ❌ 缺失       |
| `heartbeat` | 续期认领     | ❌ 缺失       |
| `release`   | 释放认领     | ❌ 缺失       |
| `comment`   | 添加评论     | ❌ 缺失       |
| `link`      | 关联任务     | ❌ 缺失       |
| `retry`     | 重试任务     | ❌ 缺失       |
| `archive`   | 归档任务     | ❌ 缺失       |
| `boards`    | 多看板管理   | ❌ 缺失       |
| `dispatch`  | 自动调度     | ❌ 缺失       |
| `workspace` | 工作空间管理 | ❌ 缺失       |

**关键差距**：

- 任务认领机制（claim/heartbeat/release）— 支持多角色并行工作
- 任务评论系统 — 支持角色间讨论
- 任务关联（link）— 支持依赖关系
- 工作空间（scratch/worktree/dir）— 支持任务隔离的文件操作
- 多 Board 支持 — 支持项目内多看板
- 自动调度器（dispatcher）— 支持无人值守自动执行

### 2.2 上下文引擎（agent/context_engine.py）

Hermes Agent 的 `ContextEngine` 抽象：

| 能力       | 说明                      | 工作室现状 |
| ---------- | ------------------------- | ---------- |
| 上下文压缩 | 接近 token 限制时自动摘要 | ❌ 缺失    |
| 插件化引擎 | 支持第三方引擎（LCM等）   | ❌ 缺失    |
| Token 追踪 | 每轮对话后更新 token 用量 | ❌ 缺失    |
| 保护机制   | 保护前N条和后N条消息      | ❌ 缺失    |

**当前工作室**：项目对话只加载最近 20 条消息，无压缩机制。

### 2.3 记忆系统（agent/memory_manager.py）

| 能力       | 说明                   | 工作室现状 |
| ---------- | ---------------------- | ---------- |
| 记忆提供者 | 插件化记忆后端         | ❌ 缺失    |
| 预取       | 对话前预取相关记忆     | ❌ 缺失    |
| 同步       | 对话后同步记忆         | ❌ 缺失    |
| 上下文清洗 | 流式输出中清洗记忆标签 | ❌ 缺失    |

### 2.4 技能系统（agent/skill_commands.py）

| 能力       | 说明                   | 工作室现状 |
| ---------- | ---------------------- | ---------- |
| 技能绑定   | 任务可绑定技能         | ❌ 缺失    |
| 技能调用   | 角色对话中调用技能     | ❌ 缺失    |
| 技能预处理 | 模板变量替换/内联Shell | ❌ 缺失    |

**当前工作室**：角色只有 `soulContent` 和 `responsibilities`，无法调用 Hermes Agent 的工具/技能。

### 2.5 工作流执行

| 能力      | Hermes Agent | 工作室现状                        |
| --------- | ------------ | --------------------------------- |
| 线性执行  | ✅           | ✅ `run_workflow_auto_chat`       |
| 条件分支  | ✅           | ❌ 前端有视觉节点，后端无执行逻辑 |
| 并行执行  | ✅           | ❌ 前端有视觉节点，后端无执行逻辑 |
| 运行实例  | ✅           | ❌ 无运行状态追踪                 |
| 暂停/恢复 | ✅           | ❌                                |
| 步骤确认  | ✅           | ⚠️ `need_confirm` 只在审批时使用  |

---

## 三、改进方案详细设计

### 3.1 任务系统增强（P0）

#### 3.1.1 数据库变更

**新增表：**

```sql
-- 任务评论
CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- 任务关联
CREATE TABLE IF NOT EXISTS task_links (
    id TEXT PRIMARY KEY,
    from_task_id TEXT NOT NULL,
    to_task_id TEXT NOT NULL,
    link_type TEXT NOT NULL DEFAULT 'depends_on',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (from_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (to_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_links_from ON task_links(from_task_id);
CREATE INDEX IF NOT EXISTS idx_task_links_to ON task_links(to_task_id);

-- 任务事件日志
CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    role_id TEXT,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
```

**project_tasks 表新增字段：**

```sql
ALTER TABLE project_tasks ADD COLUMN claim_lock TEXT NOT NULL DEFAULT '';
ALTER TABLE project_tasks ADD COLUMN claim_expire_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN started_at INTEGER;
ALTER TABLE project_tasks ADD COLUMN completed_at INTEGER;
ALTER TABLE project_tasks ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
ALTER TABLE project_tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN workspace_kind TEXT NOT NULL DEFAULT '';
ALTER TABLE project_tasks ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '';
```

#### 3.1.2 新增 Rust 命令

```rust
// 任务认领
#[tauri::command]
pub async fn claim_project_task(app: AppHandle, task_id: String, role_id: String) -> Result<(), String>

// 认领续期
#[tauri::command]
pub async fn heartbeat_task_claim(app: AppHandle, task_id: String) -> Result<(), String>

// 释放认领
#[tauri::command]
pub async fn release_task_claim(app: AppHandle, task_id: String) -> Result<(), String>

// 任务评论
#[tauri::command]
pub async fn add_task_comment(app: AppHandle, req: CreateTaskCommentRequest) -> Result<TaskComment, String>

#[tauri::command]
pub async fn list_task_comments(app: AppHandle, task_id: String) -> Result<Vec<TaskComment>, String>

// 任务关联
#[tauri::command]
pub async fn link_tasks(app: AppHandle, from_task_id: String, to_task_id: String, link_type: String) -> Result<(), String>

#[tauri::command]
pub async fn unlink_tasks(app: AppHandle, link_id: String) -> Result<(), String>

#[tauri::command]
pub async fn list_task_links(app: AppHandle, task_id: String) -> Result<Vec<TaskLink>, String>

// 任务事件
#[tauri::command]
pub async fn list_task_events(app: AppHandle, task_id: String) -> Result<Vec<TaskEvent>, String>
```

#### 3.1.3 前端改动

**TaskBoard.tsx 增强：**

- 任务卡片增加：认领者头像、评论数气泡、关联任务指示器、技能标签
- 点击任务展开侧栏详情面板
- 详情面板包含：描述编辑、评论列表、关联任务、事件日志、技能绑定

**新增组件：**

- `TaskDetailPanel.tsx` — 任务详情侧栏
- `TaskCommentList.tsx` — 评论列表
- `TaskLinkManager.tsx` — 关联管理

#### 3.1.4 类型定义变更

```typescript
// 新增类型
export interface TaskComment {
  id: string;
  taskId: string;
  roleId: string;
  content: string;
  createdAt: number;
}

export interface TaskLink {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  linkType: string;
  createdAt: number;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  roleId: string;
  detail: string;
  createdAt: number;
}

// ProjectTask 新增字段
export interface ProjectTask {
  // ... 现有字段
  claimLock: string;
  claimExpireAt: number;
  startedAt: number;
  completedAt: number;
  skills: string; // JSON array
  maxRetries: number;
  retryCount: number;
  workspaceKind: string;
  workspacePath: string;
}
```

---

### 3.2 工作流执行引擎（P0）

#### 3.2.1 数据库变更

```sql
-- 工作流运行实例
CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    workflow_id TEXT,
    current_step INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    context TEXT NOT NULL DEFAULT '{}',
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_project ON workflow_runs(project_id);

-- 工作流运行步骤
CREATE TABLE IF NOT EXISTS workflow_run_steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    role_id TEXT,
    action TEXT NOT NULL DEFAULT 'auto_push',
    status TEXT NOT NULL DEFAULT 'pending',
    input TEXT NOT NULL DEFAULT '',
    output TEXT NOT NULL DEFAULT '',
    started_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run ON workflow_run_steps(run_id);
```

#### 3.2.2 新增 Rust 命令

```rust
// 启动工作流运行
#[tauri::command]
pub async fn start_workflow_run(
    app: AppHandle,
    project_id: String,
    initial_message: String,
) -> Result<WorkflowRun, String>

// 暂停工作流
#[tauri::command]
pub async fn pause_workflow_run(app: AppHandle, run_id: String) -> Result<(), String>

// 恢复工作流
#[tauri::command]
pub async fn resume_workflow_run(app: AppHandle, run_id: String) -> Result<(), String>

// 确认当前步骤（need_confirm 类型）
#[tauri::command]
pub async fn confirm_workflow_step(
    app: AppHandle,
    run_id: String,
    approved: bool,
    comment: Option<String>,
) -> Result<(), String>

// 列出工作流运行历史
#[tauri::command]
pub async fn list_workflow_runs(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<WorkflowRun>, String>

// 获取工作流运行状态
#[tauri::command]
pub async fn get_workflow_run_status(
    app: AppHandle,
    run_id: String,
) -> Result<WorkflowRunStatus, String>
```

#### 3.2.3 执行引擎核心逻辑

```
start_workflow_run 流程：
1. 查询项目的所有工作流定义，按 sortOrder 排序
2. 创建 workflow_run 记录
3. 为每个工作流步骤创建 workflow_run_step 记录
4. 从第一个步骤开始执行：
   a. auto_push: 调用 auto_delegate_chat，完成后自动进入下一步
   b. need_confirm: 调用 auto_delegate_chat，暂停等待用户确认
   c. condition: 根据上一步输出判断分支
   d. parallel: 并行执行多个下游步骤
5. 每步完成后：
   a. 更新 step 状态
   b. 通过 Tauri 事件推送进度
   c. 更新 run 的 current_step
6. 所有步骤完成或遇到暂停/错误时结束
```

#### 3.2.4 前端改动

**WorkflowDesigner.tsx 增强：**

- 运行控制面板：启动/暂停/恢复按钮
- 节点状态高亮：当前执行步骤高亮、已完成步骤绿色、失败步骤红色
- 运行历史面板：查看历史运行记录

**新增组件：**

- `WorkflowRunPanel.tsx` — 工作流运行控制面板
- `WorkflowRunHistory.tsx` — 运行历史列表

---

### 3.3 产物版本管理（P1）

#### 3.3.1 数据库变更

```sql
CREATE TABLE IF NOT EXISTS artifact_versions (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (artifact_id) REFERENCES project_artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact ON artifact_versions(artifact_id);
```

#### 3.3.2 新增 Rust 命令

```rust
#[tauri::command]
pub async fn create_artifact_version(app: AppHandle, artifact_id: String) -> Result<ArtifactVersion, String>

#[tauri::command]
pub async fn list_artifact_versions(app: AppHandle, artifact_id: String) -> Result<Vec<ArtifactVersion>, String>

#[tauri::command]
pub async fn get_artifact_version(app: AppHandle, id: String) -> Result<ArtifactVersion, String>

#[tauri::command]
pub async fn diff_artifact_versions(app: AppHandle, from_id: String, to_id: String) -> Result<ArtifactDiff, String>
```

#### 3.3.3 前端改动

**ArtifactView.tsx 增强：**

- 产物详情面板：点击展开，显示内容、版本历史
- 版本选择器：切换查看不同版本
- 版本对比视图：diff 两个版本
- 内联编辑器：支持 Markdown 编辑和保存

**新增组件：**

- `ArtifactDetailPanel.tsx` — 产物详情侧栏
- `ArtifactVersionList.tsx` — 版本历史
- `ArtifactDiffView.tsx` — 版本对比

---

### 3.4 角色技能绑定（P1）

#### 3.4.1 数据库变更

```sql
CREATE TABLE IF NOT EXISTS role_skills (
    id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (role_id) REFERENCES ai_roles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_role_skills_role ON role_skills(role_id);
```

#### 3.4.2 新增 Rust 命令

```rust
#[tauri::command]
pub async fn bind_role_skill(app: AppHandle, role_id: String, skill_name: String) -> Result<(), String>

#[tauri::command]
pub async fn unbind_role_skill(app: AppHandle, id: String) -> Result<(), String>

#[tauri::command]
pub async fn list_role_skills(app: AppHandle, role_id: String) -> Result<Vec<RoleSkill>, String>
```

#### 3.4.3 chat_with_project_role 改造

在构建系统提示时，注入角色可用的技能列表：

```rust
// 查询角色绑定的技能
let skills: Vec<String> = sqlx::query_scalar(
    "SELECT skill_name FROM role_skills WHERE role_id = ? AND enabled = 1"
)
.bind(&role_id)
.fetch_all(&pool)
.await
.unwrap_or_default();

if !skills.is_empty() {
    system_prompt.push_str(&format!(
        "\n\n你可使用的技能：{}\n当需要使用技能时，请在回复中说明要调用的技能和参数。",
        skills.join("、")
    ));
}
```

#### 3.4.4 前端改动

**RoleManager.tsx 增强：**

- 角色详情增加"技能"标签页
- 技能选择器：从已安装技能列表中选择
- 角色卡片显示已绑定技能数量和图标

---

### 3.5 项目活动流与通知（P1）

#### 3.5.1 数据库变更

```sql
CREATE TABLE IF NOT EXISTS project_activities (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    role_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_activities_project ON project_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_created ON project_activities(created_at);
```

#### 3.5.2 活动记录触发点

| 触发操作       | action                    | target_type |
| -------------- | ------------------------- | ----------- |
| 创建任务       | `task_created`            | `task`      |
| 认领任务       | `task_claimed`            | `task`      |
| 完成任务       | `task_completed`          | `task`      |
| 提交产物       | `artifact_submitted`      | `artifact`  |
| 审批产物       | `artifact_approved`       | `artifact`  |
| 打回产物       | `artifact_rejected`       | `artifact`  |
| 发送消息       | `message_sent`            | `message`   |
| 工作流步骤完成 | `workflow_step_completed` | `workflow`  |
| 角色加入       | `member_added`            | `member`    |

#### 3.5.3 新增 Rust 命令

```rust
#[tauri::command]
pub async fn list_project_activities(
    app: AppHandle,
    project_id: String,
    limit: Option<i64>,
) -> Result<Vec<ProjectActivity>, String>
```

#### 3.5.4 Tauri 事件推送

在关键操作完成后通过 `app.emit` 推送实时通知：

```rust
let _ = app.emit("project_activity", serde_json::json!({
    "projectId": project_id,
    "action": "artifact_submitted",
    "roleId": role_id,
    "targetType": "artifact",
    "targetId": artifact_id,
    "detail": format!("{} 提交了产物：{}", role_name, artifact_title),
}));
```

#### 3.5.5 前端改动

**ProjectDetail.tsx 增强：**

- 新增"活动"标签页，显示项目活动时间线
- 活动条目：角色图标 + 动作描述 + 时间 + 目标链接

**全局通知：**

- 监听 `project_activity` 事件
- 桌面通知弹窗
- 通知中心（未读计数）

**新增组件：**

- `ActivityTimeline.tsx` — 活动时间线
- `NotificationCenter.tsx` — 通知中心

---

### 3.6 项目统计增强（P2）

#### 3.6.1 新增 Rust 命令

```rust
#[tauri::command]
pub async fn get_project_stats(app: AppHandle, project_id: String) -> Result<ProjectStats, String>
```

返回数据结构：

```json
{
  "taskStats": {
    "total": 20,
    "byStatus": { "todo": 5, "running": 3, "done": 10, "blocked": 2 },
    "completionRate": 0.5
  },
  "artifactStats": {
    "total": 15,
    "byStatus": { "pending": 3, "approved": 10, "rejected": 2 },
    "approvalRate": 0.83
  },
  "roleWorkload": [
    {
      "roleId": "...",
      "name": "开发工程师",
      "taskCount": 8,
      "completedCount": 5,
      "avgDuration": 3600000
    }
  ],
  "timeline": [
    { "date": "2026-05-10", "tasksCreated": 3, "tasksCompleted": 2, "artifactsSubmitted": 1 }
  ],
  "healthScore": 75
}
```

#### 3.6.2 前端改动

**ProjectSettingsModal stats 标签页增强：**

- 任务状态分布环形图
- 产物审批率指标
- 角色工作量柱状图
- 项目时间线折线图
- 健康度评分仪表盘

---

### 3.7 上下文压缩与记忆（P2）

#### 3.7.1 上下文压缩

改造 `chat_with_project_role`：

```rust
// 1. 加载项目对话历史
let all_messages = load_project_messages(&pool, &project_id).await?;

// 2. 计算 token 估算
let estimated_tokens = estimate_tokens(&all_messages);

// 3. 超过阈值时压缩
if estimated_tokens > threshold {
    // 保留最近 N 条完整消息
    let recent = all_messages.split_off(all_messages.len().saturating_sub(6));
    // 对旧消息生成摘要
    let summary = compress_messages(&client, &api_base, &api_key, &old_messages).await?;
    // 用摘要替代旧消息
    context_messages = vec![
        json!({ "role": "system", "content": format!("历史对话摘要：{}", summary) }),
    ];
    context_messages.extend(recent.into_iter().map(|m| message_to_json(m)));
} else {
    context_messages = all_messages.into_iter().map(message_to_json).collect();
}
```

#### 3.7.2 项目记忆

```sql
CREATE TABLE IF NOT EXISTS project_memories (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_memories_project ON project_memories(project_id);
```

在角色对话后自动提取关键决策和结论存入记忆，下次对话时预取注入上下文。

---

## 四、代码质量改进

### 4.1 状态管理重构

**问题**：`StudioPanel.tsx` 中有 15+ 个 `useState`，状态管理分散。

**方案**：创建 `useProjectStore`（Zustand store）：

```typescript
// stores/projectStore.ts
interface ProjectStore {
  projects: ProjectItem[];
  selectedProject: ProjectItem | null;
  projectMembers: ProjectMember[];
  projectArtifacts: ProjectArtifact[];
  projectWorkflows: ProjectWorkflow[];
  projectTasks: ProjectTask[];
  projectMessages: ProjectMessage[];
  allRoles: AiRoleItem[];
  loading: boolean;

  loadProjects: () => Promise<void>;
  selectProject: (project: ProjectItem) => Promise<void>;
  loadAllRoles: () => Promise<void>;
  // ... 其他操作
}
```

### 4.2 TauriCommands 类型对齐

**问题**：`TauriCommands.ts` 中部分方法签名与 Rust 命令不匹配。

**方案**：逐一核对并修正，确保参数名和类型与 Rust 命令一致。

### 4.3 数据库迁移机制

**问题**：当前使用 `ALTER TABLE IF NOT EXISTS` 逐个添加列，缺少版本化迁移。

**方案**：引入 `schema_version` 表，按版本执行迁移脚本：

```sql
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);
```

### 4.4 组件 Props 精简

**问题**：`ProjectDetail` 组件接收 17 个 props。

**方案**：使用 Context 或 Store 替代 props 传递。

---

## 五、实施路线图

### Phase 1：核心功能补全（P0）

| 任务                  | 涉及文件                       | 依赖       |
| --------------------- | ------------------------------ | ---------- |
| 任务系统数据库迁移    | `models.rs`                    | 无         |
| 任务系统新增命令      | `project.rs`                   | 数据库迁移 |
| 任务系统类型定义      | `types/index.ts`               | 无         |
| 任务详情前端组件      | `TaskDetailPanel.tsx`（新建）  | 命令+类型  |
| TaskBoard 增强        | `TaskBoard.tsx`                | 详情组件   |
| 工作流运行数据库      | `models.rs`                    | 无         |
| 工作流执行引擎        | `project.rs`                   | 数据库     |
| 工作流运行前端        | `WorkflowRunPanel.tsx`（新建） | 执行引擎   |
| WorkflowDesigner 增强 | `WorkflowDesigner.tsx`         | 运行面板   |

### Phase 2：体验增强（P1）

| 任务              | 涉及文件                          | 依赖     |
| ----------------- | --------------------------------- | -------- |
| 产物版本数据库    | `models.rs`                       | 无       |
| 产物版本命令      | `project.rs`                      | 数据库   |
| 产物详情前端      | `ArtifactDetailPanel.tsx`（新建） | 命令     |
| ArtifactView 增强 | `ArtifactView.tsx`                | 详情组件 |
| 角色技能数据库    | `models.rs`                       | 无       |
| 角色技能命令      | `project.rs`                      | 数据库   |
| RoleManager 增强  | `RoleManager.tsx`                 | 命令     |
| 项目活动数据库    | `models.rs`                       | 无       |
| 活动记录集成      | `project.rs`（各命令中添加）      | 数据库   |
| 活动流前端        | `ActivityTimeline.tsx`（新建）    | 命令     |
| 通知系统          | `NotificationCenter.tsx`（新建）  | 活动流   |

### Phase 3：优化与高级功能（P2）

| 任务               | 涉及文件                               | 依赖      |
| ------------------ | -------------------------------------- | --------- |
| 项目统计 API       | `project.rs`                           | Phase 1+2 |
| 统计可视化         | `ProjectSettingsModal.tsx`             | API       |
| 上下文压缩         | `project.rs`（chat_with_project_role） | 无        |
| 项目记忆系统       | `project.rs` + `models.rs`             | 无        |
| 状态管理重构       | `projectStore.ts`（新建）              | 无        |
| TauriCommands 对齐 | `TauriCommands.ts`                     | 无        |
| 迁移机制           | `models.rs`                            | 无        |

---

## 六、风险评估

| 风险             | 影响             | 缓解措施                        |
| ---------------- | ---------------- | ------------------------------- |
| 数据库迁移兼容性 | 旧版数据丢失     | 使用 `IF NOT EXISTS` + 增量迁移 |
| 工作流执行超时   | 用户体验差       | 设置步骤超时 + 可中断机制       |
| 上下文压缩质量   | 对话质量下降     | 保留最近 N 条不压缩 + 人工回退  |
| 技能调用安全     | 角色执行危险操作 | 技能白名单 + 用户确认机制       |
| 前端组件膨胀     | 维护困难         | 拆分子组件 + Storybook 文档     |

---

## 七、验收标准

### 任务系统

- [ ] 支持任务认领/释放/续期
- [ ] 支持任务评论和回复
- [ ] 支持任务关联（依赖/阻塞/关联）
- [ ] 任务卡片显示认领者、评论数、关联数
- [ ] 任务详情面板可展开

### 工作流执行

- [ ] 支持启动/暂停/恢复工作流
- [ ] 支持 need_confirm 步骤的确认/打回
- [ ] 工作流运行状态实时可视化
- [ ] 运行历史可查看

### 产物管理

- [ ] 产物支持版本历史
- [ ] 支持版本对比（diff）
- [ ] 支持内联编辑产物内容

### 角色技能

- [ ] 角色可绑定/解绑技能
- [ ] 角色对话中可调用技能
- [ ] 角色卡片显示技能信息

### 活动流

- [ ] 项目活动时间线可查看
- [ ] 关键操作自动记录活动
- [ ] 支持桌面通知

### 统计

- [ ] 项目概览仪表板
- [ ] 任务/产物/角色统计图表
- [ ] 项目健康度评分
