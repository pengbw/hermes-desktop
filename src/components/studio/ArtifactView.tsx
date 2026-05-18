import styles from "@pages/studio/StudioPanel.module.css";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProjectArtifact, AiRoleItem, ArtifactVersion, ArtifactDiff } from "@core/types";

const ARTIFACT_COLUMNS = [
  { key: "pending", label: "待处理", color: "#b2bec3" },
  { key: "in_progress", label: "进行中", color: "#0984e3" },
  { key: "submitted", label: "待审批", color: "#fdcb6e" },
  { key: "approved", label: "已完成", color: "#00b894" },
  { key: "rejected", label: "已打回", color: "#e17055" },
];

function ArtifactVersionPanel({
  artifact,
  onClose,
}: {
  artifact: ProjectArtifact;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [diffResult, setDiffResult] = useState<ArtifactDiff | null>(null);
  const [diffFromId, setDiffFromId] = useState<string>("");
  const [diffToId, setDiffToId] = useState<string>("");

  const loadVersions = useCallback(async () => {
    try {
      const data = await invoke<ArtifactVersion[]>("list_artifact_versions", {
        artifactId: artifact.id,
      });
      setVersions(data);
    } catch (err) {
// console.error("Failed to load versions:", err);
    }
  }, [artifact.id]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleCreateVersion = async () => {
    try {
      await invoke("create_artifact_version", { artifactId: artifact.id });
      loadVersions();
    } catch (err) {
// console.error("Failed to create version:", err);
    }
  };

  const handleDiff = async () => {
    if (!diffFromId || !diffToId) return;
    try {
      const result = await invoke<ArtifactDiff>("diff_artifact_versions", {
        fromId: diffFromId,
        toId: diffToId,
      });
      setDiffResult(result);
    } catch (err) {
// console.error("Failed to diff versions:", err);
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={styles.taskDetailOverlay} onClick={onClose}>
      <div className={styles.taskDetailPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.taskDetailHeader}>
          <h3>📦 {artifact.title || artifact.artifactType} - 版本历史</h3>
          <button className={styles.taskDetailClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.taskDetailContent}>
          <div className={styles.taskDetailSection}>
            <div className={styles.artifactVersionActions}>
              <button className={styles.artifactVersionCreateBtn} onClick={handleCreateVersion}>
                📸 保存当前版本
              </button>
            </div>

            {versions.length === 0 && (
              <div className={styles.taskDetailEmpty}>暂无版本记录，点击上方按钮保存当前版本</div>
            )}

            <div className={styles.artifactVersionList}>
              {versions.map((v) => (
                <div key={v.id} className={styles.artifactVersionItem}>
                  <div className={styles.artifactVersionHeader}>
                    <span className={styles.artifactVersionBadge}>v{v.version}</span>
                    <span className={styles.artifactVersionTime}>{formatTime(v.createdAt)}</span>
                  </div>
                  {v.filePath && <div className={styles.artifactVersionPath}>📄 {v.filePath}</div>}
                  {v.content && (
                    <div className={styles.artifactVersionContent}>
                      {v.content.slice(0, 150)}
                      {v.content.length > 150 && "..."}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {versions.length >= 2 && (
              <div className={styles.artifactVersionDiff}>
                <div className={styles.artifactVersionDiffTitle}>版本对比</div>
                <div className={styles.artifactVersionDiffForm}>
                  <select
                    value={diffFromId}
                    onChange={(e) => setDiffFromId(e.target.value)}
                    className={styles.taskDetailInput}
                  >
                    <option value="">选择旧版本</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                  <span>→</span>
                  <select
                    value={diffToId}
                    onChange={(e) => setDiffToId(e.target.value)}
                    className={styles.taskDetailInput}
                  >
                    <option value="">选择新版本</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleDiff}
                    disabled={!diffFromId || !diffToId}
                    className={styles.artifactVersionDiffBtn}
                  >
                    对比
                  </button>
                </div>

                {diffResult && (
                  <div className={styles.artifactDiffResult}>
                    <div className={styles.artifactDiffStats}>
                      <span className={styles.artifactDiffAdd}>+{diffResult.additions} 行</span>
                      <span className={styles.artifactDiffDel}>-{diffResult.deletions} 行</span>
                    </div>
                    {diffResult.diffText && (
                      <pre className={styles.artifactDiffText}>{diffResult.diffText}</pre>
                    )}
                    {diffResult.additions === 0 && diffResult.deletions === 0 && (
                      <div className={styles.artifactDiffNoChange}>两个版本内容相同</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ArtifactViewProps {
  artifacts: ProjectArtifact[];
  allRoles: AiRoleItem[];
  viewMode: "kanban" | "list";
  onViewModeChange: (mode: "kanban" | "list") => void;
  onApprove: (artifactId: string, approved: boolean) => void;
  onPreviewFile: (path: string, name: string) => void;
  getRoleName: (roleId: string) => string;
  t: (key: string) => string;
}

function ArtifactView({
  artifacts,
  allRoles: _allRoles,
  viewMode,
  onViewModeChange,
  onApprove,
  onPreviewFile,
  getRoleName,
  t,
}: ArtifactViewProps) {
  const [selectedArtifact, setSelectedArtifact] = useState<ProjectArtifact | null>(null);

  const handleCardClick = (artifact: ProjectArtifact) => {
    if (artifact.filePath) {
      onPreviewFile(artifact.filePath, artifact.title || artifact.artifactType);
    }
    setSelectedArtifact(artifact);
  };

  return (
    <div className={styles.studioDetailSection}>
      <div className={styles.studioDetailSectionHeader}>
        <h3>📦 {t("studio.projectTab.artifacts")}</h3>
        <div className={styles.studioViewToggle}>
          <button
            className={styles.studioViewBtn + " " + (viewMode === "kanban" ? styles.active : "")}
            onClick={() => onViewModeChange("kanban")}
            title="看板视图"
          >
            ▦
          </button>
          <button
            className={styles.studioViewBtn + " " + (viewMode === "list" ? styles.active : "")}
            onClick={() => onViewModeChange("list")}
            title="列表视图"
          >
            ☰
          </button>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <div className={styles.studioKanban}>
          {ARTIFACT_COLUMNS.map((col) => {
            const colArtifacts = artifacts.filter((a) => a.status === col.key);
            return (
              <div key={col.key} className={styles.studioKanbanCol}>
                <div className={styles.studioKanbanColHeader}>
                  <span className={styles.studioKanbanDot} style={{ background: col.color }} />
                  <span className={styles.studioKanbanColTitle}>{col.label}</span>
                  <span className={styles.studioKanbanCount}>{colArtifacts.length}</span>
                </div>
                <div className={styles.studioKanbanCards}>
                  {colArtifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className={styles.studioKanbanCard}
                      onClick={() => handleCardClick(artifact)}
                      style={{ cursor: "pointer" }}
                    >
                      <div className={styles.studioKanbanCardTitle}>
                        {artifact.title || artifact.artifactType}
                      </div>
                      {artifact.filePath && (
                        <div className={styles.studioKanbanCardPreview}>📄 {artifact.filePath}</div>
                      )}
                      <div className={styles.studioKanbanCardRole}>
                        {getRoleName(artifact.roleId)}
                      </div>
                      {artifact.status === "submitted" && (
                        <div
                          className={styles.studioArtifactActions}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className={styles.studioApproveBtn}
                            onClick={() => onApprove(artifact.id, true)}
                          >
                            ✓ 通过
                          </button>
                          <button
                            className={styles.studioRejectBtn}
                            onClick={() => onApprove(artifact.id, false)}
                          >
                            ✗ 打回
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.studioArtifacts}>
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className={styles.studioArtifactCard}
              onClick={() => handleCardClick(artifact)}
              style={{ cursor: "pointer" }}
            >
              <div className={styles.studioArtifactHeader}>
                <span className={styles.studioArtifactRole}>{getRoleName(artifact.roleId)}</span>
                <span
                  className={`${styles.studioArtifactStatus} ${styles["status" + artifact.status.charAt(0).toUpperCase() + artifact.status.slice(1)] || ""}`}
                >
                  {artifact.status}
                </span>
              </div>
              <h4>{artifact.title || artifact.artifactType}</h4>
              {artifact.filePath && (
                <p className={styles.studioArtifactFile}>📄 {artifact.filePath}</p>
              )}
              {artifact.content && (
                <p className={styles.studioArtifactContent}>{artifact.content.slice(0, 200)}</p>
              )}
              {artifact.reviewComment && (
                <p className={styles.studioArtifactReviewComment}>💬 {artifact.reviewComment}</p>
              )}
              {artifact.status === "submitted" && (
                <div className={styles.studioArtifactActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.studioApproveBtn}
                    onClick={() => onApprove(artifact.id, true)}
                  >
                    ✓ 通过
                  </button>
                  <button
                    className={styles.studioRejectBtn}
                    onClick={() => onApprove(artifact.id, false)}
                  >
                    ✗ 打回
                  </button>
                </div>
              )}
            </div>
          ))}
          {artifacts.length === 0 && (
            <p className={styles.studioEmpty}>{t("studio.noArtifacts")}</p>
          )}
        </div>
      )}

      {selectedArtifact && (
        <ArtifactVersionPanel
          artifact={selectedArtifact}
          onClose={() => setSelectedArtifact(null)}
        />
      )}
    </div>
  );
}

export default ArtifactView;
