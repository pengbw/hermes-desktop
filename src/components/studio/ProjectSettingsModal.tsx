import type {
  ProjectItem,
  AiRoleItem,
  ProjectMember,
  ProjectArtifact,
  ProjectStats,
  ProjectMemory,
} from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import WorkflowDesigner from "../../windows/WorkflowDesigner";

type SettingsTab =
  | "members"
  | "artifacts"
  | "workflows"
  | "guidelines"
  | "theme"
  | "memories"
  | "stats";

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
          {(
            [
              "members",
              "artifacts",
              "workflows",
              "guidelines",
              "theme",
              "memories",
              "stats",
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              className={
                styles.studioSettingsTab + " " + (settingsTab === tab ? styles.active : "")
              }
              onClick={() => setSettingsTab(tab)}
            >
              {t(`studio.projectTab.${tab}`)}
            </button>
          ))}
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
                  const eqLevel = member.equipmentLevel || 1;
                  return (
                    <div key={member.id} className={styles.studioMemberCard}>
                      <span className={styles.studioMemberRole}>{getRoleName(member.roleId)}</span>
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
                          >
                            ⭐
                          </button>
                        ))}
                      </div>
                      <button
                        className={styles.studioRemoveBtn}
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        ✕
                      </button>
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
          {settingsTab === "memories" && <MemoriesTab projectId={projectId} t={t} />}
          {settingsTab === "stats" && <StatsTab projectId={projectId} />}
        </div>
      </div>
    </div>
  );
}

function StatsTab({ projectId }: { projectId: string | null }) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  useEffect(() => {
    if (projectId) {
      invoke<ProjectStats>("get_project_stats", { projectId }).then(setStats).catch(console.error);
    }
  }, [projectId]);

  if (!stats) {
    return <div className={styles.studioEmpty}>加载统计数据...</div>;
  }

  const taskByStatus = stats.taskStats.byStatus;
  const taskTotal = stats.taskStats.total;
  const taskDone = taskByStatus["done"] || 0;
  const taskRunning = taskByStatus["running"] || 0;
  const taskTodo =
    (taskByStatus["triage"] || 0) + (taskByStatus["todo"] || 0) + (taskByStatus["ready"] || 0);
  const taskBlocked = taskByStatus["blocked"] || 0;

  const artifactByStatus = stats.artifactStats.byStatus;
  const artifactTotal = stats.artifactStats.total;
  const artifactApproved = artifactByStatus["approved"] || 0;
  const artifactInProgress = artifactByStatus["in_progress"] || 0;
  const artifactPending = artifactByStatus["pending"] || 0;
  const artifactRejected = artifactByStatus["rejected"] || 0;

  const healthColor =
    stats.healthScore >= 70 ? "#00b894" : stats.healthScore >= 40 ? "#fdcb6e" : "#e17055";

  return (
    <div className={styles.studioStatsSection}>
      <div className={styles.studioStatsOverview}>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue} style={{ color: healthColor }}>
            {stats.healthScore}
          </div>
          <div className={styles.studioStatsLabel}>健康度</div>
          <div className={styles.studioStatsBar}>
            <div
              className={styles.studioStatsBarFill}
              style={{ width: `${stats.healthScore}%`, background: healthColor }}
            />
          </div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue}>
            {Math.round(stats.taskStats.completionRate * 100)}%
          </div>
          <div className={styles.studioStatsLabel}>任务完成率</div>
          <div className={styles.studioStatsBar}>
            <div
              className={styles.studioStatsBarFill}
              style={{ width: `${stats.taskStats.completionRate * 100}%` }}
            />
          </div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue}>
            {Math.round(stats.artifactStats.approvalRate * 100)}%
          </div>
          <div className={styles.studioStatsLabel}>产物审批率</div>
          <div className={styles.studioStatsBar}>
            <div
              className={styles.studioStatsBarFill}
              style={{ width: `${stats.artifactStats.approvalRate * 100}%` }}
            />
          </div>
        </div>
      </div>

      <h4 className={styles.studioStatsSubtitle}>任务分布</h4>
      <div className={styles.studioStatsOverview}>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue}>{taskTotal}</div>
          <div className={styles.studioStatsLabel}>总任务</div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue} style={{ color: "#00b894" }}>
            {taskDone}
          </div>
          <div className={styles.studioStatsLabel}>已完成</div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue} style={{ color: "#fdcb6e" }}>
            {taskRunning}
          </div>
          <div className={styles.studioStatsLabel}>进行中</div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue} style={{ color: "#6c5ce7" }}>
            {taskTodo}
          </div>
          <div className={styles.studioStatsLabel}>待办</div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue} style={{ color: "#e17055" }}>
            {taskBlocked}
          </div>
          <div className={styles.studioStatsLabel}>阻塞</div>
        </div>
      </div>

      <h4 className={styles.studioStatsSubtitle}>产物分布</h4>
      <div className={styles.studioStatsOverview}>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue}>{artifactTotal}</div>
          <div className={styles.studioStatsLabel}>总产物</div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue} style={{ color: "#00b894" }}>
            {artifactApproved}
          </div>
          <div className={styles.studioStatsLabel}>已审批</div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue} style={{ color: "#fdcb6e" }}>
            {artifactInProgress}
          </div>
          <div className={styles.studioStatsLabel}>进行中</div>
        </div>
        <div className={styles.studioStatsCard}>
          <div className={styles.studioStatsValue} style={{ color: "#6c5ce7" }}>
            {artifactPending}
          </div>
          <div className={styles.studioStatsLabel}>待审核</div>
        </div>
        {artifactRejected > 0 && (
          <div className={styles.studioStatsCard}>
            <div className={styles.studioStatsValue} style={{ color: "#e17055" }}>
              {artifactRejected}
            </div>
            <div className={styles.studioStatsLabel}>已打回</div>
          </div>
        )}
      </div>

      {stats.roleWorkload.length > 0 && (
        <>
          <h4 className={styles.studioStatsSubtitle}>角色工作量</h4>
          <div className={styles.studioStatsMembers}>
            {stats.roleWorkload.map((rw) => {
              const maxTasks = Math.max(...stats.roleWorkload.map((r) => r.taskCount), 1);
              const barWidth = Math.round((rw.taskCount / maxTasks) * 100);
              return (
                <div key={rw.roleId} className={styles.studioStatsMemberRow}>
                  <span className={styles.studioStatsMemberName}>{rw.name}</span>
                  <div className={styles.studioStatsMemberBar}>
                    <div
                      className={styles.studioStatsMemberBarFill}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className={styles.studioStatsMemberDetail}>
                    {rw.completedCount}/{rw.taskCount} 任务
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MemoriesTab({
  projectId,
}: {
  projectId: string | null;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [memories, setMemories] = useState<ProjectMemory[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [newMemory, setNewMemory] = useState({ category: "general", content: "" });

  const loadMemories = async () => {
    if (!projectId) return;
    try {
      const data = await invoke<ProjectMemory[]>("list_project_memories", {
        projectId,
        roleId: filterCategory === "all" ? undefined : undefined,
        category: filterCategory === "all" ? undefined : filterCategory,
      });
      setMemories(data);
    } catch (err) {
      console.error("Failed to load memories:", err);
    }
  };

  useEffect(() => {
    loadMemories();
  }, [projectId, filterCategory]);

  const handleAddMemory = async () => {
    if (!projectId || !newMemory.content.trim()) return;
    try {
      await invoke("create_project_memory", {
        req: {
          projectId,
          roleId: "shared",
          category: newMemory.category,
          content: newMemory.content.trim(),
          importance:
            newMemory.category === "decision" || newMemory.category === "constraint" ? 3 : 1,
        },
      });
      setNewMemory({ category: "general", content: "" });
      loadMemories();
    } catch (err) {
      console.error("Failed to add memory:", err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await invoke("delete_project_memory", { id });
      loadMemories();
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  const categoryLabel: Record<string, string> = {
    decision: "决策",
    tech: "技术",
    constraint: "约束",
    fact: "事实",
    general: "通用",
  };

  const categoryColor: Record<string, string> = {
    decision: "#6c5ce7",
    tech: "#0984e3",
    constraint: "#e17055",
    fact: "#00b894",
    general: "#636e72",
  };

  return (
    <div className={styles.studioMembers}>
      <div className={styles.studioAddMember} style={{ flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <select
            value={newMemory.category}
            onChange={(e) => setNewMemory({ ...newMemory, category: e.target.value })}
            className={styles.studioInput}
            style={{ width: 120 }}
          >
            <option value="general">通用</option>
            <option value="decision">决策</option>
            <option value="tech">技术</option>
            <option value="constraint">约束</option>
            <option value="fact">事实</option>
          </select>
          <input
            type="text"
            value={newMemory.content}
            onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
            placeholder="添加项目记忆..."
            className={styles.studioInput}
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === "Enter" && handleAddMemory()}
          />
          <button className={styles.studioBtnPrimary} onClick={handleAddMemory}>
            添加
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", "decision", "tech", "constraint", "fact", "general"].map((cat) => (
            <button
              key={cat}
              className={
                styles.studioSettingsTab + " " + (filterCategory === cat ? styles.active : "")
              }
              onClick={() => setFilterCategory(cat)}
              style={{ fontSize: 12, padding: "2px 8px" }}
            >
              {cat === "all" ? "全部" : categoryLabel[cat] || cat}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.studioMemberList} style={{ marginTop: 8 }}>
        {memories.length === 0 ? (
          <div className={styles.studioEmpty}>暂无项目记忆</div>
        ) : (
          memories.map((mem) => (
            <div
              key={mem.id}
              className={styles.studioMemberItem}
              style={{ alignItems: "flex-start" }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#fff",
                  background: categoryColor[mem.category] || categoryColor.general,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {categoryLabel[mem.category] || mem.category}
              </span>
              <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{mem.content}</span>
              <button
                className={styles.studioBtnDanger}
                style={{ padding: "2px 6px", fontSize: 11 }}
                onClick={() => handleDeleteMemory(mem.id)}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
