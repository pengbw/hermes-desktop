import DOMPurify from "dompurify";
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PendingReviewTask, AiRoleItem, ProjectArtifact } from "@core/types";

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

function shouldRenderAsMarkdown(filePath: string, content: string): boolean {
  const ext = filePath?.split(".").pop()?.toLowerCase() || "";
  if (["md", "markdown", "txt"].includes(ext)) return true;
  if (
    filePath &&
    ![
      "json",
      "yaml",
      "yml",
      "toml",
      "xml",
      "csv",
      "html",
      "css",
      "js",
      "ts",
      "py",
      "rs",
      "go",
      "java",
      "c",
      "cpp",
      "sh",
      "sql",
    ].includes(ext)
  ) {
    if (
      content &&
      /^#{1,6}\s|^\*\s|^\-\s|^\d+\.\s|^\>\s|\[.*\]\(.*\)|```/m.test(content.slice(0, 2000))
    ) {
      return true;
    }
  }
  if (
    !filePath &&
    content &&
    /^#{1,6}\s|^\*\s|^\-\s|^\d+\.\s|^\>\s|\[.*\]\(.*\)|```/m.test(content.slice(0, 2000))
  ) {
    return true;
  }
  return false;
}

function ArtifactPreviewModal({
  artifact,
  onClose,
}: {
  artifact: ProjectArtifact;
  onClose: () => void;
}) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const isMd = shouldRenderAsMarkdown(artifact.filePath || "", artifact.content || "");

  useEffect(() => {
    const render = async () => {
      setLoading(true);
      try {
        if (isMd) {
          const { marked } = await import("marked");
          const result = await marked.parse(artifact.content || "");
          setHtml(result as string);
        } else {
          setHtml("");
        }
      } catch {
        setHtml("");
      } finally {
        setLoading(false);
      }
    };
    render();
  }, [artifact.content, isMd]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="file-preview-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="file-preview-modal">
        <div className="file-preview-header">
          <div className="file-preview-title">
            <span className="file-preview-type-badge">
              {isMd ? "markdown" : artifact.artifactType}
            </span>
            <h3>{artifact.title || artifact.artifactType}</h3>
          </div>
          <button className="file-preview-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="file-preview-body">
          {loading && isMd ? (
            <div className="file-preview-loading">
              <span className="loading-spinner">⏳</span>
              <p>渲染中...</p>
            </div>
          ) : isMd ? (
            <div
              className="file-preview-content"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
            />
          ) : (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {artifact.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PendingReviewPanel({
  projectId,
  allRoles,
  onReviewComplete,
}: PendingReviewPanelProps) {
  const [pendingTasks, setPendingTasks] = useState<PendingReviewTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<PendingReviewTask | null>(null);
  const [previewArtifact, setPreviewArtifact] = useState<ProjectArtifact | null>(null);
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
    } catch {
      // console.error("Failed to load pending review tasks:", err);
    }
  }, [projectId]);

  useEffect(() => {
    loadPending();
  }, [projectId]);

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
          reason: reviewComment || "审核驳回",
        });
      }
      setReviewComment("");
      await loadPending();
      onReviewComplete();
    } catch {
      // console.error("Failed to review artifact:", err);
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
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>🎉 暂无待审核任务</div>;
  }

  return (
    <>
      <div style={{ display: "flex", height: "100%", minHeight: 300 }}>
        <div
          style={{
            width: 240,
            borderRight: "1px solid var(--color-border)",
            overflow: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              fontWeight: 600,
              fontSize: 12,
              color: "var(--color-text-secondary)",
              borderBottom: "1px solid var(--color-border)",
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
                borderBottom: "1px solid var(--color-border)",
                background: selectedTask?.task.id === pt.task.id ? "var(--color-nav-active)" : "transparent",
                color: "var(--color-text)",
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{pt.task.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", gap: 8 }}>
                <span>
                  {getRoleIcon(pt.task.assignee)} {getRoleName(pt.task.assignee)}
                </span>
                <span>📦 {pt.pendingArtifacts.length}</span>
              </div>
            </div>
          ))}
        </div>

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
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400 }}>
                  {getRoleIcon(selectedTask.task.assignee)}{" "}
                  {getRoleName(selectedTask.task.assignee)}
                </span>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  marginBottom: 12,
                }}
              >
                待审核产物 ({selectedTask.pendingArtifacts.length})
              </div>

              {selectedTask.pendingArtifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    marginBottom: 12,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      background: "#f8f9fa",
                      cursor: "pointer",
                    }}
                    onClick={() => setPreviewArtifact(artifact)}
                  >
                    <span>📄</span>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{artifact.title}</span>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{artifact.artifactType}</span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "1px 6px",
                        borderRadius: 3,
                        background: "var(--color-dirty-badge-bg)",
                        color: "var(--color-dirty-badge-text)",
                      }}
                    >
                      {ARTIFACT_STATUS_LABEL[artifact.status] || artifact.status}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
                      {getRoleIcon(artifact.roleId)} {getRoleName(artifact.roleId)} ·{" "}
                      {formatTime(artifact.createdAt)}
                    </span>
                    {artifact.content && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "#e8f4fd",
                          color: "#0984e3",
                          cursor: "pointer",
                        }}
                      >
                        👁 查看
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      padding: "8px 12px",
                      borderTop: "1px solid var(--color-border)",
                    }}
                  >
                    <textarea
                      placeholder="审核说明（可选）..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        border: "1px solid #ddd",
                        borderRadius: 4,
                        fontSize: 13,
                        resize: "vertical",
                        boxSizing: "border-box",
                        marginBottom: 8,
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button
                        onClick={() => handleReview(artifact.id, "approve")}
                        disabled={reviewing}
                        style={{
                          padding: "6px 16px",
                          background: "#00b894",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          cursor: reviewing ? "not-allowed" : "pointer",
                          fontSize: 13,
                        }}
                      >
                        ✅ 通过
                      </button>
                      <button
                        onClick={() => handleReview(artifact.id, "reject")}
                        disabled={reviewing}
                        style={{
                          padding: "6px 16px",
                          background: "#e17055",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          cursor: reviewing ? "not-allowed" : "pointer",
                          fontSize: 13,
                        }}
                      >
                        ❌ 驳回
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
              请选择左侧任务查看详情
            </div>
          )}
        </div>
      </div>

      {previewArtifact && (
        <ArtifactPreviewModal artifact={previewArtifact} onClose={() => setPreviewArtifact(null)} />
      )}
    </>
  );
}
