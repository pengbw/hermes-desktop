import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TaskProgress, AiRoleItem } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";

interface TaskProgressModalProps {
  visible: boolean;
  taskId: string;
  allRoles: AiRoleItem[];
  onClose: () => void;
}

const STATUS_ICON: Record<string, string> = {
  pending_approval: "⏳",
  running: "🔄",
  completed: "✅",
  failed: "❌",
  skipped: "⏭️",
};

const ARTIFACT_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

export default function TaskProgressModal({
  visible,
  taskId,
  allRoles,
  onClose,
}: TaskProgressModalProps) {
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);

  useEffect(() => {
    if (visible && taskId) {
      setLoading(true);
      invoke<TaskProgress>("get_task_progress", { taskId })
        .then(setProgress)
        .catch((err) => console.error("Failed to load task progress:", err))
        .finally(() => setLoading(false));
    } else {
      setProgress(null);
    }
  }, [visible, taskId]);

  if (!visible) return null;

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "系统";
    return allRoles.find((r) => r.id === roleId)?.name || roleId;
  };

  const getRoleIcon = (roleId: string | null) => {
    if (!roleId) return "🤖";
    return allRoles.find((r) => r.id === roleId)?.icon || "👤";
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString("zh-CN");
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalContent}
        style={{ maxWidth: 640, maxHeight: "80vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h3>📊 任务进度</h3>
          <button className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#999" }}>加载中...</div>
        ) : progress ? (
          <div style={{ padding: 16 }}>
            {/* 任务基本信息 */}
            <div
              style={{
                padding: 12,
                background: "#f8f9fa",
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
                {progress.task.title}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  fontSize: 12,
                  color: "#666",
                }}
              >
                <span>
                  受理人：{getRoleIcon(progress.task.assignee)}{" "}
                  {getRoleName(progress.task.assignee)}
                </span>
                <span>状态：{progress.task.status}</span>
                <span>创建：{formatTime(progress.task.createdAt)}</span>
              </div>
            </div>

            {/* 流程进度 */}
            {progress.workflowRun && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    marginBottom: 8,
                    color: "#333",
                  }}
                >
                  🔄 流程进度
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {progress.workflowRun.steps.map((step, idx) => (
                    <div
                      key={step.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        background:
                          step.status === "running"
                            ? "#fff3cd"
                            : step.status === "completed"
                              ? "#d4edda"
                              : step.status === "failed"
                                ? "#f8d7da"
                                : "#f8f9fa",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <span>{STATUS_ICON[step.status] || "⏳"}</span>
                      <span style={{ fontWeight: 500 }}>步骤 {idx + 1}</span>
                      <span>
                        {getRoleIcon(step.roleId)} {getRoleName(step.roleId)}
                      </span>
                      <span style={{ color: "#888" }}>{step.action}</span>
                      {step.startedAt && (
                        <span style={{ marginLeft: "auto", color: "#999", fontSize: 11 }}>
                          {formatTime(step.startedAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 产物列表 */}
            {progress.artifacts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    marginBottom: 8,
                    color: "#333",
                  }}
                >
                  📦 产物 ({progress.artifacts.length})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {progress.artifacts.map((a) => (
                    <div key={a.id}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          background: "#f8f9fa",
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: a.content ? "pointer" : "default",
                        }}
                        onClick={() => setExpandedArtifact(expandedArtifact === a.id ? null : a.id)}
                      >
                        <span>
                          {a.status === "approved"
                            ? "✅"
                            : a.status === "rejected"
                              ? "❌"
                              : a.status === "submitted"
                                ? "⏳"
                                : "📝"}
                        </span>
                        <span style={{ fontWeight: 500 }}>{a.title}</span>
                        <span style={{ color: "#888" }}>{a.artifactType}</span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: 3,
                            background:
                              a.status === "approved"
                                ? "#d4edda"
                                : a.status === "rejected"
                                  ? "#f8d7da"
                                  : a.status === "submitted"
                                    ? "#fff3cd"
                                    : "#e9ecef",
                          }}
                        >
                          {ARTIFACT_STATUS_LABEL[a.status] || a.status}
                        </span>
                        <span style={{ marginLeft: "auto", color: "#999", fontSize: 11 }}>
                          {getRoleIcon(a.roleId)} {getRoleName(a.roleId)}
                        </span>
                      </div>
                      {expandedArtifact === a.id && a.content && (
                        <div
                          style={{
                            margin: "4px 0 4px 24px",
                            padding: 10,
                            background: "#fff",
                            border: "1px solid #e9ecef",
                            borderRadius: 6,
                            fontSize: 12,
                            maxHeight: 200,
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {a.content.slice(0, 2000)}
                          {a.content.length > 2000 && "..."}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 活动时间线 */}
            {progress.activities.length > 0 && (
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    marginBottom: 8,
                    color: "#333",
                  }}
                >
                  📋 最近动态
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {progress.activities.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 10px",
                        fontSize: 12,
                        color: "#666",
                      }}
                    >
                      <span style={{ color: "#999", fontSize: 11, minWidth: 120 }}>
                        {formatTime(act.createdAt)}
                      </span>
                      <span>
                        {getRoleIcon(act.roleId)} {getRoleName(act.roleId)}
                      </span>
                      <span>{act.detail || act.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {progress.artifacts.length === 0 &&
              !progress.workflowRun &&
              progress.activities.length === 0 && (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#999",
                    fontSize: 13,
                  }}
                >
                  暂无进度信息
                </div>
              )}
          </div>
        ) : (
          <div style={{ padding: 32, textAlign: "center", color: "#999" }}>未找到任务信息</div>
        )}
      </div>
    </div>
  );
}
