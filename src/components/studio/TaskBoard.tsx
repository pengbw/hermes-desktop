import type {
  ProjectTask,
  ProjectMember,
  AiRoleItem,
  TaskComment,
  TaskLink,
  TaskEvent,
} from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const TASK_COLUMNS = [
  { key: "triage", label: "待分类", color: "#b2bec3" },
  { key: "todo", label: "待办", color: "#6c5ce7" },
  { key: "ready", label: "就绪", color: "#0984e3" },
  { key: "running", label: "进行中", color: "#fdcb6e" },
  { key: "done", label: "完成", color: "#00b894" },
  { key: "blocked", label: "阻塞", color: "#e17055" },
];

interface TaskBoardProps {
  tasks: ProjectTask[];
  projectId: string;
  projectMembers: ProjectMember[];
  allRoles: AiRoleItem[];
  onTasksUpdate: (tasks: ProjectTask[]) => void;
}

function TaskDetailPanel({
  task,
  allRoles,
  projectId: _projectId,
  onClose,
  onTaskUpdate,
}: {
  task: ProjectTask;
  allRoles: AiRoleItem[];
  projectId: string;
  onClose: () => void;
  onTaskUpdate: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"detail" | "comments" | "links" | "events">("detail");
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [newComment, setNewComment] = useState("");
  const [linkToTaskId, setLinkToTaskId] = useState("");
  const [linkType, setLinkType] = useState("depends_on");
  const [editBody, setEditBody] = useState(task.body);
  const [isEditingBody, setIsEditingBody] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const data = await invoke<TaskComment[]>("list_task_comments", { taskId: task.id });
      setComments(data);
    } catch (err) {
      console.error("Failed to load comments:", err);
    }
  }, [task.id]);

  const loadLinks = useCallback(async () => {
    try {
      const data = await invoke<TaskLink[]>("list_task_links", { taskId: task.id });
      setLinks(data);
    } catch (err) {
      console.error("Failed to load links:", err);
    }
  }, [task.id]);

  const loadEvents = useCallback(async () => {
    try {
      const data = await invoke<TaskEvent[]>("list_task_events", { taskId: task.id });
      setEvents(data);
    } catch (err) {
      console.error("Failed to load events:", err);
    }
  }, [task.id]);

  useEffect(() => {
    loadComments();
    loadLinks();
    loadEvents();
  }, [loadComments, loadLinks, loadEvents]);

  const handleClaim = async () => {
    try {
      await invoke("claim_project_task", { taskId: task.id, roleId: "builtin_user" });
      onTaskUpdate();
    } catch (err) {
      console.error("Failed to claim task:", err);
    }
  };

  const handleRelease = async () => {
    try {
      await invoke("release_task_claim", { taskId: task.id });
      onTaskUpdate();
    } catch (err) {
      console.error("Failed to release task:", err);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await invoke("add_task_comment", {
        req: { taskId: task.id, roleId: "builtin_user", content: newComment.trim() },
      });
      setNewComment("");
      loadComments();
    } catch (err) {
      console.error("Failed to add comment:", err);
    }
  };

  const handleLinkTask = async () => {
    if (!linkToTaskId.trim()) return;
    try {
      await invoke("link_tasks", {
        fromTaskId: task.id,
        toTaskId: linkToTaskId.trim(),
        linkType,
      });
      setLinkToTaskId("");
      loadLinks();
    } catch (err) {
      console.error("Failed to link tasks:", err);
    }
  };

  const handleUnlink = async (linkId: string) => {
    try {
      await invoke("unlink_tasks", { linkId });
      loadLinks();
    } catch (err) {
      console.error("Failed to unlink:", err);
    }
  };

  const handleSaveBody = async () => {
    try {
      await invoke("update_project_task", { id: task.id, req: { body: editBody } });
      setIsEditingBody(false);
      onTaskUpdate();
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  };

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "系统";
    const role = allRoles.find((r) => r.id === roleId);
    if (role) return `${role.icon} ${role.name}`;
    return roleId;
  };

  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (ts: number) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const claimerRole = task.claimLock ? allRoles.find((r) => r.id === task.claimLock) : null;
  const isExpired = task.claimExpireAt > 0 && task.claimExpireAt < now;
  const isClaimedByMe = task.claimLock === "builtin_user";

  return (
    <div className={styles.taskDetailOverlay} onClick={onClose}>
      <div className={styles.taskDetailPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.taskDetailHeader}>
          <h3>{task.title}</h3>
          <button className={styles.taskDetailClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.taskDetailTabs}>
          {(["detail", "comments", "links", "events"] as const).map((tab) => (
            <button
              key={tab}
              className={`${styles.taskDetailTab} ${activeTab === tab ? styles.taskDetailTabActive : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "detail" && "详情"}
              {tab === "comments" && `评论 (${comments.length})`}
              {tab === "links" && `关联 (${links.length})`}
              {tab === "events" && "事件"}
            </button>
          ))}
        </div>

        <div className={styles.taskDetailContent}>
          {activeTab === "detail" && (
            <div className={styles.taskDetailSection}>
              <div className={styles.taskDetailField}>
                <label>状态</label>
                <span
                  className={styles.taskDetailStatus}
                  style={{
                    color: TASK_COLUMNS.find((c) => c.key === task.status)?.color || "#999",
                  }}
                >
                  {TASK_COLUMNS.find((c) => c.key === task.status)?.label || task.status}
                </span>
              </div>
              <div className={styles.taskDetailField}>
                <label>优先级</label>
                <span>{task.priority}</span>
              </div>
              <div className={styles.taskDetailField}>
                <label>负责人</label>
                <span>{getRoleName(task.assignee)}</span>
              </div>

              {task.claimLock && (
                <div className={styles.taskDetailField}>
                  <label>认领</label>
                  <span>
                    {claimerRole ? `${claimerRole.icon} ${claimerRole.name}` : task.claimLock}
                    {isExpired && <span style={{ color: "#e17055", marginLeft: 4 }}>(已过期)</span>}
                  </span>
                </div>
              )}

              <div className={styles.taskDetailClaimActions}>
                {!task.claimLock && task.status !== "done" && (
                  <button className={styles.taskDetailClaimBtn} onClick={handleClaim}>
                    🤚 认领任务
                  </button>
                )}
                {isClaimedByMe && (
                  <button className={styles.taskDetailReleaseBtn} onClick={handleRelease}>
                    🔓 释放认领
                  </button>
                )}
                {task.assignee && task.status !== "done" && task.status !== "running" && (
                  <button
                    className={styles.taskDetailDispatchBtn}
                    onClick={async () => {
                      try {
                        await invoke("dispatch_task_to_role", {
                          taskId: task.id,
                          roleId: task.assignee,
                        });
                        onTaskUpdate();
                      } catch (err) {
                        console.error("Failed to dispatch task:", err);
                      }
                    }}
                  >
                    🚀 派发给角色
                  </button>
                )}
              </div>

              {task.startedAt && (
                <div className={styles.taskDetailField}>
                  <label>开始时间</label>
                  <span>{formatTime(task.startedAt)}</span>
                </div>
              )}
              {task.completedAt && (
                <div className={styles.taskDetailField}>
                  <label>完成时间</label>
                  <span>{formatTime(task.completedAt)}</span>
                </div>
              )}

              {task.skills && task.skills !== "[]" && (
                <div className={styles.taskDetailField}>
                  <label>技能</label>
                  <div className={styles.taskDetailSkills}>
                    {JSON.parse(task.skills).map((s: string, i: number) => (
                      <span key={i} className={styles.taskDetailSkillTag}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.taskDetailField}>
                <label>描述</label>
                {isEditingBody ? (
                  <div className={styles.taskDetailEditArea}>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className={styles.taskDetailTextarea}
                      rows={6}
                    />
                    <div className={styles.taskDetailEditActions}>
                      <button onClick={handleSaveBody}>保存</button>
                      <button onClick={() => setIsEditingBody(false)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={styles.taskDetailBody}
                    onClick={() => {
                      setEditBody(task.body);
                      setIsEditingBody(true);
                    }}
                  >
                    {task.body || <span style={{ color: "#999" }}>点击编辑描述...</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "comments" && (
            <div className={styles.taskDetailSection}>
              <div className={styles.taskDetailCommentList}>
                {comments.length === 0 && <div className={styles.taskDetailEmpty}>暂无评论</div>}
                {comments.map((c) => (
                  <div key={c.id} className={styles.taskDetailCommentItem}>
                    <div className={styles.taskDetailCommentMeta}>
                      <span className={styles.taskDetailCommentRole}>{getRoleName(c.roleId)}</span>
                      <span className={styles.taskDetailCommentTime}>
                        {formatTime(c.createdAt)}
                      </span>
                    </div>
                    <div className={styles.taskDetailCommentContent}>{c.content}</div>
                  </div>
                ))}
              </div>
              <div className={styles.taskDetailCommentInput}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="添加评论..."
                  rows={3}
                  className={styles.taskDetailTextarea}
                />
                <button
                  className={styles.taskDetailSendBtn}
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                >
                  发送
                </button>
              </div>
            </div>
          )}

          {activeTab === "links" && (
            <div className={styles.taskDetailSection}>
              <div className={styles.taskDetailLinkList}>
                {links.length === 0 && <div className={styles.taskDetailEmpty}>暂无关联任务</div>}
                {links.map((l) => {
                  const isFrom = l.fromTaskId === task.id;
                  const otherId = isFrom ? l.toTaskId : l.fromTaskId;
                  return (
                    <div key={l.id} className={styles.taskDetailLinkItem}>
                      <span className={styles.taskDetailLinkType}>
                        {l.linkType === "depends_on"
                          ? "依赖"
                          : l.linkType === "blocks"
                            ? "阻塞"
                            : l.linkType}
                      </span>
                      <span className={styles.taskDetailLinkTask}>
                        {isFrom ? "→" : "←"} {otherId.slice(0, 8)}...
                      </span>
                      <button
                        className={styles.taskDetailUnlinkBtn}
                        onClick={() => handleUnlink(l.id)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className={styles.taskDetailLinkForm}>
                <input
                  value={linkToTaskId}
                  onChange={(e) => setLinkToTaskId(e.target.value)}
                  placeholder="目标任务 ID"
                  className={styles.taskDetailInput}
                />
                <select value={linkType} onChange={(e) => setLinkType(e.target.value)}>
                  <option value="depends_on">依赖</option>
                  <option value="blocks">阻塞</option>
                  <option value="related">相关</option>
                </select>
                <button onClick={handleLinkTask} disabled={!linkToTaskId.trim()}>
                  关联
                </button>
              </div>
            </div>
          )}

          {activeTab === "events" && (
            <div className={styles.taskDetailSection}>
              <div className={styles.taskDetailEventList}>
                {events.length === 0 && <div className={styles.taskDetailEmpty}>暂无事件记录</div>}
                {events.map((ev) => (
                  <div key={ev.id} className={styles.taskDetailEventItem}>
                    <span className={styles.taskDetailEventTime}>{formatTime(ev.createdAt)}</span>
                    <span className={styles.taskDetailEventRole}>{getRoleName(ev.roleId)}</span>
                    <span className={styles.taskDetailEventType}>
                      {ev.eventType === "claimed" && "🤚 认领"}
                      {ev.eventType === "released" && "🔓 释放"}
                      {ev.eventType === "commented" && "💬 评论"}
                      {ev.eventType === "status_changed" && "🔄 状态变更"}
                      {!["claimed", "released", "commented", "status_changed"].includes(
                        ev.eventType
                      ) && ev.eventType}
                    </span>
                    {ev.detail && (
                      <span className={styles.taskDetailEventDetail}>{ev.detail.slice(0, 60)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskBoard({ tasks, projectId, projectMembers, allRoles, onTasksUpdate }: TaskBoardProps) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);

  const refreshTasks = async () => {
    const updatedTasks = await invoke<ProjectTask[]>("list_project_tasks", { projectId });
    onTasksUpdate(updatedTasks);
    if (selectedTask) {
      const refreshed = updatedTasks.find((t) => t.id === selectedTask.id);
      if (refreshed) setSelectedTask(refreshed);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      await invoke("create_project_task", {
        req: {
          projectId,
          title: newTaskTitle.trim(),
          assignee: newTaskAssignee || undefined,
          status: "todo",
        },
      });
      setNewTaskTitle("");
      refreshTasks();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      await invoke("update_project_task", { id: taskId, req: { status } });
      refreshTasks();
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await invoke("delete_project_task", { id: taskId });
      if (selectedTask?.id === taskId) setSelectedTask(null);
      refreshTasks();
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = "";
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.taskId && data.fromStatus !== targetStatus) {
        await handleUpdateTaskStatus(data.taskId, targetStatus);
      }
    } catch (err) {
      console.warn("Failed to update task status:", err);
    }
  };

  return (
    <div className={styles.studioTasksView}>
      <div className={styles.studioTasksHeader}>
        <div className={styles.studioTasksAdd}>
          <input
            className={styles.studioTasksInput}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="输入任务标题..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTaskTitle.trim()) {
                handleCreateTask();
              }
            }}
          />
          <select
            className={styles.studioTasksAssigneeSelect}
            value={newTaskAssignee}
            onChange={(e) => setNewTaskAssignee(e.target.value)}
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
      </div>
      <div className={styles.studioTasksKanban}>
        {TASK_COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className={styles.studioKanbanCol}>
              <div className={styles.studioKanbanColHeader}>
                <span className={styles.studioKanbanDot} style={{ background: col.color }} />
                <span className={styles.studioKanbanColTitle}>{col.label}</span>
                <span className={styles.studioKanbanCount}>{colTasks.length}</span>
              </div>
              <div
                className={styles.studioKanbanCards}
                onDragOver={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).style.background = "rgba(108,92,231,0.05)";
                }}
                onDragLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "";
                }}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                {colTasks.map((task) => {
                  const assigneeRole = allRoles.find((r) => r.id === task.assignee);
                  const claimerRole = task.claimLock
                    ? allRoles.find((r) => r.id === task.claimLock)
                    : null;
                  return (
                    <div
                      key={task.id}
                      className={`${styles.studioKanbanCard} ${selectedTask?.id === task.id ? styles.studioKanbanCardSelected : ""}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({ taskId: task.id, fromStatus: task.status })
                        );
                      }}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className={styles.studioKanbanCardTitle}>{task.title}</div>
                      {task.body && (
                        <div className={styles.studioKanbanCardPreview}>
                          {task.body.slice(0, 80)}
                        </div>
                      )}
                      <div className={styles.studioKanbanCardMeta}>
                        {assigneeRole && (
                          <span className={styles.studioKanbanCardRole}>
                            {assigneeRole.icon} {assigneeRole.name}
                          </span>
                        )}
                        {claimerRole && (
                          <span className={styles.studioKanbanCardClaimer}>
                            🤚 {claimerRole.name}
                          </span>
                        )}
                        {task.status === "running" && task.claimLock && (
                          <span className={styles.studioKanbanCardDispatched}>🚀 已派发</span>
                        )}
                      </div>
                      <div className={styles.studioTaskCardActions}>
                        <button
                          className={styles.studioTaskDeleteBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTask(task.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          allRoles={allRoles}
          projectId={projectId}
          onClose={() => setSelectedTask(null)}
          onTaskUpdate={refreshTasks}
        />
      )}
    </div>
  );
}

export default TaskBoard;
