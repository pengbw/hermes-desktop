import type { ProjectMember, AiRoleItem, ProjectArtifact } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { invoke } from "@tauri-apps/api/core";

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
            const isUser = member.roleId === "builtin_user";
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
              <div
                key={member.id}
                className={
                  styles.studioMemberDetailCard + " " + (isUser ? styles.studioMemberUser : "")
                }
              >
                <div
                  className={styles.studioMemberDetailAvatar}
                  style={{ background: avatarColor }}
                >
                  {isUser ? "👤" : role?.icon || "🤖"}
                </div>
                <div className={styles.studioMemberDetailInfo}>
                  <h4>
                    {isUser ? "用户" : role?.name || "未知角色"}
                    {isUser && <span className={styles.studioMemberYouBadge}>YOU</span>}
                    {!isUser && (
                      <span className={styles.studioMemberMood} title={mood}>
                        {moodEmoji}
                      </span>
                    )}
                  </h4>
                  <p className={styles.studioMemberDetailDesc}>
                    {role?.description || member.roleId}
                  </p>
                  {role?.responsibilities && (
                    <p className={styles.studioMemberDetailResp}>{role.responsibilities}</p>
                  )}
                  {!isUser && (
                    <div className={styles.studioMemberEnergy}>
                      <div
                        className={styles.studioMemberEnergyBar}
                        style={{ background: "#e0e0e0" }}
                      >
                        <div
                          className={styles.studioMemberEnergyFill}
                          style={{ width: `${energy}%`, background: energyColor }}
                        />
                      </div>
                      <span
                        className={styles.studioMemberEnergyText}
                        style={{ color: energyColor }}
                      >
                        {energy}%
                      </span>
                    </div>
                  )}
                </div>
                {!isUser && (
                  <button
                    className={styles.studioRemoveBtn}
                    onClick={() => handleRemoveMember(member.id)}
                    title="移除成员"
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
    </div>
  );
}

export default RoleManager;
