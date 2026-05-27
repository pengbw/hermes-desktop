import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SkillItem } from "@core/types";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@contexts/I18nContext";

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
  department: string;
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
  const { locale } = useI18n();
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
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const [newRoleSkills, setNewRoleSkills] = useState<string[]>([]);
  const [viewingRole, setViewingRole] = useState<AiRoleItem | null>(null);

  const loadRoles = async () => {
    try {
      const list = await invoke<AiRoleItem[]>("list_ai_roles", { locale });
      setRoles(list);
    } catch {
      // console.error("Failed to load AI roles:", err);
    } finally {
      setLoading(false);
    }
  };

  const DEPT_LABELS: Record<string, string> = {
    engineering: "⚙️ 工程部",
    design: "🎨 设计部",
    marketing: "📢 营销部",
    paid_media: "💰 付费媒体部",
    sales: "🤝 销售部",
    finance: "🏦 金融部",
    hr: "👥 人力资源部",
    legal: "⚖️ 法务部",
    supply_chain: "🔗 供应链部",
    product: "📦 产品部",
    project_management: "📋 项目管理部",
    testing: "🧪 测试部",
    support: "🎧 支持部",
    specialized: "🎯 专项部",
    spatial_computing: "🥽 空间计算部",
    game_dev: "🎮 游戏开发部",
    academic: "🎓 学术部",
  };

  const departments = useMemo(() => {
    const deptSet = new Set<string>();
    for (const r of roles) {
      if (r.department) deptSet.add(r.department);
    }
    const depts = Array.from(deptSet).sort();
    return depts;
  }, [roles]);

  const filteredRoles = useMemo(() => {
    if (deptFilter === "all") return roles;
    return roles.filter((r) => r.department === deptFilter);
  }, [roles, deptFilter]);

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
  }, [locale]);

  useEffect(() => {
    invoke<{ skills: SkillItem[] }>("list_hermes_skills")
      .then((res) => setAvailableSkills(res.skills.filter((s) => s.enabled)))
      .catch(() => setAvailableSkills([]));
  }, []);

  const handleImportRole = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!selected) return;
      const filePath = typeof selected === "string" ? selected : selected;
      await invoke("import_role_from_file", { filePath, locale });
      loadRoles();
      showToast("✅ 角色导入成功");
    } catch (err) {
      showToast("❌ 导入失败：" + String(err));
    }
  };

  const handleExportRole = async (roleId: string) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const filePath = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "role.json",
      });
      if (!filePath) return;
      await invoke("export_role_to_file", { roleId, filePath });
      showToast("✅ 角色导出成功");
    } catch (err) {
      showToast("❌ 导出失败：" + String(err));
    }
  };

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
        } catch {
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
    } catch {
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

  const closeView = () => {
    setViewingRole(null);
  };

  if (loading) {
    return (
      <div className="animate-[fadeIn_0.2s_ease]">
        <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
          <span className="text-2xl animate-pulse">⏳</span>
          <p className="text-sm">{t("aiRoles.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-foreground m-0">{t("aiRoles.title")}</h3>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 border border-border rounded-md bg-transparent text-foreground text-xs cursor-pointer transition-all hover:bg-muted"
              onClick={handleImportRole}
            >
              📂 {t("aiRoles.importRole")}
            </button>
            <button
              className="px-3 py-1.5 border border-primary rounded-md bg-transparent text-primary text-xs cursor-pointer transition-all hover:bg-primary/5"
              onClick={() => setShowNewRole(true)}
            >
              + {t("aiRoles.addRole")}
            </button>
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground mb-4 leading-relaxed">
          {t("aiRoles.desc")}
        </p>
        {departments.length > 1 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-muted-foreground">部门筛选：</span>
            <button
              className={`px-2 py-1 rounded-md text-xs cursor-pointer transition-all border ${deptFilter === "all" ? "bg-primary/10 text-primary border-primary/30 font-medium" : "bg-transparent text-foreground border-border hover:bg-muted"}`}
              onClick={() => setDeptFilter("all")}
            >
              全部 ({roles.length})
            </button>
            {departments.map((dept) => (
              <button
                key={dept}
                className={`px-2 py-1 rounded-md text-xs cursor-pointer transition-all border ${deptFilter === dept ? "bg-primary/10 text-primary border-primary/30 font-medium" : "bg-transparent text-foreground border-border hover:bg-muted"}`}
                onClick={() => setDeptFilter(dept)}
              >
                {DEPT_LABELS[dept] || dept} ({roles.filter((r) => r.department === dept).length})
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {filteredRoles.map((role) => (
            <div
              key={role.id}
              className="relative bg-card border border-border rounded-xl p-3 flex flex-col gap-1 transition-all hover:border-primary/30 hover:shadow-md hover:-translate-y-px group cursor-pointer"
              style={
                role.avatarColor
                  ? { borderLeftColor: role.avatarColor, borderLeftWidth: 3 }
                  : undefined
              }
              onClick={() => setViewingRole(role)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm"
                  style={
                    role.avatarColor
                      ? {
                          backgroundColor: role.avatarColor + "22",
                          color: role.avatarColor,
                        }
                      : undefined
                  }
                >
                  {role.icon}
                </span>
                <span className="text-sm font-semibold text-foreground">{role.name}</span>
                {role.isBuiltin && (
                  <span className="text-[10px] px-1.5 py-px rounded bg-primary/10 text-primary font-medium">
                    {t("aiRoles.builtin")}
                  </span>
                )}
                {role.avatarPreset && (
                  <span
                    className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] text-white"
                    style={role.avatarColor ? { backgroundColor: role.avatarColor } : undefined}
                  >
                    {AVATAR_PRESETS.find((p) => p.value === role.avatarPreset)?.label.split(
                      " "
                    )[0] || "👤"}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed m-0 line-clamp-1">
                {role.description}
              </p>
              <div
                className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-6 h-6 flex items-center justify-center rounded-md border-none bg-transparent text-muted-foreground cursor-pointer text-sm transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => handleExportRole(role.id)}
                  title={t("aiRoles.exportRole")}
                >
                  💾
                </button>
                <button
                  className="w-6 h-6 flex items-center justify-center rounded-md border-none bg-transparent text-muted-foreground cursor-pointer text-sm transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => startEdit(role)}
                >
                  ✏️
                </button>
                {!role.isBuiltin && (
                  <button
                    className="w-6 h-6 flex items-center justify-center rounded-md border-none bg-transparent text-muted-foreground cursor-pointer text-sm transition-colors hover:bg-red-500/10 hover:text-red-500"
                    onClick={() => handleDelete(role.id)}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {(showNewRole || editingRole) && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease]"
          onClick={cancelEdit}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-[720px] h-[520px] max-h-[90vh] flex flex-col shadow-xl animate-[modalIn_0.25s_ease] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between h-10 px-3 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground m-0">
                {editingRole ? t("aiRoles.editRole") : t("aiRoles.addRole")}
              </h3>
              <button
                className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                onClick={cancelEdit}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">
                    {t("aiRoles.roleIcon")}
                  </label>
                  <input
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors"
                    value={editForm.icon}
                    onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                    placeholder="🤖"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">
                    {t("aiRoles.roleName")}
                  </label>
                  <input
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder={t("aiRoles.roleNamePlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">角色昵称</label>
                  <input
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors"
                    value={editForm.nickname}
                    onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                    placeholder="如：小刘、老张"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">
                    {t("aiRoles.roleDesc")}
                  </label>
                  <input
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder={t("aiRoles.roleDescPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">
                    {t("aiRoles.roleResp")}
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors resize-y min-h-[80px]"
                    value={editForm.responsibilities}
                    onChange={(e) => setEditForm({ ...editForm, responsibilities: e.target.value })}
                    placeholder={t("aiRoles.roleRespPlaceholder")}
                    rows={3}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">
                    {t("aiRoles.roleSoul")}
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors resize-y min-h-[80px]"
                    value={editForm.soulContent}
                    onChange={(e) => setEditForm({ ...editForm, soulContent: e.target.value })}
                    placeholder={t("aiRoles.roleSoulPlaceholder")}
                    rows={6}
                  />
                </div>
                <div className="h-px bg-border my-2" />
                <div className="text-sm font-semibold text-primary mb-3">
                  {t("aiRoles.avatarSection")}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">
                    {t("aiRoles.avatarPreset")}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        className={`px-2.5 py-1 border-2 rounded-lg bg-card cursor-pointer text-xs transition-all hover:border-primary hover:bg-primary/5 ${editForm.avatarPreset === preset.value ? "font-semibold bg-primary/5" : "border-border"}`}
                        style={{
                          borderColor:
                            editForm.avatarPreset === preset.value ? preset.color : undefined,
                        }}
                        onClick={() =>
                          setEditForm({
                            ...editForm,
                            avatarPreset: preset.value,
                            avatarColor: preset.color,
                          })
                        }
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">
                    {t("aiRoles.avatarColor")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editForm.avatarColor || "#6c5ce7"}
                      onChange={(e) => setEditForm({ ...editForm, avatarColor: e.target.value })}
                      className="w-9 h-9 border-2 border-border rounded-lg cursor-pointer p-0.5"
                    />
                    <span className="text-[13px] text-muted-foreground font-mono">
                      {editForm.avatarColor || "#6c5ce7"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-foreground">
                    {t("studio.avatarType")}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className={`px-2.5 py-1 border-2 rounded-lg bg-card cursor-pointer text-xs transition-all hover:border-primary hover:bg-primary/5 ${editForm.avatarType === "default" || !editForm.avatarUrl ? "font-semibold bg-primary/5 border-primary" : "border-border"}`}
                      onClick={() => setEditForm({ ...editForm, avatarType: "default" })}
                    >
                      {t("studio.avatarTypeDefault")}
                    </button>
                    <button
                      className="px-2.5 py-1 border-2 border-border rounded-lg bg-card cursor-not-allowed text-xs opacity-50"
                      onClick={() => showToast("🚧 VRM 功能开发中，敬请期待")}
                    >
                      {t("studio.avatarTypeVrm")} (开发中)
                    </button>
                  </div>
                </div>
                {editingRole && (
                  <>
                    <div className="h-px bg-border my-2" />
                    <div className="text-sm font-semibold text-primary mb-3">🛠️ 技能绑定</div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[13px] font-medium text-foreground">已绑定技能</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {editRoleSkills.length === 0 && (
                          <span style={{ color: "#999", fontSize: 12 }}>暂无绑定技能</span>
                        )}
                        {editRoleSkills.map((skill) => (
                          <span
                            key={skill.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs"
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
                                } catch {
                                  // console.error("Failed to unbind skill:", err);
                                }
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <button
                          className="px-2 py-1 border border-dashed border-border rounded-md bg-card text-muted-foreground text-xs cursor-pointer transition-all hover:border-primary hover:text-primary"
                          onClick={() => setShowSkillPicker(true)}
                        >
                          + 添加技能
                        </button>
                      </div>
                    </div>
                    {showSkillPicker && (
                      <div
                        className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1100] animate-[fadeIn_0.2s_ease]"
                        onClick={() => setShowSkillPicker(false)}
                      >
                        <div
                          className="bg-card border border-border rounded-xl w-full max-w-[400px] max-h-[70vh] flex flex-col shadow-xl animate-[modalIn_0.25s_ease] overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between h-10 px-3 border-b border-border">
                            <h4 className="text-base font-semibold text-foreground m-0">技能库</h4>
                            <button
                              className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                              onClick={() => setShowSkillPicker(false)}
                            >
                              ✕
                            </button>
                          </div>
                          <input
                            className="mx-4 mt-3 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors"
                            value={skillSearch}
                            onChange={(e) => setSkillSearch(e.target.value)}
                            placeholder="搜索技能名称..."
                            autoFocus
                          />
                          <div className="flex-1 overflow-y-auto p-4 space-y-1">
                            {availableSkills
                              .filter((s) => !editRoleSkills.some((rs) => rs.skillName === s.name))
                              .filter(
                                (s) =>
                                  !skillSearch.trim() ||
                                  s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                                  (s.description &&
                                    s.description.toLowerCase().includes(skillSearch.toLowerCase()))
                              ).length === 0 && (
                              <div className="text-center text-sm text-muted-foreground py-6">
                                无匹配技能
                              </div>
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
                                  className="p-3 rounded-lg cursor-pointer transition-all hover:bg-muted border border-transparent hover:border-border"
                                  onClick={async () => {
                                    try {
                                      await invoke("bind_role_skill", {
                                        roleId: editingRole.id,
                                        skillName: s.name,
                                      });
                                      loadRoleSkills(editingRole.id);
                                    } catch {
                                      // console.error("Failed to bind skill:", err);
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    {s.name}
                                    {s.category && (
                                      <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground">
                                        {s.category}
                                      </span>
                                    )}
                                  </div>
                                  {s.description && (
                                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
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
                    <div className="h-px bg-border my-2" />
                    <div className="text-sm font-semibold text-primary mb-3">🛠️ 技能绑定</div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[13px] font-medium text-foreground">已选择技能</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {newRoleSkills.length === 0 && (
                          <span style={{ color: "#999", fontSize: 12 }}>
                            暂未选择技能，创建后自动绑定
                          </span>
                        )}
                        {newRoleSkills.map((skillName) => (
                          <span
                            key={skillName}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs"
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
                          className="px-2 py-1 border border-dashed border-border rounded-md bg-card text-muted-foreground text-xs cursor-pointer transition-all hover:border-primary hover:text-primary"
                          onClick={() => setShowSkillPicker(true)}
                        >
                          + 添加技能
                        </button>
                      </div>
                    </div>
                    {showSkillPicker && (
                      <div
                        className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1100] animate-[fadeIn_0.2s_ease]"
                        onClick={() => setShowSkillPicker(false)}
                      >
                        <div
                          className="bg-card border border-border rounded-xl w-full max-w-[400px] max-h-[70vh] flex flex-col shadow-xl animate-[modalIn_0.25s_ease] overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between h-10 px-3 border-b border-border">
                            <h4 className="text-base font-semibold text-foreground m-0">技能库</h4>
                            <button
                              className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                              onClick={() => setShowSkillPicker(false)}
                            >
                              ✕
                            </button>
                          </div>
                          <input
                            className="mx-4 mt-3 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:border-primary transition-colors"
                            value={skillSearch}
                            onChange={(e) => setSkillSearch(e.target.value)}
                            placeholder="搜索技能名称..."
                            autoFocus
                          />
                          <div className="flex-1 overflow-y-auto p-4 space-y-1">
                            {availableSkills
                              .filter((s) => !newRoleSkills.includes(s.name))
                              .filter(
                                (s) =>
                                  !skillSearch.trim() ||
                                  s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                                  (s.description &&
                                    s.description.toLowerCase().includes(skillSearch.toLowerCase()))
                              ).length === 0 && (
                              <div className="text-center text-sm text-muted-foreground py-6">
                                无匹配技能
                              </div>
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
                                  className="p-3 rounded-lg cursor-pointer transition-all hover:bg-muted border border-transparent hover:border-border"
                                  onClick={() => {
                                    setNewRoleSkills((prev) => [...prev, s.name]);
                                  }}
                                >
                                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    {s.name}
                                    {s.category && (
                                      <span className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground">
                                        {s.category}
                                      </span>
                                    )}
                                  </div>
                                  {s.description && (
                                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
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
                <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-border">
                  <button
                    className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium cursor-pointer transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
                    onClick={editingRole ? handleUpdate : handleCreate}
                  >
                    {editingRole ? t("aiRoles.save") : t("aiRoles.create")}
                  </button>
                  <button
                    className="px-5 py-2 rounded-lg border border-border bg-card text-foreground text-sm font-medium cursor-pointer transition-all hover:bg-muted active:scale-[0.98]"
                    onClick={cancelEdit}
                  >
                    {t("studio.cancel")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {viewingRole && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
          onClick={closeView}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-base font-semibold text-foreground m-0">
                {t("aiRoles.roleDetail")}
              </h3>
              <button
                className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                onClick={closeView}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full text-lg shrink-0"
                  style={
                    viewingRole.avatarColor
                      ? {
                          backgroundColor: viewingRole.avatarColor + "22",
                          color: viewingRole.avatarColor,
                        }
                      : undefined
                  }
                >
                  {viewingRole.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">{viewingRole.name}</div>
                  {viewingRole.nickname && (
                    <div className="text-xs text-muted-foreground">{viewingRole.nickname}</div>
                  )}
                </div>
                {viewingRole.isBuiltin && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-px">
                    {t("aiRoles.builtin")}
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-[13px] font-medium text-muted-foreground mb-1.5">
                    {t("aiRoles.roleDesc")}
                  </div>
                  <div className="text-sm text-foreground leading-relaxed">
                    {viewingRole.description || "-"}
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="text-[13px] font-medium text-muted-foreground mb-1.5">
                    {t("aiRoles.roleResp")}
                  </div>
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {viewingRole.responsibilities || "-"}
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="text-[13px] font-medium text-muted-foreground mb-1.5">
                    {t("aiRoles.roleSoul")}
                  </div>
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {viewingRole.soulContent || "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lg px-5 py-2 text-[13px] shadow-lg z-[99999] transition-opacity duration-300">
          {saveToast}
        </div>
      )}
    </div>
  );
}

export default AiRolesSettingsSection;
