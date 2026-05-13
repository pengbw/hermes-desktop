import type { ProjectTask, ProjectMember, AiRoleItem } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const TASK_STATUS_OPTIONS = [
  { key: "triage", label: "待分类", color: "#b2bec3", icon: "📥" },
  { key: "todo", label: "待办", color: "#6c5ce7", icon: "📋" },
  { key: "ready", label: "就绪", color: "#0984e3", icon: "🟢" },
  { key: "running", label: "进行中", color: "#fdcb6e", icon: "🔄" },
  { key: "done", label: "完成", color: "#00b894", icon: "✅" },
  { key: "blocked", label: "阻塞", color: "#e17055", icon: "🚫" },
];

const PRIORITY_OPTIONS = [
  { key: 0, label: "无", color: "#999" },
  { key: 1, label: "🟢 低", color: "#00b894" },
  { key: 2, label: "🟡 中", color: "#fdcb6e" },
  { key: 3, label: "🔴 高", color: "#e17055" },
];

interface TaskManagementProps {
  tasks: ProjectTask[];
  projectId: string;
  projectMembers: ProjectMember[];
  allRoles: AiRoleItem[];
  onTasksUpdate: (tasks: ProjectTask[]) => void;
}

function TaskManagement({
  tasks,
  projectId,
  projectMembers,
  allRoles,
  onTasksUpdate,
}: TaskManagementProps) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newPriority, setNewPriority] = useState(0);
  const [newStatus, setNewStatus] = useState("ready");
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editPriority, setEditPriority] = useState(0);
  const [dispatchingTask, setDispatchingTask] = useState<ProjectTask | null>(null);
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [dispatching, setDispatching] = useState(false);

  const refreshTasks = useCallback(async () => {
    const updatedTasks = await invoke<ProjectTask[]>("list_project_tasks", { projectId });
    onTasksUpdate(updatedTasks);
  }, [projectId, onTasksUpdate]);

  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;
    try {
      await invoke("create_project_task", {
        req: {
          projectId,
          title: newTitle.trim(),
          body: newBody.trim() || undefined,
          assignee: newAssignee || undefined,
          status: newStatus,
          priority: newPriority,
        },
      });
      setNewTitle("");
      setNewBody("");
      setNewAssignee("");
      setNewPriority(0);
      setNewStatus("ready");
      setShowCreateForm(false);
      refreshTasks();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Record<string, any>) => {
    try {
      await invoke("update_project_task", { id: taskId, req: updates });
      refreshTasks();
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await invoke("delete_project_task", { id: taskId });
      if (editingTask?.id === taskId) setEditingTask(null);
      refreshTasks();
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const handleDispatchTask = async () => {
    if (!dispatchingTask) return;
    const roleId = dispatchingTask.assignee;
    if (!roleId) return;
    setDispatching(true);
    try {
      await invoke("dispatch_task_to_role", {
        taskId: dispatchingTask.id,
        roleId,
        message: dispatchMessage || undefined,
      });
      setDispatchingTask(null);
      setDispatchMessage("");
      refreshTasks();
    } catch (err) {
      console.error("Failed to dispatch task:", err);
    } finally {
      setDispatching(false);
    }
  };

  const startEdit = (task: ProjectTask) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditBody(task.body);
    setEditAssignee(task.assignee);
    setEditPriority(task.priority);
  };

  const saveEdit = async () => {
    if (!editingTask) return;
    await handleUpdateTask(editingTask.id, {
      title: editTitle,
      body: editBody,
      assignee: editAssignee,
      priority: editPriority,
    });
    setEditingTask(null);
  };

  const getRoleName = (roleId: string) => {
    if (!roleId) return "未分配";
    const role = allRoles.find((r) => r.id === roleId);
    if (role) return `${role.icon} ${role.name}`;
    return roleId;
  };

  const getStatusInfo = (status: string) => {
    return (
      TASK_STATUS_OPTIONS.find((s) => s.key === status) || {
        key: status,
        label: status,
        color: "#999",
        icon: "📌",
      }
    );
  };

  const getPriorityInfo = (priority: number) => {
    return PRIORITY_OPTIONS.find((p) => p.key === priority) || PRIORITY_OPTIONS[0];
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAssignee !== "all" && t.assignee !== filterAssignee) return false;
    return true;
  });

  const statusCounts = tasks.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className={styles.taskMgmtView}>
      <div className={styles.taskMgmtHeader}>
        <div className={styles.taskMgmtStats}>
          {TASK_STATUS_OPTIONS.map((s) => (
            <button
              key={s.key}
              className={`${styles.taskMgmtStatBtn} ${filterStatus === s.key ? styles.taskMgmtStatBtnActive : ""}`}
              onClick={() => setFilterStatus(filterStatus === s.key ? "all" : s.key)}
              style={{ borderColor: s.color }}
            >
              <span className={styles.taskMgmtStatIcon}>{s.icon}</span>
              <span className={styles.taskMgmtStatLabel}>{s.label}</span>
              <span className={styles.taskMgmtStatCount} style={{ color: s.color }}>
                {statusCounts[s.key] || 0}
              </span>
            </button>
          ))}
        </div>
        <div className={styles.taskMgmtActions}>
          <select
            className={styles.taskMgmtFilterSelect}
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <option value="all">全部成员</option>
            <option value="">未分配</option>
            {projectMembers.map((m) => {
              const role = allRoles.find((r) => r.id === m.roleId);
              return (
                <option key={m.roleId} value={m.roleId}>
                  {role?.name || m.roleId}
                </option>
              );
            })}
          </select>
          <div style={{ flex: 1 }} />
          <button
            className={styles.taskMgmtCreateBtn}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            + 新建任务
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className={styles.taskMgmtCreateForm}>
          <div className={styles.taskMgmtFormRow}>
            <input
              className={styles.taskMgmtFormInput}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="任务标题"
              autoFocus
            />
          </div>
          <div className={styles.taskMgmtFormRow}>
            <textarea
              className={styles.taskMgmtFormTextarea}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="任务描述（可选）"
              rows={3}
            />
          </div>
          <div className={styles.taskMgmtFormRow}>
            <select
              className={styles.taskMgmtFormSelect}
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
            >
              <option value="">未分配</option>
              {projectMembers.map((m) => {
                const role = allRoles.find((r) => r.id === m.roleId);
                return (
                  <option key={m.roleId} value={m.roleId}>
                    {role?.name || m.roleId}
                  </option>
                );
              })}
            </select>
            <select
              className={styles.taskMgmtFormSelect}
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  优先级：{p.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.taskMgmtFormActions}>
            <button className={styles.taskMgmtFormSubmit} onClick={handleCreateTask}>
              创建
            </button>
            <button
              className={styles.taskMgmtFormCancel}
              onClick={() => {
                setShowCreateForm(false);
                setNewTitle("");
                setNewBody("");
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {editingTask && (
        <div className={styles.taskMgmtEditOverlay} onClick={() => setEditingTask(null)}>
          <div className={styles.taskMgmtEditPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.taskMgmtEditHeader}>
              <h3>编辑任务</h3>
              <button className={styles.taskMgmtEditClose} onClick={() => setEditingTask(null)}>
                ✕
              </button>
            </div>
            <div className={styles.taskMgmtEditBody}>
              <div className={styles.taskMgmtFormField}>
                <label>标题</label>
                <input
                  className={styles.taskMgmtFormInput}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className={styles.taskMgmtFormField}>
                <label>描述</label>
                <textarea
                  className={styles.taskMgmtFormTextarea}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={4}
                />
              </div>
              <div className={styles.taskMgmtFormRow}>
                <div className={styles.taskMgmtFormField}>
                  <label>负责人</label>
                  <select
                    className={styles.taskMgmtFormSelect}
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                  >
                    <option value="">未分配</option>
                    {projectMembers.map((m) => {
                      const role = allRoles.find((r) => r.id === m.roleId);
                      return (
                        <option key={m.roleId} value={m.roleId}>
                          {role?.name || m.roleId}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className={styles.taskMgmtFormField}>
                  <label>优先级</label>
                  <select
                    className={styles.taskMgmtFormSelect}
                    value={editPriority}
                    onChange={(e) => setEditPriority(Number(e.target.value))}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className={styles.taskMgmtEditActions}>
              <button className={styles.taskMgmtFormSubmit} onClick={saveEdit}>
                保存
              </button>
              <button className={styles.taskMgmtFormCancel} onClick={() => setEditingTask(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {dispatchingTask && (
        <div className={styles.taskMgmtEditOverlay} onClick={() => setDispatchingTask(null)}>
          <div className={styles.taskMgmtEditPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.taskMgmtEditHeader}>
              <h3>🚀 派发任务</h3>
              <button className={styles.taskMgmtEditClose} onClick={() => setDispatchingTask(null)}>
                ✕
              </button>
            </div>
            <div className={styles.taskMgmtEditBody}>
              <div className={styles.taskMgmtDispatchInfo}>
                <div className={styles.taskMgmtDispatchRow}>
                  <span className={styles.taskMgmtDispatchLabel}>任务：</span>
                  <span className={styles.taskMgmtDispatchValue}>{dispatchingTask.title}</span>
                </div>
                <div className={styles.taskMgmtDispatchRow}>
                  <span className={styles.taskMgmtDispatchLabel}>派发给：</span>
                  <span className={styles.taskMgmtDispatchValue}>
                    {getRoleName(dispatchingTask.assignee)}
                  </span>
                </div>
              </div>
              <div className={styles.taskMgmtFormField}>
                <label>附加说明（可选）</label>
                <textarea
                  className={styles.taskMgmtFormTextarea}
                  value={dispatchMessage}
                  onChange={(e) => setDispatchMessage(e.target.value)}
                  placeholder="给角色的额外指示或说明..."
                  rows={3}
                />
              </div>
            </div>
            <div className={styles.taskMgmtEditActions}>
              <button
                className={styles.taskMgmtFormSubmit}
                onClick={handleDispatchTask}
                disabled={dispatching}
              >
                {dispatching ? "派发中..." : "确认派发"}
              </button>
              <button
                className={styles.taskMgmtFormCancel}
                onClick={() => setDispatchingTask(null)}
                disabled={dispatching}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.taskMgmtList}>
        {filteredTasks.length === 0 ? (
          <div className={styles.taskMgmtEmpty}>
            {tasks.length === 0 ? "暂无任务，点击「新建任务」创建" : "没有匹配的任务"}
          </div>
        ) : (
          filteredTasks.map((task) => {
            const si = getStatusInfo(task.status);
            const pi = getPriorityInfo(task.priority);
            return (
              <div key={task.id} className={styles.taskMgmtItem}>
                <div className={styles.taskMgmtItemLeft}>
                  <span
                    className={styles.taskMgmtItemStatus}
                    style={{ color: si.color, borderColor: si.color }}
                  >
                    {si.icon} {si.label}
                  </span>
                </div>
                <div className={styles.taskMgmtItemCenter}>
                  <div className={styles.taskMgmtItemTitle}>{task.title}</div>
                  {task.body && (
                    <div className={styles.taskMgmtItemBody}>{task.body.slice(0, 100)}</div>
                  )}
                  <div className={styles.taskMgmtItemMeta}>
                    {task.assignee && (
                      <span className={styles.taskMgmtItemAssignee}>
                        {getRoleName(task.assignee)}
                      </span>
                    )}
                    {task.priority > 0 && (
                      <span className={styles.taskMgmtItemPriority} style={{ color: pi.color }}>
                        {pi.label}
                      </span>
                    )}
                    {task.claimLock && (
                      <span className={styles.taskMgmtItemClaim}>
                        🤚 {getRoleName(task.claimLock)}
                      </span>
                    )}
                    <span className={styles.taskMgmtItemTime}>
                      {new Date(task.createdAt).toLocaleDateString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
                <div className={styles.taskMgmtItemRight}>
                  {task.assignee && task.status !== "done" && task.status !== "running" && (
                    <button
                      className={styles.taskMgmtItemDispatch}
                      onClick={() => {
                        setDispatchingTask(task);
                        setDispatchMessage("");
                      }}
                      title="派发给角色"
                    >
                      🚀
                    </button>
                  )}
                  <button
                    className={styles.taskMgmtItemEdit}
                    onClick={() => startEdit(task)}
                    title="编辑"
                  >
                    ✏️
                  </button>
                  <button
                    className={styles.taskMgmtItemDelete}
                    onClick={() => handleDeleteTask(task.id)}
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default TaskManagement;
