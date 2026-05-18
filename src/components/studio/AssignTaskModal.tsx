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
// console.error("Failed to assign task:", err);
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = roleMap.get(assignee);

  return (
    <div className={styles.studioModalOverlay} onClick={onClose}>
      <div
        className={styles.studioModal}
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.studioModalHeader}>
          <h3>📋 分配任务</h3>
          <button className={styles.studioModalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto" }}>
          <div
            style={{
              padding: "10px 14px",
              background: "#f8f9fa",
              borderRadius: 8,
              marginBottom: 18,
              fontSize: 13,
              color: "#555",
              borderLeft: "3px solid #6c5ce7",
            }}
          >
            <span style={{ fontWeight: 600, color: "#333" }}>任务：</span>
            {taskTitle}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 13,
                fontWeight: 600,
                color: "#333",
              }}
            >
              🔄 流程选择
            </label>
            <select
              className={styles.studioFormInput}
              value={selectedGroupId || ""}
              onChange={(e) => {
                setSelectedGroupId(e.target.value || null);
              }}
              style={{ width: "100%", padding: "10px 12px" }}
            >
              <option value="">不使用流程（自由分配）</option>
              {workflowGroups
                .filter((g) => g.isValid !== false)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.isPrimary ? " 🔒" : ""}
                  </option>
                ))}
            </select>
            {selectedGroupId && (
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                选择流程后，受理人将自动锁定为流程起始角色
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 13,
                fontWeight: 600,
                color: "#333",
              }}
            >
              👤 受理人
            </label>
            <div style={{ position: "relative" }}>
              <select
                className={styles.studioFormInput}
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                disabled={assigneeLocked}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  opacity: assigneeLocked ? 0.7 : 1,
                  background: assigneeLocked ? "#f0f0f0" : undefined,
                }}
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
            </div>
            {assigneeLocked && selectedRole && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                  padding: "6px 10px",
                  background: "#fff3cd",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#856404",
                }}
              >
                <span>🔒 已锁定为流程起始角色：</span>
                <span style={{ fontWeight: 600 }}>
                  {selectedRole.icon} {selectedRole.name}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 8 }}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="请详细描述任务需求、目标和验收标准（必须）"
              rows={3}
              className={styles.studioFormTextarea}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
        </div>

        <div className={styles.studioModalFooter}>
          <button className={styles.studioBtnSecondary} onClick={onClose}>
            取消
          </button>
          <button
            className={styles.studioBtnPrimary}
            onClick={handleAssign}
            disabled={!assignee || loading}
            style={{ opacity: !assignee || loading ? 0.5 : 1 }}
          >
            {loading ? "分配中..." : "✓ 确认分配"}
          </button>
        </div>
      </div>
    </div>
  );
}
