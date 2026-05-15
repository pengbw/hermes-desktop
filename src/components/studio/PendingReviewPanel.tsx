import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PendingReviewTask, AiRoleItem } from "@core/types";

interface PendingReviewPanelProps {
  projectId: string;
  allRoles: AiRoleItem[];
  onReviewComplete: () => void;
}

const ARTIFACT_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

export default function PendingReviewPanel({
  projectId,
  allRoles,
  onReviewComplete,
}: PendingReviewPanelProps) {
  const [pendingTasks, setPendingTasks] = useState<PendingReviewTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<PendingReviewTask | null>(null);
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      const data = await invoke<PendingReviewTask[]>("list_pending_review_tasks", { projectId });
      setPendingTasks(data);
      setSelectedTask((prev) => {
        if (prev) {
          const refreshed = data.find((t) => t.task.id === prev.task.id);
          if (refreshed) return refreshed;
        }
        return data.length > 0 ? data[0] : null;
      });
    } catch (err) {
      console.error("Failed to load pending review tasks:", err);
    }
  }, [projectId]);

  useEffect(() => {
    loadPending();
  }, [projectId]);

  // 监听产物状态变更事件，自动刷新待办审核列表
  useEffect(() => {
    const unlisten = listen<{
      projectId: string;
      artifactId: string;
      newStatus: string;
    }>("artifact_status_changed", (event) => {
      const { projectId: pid, newStatus } = event.payload;
      if (pid !== projectId) return;
      if (newStatus === "submitted" || newStatus === "approved" || newStatus === "rejected") {
        loadPending();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [projectId, loadPending]);

  const handleReview = async (artifactId: string, action: "approve" | "reject") => {
    setReviewing(true);
    try {
      if (action === "approve") {
        await invoke("approve_project_artifact", {
          id: artifactId,
          comment: reviewComment || (action === "approve" ? "审核通过" : "审核驳回"),
        });
      } else {
        await invoke("reject_project_artifact", {
          id: artifactId,
          comment: reviewComment || "审核驳回",
        });
      }
      setReviewComment("");
      await loadPending();
      onReviewComplete();
    } catch (err) {
      console.error("Failed to review artifact:", err);
    } finally {
      setReviewing(false);
    }
  };

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "系统";
    return allRoles.find((r) => r.id === roleId)?.name || roleId;
  };

  const getRoleIcon = (roleId: string | null) => {
    if (!roleId) return "🤖";
    return allRoles.find((r) => r.id === roleId)?.icon || "👤";
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString("zh-CN");
  };

  if (pendingTasks.length === 0) {
    return <div style={{ padding: 32, textAlign: "center", color: "#999" }}>🎉 暂无待审核任务</div>;
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 300 }}>
      {/* 左侧：待审核任务列表 */}
      <div
        style={{
          width: 240,
          borderRight: "1px solid #e9ecef",
          overflow: "auto",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            fontWeight: 600,
            fontSize: 12,
            color: "#666",
            borderBottom: "1px solid #e9ecef",
          }}
        >
          待审核 ({pendingTasks.length})
        </div>
        {pendingTasks.map((pt) => (
          <div
            key={pt.task.id}
            onClick={() => setSelectedTask(pt)}
            style={{
              padding: "10px 12px",
              cursor: "pointer",
              borderBottom: "1px solid #f0f0f0",
              background: selectedTask?.task.id === pt.task.id ? "#eef0ff" : "transparent",
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{pt.task.title}</div>
            <div style={{ fontSize: 11, color: "#888", display: "flex", gap: 8 }}>
              <span>
                {getRoleIcon(pt.task.assignee)} {getRoleName(pt.task.assignee)}
              </span>
              <span>📦 {pt.pendingArtifacts.length}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 右侧：产物详情和审核 */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {selectedTask ? (
          <>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {selectedTask.task.title}
              <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>
                {getRoleIcon(selectedTask.task.assignee)} {getRoleName(selectedTask.task.assignee)}
              </span>
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 12,
              }}
            >
              待审核产物 ({selectedTask.pendingArtifacts.length})
            </div>

            {selectedTask.pendingArtifacts.map((artifact) => (
              <div
                key={artifact.id}
                style={{
                  border: "1px solid #e9ecef",
                  borderRadius: 8,
                  marginBottom: 12,
                  overflow: "hidden",
                }}
              >
                {/* 产物头部 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    background: "#f8f9fa",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    setExpandedArtifact(expandedArtifact === artifact.id ? null : artifact.id)
                  }
                >
                  <span>📄</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{artifact.title}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>{artifact.artifactType}</span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: "#fff3cd",
                    }}
                  >
                    {ARTIFACT_STATUS_LABEL[artifact.status] || artifact.status}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#999" }}>
                    {getRoleIcon(artifact.roleId)} {getRoleName(artifact.roleId)} ·{" "}
                    {formatTime(artifact.createdAt)}
                  </span>
                </div>

                {/* 产物内容预览 */}
                {expandedArtifact === artifact.id && artifact.content && (
                  <div
                    style={{
                      padding: 12,
                      fontSize: 12,
                      maxHeight: 200,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      borderTop: "1px solid #e9ecef",
                    }}
                  >
                    {artifact.content.slice(0, 3000)}
                    {artifact.content.length > 3000 && (
                      <span style={{ color: "#999" }}>... (内容过长，已截断)</span>
                    )}
                  </div>
                )}

                {/* 审核操作 */}
                <div
                  style={{
                    padding: "8px 12px",
                    borderTop: "1px solid #e9ecef",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <input
                    type="text"
                    placeholder="审核说明（可选）..."
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      border: "1px solid #ddd",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  />
                  <button
                    onClick={() => handleReview(artifact.id, "approve")}
                    disabled={reviewing}
                    style={{
                      padding: "4px 12px",
                      background: "#00b894",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      cursor: reviewing ? "not-allowed" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    ✅ 通过
                  </button>
                  <button
                    onClick={() => handleReview(artifact.id, "reject")}
                    disabled={reviewing}
                    style={{
                      padding: "4px 12px",
                      background: "#e17055",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      cursor: reviewing ? "not-allowed" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    ❌ 驳回
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div style={{ padding: 32, textAlign: "center", color: "#999" }}>
            请选择左侧任务查看详情
          </div>
        )}
      </div>
    </div>
  );
}
