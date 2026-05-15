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

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "待审批",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  skipped: "已跳过",
  pending: "等待中",
};

const ARTIFACT_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  in_progress: "进行中",
  pending: "待处理",
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  triage: { label: "待分类", color: "#636e72", bg: "#dfe6e9" },
  todo: { label: "待办", color: "#6c5ce7", bg: "#ddd6fe" },
  ready: { label: "就绪", color: "#0984e3", bg: "#bee3f8" },
  running: { label: "进行中", color: "#e17055", bg: "#ffeaa7" },
  done: { label: "已完成", color: "#00b894", bg: "#c6f6d5" },
  blocked: { label: "阻塞", color: "#d63031", bg: "#fab1a0" },
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

  const taskStatus = progress ? TASK_STATUS_CONFIG[progress.task.status] : null;

  return (
    <div className={styles.studioModalOverlay} onClick={onClose}>
      <div
        className={styles.studioModal}
        style={{ maxWidth: 680, maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.studioModalHeader}>
          <h3>📊 任务进度</h3>
          <button className={styles.studioModalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            加载中...
          </div>
        ) : progress ? (
          <div style={{ padding: "20px 24px", overflowY: "auto", maxHeight: "calc(85vh - 60px)" }}>
            {/* 任务基本信息 */}
            <div
              style={{
                padding: 14,
                background: "#f8f9fa",
                borderRadius: 10,
                marginBottom: 20,
                border: "1px solid #e9ecef",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{getRoleIcon(progress.task.assignee)}</span>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>
                  {progress.task.title}
                </span>
                {taskStatus && (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      color: taskStatus.color,
                      background: taskStatus.bg,
                    }}
                  >
                    {taskStatus.label}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#666" }}>
                <span>
                  👤 受理人：{getRoleIcon(progress.task.assignee)}{" "}
                  {getRoleName(progress.task.assignee)}
                </span>
                <span>📅 创建：{formatTime(progress.task.createdAt)}</span>
                {progress.task.startedAt && (
                  <span>🚀 开始：{formatTime(progress.task.startedAt)}</span>
                )}
              </div>
            </div>

            {/* 流程进度 */}
            {progress.workflowRun && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    marginBottom: 12,
                    color: "#333",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  🔄 流程进度
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {progress.workflowRun.steps.map((step, idx) => {
                    const isRunning = step.status === "running";
                    const isCompleted = step.status === "completed";
                    const isFailed = step.status === "failed";
                    return (
                      <div
                        key={step.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          background: isRunning
                            ? "#fff8e1"
                            : isCompleted
                              ? "#e8f5e9"
                              : isFailed
                                ? "#ffebee"
                                : "#f5f5f5",
                          borderRadius: 8,
                          border: isRunning ? "1px solid #ffd54f" : "1px solid transparent",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{STATUS_ICON[step.status] || "⏳"}</span>
                        <span
                          style={{
                            fontWeight: 600,
                            color: "#555",
                            minWidth: 50,
                          }}
                        >
                          步骤 {idx + 1}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span>{getRoleIcon(step.roleId)}</span>
                          <span>{getRoleName(step.roleId)}</span>
                        </span>
                        <span style={{ color: "#888", flex: 1 }}>{step.action}</span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: isRunning
                              ? "#fff3cd"
                              : isCompleted
                                ? "#d4edda"
                                : isFailed
                                  ? "#f8d7da"
                                  : "#e9ecef",
                            color: isRunning
                              ? "#856404"
                              : isCompleted
                                ? "#155724"
                                : isFailed
                                  ? "#721c24"
                                  : "#666",
                          }}
                        >
                          {STATUS_LABEL[step.status] || step.status}
                        </span>
                        {step.startedAt && (
                          <span
                            style={{
                              color: "#aaa",
                              fontSize: 11,
                              minWidth: 80,
                              textAlign: "right",
                            }}
                          >
                            {formatTime(step.startedAt)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 产物列表 */}
            {progress.artifacts.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    marginBottom: 12,
                    color: "#333",
                  }}
                >
                  📦 产物 ({progress.artifacts.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {progress.artifacts.map((a) => {
                    const statusConfig: Record<
                      string,
                      { icon: string; color: string; bg: string }
                    > = {
                      approved: { icon: "✅", color: "#155724", bg: "#d4edda" },
                      rejected: { icon: "❌", color: "#721c24", bg: "#f8d7da" },
                      submitted: { icon: "⏳", color: "#856404", bg: "#fff3cd" },
                      in_progress: { icon: "🔄", color: "#0c5460", bg: "#d1ecf1" },
                      draft: { icon: "📝", color: "#495057", bg: "#e9ecef" },
                      pending: { icon: "📋", color: "#495057", bg: "#e9ecef" },
                    };
                    const sc = statusConfig[a.status] || statusConfig.draft;
                    return (
                      <div key={a.id}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 14px",
                            background: "#fafafa",
                            borderRadius: 8,
                            border: "1px solid #eee",
                            fontSize: 13,
                            cursor: a.content ? "pointer" : "default",
                            transition: "background 0.15s",
                          }}
                          onClick={() =>
                            setExpandedArtifact(expandedArtifact === a.id ? null : a.id)
                          }
                        >
                          <span style={{ fontSize: 16 }}>{sc.icon}</span>
                          <span style={{ fontWeight: 600, flex: 1 }}>{a.title}</span>
                          <span style={{ color: "#888", fontSize: 12 }}>{a.artifactType}</span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 10,
                              color: sc.color,
                              background: sc.bg,
                              fontWeight: 500,
                            }}
                          >
                            {ARTIFACT_STATUS_LABEL[a.status] || a.status}
                          </span>
                          <span
                            style={{
                              color: "#888",
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {getRoleIcon(a.roleId)} {getRoleName(a.roleId)}
                          </span>
                        </div>
                        {expandedArtifact === a.id && a.content && (
                          <div
                            style={{
                              margin: "4px 0 4px 28px",
                              padding: 12,
                              background: "#fff",
                              border: "1px solid #e0e0e0",
                              borderRadius: 8,
                              fontSize: 12,
                              maxHeight: 200,
                              overflow: "auto",
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.6,
                              color: "#444",
                            }}
                          >
                            {a.content.slice(0, 3000)}
                            {a.content.length > 3000 && "..."}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 活动时间线 */}
            {progress.activities.length > 0 && (
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    marginBottom: 12,
                    color: "#333",
                  }}
                >
                  📋 最近动态
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {progress.activities.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "#555",
                        background: "#fafafa",
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ color: "#aaa", fontSize: 11, minWidth: 130 }}>
                        {formatTime(act.createdAt)}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {getRoleIcon(act.roleId)} {getRoleName(act.roleId)}
                      </span>
                      <span style={{ flex: 1 }}>{act.detail || act.action}</span>
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
                    padding: 40,
                    textAlign: "center",
                    color: "#999",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  暂无进度信息
                </div>
              )}
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            未找到任务信息
          </div>
        )}
      </div>
    </div>
  );
}
