import type {
  ProjectItem,
  AiRoleItem,
  ProjectMember,
  ProjectArtifact,
  ProjectMessage,
} from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import WorkflowDesigner from "../../windows/WorkflowDesigner";

type SettingsTab = "members" | "artifacts" | "workflows" | "guidelines" | "theme" | "stats";

interface ProjectSettingsModalProps {
  visible: boolean;
  projectId: string | null;
  project: ProjectItem | null;
  allRoles: AiRoleItem[];
  projectMembersMap: Record<string, ProjectMember[]>;
  onClose: () => void;
  onProjectsUpdate: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export default function ProjectSettingsModal({
  visible,
  projectId,
  project,
  allRoles,
  projectMembersMap,
  onClose,
  onProjectsUpdate,
  t,
}: ProjectSettingsModalProps) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("members");
  const [settingsMaximized, setSettingsMaximized] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectArtifacts, setProjectArtifacts] = useState<ProjectArtifact[]>([]);
  const [projectMessages] = useState<ProjectMessage[]>([]);
  const [projectGuidelines, setProjectGuidelines] = useState("");

  const loadSettingsData = async () => {
    if (!projectId) return;
    try {
      const [members, artifacts] = await Promise.all([
        invoke<ProjectMember[]>("list_project_members", { projectId }),
        invoke<ProjectArtifact[]>("list_project_artifacts", { projectId }),
      ]);
      setProjectMembers(members);
      setProjectArtifacts(artifacts);
      const proj = project;
      setProjectGuidelines(proj?.projectGuidelines || "");
    } catch (err) {
      console.error("Failed to load project data:", err);
    }
  };

  useEffect(() => {
    if (visible && projectId) {
      setSettingsTab("members");
      loadSettingsData();
    }
  }, [visible, projectId]);

  const getRoleName = (roleId: string) => {
    const role = allRoles.find((r) => r.id === roleId);
    return role ? `${role.icon} ${role.name}` : roleId;
  };

  const handleAddMember = async (roleId: string) => {
    if (!projectId) return;
    try {
      await invoke("add_project_member", {
        req: { projectId, roleId },
      });
      const members = await invoke<ProjectMember[]>("list_project_members", { projectId });
      setProjectMembers(members);
      const artifacts = await invoke<ProjectArtifact[]>("list_project_artifacts", { projectId });
      setProjectArtifacts(artifacts);
    } catch (err) {
      console.error("Failed to add member:", err);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!projectId) return;
    try {
      await invoke("remove_project_member", { id: memberId });
      const members = await invoke<ProjectMember[]>("list_project_members", { projectId });
      setProjectMembers(members);
      const artifacts = await invoke<ProjectArtifact[]>("list_project_artifacts", { projectId });
      setProjectArtifacts(artifacts);
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  const handleUpdateEquipment = async (memberId: string, level: number) => {
    try {
      await invoke("update_member_equipment", { memberId, equipmentLevel: level });
      if (projectId) {
        const members = await invoke<ProjectMember[]>("list_project_members", { projectId });
        setProjectMembers(members);
      }
    } catch (err) {
      console.error("Failed to update equipment:", err);
    }
  };

  const handleSaveGuidelines = async () => {
    if (!projectId) return;
    try {
      await invoke("update_project", {
        req: {
          id: projectId,
          projectGuidelines: projectGuidelines.trim() || undefined,
        },
      });
      onProjectsUpdate();
    } catch (err) {
      console.error("Failed to save guidelines:", err);
    }
  };

  const handleExport = async () => {
    if (!projectId) return;
    try {
      const data = await invoke("export_project", { projectId });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hermes-project-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const handleClose = () => {
    setSettingsMaximized(false);
    onClose();
  };

  if (!visible || !projectId) return null;

  return (
    <div className={styles.studioSettingsOverlay} onClick={handleClose}>
      <div
        className={`${styles.studioSettingsModal} ${settingsMaximized ? styles.maximized : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.studioSettingsHeader}>
          <h3>{t("studio.settings")}</h3>
          <div className={styles.studioSettingsHeaderActions}>
            <button
              className={styles.studioSettingsExport}
              title={t("studio.exportProject")}
              onClick={handleExport}
            >
              ↗
            </button>
            <button
              className={styles.studioSettingsMaximize}
              onClick={() => setSettingsMaximized(!settingsMaximized)}
              title={settingsMaximized ? t("studio.restore") : t("studio.maximize")}
            >
              {settingsMaximized ? "⊡" : "▢"}
            </button>
            <button className={styles.studioSettingsClose} onClick={handleClose}>
              ✕
            </button>
          </div>
        </div>
        <div className={styles.studioSettingsTabs}>
          {(["members", "artifacts", "workflows", "guidelines", "theme", "stats"] as const).map(
            (tab) => (
              <button
                key={tab}
                className={
                  styles.studioSettingsTab + " " + (settingsTab === tab ? styles.active : "")
                }
                onClick={() => setSettingsTab(tab)}
              >
                {t(`studio.projectTab.${tab}`)}
              </button>
            )
          )}
        </div>
        <div className={styles.studioSettingsContent}>
          {settingsTab === "members" && (
            <div className={styles.studioMembers}>
              <div className={styles.studioAddMember}>
                <select
                  className={styles.studioSelect}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddMember(e.target.value);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="" disabled>
                    {t("studio.addMember")}
                  </option>
                  {allRoles
                    .filter((r) => !projectMembers.some((m) => m.roleId === r.id))
                    .map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.icon} {role.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className={styles.studioMemberList}>
                {projectMembers.map((member) => {
                  const isUser = member.roleId === "builtin_user";
                  const eqLevel = member.equipmentLevel || 1;
                  return (
                    <div
                      key={member.id}
                      className={
                        styles.studioMemberCard + " " + (isUser ? styles.studioMemberUser : "")
                      }
                    >
                      <span className={styles.studioMemberRole}>{getRoleName(member.roleId)}</span>
                      {isUser && <span className={styles.studioMemberYouBadge}>YOU</span>}
                      <div className={styles.studioEquipmentControl}>
                        <span className={styles.studioEquipmentLabel}>设备</span>
                        {[1, 2, 3, 4, 5].map((lv) => (
                          <button
                            key={lv}
                            className={
                              styles.studioEquipmentStar +
                              " " +
                              (lv <= eqLevel ? styles.active : "")
                            }
                            onClick={() => handleUpdateEquipment(member.id, lv)}
                            disabled={isUser}
                          >
                            ⭐
                          </button>
                        ))}
                      </div>
                      {!isUser && (
                        <button
                          className={styles.studioRemoveBtn}
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
                {projectMembers.length === 0 && (
                  <p className={styles.studioEmpty}>{t("studio.noMembers")}</p>
                )}
              </div>
            </div>
          )}
          {settingsTab === "artifacts" && (
            <div className={styles.studioArtifacts}>
              {projectArtifacts.map((artifact) => (
                <div key={artifact.id} className={styles.studioArtifactCard}>
                  <div className={styles.studioArtifactHeader}>
                    <span className={styles.studioArtifactRole}>
                      {getRoleName(artifact.roleId)}
                    </span>
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
                    <p className={styles.studioArtifactReviewComment}>
                      💬 {artifact.reviewComment}
                    </p>
                  )}
                  {artifact.status === "submitted" && (
                    <div className={styles.studioArtifactActions}>
                      <button
                        className={styles.studioApproveBtn}
                        onClick={async () => {
                          try {
                            await invoke("approve_project_artifact", { id: artifact.id });
                            const artifacts = await invoke<ProjectArtifact[]>(
                              "list_project_artifacts",
                              {
                                projectId: projectId!,
                              }
                            );
                            setProjectArtifacts(artifacts);
                          } catch (err) {
                            console.error("Failed to approve:", err);
                          }
                        }}
                      >
                        ✓ 通过
                      </button>
                      <button
                        className={styles.studioRejectBtn}
                        onClick={async () => {
                          try {
                            await invoke("reject_project_artifact", {
                              id: artifact.id,
                              reason: "需要修改",
                            });
                            const artifacts = await invoke<ProjectArtifact[]>(
                              "list_project_artifacts",
                              {
                                projectId: projectId!,
                              }
                            );
                            setProjectArtifacts(artifacts);
                          } catch (err) {
                            console.error("Failed to reject:", err);
                          }
                        }}
                      >
                        ✗ 打回
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {projectArtifacts.length === 0 && (
                <p className={styles.studioEmpty}>{t("studio.noArtifacts")}</p>
              )}
            </div>
          )}
          {settingsTab === "workflows" && (
            <div className={styles.studioWorkflowsFlow}>
              <WorkflowDesigner
                projectId={projectId}
                roles={allRoles}
                projectMembers={projectMembersMap[projectId] || []}
                t={t}
              />
            </div>
          )}
          {settingsTab === "guidelines" && (
            <div className={styles.studioGuidelines}>
              <div className={styles.studioGuidelinesHeader}>
                <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 0 12px 0" }}>
                  项目执行规则会注入到每个角色的系统提示中，确保所有角色遵循统一的规范。
                </p>
              </div>
              <textarea
                className={styles.studioTextarea}
                style={{ minHeight: 300, fontSize: 13, lineHeight: 1.6 }}
                value={projectGuidelines}
                onChange={(e) => setProjectGuidelines(e.target.value)}
                placeholder={
                  "示例：\n1. 代码必须遵循 ESLint 规范\n2. 提交信息使用 Conventional Commits 格式\n3. 所有 API 接口需有 TypeScript 类型定义\n4. 组件开发遵循原子设计模式"
                }
              />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button className={styles.studioBtnPrimary} onClick={handleSaveGuidelines}>
                  保存规则
                </button>
              </div>
            </div>
          )}
          {settingsTab === "theme" && (
            <div className={styles.studioThemeSection}>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 0 16px 0" }}>
                选择办公室的视觉风格，不同主题会改变3D办公场景的配色和氛围。
              </p>
              <div className={styles.studioThemeGrid}>
                {[
                  {
                    key: "cozy",
                    name: "温馨风",
                    icon: "🏠",
                    desc: "暖色调木质家具，舒适温馨",
                    colors: ["#f5e6d3", "#c68642", "#c0392b", "#8b6914"],
                  },
                  {
                    key: "tech",
                    name: "科技风",
                    icon: "🚀",
                    desc: "深色背景，冷色调霓虹感",
                    colors: ["#0a0e27", "#1abc9c", "#2980b9", "#533483"],
                  },
                  {
                    key: "minimal",
                    name: "极简风",
                    icon: "⬜",
                    desc: "灰白简约，干净利落",
                    colors: ["#f0f0f0", "#707070", "#505050", "#a0a0a0"],
                  },
                ].map((theme) => (
                  <div
                    key={theme.key}
                    className={
                      styles.studioThemeCard + " " + (project?.officeTheme || "cozy") === theme.key
                        ? styles.active
                        : ""
                    }
                    onClick={() => {
                      if (project) {
                        invoke("update_project", {
                          req: { id: project.id, officeTheme: theme.key },
                        }).then(() => {
                          onProjectsUpdate();
                        });
                      }
                    }}
                  >
                    <div className={styles.studioThemeCardHeader}>
                      <span className={styles.studioThemeIcon}>{theme.icon}</span>
                      <span className={styles.studioThemeName}>{theme.name}</span>
                      {(project?.officeTheme || "cozy") === theme.key && (
                        <span className={styles.studioThemeCheck}>✓</span>
                      )}
                    </div>
                    <div className={styles.studioThemeColors}>
                      {theme.colors.map((c, i) => (
                        <div
                          key={i}
                          className={styles.studioThemeColorDot}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <p className={styles.studioThemeDesc}>{theme.desc}</p>
                  </div>
                ))}
              </div>
              <h4
                style={{
                  margin: "20px 0 8px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary, #333)",
                }}
              >
                {t("studio.officeLayout")}
              </h4>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 0 12px 0" }}>
                {t("studio.officeLayoutDesc")}
              </p>
              <div className={styles.studioThemeGrid}>
                {[
                  {
                    key: "standard",
                    name: t("studio.layoutStandard"),
                    icon: "🏢",
                    desc: t("studio.layoutStandardDesc"),
                  },
                  {
                    key: "compact",
                    name: t("studio.layoutCompact"),
                    icon: "📋",
                    desc: t("studio.layoutCompactDesc"),
                  },
                  {
                    key: "open",
                    name: t("studio.layoutOpen"),
                    icon: "🌐",
                    desc: t("studio.layoutOpenDesc"),
                  },
                ].map((layout) => (
                  <div
                    key={layout.key}
                    className={
                      styles.studioThemeCard + " " + (project?.officeLayout || "standard") ===
                      layout.key
                        ? styles.active
                        : ""
                    }
                    onClick={() => {
                      if (project) {
                        invoke("update_project", {
                          req: { id: project.id, officeLayout: layout.key },
                        }).then(() => {
                          onProjectsUpdate();
                        });
                      }
                    }}
                  >
                    <div className={styles.studioThemeCardHeader}>
                      <span className={styles.studioThemeIcon}>{layout.icon}</span>
                      <span className={styles.studioThemeName}>{layout.name}</span>
                      {(project?.officeLayout || "standard") === layout.key && (
                        <span className={styles.studioThemeCheck}>✓</span>
                      )}
                    </div>
                    <p className={styles.studioThemeDesc}>{layout.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {settingsTab === "stats" &&
            (() => {
              const totalArtifacts = projectArtifacts.length;
              const completedArtifacts = projectArtifacts.filter(
                (a) => a.status === "approved" || a.status === "completed"
              ).length;
              const inProgressArtifacts = projectArtifacts.filter(
                (a) => a.status === "in_progress"
              ).length;
              const pendingArtifacts = projectArtifacts.filter(
                (a) => a.status === "pending"
              ).length;
              const progressPercent =
                totalArtifacts > 0 ? Math.round((completedArtifacts / totalArtifacts) * 100) : 0;
              const memberStats = projectMembers.map((m) => {
                const memberArtifacts = projectArtifacts.filter((a) => a.roleId === m.roleId);
                const memberCompleted = memberArtifacts.filter(
                  (a) => a.status === "approved" || a.status === "completed"
                ).length;
                const memberMessages = projectMessages.filter(
                  (msg) => msg.roleId === m.roleId
                ).length;
                return {
                  ...m,
                  artifactCount: memberArtifacts.length,
                  completedCount: memberCompleted,
                  messageCount: memberMessages,
                };
              });
              return (
                <div className={styles.studioStatsSection}>
                  <div className={styles.studioStatsOverview}>
                    <div className={styles.studioStatsCard}>
                      <div className={styles.studioStatsValue}>{progressPercent}%</div>
                      <div className={styles.studioStatsLabel}>{t("studio.statsProgress")}</div>
                      <div className={styles.studioStatsBar}>
                        <div
                          className={styles.studioStatsBarFill}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className={styles.studioStatsCard}>
                      <div className={styles.studioStatsValue}>{completedArtifacts}</div>
                      <div className={styles.studioStatsLabel}>{t("studio.statsCompleted")}</div>
                    </div>
                    <div className={styles.studioStatsCard}>
                      <div className={styles.studioStatsValue}>{inProgressArtifacts}</div>
                      <div className={styles.studioStatsLabel}>{t("studio.statsInProgress")}</div>
                    </div>
                    <div className={styles.studioStatsCard}>
                      <div className={styles.studioStatsValue}>{pendingArtifacts}</div>
                      <div className={styles.studioStatsLabel}>{t("studio.statsPending")}</div>
                    </div>
                  </div>
                  <h4 className={styles.studioStatsSubtitle}>{t("studio.statsMemberContrib")}</h4>
                  <div className={styles.studioStatsMembers}>
                    {memberStats.map((ms) => {
                      const maxArtifacts = Math.max(...memberStats.map((m) => m.artifactCount), 1);
                      const barWidth = Math.round((ms.artifactCount / maxArtifacts) * 100);
                      return (
                        <div key={ms.id} className={styles.studioStatsMemberRow}>
                          <span className={styles.studioStatsMemberName}>
                            {getRoleName(ms.roleId)}
                          </span>
                          <div className={styles.studioStatsMemberBar}>
                            <div
                              className={styles.studioStatsMemberBarFill}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className={styles.studioStatsMemberDetail}>
                            {ms.completedCount}/{ms.artifactCount} 产物 · {ms.messageCount} 消息
                          </span>
                        </div>
                      );
                    })}
                    {memberStats.length === 0 && <p className={styles.studioEmpty}>暂无成员数据</p>}
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
