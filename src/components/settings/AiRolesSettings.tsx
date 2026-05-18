import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import settingsStyles from "@pages/settings/SettingsPanel.module.css";
import studioStyles from "@pages/studio/StudioPanel.module.css";
import type { SkillItem } from "@core/types";

interface RoleSkill {
  id: string;
  roleId: string;
  skillName: string;
  enabled: boolean;
  createdAt: number;
}

interface AiRoleItem {
  id: string;
  name: string;
  nickname: string;
  icon: string;
  description: string;
  responsibilities: string;
  soulContent: string;
  avatarUrl: string;
  avatarType: string;
  avatarPreset: string;
  avatarColor: string;
  sortOrder: number;
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
}

const AVATAR_PRESETS = [
  { value: "office_worker", label: "📋 商务人士", color: "#6c5ce7" },
  { value: "explorer", label: "🔍 探险者", color: "#00b894" },
  { value: "scholar", label: "📊 学者", color: "#0984e3" },
  { value: "creative", label: "📝 创意人", color: "#e17055" },
  { value: "artist", label: "🎨 艺术家", color: "#fd79a8" },
  { value: "architect", label: "🏗️ 建筑师", color: "#fdcb6e" },
  { value: "coder", label: "💻 程序员", color: "#00cec9" },
  { value: "engineer", label: "⚙️ 工程师", color: "#636e72" },
  { value: "tester", label: "🧪 实验员", color: "#e74c3c" },
  { value: "boss", label: "👤 决策者", color: "#2d3436" },
];

const EMPTY_FORM = {
  name: "",
  nickname: "",
  icon: "",
  description: "",
  responsibilities: "",
  soulContent: "",
  avatarUrl: "",
  avatarType: "default" as string,
  avatarPreset: "",
  avatarColor: "",
};

function AiRolesSettingsSection({ t }: { t: (key: string) => string }) {
  const [roles, setRoles] = useState<AiRoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<AiRoleItem | null>(null);
  const [showNewRole, setShowNewRole] = useState(false);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [editRoleSkills, setEditRoleSkills] = useState<RoleSkill[]>([]);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [availableSkills, setAvailableSkills] = useState<SkillItem[]>([]);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");

  const [newRoleSkills, setNewRoleSkills] = useState<string[]>([]);

  const loadRoles = async () => {
    try {
      const list = await invoke<AiRoleItem[]>("list_ai_roles");
      setRoles(list);
    } catch (err) {
// console.error("Failed to load AI roles:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadRoleSkills = useCallback(async (roleId: string) => {
    try {
      const data = await invoke<RoleSkill[]>("list_role_skills", { roleId });
      setEditRoleSkills(data);
    } catch {
      setEditRoleSkills([]);
    }
  }, []);

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 2000);
  };

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    invoke<{ skills: SkillItem[] }>("list_hermes_skills")
      .then((res) => setAvailableSkills(res.skills.filter((s) => s.enabled)))
      .catch(() => setAvailableSkills([]));
  }, []);

  const handleCreate = async () => {
    if (!editForm.name.trim()) return;
    try {
      const created = await invoke<AiRoleItem>("create_ai_role", {
        req: {
          name: editForm.name.trim(),
          nickname: editForm.nickname.trim() || undefined,
          icon: editForm.icon.trim() || undefined,
          description: editForm.description.trim() || undefined,
          responsibilities: editForm.responsibilities.trim() || undefined,
          soulContent: editForm.soulContent.trim() || undefined,
          avatarUrl: editForm.avatarUrl.trim() || undefined,
          avatarType: editForm.avatarType || undefined,
          avatarPreset: editForm.avatarPreset || undefined,
          avatarColor: editForm.avatarColor || undefined,
        },
      });
      for (const skillName of newRoleSkills) {
        try {
          await invoke("bind_role_skill", { roleId: created.id, skillName });
        } catch (err) {
// console.error("Failed to bind skill:", skillName, err);
        }
      }
      setEditForm({ ...EMPTY_FORM });
      setNewRoleSkills([]);
      setShowNewRole(false);
      loadRoles();
      showToast("✅ 角色创建成功");
    } catch (err) {
// console.error("Failed to create role:", err);
      showToast("❌ 创建失败：" + String(err));
    }
  };

  const handleUpdate = async () => {
    if (!editingRole) return;
    try {
      await invoke("update_ai_role", {
        req: {
          id: editingRole.id,
          name: editForm.name.trim() || undefined,
          nickname: editForm.nickname.trim() || undefined,
          icon: editForm.icon.trim() || undefined,
          description: editForm.description.trim() || undefined,
          responsibilities: editForm.responsibilities.trim() || undefined,
          soulContent: editForm.soulContent.trim() || undefined,
          avatarUrl: editForm.avatarUrl.trim() || undefined,
          avatarType: editForm.avatarType || undefined,
          avatarPreset: editForm.avatarPreset || undefined,
          avatarColor: editForm.avatarColor || undefined,
        },
      });
      setEditingRole(null);
      setEditForm({ ...EMPTY_FORM });
      setEditRoleSkills([]);
      loadRoles();
      showToast("✅ 角色保存成功");
    } catch (err) {
// console.error("Failed to update role:", err);
      showToast("❌ 保存失败：" + String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_ai_role", { id });
      loadRoles();
    } catch (err) {
// console.error("Failed to delete role:", err);
    }
  };

  const startEdit = (role: AiRoleItem) => {
    setEditingRole(role);
    setEditForm({
      name: role.name,
      nickname: role.nickname || "",
      icon: role.icon,
      description: role.description,
      responsibilities: role.responsibilities,
      soulContent: role.soulContent,
      avatarUrl: role.avatarUrl || "",
      avatarType: role.avatarType || "default",
      avatarPreset: role.avatarPreset || "",
      avatarColor: role.avatarColor || "",
    });
    loadRoleSkills(role.id);
  };

  const cancelEdit = () => {
    setEditingRole(null);
    setShowNewRole(false);
    setEditForm({ ...EMPTY_FORM });
    setEditRoleSkills([]);
    setNewRoleSkills([]);
    setShowSkillPicker(false);
    setSkillSearch("");
  };

  if (loading) {
    return (
      <div className={settingsStyles.settingsSectionCard}>
        <div className={settingsStyles.skillsLoading}>
          <span className={settingsStyles.loadingSpinner}>⏳</span>
          <p>{t("aiRoles.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={settingsStyles.settingsSectionCard}>
      <div className={settingsStyles.settingsSection}>
        <div className={settingsStyles.cardManagerHeader}>
          <h3>{t("aiRoles.title")}</h3>
          <button className={settingsStyles.cardAddBtn} onClick={() => setShowNewRole(true)}>
            + {t("aiRoles.addRole")}
          </button>
        </div>
        <p className={settingsStyles.settingsDesc}>{t("aiRoles.desc")}</p>
        <div className={settingsStyles.cardManagerGrid}>
          {roles.map((role) => (
            <div
              key={role.id}
              className={settingsStyles.cardManagerItem + " " + "custom"}
              style={role.avatarColor ? { borderLeftColor: role.avatarColor } : undefined}
            >
              <div className={studioStyles.aiRoleCardHeader}>
                <span
                  className={settingsStyles.cardManagerIcon}
                  style={
                    role.avatarColor
                      ? {
                          backgroundColor: role.avatarColor + "22",
                          color: role.avatarColor,
                          borderRadius: "50%",
                          width: "28px",
                          height: "28px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                        }
                      : undefined
                  }
                >
                  {role.icon}
                </span>
                <span className={settingsStyles.cardManagerName}>{role.name}</span>
                {role.isBuiltin && (
                  <span className={studioStyles.aiRoleBuiltinBadge}>{t("aiRoles.builtin")}</span>
                )}
                {role.avatarPreset && (
                  <span
                    className={studioStyles.aiRoleAvatarBadge}
                    style={role.avatarColor ? { backgroundColor: role.avatarColor } : undefined}
                  >
                    {AVATAR_PRESETS.find((p) => p.value === role.avatarPreset)?.label.split(
                      " "
                    )[0] || "👤"}
                  </span>
                )}
              </div>
              <p className={settingsStyles.cardManagerDesc}>{role.description}</p>
              <p className={studioStyles.aiRoleResp}>{role.responsibilities}</p>
              <div className={settingsStyles.cardManagerActions}>
                <button onClick={() => startEdit(role)}>✏️</button>
                {!role.isBuiltin && <button onClick={() => handleDelete(role.id)}>🗑️</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {(showNewRole || editingRole) && (
        <div className={studioStyles.studioSettingsOverlay} onClick={cancelEdit}>
          <div className={studioStyles.studioSettingsModal} onClick={(e) => e.stopPropagation()}>
            <div className={studioStyles.studioSettingsHeader}>
              <h3>{editingRole ? t("aiRoles.editRole") : t("aiRoles.addRole")}</h3>
              <button className={studioStyles.studioSettingsClose} onClick={cancelEdit}>
                ✕
              </button>
            </div>
            <div className={studioStyles.studioSettingsContent}>
              <div
                className={studioStyles.aiRoleForm}
                style={{ margin: 0, border: "none", background: "transparent", padding: 0 }}
              >
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("aiRoles.roleIcon")}</label>
                  <input
                    className={studioStyles.studioInput}
                    value={editForm.icon}
                    onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                    placeholder="🤖"
                  />
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("aiRoles.roleName")}</label>
                  <input
                    className={studioStyles.studioInput}
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder={t("aiRoles.roleNamePlaceholder")}
                  />
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>角色昵称</label>
                  <input
                    className={studioStyles.studioInput}
                    value={editForm.nickname}
                    onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                    placeholder="如：小刘、老张"
                  />
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("aiRoles.roleDesc")}</label>
                  <input
                    className={studioStyles.studioInput}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder={t("aiRoles.roleDescPlaceholder")}
                  />
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("aiRoles.roleResp")}</label>
                  <textarea
                    className={studioStyles.studioTextarea}
                    value={editForm.responsibilities}
                    onChange={(e) => setEditForm({ ...editForm, responsibilities: e.target.value })}
                    placeholder={t("aiRoles.roleRespPlaceholder")}
                    rows={3}
                  />
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("aiRoles.roleSoul")}</label>
                  <textarea
                    className={studioStyles.studioTextarea}
                    value={editForm.soulContent}
                    onChange={(e) => setEditForm({ ...editForm, soulContent: e.target.value })}
                    placeholder={t("aiRoles.roleSoulPlaceholder")}
                    rows={6}
                  />
                </div>
                <div className={studioStyles.aiRoleFormDivider} />
                <div className={studioStyles.aiRoleFormSectionTitle}>
                  {t("aiRoles.avatarSection")}
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("aiRoles.avatarPreset")}</label>
                  <div className={studioStyles.aiRoleAvatarPresets}>
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        className={
                          studioStyles.aiRoleAvatarPresetBtn +
                          " " +
                          (editForm.avatarPreset === preset.value ? studioStyles.active : "")
                        }
                        onClick={() =>
                          setEditForm({
                            ...editForm,
                            avatarPreset: preset.value,
                            avatarColor: preset.color,
                          })
                        }
                        style={{
                          borderColor:
                            editForm.avatarPreset === preset.value ? preset.color : undefined,
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("aiRoles.avatarColor")}</label>
                  <div className={studioStyles.aiRoleColorPicker}>
                    <input
                      type="color"
                      value={editForm.avatarColor || "#6c5ce7"}
                      onChange={(e) => setEditForm({ ...editForm, avatarColor: e.target.value })}
                      className={studioStyles.aiRoleColorInput}
                    />
                    <span className={studioStyles.aiRoleColorValue}>
                      {editForm.avatarColor || "#6c5ce7"}
                    </span>
                  </div>
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("studio.avatarType")}</label>
                  <div className={studioStyles.aiRoleAvatarPresets}>
                    <button
                      className={
                        studioStyles.aiRoleAvatarPresetBtn +
                        " " +
                        (editForm.avatarType === "default" || !editForm.avatarUrl
                          ? studioStyles.active
                          : "")
                      }
                      onClick={() => setEditForm({ ...editForm, avatarType: "default" })}
                    >
                      {t("studio.avatarTypeDefault")}
                    </button>
                    <button
                      className={studioStyles.aiRoleAvatarPresetBtn}
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                      onClick={() => showToast("🚧 VRM 功能开发中，敬请期待")}
                    >
                      {t("studio.avatarTypeVrm")} (开发中)
                    </button>
                  </div>
                </div>
                {editingRole && (
                  <>
                    <div className={studioStyles.aiRoleFormDivider} />
                    <div className={studioStyles.aiRoleFormSectionTitle}>🛠️ 技能绑定</div>
                    <div className={studioStyles.aiRoleFormRow}>
                      <label>已绑定技能</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {editRoleSkills.length === 0 && (
                          <span style={{ color: "#999", fontSize: 12 }}>暂无绑定技能</span>
                        )}
                        {editRoleSkills.map((skill) => (
                          <span
                            key={skill.id}
                            className={studioStyles.roleSkillTag}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            {skill.skillName}
                            <button
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "#999",
                                fontSize: 12,
                                padding: 0,
                                lineHeight: 1,
                              }}
                              onClick={async () => {
                                try {
                                  await invoke("unbind_role_skill", { id: skill.id });
                                  loadRoleSkills(editingRole.id);
                                } catch (err) {
// console.error("Failed to unbind skill:", err);
                                }
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <button
                          className={studioStyles.roleSkillAddBtn}
                          onClick={() => setShowSkillPicker(true)}
                        >
                          + 添加技能
                        </button>
                      </div>
                    </div>
                    {showSkillPicker && (
                      <div
                        className={studioStyles.skillPickerOverlay}
                        onClick={() => setShowSkillPicker(false)}
                      >
                        <div
                          className={studioStyles.skillPickerPanel}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className={studioStyles.skillPickerHeader}>
                            <h4>技能库</h4>
                            <button
                              className={studioStyles.taskDetailClose}
                              onClick={() => setShowSkillPicker(false)}
                            >
                              ✕
                            </button>
                          </div>
                          <input
                            className={studioStyles.skillPickerSearch}
                            value={skillSearch}
                            onChange={(e) => setSkillSearch(e.target.value)}
                            placeholder="搜索技能名称..."
                            autoFocus
                          />
                          <div className={studioStyles.skillPickerList}>
                            {availableSkills
                              .filter((s) => !editRoleSkills.some((rs) => rs.skillName === s.name))
                              .filter(
                                (s) =>
                                  !skillSearch.trim() ||
                                  s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                                  (s.description &&
                                    s.description.toLowerCase().includes(skillSearch.toLowerCase()))
                              ).length === 0 && (
                              <div className={studioStyles.skillPickerEmpty}>无匹配技能</div>
                            )}
                            {availableSkills
                              .filter((s) => !editRoleSkills.some((rs) => rs.skillName === s.name))
                              .filter(
                                (s) =>
                                  !skillSearch.trim() ||
                                  s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                                  (s.description &&
                                    s.description.toLowerCase().includes(skillSearch.toLowerCase()))
                              )
                              .map((s) => (
                                <div
                                  key={s.name}
                                  className={studioStyles.skillPickerItem}
                                  onClick={async () => {
                                    try {
                                      await invoke("bind_role_skill", {
                                        roleId: editingRole.id,
                                        skillName: s.name,
                                      });
                                      loadRoleSkills(editingRole.id);
                                    } catch (err) {
// console.error("Failed to bind skill:", err);
                                    }
                                  }}
                                >
                                  <div className={studioStyles.skillPickerItemName}>
                                    {s.name}
                                    {s.category && (
                                      <span className={studioStyles.skillPickerItemCat}>
                                        {s.category}
                                      </span>
                                    )}
                                  </div>
                                  {s.description && (
                                    <div className={studioStyles.skillPickerItemDesc}>
                                      {s.description}
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {showNewRole && (
                  <>
                    <div className={studioStyles.aiRoleFormDivider} />
                    <div className={studioStyles.aiRoleFormSectionTitle}>🛠️ 技能绑定</div>
                    <div className={studioStyles.aiRoleFormRow}>
                      <label>已选择技能</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {newRoleSkills.length === 0 && (
                          <span style={{ color: "#999", fontSize: 12 }}>暂未选择技能，创建后自动绑定</span>
                        )}
                        {newRoleSkills.map((skillName) => (
                          <span
                            key={skillName}
                            className={studioStyles.roleSkillTag}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            {skillName}
                            <button
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "#999",
                                fontSize: 12,
                                padding: 0,
                                lineHeight: 1,
                              }}
                              onClick={() =>
                                setNewRoleSkills((prev) => prev.filter((n) => n !== skillName))
                              }
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <button
                          className={studioStyles.roleSkillAddBtn}
                          onClick={() => setShowSkillPicker(true)}
                        >
                          + 添加技能
                        </button>
                      </div>
                    </div>
                    {showSkillPicker && (
                      <div
                        className={studioStyles.skillPickerOverlay}
                        onClick={() => setShowSkillPicker(false)}
                      >
                        <div
                          className={studioStyles.skillPickerPanel}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className={studioStyles.skillPickerHeader}>
                            <h4>技能库</h4>
                            <button
                              className={studioStyles.taskDetailClose}
                              onClick={() => setShowSkillPicker(false)}
                            >
                              ✕
                            </button>
                          </div>
                          <input
                            className={studioStyles.skillPickerSearch}
                            value={skillSearch}
                            onChange={(e) => setSkillSearch(e.target.value)}
                            placeholder="搜索技能名称..."
                            autoFocus
                          />
                          <div className={studioStyles.skillPickerList}>
                            {availableSkills
                              .filter((s) => !newRoleSkills.includes(s.name))
                              .filter(
                                (s) =>
                                  !skillSearch.trim() ||
                                  s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                                  (s.description &&
                                    s.description.toLowerCase().includes(skillSearch.toLowerCase()))
                              ).length === 0 && (
                              <div className={studioStyles.skillPickerEmpty}>无匹配技能</div>
                            )}
                            {availableSkills
                              .filter((s) => !newRoleSkills.includes(s.name))
                              .filter(
                                (s) =>
                                  !skillSearch.trim() ||
                                  s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                                  (s.description &&
                                    s.description.toLowerCase().includes(skillSearch.toLowerCase()))
                              )
                              .map((s) => (
                                <div
                                  key={s.name}
                                  className={studioStyles.skillPickerItem}
                                  onClick={() => {
                                    setNewRoleSkills((prev) => [...prev, s.name]);
                                  }}
                                >
                                  <div className={studioStyles.skillPickerItemName}>
                                    {s.name}
                                    {s.category && (
                                      <span className={studioStyles.skillPickerItemCat}>
                                        {s.category}
                                      </span>
                                    )}
                                  </div>
                                  {s.description && (
                                    <div className={studioStyles.skillPickerItemDesc}>
                                      {s.description}
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className={studioStyles.aiRoleFormActions}>
                  <button
                    className={studioStyles.studioBtnPrimary}
                    onClick={editingRole ? handleUpdate : handleCreate}
                  >
                    {editingRole ? t("aiRoles.save") : t("aiRoles.create")}
                  </button>
                  <button className={studioStyles.studioBtnSecondary} onClick={cancelEdit}>
                    {t("studio.cancel")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {saveToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-primary, #fff)",
            border: "1px solid var(--border-color, #e0e0e0)",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 99999,
            transition: "opacity 0.3s",
          }}
        >
          {saveToast}
        </div>
      )}
    </div>
  );
}

export default AiRolesSettingsSection;
