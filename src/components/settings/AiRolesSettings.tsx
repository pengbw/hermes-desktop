import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import settingsStyles from "@pages/settings/SettingsPanel.module.css";
import studioStyles from "@pages/studio/StudioPanel.module.css";

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

  const loadRoles = async () => {
    try {
      const list = await invoke<AiRoleItem[]>("list_ai_roles");
      setRoles(list);
    } catch (err) {
      console.error("Failed to load AI roles:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleCreate = async () => {
    if (!editForm.name.trim()) return;
    try {
      await invoke("create_ai_role", {
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
      setEditForm({ ...EMPTY_FORM });
      setShowNewRole(false);
      loadRoles();
    } catch (err) {
      console.error("Failed to create role:", err);
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
      loadRoles();
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_ai_role", { id });
      loadRoles();
    } catch (err) {
      console.error("Failed to delete role:", err);
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
  };

  const cancelEdit = () => {
    setEditingRole(null);
    setShowNewRole(false);
    setEditForm({ ...EMPTY_FORM });
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
                  <label>{t("aiRoles.avatarUrl")}</label>
                  <input
                    className={studioStyles.studioInput}
                    value={editForm.avatarUrl}
                    onChange={(e) => setEditForm({ ...editForm, avatarUrl: e.target.value })}
                    placeholder={t("aiRoles.avatarUrlPlaceholder")}
                  />
                  <button
                    className={studioStyles.studioBtnSecondary}
                    style={{
                      marginLeft: 8,
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      padding: "4px 10px",
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".vrm,.glb,.gltf";
                      input.onchange = async (e: Event) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file || !editingRole) return;
                        try {
                          const path = await (window as any).__TAURI__.dialog?.open?.({
                            filters: [{ name: "VRM", extensions: ["vrm", "glb", "gltf"] }],
                            multiple: false,
                          });
                          if (!path) return;
                          const result = await invoke<string>("upload_vrm_avatar", {
                            roleId: editingRole,
                            filePath: path,
                          });
                          setEditForm({ ...editForm, avatarUrl: result, avatarType: "vrm" });
                          loadRoles();
                        } catch (err) {
                          console.error("VRM upload failed:", err);
                        }
                      };
                      input.click();
                    }}
                  >
                    {t("studio.uploadVrm")}
                  </button>
                </div>
                <div className={studioStyles.aiRoleFormRow}>
                  <label>{t("studio.avatarType")}</label>
                  <div className={studioStyles.aiRoleAvatarPresets}>
                    {[
                      { value: "default", label: t("studio.avatarTypeDefault") },
                      { value: "vrm", label: t("studio.avatarTypeVrm") },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        className={
                          studioStyles.aiRoleAvatarPresetBtn +
                          " " +
                          (editForm.avatarType === opt.value ||
                          (!editForm.avatarUrl && opt.value === "default")
                            ? studioStyles.active
                            : "")
                        }
                        onClick={() => setEditForm({ ...editForm, avatarType: opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
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
    </div>
  );
}

export default AiRolesSettingsSection;
