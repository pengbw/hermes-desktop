import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WorkflowGroup, ProjectMember, AiRoleItem } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";

interface AssignTaskModalProps {
  visible: boolean;
  projectId: string;
  taskId: string;
  taskTitle: string;
  members: ProjectMember[];
  allRoles: AiRoleItem[];
  onClose: () => void;
  onAssigned: () => void;
}

export default function AssignTaskModal({
  visible,
  projectId,
  taskId,
  taskTitle,
  members,
  allRoles,
  onClose,
  onAssigned,
}: AssignTaskModalProps) {
  const [workflowGroups, setWorkflowGroups] = useState<WorkflowGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [assigneeLocked, setAssigneeLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && projectId) {
      invoke<WorkflowGroup[]>("list_workflow_groups", { projectId })
        .then(setWorkflowGroups)
        .catch(() => setWorkflowGroups([]));
    }
  }, [visible, projectId]);

  useEffect(() => {
    if (selectedGroupId) {
      invoke<{ roleId: string; roleName: string; roleIcon: string } | null>(
        "get_workflow_start_role",
        { groupId: selectedGroupId }
      )
        .then((result) => {
          if (result) {
            setAssignee(result.roleId);
            setAssigneeLocked(true);
          }
        })
        .catch(() => {});
    } else {
      setAssignee("");
      setAssigneeLocked(false);
    }
  }, [selectedGroupId]);

  if (!visible) return null;

  const roleMap = new Map(allRoles.map((r) => [r.id, r]));

  const handleAssign = async () => {
    if (!assignee) return;
    setLoading(true);
    try {
      await invoke("assign_task", {
        taskId,
        assignee,
        workflowGroupId: selectedGroupId || undefined,
        message: message.trim() || undefined,
      });
      onAssigned();
      onClose();
    } catch (err) {
      console.error("Failed to assign task:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalContent}
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h3>📋 分配任务</h3>
          <button className={styles.modalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div style={{ marginBottom: 12, color: "#666", fontSize: 13 }}>任务：{taskTitle}</div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
              流程选择
            </label>
            <select
              className={styles.taskMgmtFormSelect}
              value={selectedGroupId || ""}
              onChange={(e) => {
                setSelectedGroupId(e.target.value || null);
              }}
              style={{ width: "100%" }}
            >
              <option value="">不使用流程（自由分配）</option>
              {workflowGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.isPrimary ? " 🔒" : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
              受理人
            </label>
            <select
              className={styles.taskMgmtFormSelect}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              disabled={assigneeLocked}
              style={{ width: "100%", opacity: assigneeLocked ? 0.6 : 1 }}
            >
              <option value="">选择受理人</option>
              {members.map((m) => {
                const role = roleMap.get(m.roleId);
                return (
                  <option key={m.roleId} value={m.roleId}>
                    {role?.icon || "👤"} {role?.name || m.roleId}
                  </option>
                );
              })}
            </select>
            {assigneeLocked && (
              <span style={{ fontSize: 11, color: "#e67e22", marginTop: 2 }}>
                已自动锁定为流程起始角色
              </span>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
              任务说明（可选）
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="输入给受理人的说明..."
              rows={3}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ddd",
                fontSize: 13,
                resize: "vertical",
              }}
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.modalCancelBtn} onClick={onClose}>
            取消
          </button>
          <button
            className={styles.modalConfirmBtn}
            onClick={handleAssign}
            disabled={!assignee || loading}
            style={{ opacity: !assignee || loading ? 0.5 : 1 }}
          >
            {loading ? "分配中..." : "确认分配"}
          </button>
        </div>
      </div>
    </div>
  );
}
