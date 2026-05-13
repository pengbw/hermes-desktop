import { useState, useEffect, useCallback } from "react";
import type { ProjectMember, AiRoleItem, ProjectArtifact, RoleSkill } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { invoke } from "@tauri-apps/api/core";

const KNOWN_SKILLS = [
  "coding",
  "writing",
  "analysis",
  "design",
  "review",
  "testing",
  "planning",
  "research",
  "translation",
  "summarization",
  "data_extraction",
  "web_search",
  "file_management",
  "communication",
  "debugging",
];

function RoleSkillPanel({
  roleId,
  roleName,
  roleIcon,
  onClose,
}: {
  roleId: string;
  roleName: string;
  roleIcon: string;
  onClose: () => void;
}) {
  const [skills, setSkills] = useState<RoleSkill[]>([]);
  const [newSkillName, setNewSkillName] = useState("");
  const [showSkillInput, setShowSkillInput] = useState(false);

  const loadSkills = useCallback(async () => {
    try {
      const data = await invoke<RoleSkill[]>("list_role_skills", { roleId });
      setSkills(data);
    } catch (err) {
      console.error("Failed to load skills:", err);
    }
  }, [roleId]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleBindSkill = async () => {
    if (!newSkillName.trim()) return;
    try {
      await invoke("bind_role_skill", { roleId, skillName: newSkillName.trim() });
      setNewSkillName("");
      setShowSkillInput(false);
      loadSkills();
    } catch (err) {
      console.error("Failed to bind skill:", err);
    }
  };

  const handleUnbindSkill = async (id: string) => {
    try {
      await invoke("unbind_role_skill", { id });
      loadSkills();
    } catch (err) {
      console.error("Failed to unbind skill:", err);
    }
  };

  const boundSkillNames = new Set(skills.map((s) => s.skillName));
  const availableSkills = KNOWN_SKILLS.filter((s) => !boundSkillNames.has(s));

  return (
    <div className={styles.taskDetailOverlay} onClick={onClose}>
      <div className={styles.taskDetailPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.taskDetailHeader}>
          <h3>
            {roleIcon} {roleName} - 技能管理
          </h3>
          <button className={styles.taskDetailClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.taskDetailContent}>
          <div className={styles.taskDetailSection}>
            <div className={styles.artifactVersionActions}>
              <button
                className={styles.artifactVersionCreateBtn}
                onClick={() => setShowSkillInput(!showSkillInput)}
              >
                ➕ 添加技能
              </button>
            </div>

            {showSkillInput && (
              <div className={styles.roleSkillAddForm}>
                {availableSkills.length > 0 && (
                  <div className={styles.roleSkillQuickAdd}>
                    <label>快速添加</label>
                    <div className={styles.roleSkillQuickTags}>
                      {availableSkills.map((s) => (
                        <button
                          key={s}
                          className={styles.roleSkillQuickTag}
                          onClick={() => {
                            invoke("bind_role_skill", { roleId, skillName: s })
                              .then(() => loadSkills())
                              .catch(console.error);
                          }}
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.roleSkillCustomAdd}>
                  <label>自定义技能</label>
                  <div className={styles.roleSkillCustomRow}>
                    <input
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      placeholder="输入技能名称..."
                      className={styles.taskDetailInput}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newSkillName.trim()) handleBindSkill();
                      }}
                    />
                    <button
                      className={styles.artifactVersionDiffBtn}
                      onClick={handleBindSkill}
                      disabled={!newSkillName.trim()}
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>
            )}

            {skills.length === 0 && !showSkillInput && (
              <div className={styles.taskDetailEmpty}>暂无绑定技能，点击上方按钮添加</div>
            )}

            <div className={styles.roleSkillList}>
              {skills.map((skill) => (
                <div key={skill.id} className={styles.roleSkillItem}>
                  <span className={styles.roleSkillName}>{skill.skillName}</span>
                  <span
                    className={`${styles.roleSkillEnabled} ${skill.enabled ? styles.roleSkillOn : styles.roleSkillOff}`}
                  >
                    {skill.enabled ? "启用" : "禁用"}
                  </span>
                  <button
                    className={styles.roleSkillRemoveBtn}
                    onClick={() => handleUnbindSkill(skill.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RoleManagerProps {
  projectMembers: ProjectMember[];
  allRoles: AiRoleItem[];
  projectId: string;
  onMembersUpdate: (members: ProjectMember[]) => void;
  onArtifactsUpdate: (artifacts: ProjectArtifact[]) => void;
  getRoleName: (roleId: string) => string;
  t: (key: string) => string;
}

function RoleManager({
  projectMembers,
  allRoles,
  projectId,
  onMembersUpdate,
  onArtifactsUpdate,
  getRoleName: _getRoleName,
  t,
}: RoleManagerProps) {
  const [skillPanelRole, setSkillPanelRole] = useState<{
    id: string;
    name: string;
    icon: string;
  } | null>(null);

  const handleAddMember = async (roleId: string) => {
    try {
      await invoke("add_project_member", {
        req: { projectId, roleId },
      });
      const members = await invoke<ProjectMember[]>("list_project_members", { projectId });
      onMembersUpdate(members);
      const artifacts = await invoke<ProjectArtifact[]>("list_project_artifacts", { projectId });
      onArtifactsUpdate(artifacts);
    } catch (err) {
      console.error("Failed to add member:", err);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await invoke("remove_project_member", { id: memberId });
      const members = await invoke<ProjectMember[]>("list_project_members", { projectId });
      onMembersUpdate(members);
      const artifacts = await invoke<ProjectArtifact[]>("list_project_artifacts", { projectId });
      onArtifactsUpdate(artifacts);
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  return (
    <div className={styles.studioDetailFull}>
      <div className={styles.studioDetailSection}>
        <div className={styles.studioDetailSectionHeader}>
          <h3>👥 {t("studio.projectTab.members")}</h3>
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
        </div>
        <div className={styles.studioMembersGrid}>
          {projectMembers.map((member) => {
            const role = allRoles.find((r) => r.id === member.roleId);
            const avatarColor = role?.avatarColor || "#6c5ce7";
            const energy = role?.energy ?? 100;
            const mood = role?.mood || "neutral";
            const moodEmoji =
              mood === "energetic"
                ? "⚡"
                : mood === "tired"
                  ? "😴"
                  : mood === "exhausted"
                    ? "😵"
                    : "🙂";
            const energyColor =
              energy >= 70
                ? "#27ae60"
                : energy >= 40
                  ? "#f39c12"
                  : energy >= 20
                    ? "#e67e22"
                    : "#e74c3c";
            return (
              <div key={member.id} className={styles.studioMemberDetailCard}>
                <div
                  className={styles.studioMemberDetailAvatar}
                  style={{ background: avatarColor }}
                >
                  {role?.icon || "🤖"}
                </div>
                <div className={styles.studioMemberDetailInfo}>
                  <h4>
                    {role?.name || "未知角色"}
                    <span className={styles.studioMemberMood} title={mood}>
                      {moodEmoji}
                    </span>
                  </h4>
                  <p className={styles.studioMemberDetailDesc}>
                    {role?.description || member.roleId}
                  </p>
                  {role?.responsibilities && (
                    <p className={styles.studioMemberDetailResp}>{role.responsibilities}</p>
                  )}
                  <div className={styles.studioMemberEnergy}>
                    <div className={styles.studioMemberEnergyBar} style={{ background: "#e0e0e0" }}>
                      <div
                        className={styles.studioMemberEnergyFill}
                        style={{ width: `${energy}%`, background: energyColor }}
                      />
                    </div>
                    <span className={styles.studioMemberEnergyText} style={{ color: energyColor }}>
                      {energy}%
                    </span>
                  </div>
                  <button
                    className={styles.roleSkillManageBtn}
                    onClick={() =>
                      setSkillPanelRole({
                        id: member.roleId,
                        name: role?.name || "未知角色",
                        icon: role?.icon || "🤖",
                      })
                    }
                  >
                    🛠️ 技能管理
                  </button>
                </div>
                <button
                  className={styles.studioRemoveBtn}
                  onClick={() => handleRemoveMember(member.id)}
                  title="移除成员"
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

      {skillPanelRole && (
        <RoleSkillPanel
          roleId={skillPanelRole.id}
          roleName={skillPanelRole.name}
          roleIcon={skillPanelRole.icon}
          onClose={() => setSkillPanelRole(null)}
        />
      )}
    </div>
  );
}

export default RoleManager;
