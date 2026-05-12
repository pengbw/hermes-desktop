import type { ProjectTask, ProjectMember, AiRoleItem } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { useState } from "react";
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

function TaskBoard({ tasks, projectId, projectMembers, allRoles, onTasksUpdate }: TaskBoardProps) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");

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
      const updatedTasks = await invoke<ProjectTask[]>("list_project_tasks", { projectId });
      onTasksUpdate(updatedTasks);
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      await invoke("update_project_task", { id: taskId, req: { status } });
      const updatedTasks = await invoke<ProjectTask[]>("list_project_tasks", { projectId });
      onTasksUpdate(updatedTasks);
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await invoke("delete_project_task", { id: taskId });
      const updatedTasks = await invoke<ProjectTask[]>("list_project_tasks", { projectId });
      onTasksUpdate(updatedTasks);
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
            {projectMembers
              .filter((m) => m.roleId !== "builtin_user")
              .map((m) => {
                const role = allRoles.find((r) => r.id === m.roleId);
                return (
                  <option key={m.roleId} value={m.roleId}>
                    {role?.nickname || role?.name || m.roleId}
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
                  return (
                    <div
                      key={task.id}
                      className={styles.studioKanbanCard}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({ taskId: task.id, fromStatus: task.status })
                        );
                      }}
                    >
                      <div className={styles.studioKanbanCardTitle}>{task.title}</div>
                      {task.body && (
                        <div className={styles.studioKanbanCardPreview}>
                          {task.body.slice(0, 80)}
                        </div>
                      )}
                      {assigneeRole && (
                        <div className={styles.studioKanbanCardRole}>
                          {assigneeRole.icon} {assigneeRole.nickname || assigneeRole.name}
                        </div>
                      )}
                      <div className={styles.studioTaskCardActions}>
                        {col.key !== "done" && (
                          <select
                            className={styles.studioTaskStatusSelect}
                            value={task.status}
                            onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                          >
                            <option value="triage">待分类</option>
                            <option value="todo">待办</option>
                            <option value="ready">就绪</option>
                            <option value="running">进行中</option>
                            <option value="done">完成</option>
                            <option value="blocked">阻塞</option>
                          </select>
                        )}
                        <button
                          className={styles.studioTaskDeleteBtn}
                          onClick={() => handleDeleteTask(task.id)}
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
    </div>
  );
}

export default TaskBoard;
