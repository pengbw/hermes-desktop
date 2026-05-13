# Hermes Desktop 工作流触发机制说明

## 一、核心概念

### 1.1 工作流起始角色

工作流起始角色是指在工作流定义中，**作为 `from_role_id` 出现但从未作为 `to_role_id` 出现的角色**，即工作流的"源头节点"。

判断逻辑（`is_workflow_start_role`）：

- 在 `project_workflows` 表中，该角色有 `from_role_id = 角色ID` 的记录
- 同时没有 `to_role_id = 角色ID` 的记录
- 满足以上条件即为起始角色

### 1.2 工作流转换类型

| 转换类型       | 说明     | 触发后行为                                              |
| -------------- | -------- | ------------------------------------------------------- |
| `auto_push`    | 自动推送 | 直接创建状态为 `in_progress` 的制品，流程自动流转       |
| `need_confirm` | 需确认   | 创建状态为 `submitted` 的制品，等待人工确认后才继续流转 |
| `condition`    | 条件分支 | 根据条件表达式结果选择分支，默认走 `yes` 分支           |
| `parallel`     | 并行分支 | 同一分组内的所有分支同时触发                            |

---

## 二、工作流触发场景

### 场景一：手动派发任务给起始角色

**触发位置**：`dispatch_task_to_role` 命令

**触发条件**：

1. 用户在任务卡片上点击「派发任务」按钮
2. 任务被派发到的角色（`role_id`）是工作流的起始角色

**执行流程**：

```
用户点击「派发任务」
  → 调用 dispatch_task_to_role(taskId, roleId, message)
  → 创建 task_dispatches 记录（dispatch_type = 'manual'）
  → 更新任务状态为 running
  → 检查 is_workflow_start_role(roleId)
  → 如果是起始角色 → 触发 trigger_workflow_execution
```

**涉及前端组件**：

- [TaskManagement.tsx](../src/components/studio/TaskManagement.tsx) — 任务管理页的派发按钮
- [TaskBoard.tsx](../src/components/studio/TaskBoard.tsx) — 任务看板的派发按钮

---

### 场景二：自动派发就绪任务

**触发位置**：`auto_dispatch_ready_tasks` 命令

**触发条件**：

1. 用户点击「自动派发」按钮
2. 系统查找项目中所有状态为 `triage`（待处理）且已分配负责人的任务
3. 对每个任务的负责人，如果是工作流起始角色，则触发工作流

**执行流程**：

```
用户点击「自动派发」
  → 调用 auto_dispatch_ready_tasks(projectId)
  → 查询所有 status = 'triage' 且 assignee 不为空的任务
  → 逐个派发：
      → 创建 task_dispatches 记录（dispatch_type = 'auto'）
      → 更新任务状态为 running
      → 检查 is_workflow_start_role(assignee)
      → 如果是起始角色 → 触发 trigger_workflow_execution
```

**涉及前端组件**：

- [TaskManagement.tsx](../src/components/studio/TaskManagement.tsx) — 自动派发按钮

---

### 场景三：制品审批通过后继续流转

**触发位置**：`approve_project_artifact` + 前端调用 `trigger_workflow_execution`

**触发条件**：

1. 某个角色提交了制品（artifact）
2. 上游角色审批通过该制品
3. 以该制品所属角色为 `from_role_id`，查找下游工作流节点

**执行流程**：

```
用户审批制品（点击通过）
  → 调用 approve_project_artifact(artifactId)
  → 前端继续调用 trigger_workflow_execution(projectId, fromRoleId=artifact.roleId, artifactType)
  → 查找 from_role_id 对应的下游工作流
  → 根据转换类型执行流转
```

**涉及前端组件**：

- [ProjectDetail.tsx](../src/components/studio/ProjectDetail.tsx) — 制品审批操作

---

### 场景四：工作流步骤确认后继续流转

**触发位置**：`confirm_workflow_step` 命令

**触发条件**：

1. 工作流运行到某个 `need_confirm` 类型的步骤
2. 用户确认通过该步骤
3. 系统自动推进到下一个步骤并触发下游工作流

**执行流程**：

```
用户确认工作流步骤
  → 调用 confirm_workflow_step(runId, approved=true, comment)
  → 更新当前步骤状态为 completed
  → 查找下一个步骤的 role_id
  → 触发 trigger_workflow_execution(projectId, nextRoleId)
```

**涉及前端组件**：

- [WorkflowRunPanel.tsx](../src/components/studio/WorkflowRunPanel.tsx) — 工作流运行面板的确认按钮

---

## 三、工作流执行引擎（trigger_workflow_execution）

当工作流被触发后，核心引擎 `trigger_workflow_execution` 的处理逻辑如下：

```
输入：project_id, from_role_id, artifact_type(可选), condition_result(可选)

1. 查询 from_role_id 对应的所有下游工作流节点
   - 如果指定了 artifact_type，则进一步过滤

2. 分类处理：
   ├── 普通节点（auto_push / need_confirm）
   │   ├── auto_push → 创建 in_progress 制品，直接流转
   │   └── need_confirm → 创建 submitted 制品，等待确认
   │
   ├── 条件分支节点（condition）
   │   └── 根据 condition_result 选择分支（默认 "yes"）
   │       └── 匹配 branch_label 的分支才会执行
   │
   └── 并行分支节点（parallel）
       └── 同一 parallel_group 内的所有分支同时触发

3. 对每个触发的下游节点：
   ├── 如果关联了任务（task_id 不为空）→ 创建派发记录
   └── 创建制品记录（artifact）
```

---

## 四、流程总结图

```
┌─────────────────────────────────────────────────────────────┐
│                     工作流触发入口                            │
├─────────────┬──────────────┬──────────────┬─────────────────┤
│  手动派发    │  自动派发     │  制品审批     │  步骤确认        │
│  任务给      │  就绪任务     │  通过后       │  通过后          │
│  起始角色    │  给起始角色    │  继续流转     │  继续流转        │
├─────────────┴──────────────┴──────────────┴─────────────────┤
│                                                              │
│              trigger_workflow_execution                       │
│                                                              │
│   ┌────────────┐  ┌────────────┐  ┌──────────┐              │
│   │ auto_push  │  │need_confirm│  │condition │              │
│   │ 自动推送    │  │ 需确认     │  │ 条件分支  │              │
│   │            │  │            │  │          │              │
│   │ 直接创建   │  │ 创建待审    │  │ 选择分支  │              │
│   │ 进行中制品  │  │ 批制品     │  │ 执行     │              │
│   └────────────┘  └────────────┘  └──────────┘              │
│                                                              │
│   ┌────────────┐                                             │
│   │ parallel   │                                             │
│   │ 并行分支    │                                             │
│   │            │                                             │
│   │ 同组全部    │                                             │
│   │ 同时触发    │                                             │
│   └────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 五、注意事项

1. **起始角色判断**：只有被派发到工作流起始角色的任务才会触发工作流，派发到中间节点角色不会触发新流程
2. **防重复派发**：系统会检查是否已存在 `status = 'sent'` 的派发记录，避免重复派发
3. **条件分支默认值**：条件分支未指定结果时默认走 `yes` 分支
4. **制品与任务关联**：工作流流转时会同时创建制品记录和任务派发记录（如果工作流节点关联了任务）
5. **任务状态联动**：工作流派发任务时会自动将任务状态更新为 `running`，并设置 30 分钟的锁定超时
