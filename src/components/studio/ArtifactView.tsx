import styles from "@pages/studio/StudioPanel.module.css";
import type { ProjectArtifact, AiRoleItem } from "@core/types";

const ARTIFACT_COLUMNS = [
  { key: "pending", label: "待处理", color: "#b2bec3" },
  { key: "in_progress", label: "进行中", color: "#0984e3" },
  { key: "submitted", label: "待审批", color: "#fdcb6e" },
  { key: "approved", label: "已完成", color: "#00b894" },
  { key: "rejected", label: "已打回", color: "#e17055" },
];

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
                      onClick={() => {
                        if (artifact.filePath) {
                          onPreviewFile(artifact.filePath, artifact.title || artifact.artifactType);
                        }
                      }}
                      style={artifact.filePath ? { cursor: "pointer" } : undefined}
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
              onClick={() => {
                if (artifact.filePath) {
                  onPreviewFile(artifact.filePath, artifact.title || artifact.artifactType);
                }
              }}
              style={artifact.filePath ? { cursor: "pointer" } : undefined}
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
    </div>
  );
}

export default ArtifactView;
