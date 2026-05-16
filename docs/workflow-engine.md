# 工作流引擎设计文档

## 一、核心概念

### 1.1 工作流边（Workflow Edge）

一条工作流边定义了一个流转关系，数据结构如下：

| 字段              | 类型     | 说明                                  |
| ----------------- | -------- | ------------------------------------- |
| `from_role_id`    | `string` | 上游角色 ID（`"start"` 表示起始节点） |
| `to_role_id`      | `string` | 下游角色 ID（`"end"` 表示结束节点）   |
| `artifact_type`   | `string` | 该步骤产出的产物类型名称              |
| `transition_type` | `enum`   | 流转方式                              |
| `sort_order`      | `int`    | 排序序号                              |

### 1.2 流转方式（transition_type）

| 类型           | 含义       | AI 完成后行为                           |
| -------------- | ---------- | --------------------------------------- |
| `auto_push`    | 自动流转   | artifact → `approved`，自动推进到下一步 |
| `need_confirm` | 需人工审批 | artifact → `submitted`，暂停等人审批    |

`need_confirm` 就是一道**必须过的审批关卡**，没有任何绕过方式。

### 1.3 工作流运行步骤（workflow_run_steps）

```sql
workflow_run_steps (
    id          TEXT,
    run_id      TEXT,       -- 关联的 workflow_runs.id
    step_index  INTEGER,    -- 步骤序号，0 = 起始节点
    role_id     TEXT,       -- 该步骤的执行角色
    action      TEXT,       -- 产出后的流转动作: start / auto_push / need_confirm
    status      TEXT,       -- pending → running → completed / pending_approval
    ...
)
```

**关键**：`action` 字段不是从模板 `transition_type` 直接复制的，而是根据角色的**所有出边**计算的：

- 如果该角色**任何一条**出边的 `transition_type = need_confirm`，则 action = `need_confirm`
- 否则 action = `auto_push`

这样确保：一个角色产出后如果需要人工审批，无论有多少出边都不会悄悄溜过去。

### 1.4 Artifact 状态机

```
  pending
     │
     ▼
in_progress  ←─── AI 拿到 artifact 开始工作
     │
     ├── auto_push ──→ approved ──→ 自动流转到下一步
     │
     └── need_confirm ──→ submitted ──→ 等人审批
                               │
                       ┌───────┼───────┐
                       │               │
                       ▼               ▼
                   approved         rejected
                   (人点"通过")      (人点"驳回")
                                        │
                                        ▼
                                  新建 in_progress
                                  (回退到上游角色重做)
```

---

## 二、完整生命周期流程

```
1. 用户创建项目 → 选模板
    └─ 种子数据写入 template_workflows

2. 用户创建任务 → 分配给主流程
    └─ 系统复制 template_workflows → project_workflows

3. start_workflow_run 被调用：
    ├─ 创建 workflow_runs (status=running, current_step=0)
    ├─ 创建 step 0 (起始节点, action=start, status=completed)
    ├─ 遍历 project_workflows，创建 step 1..N：
    │   └─ action = 该角色的出边 transition_type (need_confirm 优先)
    ├─ 将 step 1 设为 running
    └─ 调用 trigger_workflow_execution(from_role_id="start")
        └─ 为 step 1 角色创建 artifact (status=in_progress)
        └─ 调用 auto_delegate_chat → AI 开始干活

4. AI 完成后 (auto_delegate_chat)：
    ├─ 写入回复内容到 artifact
    ├─ 判断 requires_confirmation：
    │
    │   ┌─ action=need_confirm ──────────────────────────┐
    │   │   artifact.status = submitted                   │
    │   │   步骤状态 → pending_approval                    │
    │   │   前端弹出审批窗口，等人操作                      │
    │   └────────────────────────────────────────────────┘
    │
    │   ┌─ action=auto_push ─────────────────────────────┐
    │   │   artifact.status = approved                    │
    │   │   步骤状态 → completed                           │
    │   │   下一步骤 → running                             │
    │   │   发射 workflow_auto_push_completed 事件          │
    │   │   └─ trigger_workflow_execution                 │
    │   │       └─ 为下一步创建 artifact                   │
    │   │       └─ auto_delegate_chat → AI 继续干活        │
    │   └────────────────────────────────────────────────┘

5. 人审批通过 (approve_project_artifact)：
    ├─ artifact.status → approved
    └─ trigger_workflow_execution (skip_need_confirm=false)
        └─ 为下一步角色创建 artifact (status=in_progress)
        └─ auto_delegate_chat → AI 继续干活

6. 人驳回 (reject_project_artifact)：
    ├─ artifact.status → rejected
    ├─ 查找上游步骤 (step_index - 1)
    ├─ 上一步 → running，当前步 → pending
    ├─ 为上游角色创建新 artifact (status=in_progress)
    └─ auto_delegate_chat → 上游 AI 根据驳回原因重做
```

---

## 三、驳回逻辑详解

### 3.1 驳回回退规则

驳回时，系统查找**上一个 `action = 'need_confirm'` 的步骤**作为回退目标，而非固定回退到 `step_index - 1`：

```sql
SELECT step_index, role_id, artifact_type FROM workflow_run_steps
WHERE run_id = ? AND step_index < ? AND action = 'need_confirm'
ORDER BY step_index DESC LIMIT 1
```

找不到时 fallback 到 `step_index - 1`。

**这样可以跳过中间的 `auto_push` 步骤**，直接回到上一个需要人工审批的角色那里。无论自定义工作流中间隔了多少个 auto_push 步骤（0个、1个、2个甚至更多），都能正确找到回退目标。

### 3.2 驳回执行步骤

```
reject_project_artifact(artifact_id, reason):
    1. artifact.status → rejected
    2. 查找上一个 action='need_confirm' 且 step_index < 当前步 的步骤
    3. 目标步骤 → running（重新激活）
    4. 目标步+1 到 当前步之间 所有步骤 → pending（重置，无论几个）
    5. 为目标角色创建新 artifact (status=in_progress, title="原标题 - 修改稿")
    6. 调用 auto_delegate_chat 通知目标 AI 根据驳回原因重做
```

### 3.3 中间步骤重置

key 改进：回退时不仅重置目标步骤，还**批量重置中间所有步骤为 pending**（for 循环 `target+1..=current_step`），确保 AI 流程重做后能正确重新推进。

示例：step 2 驳回，step 3/4/5 全部 → pending。

---

## 四、各模板流程分析

### 4.1 软件开发（software_dev）

```
种子数据：
wf0: start   ──auto_push──→ PM（需求文档）
wf1: PM      ──need_confirm──→ Dev（需求规格）
wf2: Dev     ──auto_push──→ QA（代码实现）
wf3: QA      ──need_confirm──→ Reviewer（测试报告）
wf4: Reviewer ──auto_push──→ end（完成）
```

**运行时步骤：**

| 步骤 | 角色     | action       | 驳回 → 回退到（上一个 need_confirm）                                                                     |
| ---- | -------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| 1    | PM       | need_confirm | —（auto_push 边但 need_confirm 出边，PM 不产生 need_confirm artifact，因为起始触发用 skip_need_confirm） |
| 2    | Dev      | auto_push    | —                                                                                                        |
| 3    | QA       | need_confirm | —                                                                                                        |
| 4    | Reviewer | need_confirm | **QA** ← step3 是上一个 need_confirm                                                                     |

Notes: QA 的 action=need_confirm（出边 wf3），QA 产出测试报告后 submit 给 Reviewer 审批。Reviewer 驳回时回退到 QA（上一个 need_confirm）。

---

### 4.2 内容创作（content_creation）

```
种子数据：
wf0: start    ──auto_push──→ Planner（选题方向）
wf1: Planner  ──need_confirm──→ Writer（内容大纲）
wf2: Writer   ──auto_push──→ Editor（初稿）
wf3: Editor   ──auto_push──→ Auditor（修改稿）
wf4: Auditor  ──need_confirm──→ end（终审）
```

**运行时步骤：**

| 步骤 | 角色    | action       | 驳回 → 回退到（上一个 need_confirm）     |
| ---- | ------- | ------------ | ---------------------------------------- |
| 1    | Planner | need_confirm | —                                        |
| 2    | Writer  | auto_push    | —                                        |
| 3    | Editor  | auto_push    | —                                        |
| 4    | Auditor | need_confirm | **Writer** ← step2 是上一个 need_confirm |

---

### 4.3 数据分析（data_analysis）

```
种子数据：
wf0: start ──auto_push──→ BA（分析需求）
wf1: BA    ──auto_push──→ DE（数据需求）
wf2: DE    ──need_confirm──→ DS（数据集）
wf3: DS    ──auto_push──→ BA（分析报告）
wf4: BA    ──auto_push──→ end（完成）
```

**运行时步骤：**

| 步骤 | 角色 | action       | 驳回 → 回退到（上一个 need_confirm） |
| ---- | ---- | ------------ | ------------------------------------ |
| 1    | BA   | auto_push    | —                                    |
| 2    | DE   | need_confirm | —                                    |
| 3    | DS   | auto_push    | —                                    |
| 4    | BA   | auto_push    | —                                    |

仅 DS 审数据集时可能被驳回 → 上一个 need_confirm = step2(DE) ✅ 数据工程师重新清洗数据。

---

### 4.4 营销策划（marketing_campaign）

```
种子数据：
wf0: start       ──auto_push──→ Strategist（营销需求）
wf1: Strategist  ──need_confirm──→ Creative（策略方案）
wf2: Creative    ──auto_push──→ Executor（创意素材）
wf3: Executor    ──auto_push──→ Analyst（执行数据）
wf4: Analyst     ──need_confirm──→ end（效果评估）
```

**运行时步骤：**

| 步骤 | 角色       | action       | 驳回 → 回退到（上一个 need_confirm）       |
| ---- | ---------- | ------------ | ------------------------------------------ |
| 1    | Strategist | need_confirm | —                                          |
| 2    | Creative   | auto_push    | —                                          |
| 3    | Executor   | auto_push    | —                                          |
| 4    | Analyst    | need_confirm | **Creative** ← step2 是上一个 need_confirm |

---

### 4.5 游戏开发（game_dev）

```
种子数据：
wf0: start    ──auto_push──→ Designer（游戏概念）
wf1: Designer ──need_confirm──→ Artist（设计文档）
wf2: Artist   ──auto_push──→ Coder（美术资源）
wf3: Coder    ──auto_push──→ Tester（可玩版本）
wf4: Tester   ──need_confirm──→ end（验收测试）
```

**运行时步骤：**

| 步骤 | 角色     | action       | 驳回 → 回退到（上一个 need_confirm）     |
| ---- | -------- | ------------ | ---------------------------------------- |
| 1    | Designer | need_confirm | —                                        |
| 2    | Artist   | auto_push    | —                                        |
| 3    | Coder    | auto_push    | —                                        |
| 4    | Tester   | need_confirm | **Artist** ← step2 是上一个 need_confirm |

---

### 4.6 学术研究（research_project）

```
种子数据：
wf0: start ──auto_push──→ PI（研究选题）
wf1: PI    ──need_confirm──→ LR（研究计划）
wf2: LR    ──auto_push──→ ER（文献综述）
wf3: ER    ──need_confirm──→ end（研究成果）
```

**运行时步骤：**

| 步骤 | 角色 | action       | 驳回 → 回退到（上一个 need_confirm） |
| ---- | ---- | ------------ | ------------------------------------ |
| 1    | PI   | need_confirm | —                                    |
| 2    | LR   | auto_push    | —                                    |
| 3    | ER   | need_confirm | **PI** ← step1 是上一个 need_confirm |

---

## 五、驳回回退矩阵（基于"上一个 need_confirm"逻辑）

| 模板               | 驳回节点 | 回退到   |                                      业务合理性                                      |
| ------------------ | -------- | -------- | :----------------------------------------------------------------------------------: |
| software_dev       | Reviewer | QA       |                                    ✅ QA 重新测试                                    |
| content_creation   | Auditor  | Writer   |                                    ✅ Writer 重写                                    |
| data_analysis      | DS       | DE       |                                  ✅ DE 重新清洗数据                                  |
| marketing_campaign | Analyst  | Creative |                                 ✅ Creative 重新设计                                 |
| game_dev           | Tester   | Artist   | ⚠️ Bug 应在 Coder 代码中，回退到 Artist 范围可能过大（Artist→Coder→Tester 全套重做） |
| research_project   | ER       | PI       |                                ✅ PI 重新确定研究计划                                |

**已知局限**：驳回回退基于步骤拓扑位置（上一个 need_confirm），而非语义上的"谁出了 bug"。game_dev 中 Artist 与 Coder 中间可能不该全套重做。长期可考虑在工作流边定义 `reject_target_role_id`。

---

## 六、当前实现状态

### 已实施优化

1. **驳回逻辑**：改为查找上一个 `action='need_confirm'` 的步骤，通用支持任意复杂自定义工作流
2. **中间步骤重置**：回退时批量重置 `target+1` 到 `current_step` 之间所有步骤为 pending
3. **种子数据**：移除所有末尾循环审批（content_creation、marketing_campaign、game_dev、research_project 去掉多余的 `need_confirm→上游→auto_push→end` 模式）
4. **step_index 传递**：`workflow_auto_push_completed` 事件正确查询当前 running 步骤，artifact 不再有 NULL step_index

### 长期规划

- game_dev 驳回回退到 Artist（而非 Coder）：需支持工作流边级别的 `reject_target_role_id` 语义化回退目标

---

## 七、当前种子数据一览

| 模板                   | 边  | from       | to         | 产物     | 流转         |
| ---------------------- | --- | ---------- | ---------- | -------- | ------------ |
| **software_dev**       | wf0 | start      | PM         | 需求文档 | auto_push    |
|                        | wf1 | PM         | Dev        | 需求规格 | need_confirm |
|                        | wf2 | Dev        | QA         | 代码实现 | auto_push    |
|                        | wf3 | QA         | Reviewer   | 测试报告 | need_confirm |
|                        | wf4 | Reviewer   | end        | 完成     | auto_push    |
| **content_creation**   | wf0 | start      | Planner    | 选题方向 | auto_push    |
|                        | wf1 | Planner    | Writer     | 内容大纲 | need_confirm |
|                        | wf2 | Writer     | Editor     | 初稿     | auto_push    |
|                        | wf3 | Editor     | Auditor    | 修改稿   | auto_push    |
|                        | wf4 | Auditor    | end        | 终审     | need_confirm |
| **data_analysis**      | wf0 | start      | BA         | 分析需求 | auto_push    |
|                        | wf1 | BA         | DE         | 数据需求 | auto_push    |
|                        | wf2 | DE         | DS         | 数据集   | need_confirm |
|                        | wf3 | DS         | BA         | 分析报告 | auto_push    |
|                        | wf4 | BA         | end        | 完成     | auto_push    |
| **marketing_campaign** | wf0 | start      | Strategist | 营销需求 | auto_push    |
|                        | wf1 | Strategist | Creative   | 策略方案 | need_confirm |
|                        | wf2 | Creative   | Executor   | 创意素材 | auto_push    |
|                        | wf3 | Executor   | Analyst    | 执行数据 | auto_push    |
|                        | wf4 | Analyst    | end        | 效果评估 | need_confirm |
| **game_dev**           | wf0 | start      | Designer   | 游戏概念 | auto_push    |
|                        | wf1 | Designer   | Artist     | 设计文档 | need_confirm |
|                        | wf2 | Artist     | Coder      | 美术资源 | auto_push    |
|                        | wf3 | Coder      | Tester     | 可玩版本 | auto_push    |
|                        | wf4 | Tester     | end        | 验收测试 | need_confirm |
| **research_project**   | wf0 | start      | PI         | 研究选题 | auto_push    |
|                        | wf1 | PI         | LR         | 研究计划 | need_confirm |
|                        | wf2 | LR         | ER         | 文献综述 | auto_push    |
|                        | wf3 | ER         | end        | 研究成果 | need_confirm |

---

## 八、总结

### 驳回逻辑

- 驳回时查找**上一个 need_confirm 步骤**，通用支持任意复杂自定义工作流
- 回退时**批量重置**中间所有步骤（`target+1..=current`）为 pending
- 与种子数据结构无关，代码层面通用

### 种子数据

- 移除 4 个模板的末尾循环审批（content_creation、marketing_campaign、game_dev、research_project）
- software_dev 和 data_analysis 保持原有结构

### 已知局限

- game_dev 驳回回退到 Artist 而非 Coder，后续可考虑工作流边级别的 `reject_target_role_id`
