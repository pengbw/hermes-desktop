# Hermes Desktop 流程引擎增强计划

> 最后更新: 2026-05-27

---

## 0. Hermes Agent 源码分析结论

### 0.1 架构关系

```
┌──────────────────────────────────────────────────────────┐
│  Hermes Desktop (Rust + React)                           │
│  ┌──────────────────────┐  ┌───────────────────────────┐ │
│  │ 工作流引擎 (Orchestrator) │  │ ReactFlow 可视化设计器  │ │
│  │ - 流程定义存储 (SQLite) │  │ - 节点拖拽/连线编辑       │ │
│  │ - 步骤调度/路由        │  │ - 审批面板                │ │
│  │ - 条件/并行/驳回逻辑   │  │ - 条件节点编辑面板        │ │
│  └──────────┬─────────────┘  └───────────────────────────┘ │
│             │ HTTP (localhost:8642)                        │
└─────────────┼──────────────────────────────────────────────┘
              │
┌─────────────┴──────────────────────────────────────────────┐
│  Hermes Agent (Python) — 纯 AI 对话执行引擎               │
│  - 单次对话 + 工具调用                                    │
│  - ❌ 无工作流引擎  ❌ 无多 Agent 并行  ❌ 无条件分支    │
└────────────────────────────────────────────────────────────┘
```

**核心结论：Hermes Agent 只是"单次对话执行器"，所有流程引擎功能由 Desktop Rust 后端实现。**

---

## 1. 条件分支 — 实施计划

### 1.1 方案确定

经过讨论，条件分支采用 **AI 自然语言判断** 模式（而非审批状态判断或规则表达式）：

- **用户只需写判断条件**（自然语言），系统自动拼接上游产出物内容，发给 AI 判断 yes/no
- 示例："检查代码是否包含SQL注入风险和XSS漏洞，全部通过视为是"

### 1.2 实施步骤

#### ✅ 步骤 A：前端条件节点编辑面板

**文件**: [src/windows/WorkflowDesigner.tsx](file:///Users/pengbaowei/workspace/hermes-desktop/src/windows/WorkflowDesigner.tsx)

已实现：

- 点击条件节点 → 弹出编辑面板
- 两个字段：判断名称（label）、判断条件（conditionDesc）
- 提示用户系统会自动拼接上游内容 + 条件发送给 AI

#### ✅ 步骤 B：条件分支强制连通性校验

**文件**: 前端 `validateWorkflow` + 后端 `validate_group_workflows`

已实现：条件节点的 yes/no 分支各自独立追溯能否到达 end，两条件必须同时满足。

#### ✅ 步骤 C：连线时 conditionExpr 取值修正

**文件**: [src/windows/WorkflowDesigner.tsx](file:///Users/pengbaowei/workspace/hermes-desktop/src/windows/WorkflowDesigner.tsx#L1178-L1182)

已实现：`conditionExpr` 取自条件节点的 `conditionDesc` 而不是写死的 `"approved"`。

#### ✅ 步骤 D：后端运行时 AI 判断

**文件**: [src-tauri/src/commands/project_execution.rs](file:///Users/pengbaowei/workspace/hermes-desktop/src-tauri/src/commands/project_execution.rs)

已实现：

- 新增 `evaluate_condition_with_ai` 函数：拼接用户判断条件 + 上游产出物内容，调用 Hermes API 非流式接口，AI 返回「是」或「否」
- `confirm_workflow_step(approved=true)` 中：上游角色确认通过后，自动查询条件节点连线的 `condition_expr`，调用 `evaluate_condition_with_ai` 获取 yes/no，传递给 `trigger_workflow_execution` 的 `condition_result` 参数

#### ⏳ 步骤 E：运行时步骤动态生成

- 条件分支的步骤不由 `start_workflow_run` 全部预生成
- 根据条件判断结果动态创建后续步骤

---

## 2. 驳回逻辑 — 实施计划

### 2.1 现状问题

| 问题                         | 说明                                                                                                        | 严重程度 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | :------: |
| 两条驳回路径不一致           | `reject_project_artifact` 读取 `reject_to_role_id`; `confirm_workflow_step(false)` 不读取，只让同一角色重做 |  🔴 高   |
| "不驳回" 语义误导            | 前端写"留空则不驳回"，实际 fallback 回退到上一环节                                                          |  🟡 中   |
| reject_to_role_id 查询不精确 | `LIMIT 1` + 仅按 `from_role_id` 匹配，可能取错                                                              |  🟡 中   |

### 2.2 实施步骤

#### ✅ 步骤 A：统一驳回路径

**文件**: [src-tauri/src/commands/project_execution.rs](file:///Users/pengbaowei/workspace/hermes-desktop/src-tauri/src/commands/project_execution.rs)

已实现 `confirm_workflow_step(false)` 读取 `reject_to_role_id` 逻辑：

- 有指定驳回目标 → 回退到目标角色（将目标步骤重置为 pending，将中间步骤标记为 skipped，启动目标角色运行）
- 无指定 → 同一角色重试（保持现有逻辑）

#### ✅ 步骤 B：前端驳回选项改为明确语义

**文件**: [src/windows/WorkflowDesigner.tsx](file:///Users/pengbaowei/workspace/hermes-desktop/src/windows/WorkflowDesigner.tsx) — EdgeEditorModal

已实现：

- select 默认选项从"不驳回"改为"当前角色重做"（语义明确：驳回时同一角色重新工作）
- 提示文字从"留空则不驳回"改为"留空则当前角色重做"

#### ✅ 步骤 C：精确化 reject_to_role_id 查询

**文件**: [src-tauri/src/commands/project_workflow.rs](file:///Users/pengbaowei/workspace/hermes-desktop/src-tauri/src/commands/project_workflow.rs)

已实现：`reject_project_artifact` 查询增加 `artifact_type` 匹配条件，优先匹配精确 artifact_type 的 workflow，兼容旧数据（artifact_type 为空）。

---

## 3. 并行分支 — 实施计划（后续迭代）

### 3.1 现状

| 层次                              |            状态             |
| --------------------------------- | :-------------------------: |
| 前端 UI (ParallelNode, MergeNode) |             ✅              |
| 数据库存储 (parallel_group)       |             ✅              |
| 后端验证                          |             ✅              |
| 运行时执行                        | ❌ 步骤线性生成，无合并等待 |

### 3.2 实施步骤（暂缓，待条件分支完成后启动）

- 扩展 `workflow_run_steps` 表结构（parallel_group, depends_on_steps, step_type）
- 修改 `start_workflow_run` 步骤生成逻辑（DAG 拓扑排序）
- 实现合并节点等待逻辑
- 前端并行状态展示

---

## 4. 数据库迁移

```sql
-- 待条件分支运行时 + 并行分支开发时执行
ALTER TABLE workflow_run_steps ADD COLUMN parallel_group TEXT DEFAULT NULL;
ALTER TABLE workflow_run_steps ADD COLUMN depends_on_steps TEXT DEFAULT NULL;
ALTER TABLE workflow_run_steps ADD COLUMN step_type TEXT DEFAULT 'sequential';
```

---

## 5. 完整实施清单

### P0 — 当前迭代

| #   | 任务                                                | 状态 | 涉及文件                                  |
| --- | --------------------------------------------------- | :--: | ----------------------------------------- |
| 0   | 条件分支强制连通性校验（前后端）                    |  ✅  | WorkflowDesigner.tsx, project_workflow.rs |
| 1   | 条件节点编辑面板（判断名称 + 条件描述）             |  ✅  | WorkflowDesigner.tsx                      |
| 2   | conditionExpr 取条件节点数据（不再写死 "approved"） |  ✅  | WorkflowDesigner.tsx                      |
| 3   | **后端运行时 AI 条件判断**                          |  ✅  | project_execution.rs                      |
| 4   | **统一 confirm_workflow_step(false) 驳回路径**      |  ✅  | project_execution.rs                      |
| 5   | **前端驳回选项改为明确语义**                        |  ✅  | WorkflowDesigner.tsx                      |
| 6   | **精确化 reject_to_role_id 查询**                   |  ✅  | project_workflow.rs                       |

### P1 — 下一迭代

| #   | 任务                       | 说明                           |
| --- | -------------------------- | ------------------------------ |
| 7   | 条件分支运行时步骤动态生成 | 根据判断结果动态创建后续步骤   |
| 8   | 并行分支数据库迁移         | ALTER TABLE workflow_run_steps |
| 9   | 并行分支 DAG 步骤生成      | start_workflow_run 拓扑排序    |
| 10  | 合并节点等待逻辑           | confirm_workflow_step 并行感知 |

### P2 — 后续优化

| #   | 任务                   | 说明                          |
| --- | ---------------------- | ----------------------------- |
| 11  | 前端运行时并行状态展示 | WorkflowRunPanel 并行步骤层级 |
| 12  | 并行分支驳回处理       | 驳回时暂停同组其他分支        |
| 13  | 流程执行可视化         | ReactFlow 实时状态动效        |

---

## 6. 风险与注意事项

1. **向后兼容**: 所有数据库迁移必须是 `ALTER TABLE ADD COLUMN`。
2. **并发安全**: Rust tokio 异步运行时，`sqlx::SqlitePool` 线程安全，业务逻辑需注意状态竞争。
3. **AI 判断稳定性**: 条件节点的 LLM 判断可能不稳定，建议 prompt 中强调"只回复是或否"，并做结果解析容错。
