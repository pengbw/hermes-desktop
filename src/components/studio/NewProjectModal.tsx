import type { ProjectTemplateDetail } from "@core/tauri/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@contexts/ToastContext";
import { projectIcons } from "../../constants/projectTemplates";
import { useI18n } from "@contexts/I18nContext";

interface NewProjectModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const TRANSITION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  auto_push: { label: "→", color: "#3498db" },
  need_confirm: { label: "🔒", color: "#e67e22" },
  condition: { label: "◆", color: "#f39c12" },
  parallel: { label: "⊕", color: "#00b894" },
};

export default function NewProjectModal({ visible, onClose, onCreated, t }: NewProjectModalProps) {
  const { locale } = useI18n();
  const toast = useToast();
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newProjectIcon, setNewProjectIcon] = useState("💼");
  const [newProjectRule, setNewProjectRule] = useState("");
  const [newProjectTemplate, setNewProjectTemplate] = useState<string>("");
  const [isCustomProject, setIsCustomProject] = useState(false);
  const [newProjectTheme, setNewProjectTheme] = useState("cozy");
  const [templates, setTemplates] = useState<ProjectTemplateDetail[]>([]);
  const [previewTab, setPreviewTab] = useState<"roles" | "workflows">("roles");
  const [hoverTip, setHoverTip] = useState<{ id: string; x: number; y: number } | null>(null);

  const handleHelpEnter = useCallback((id: string, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setHoverTip({ id, x: rect.left, y: rect.bottom + 6 });
  }, []);

  const handleHelpLeave = useCallback(() => {
    setHoverTip(null);
  }, []);

  useEffect(() => {
    if (visible) {
      invoke<ProjectTemplateDetail[]>("list_project_templates", { locale })
        .then((list) => {
          setTemplates(list);
          if (list.length > 0 && !newProjectTemplate) {
            setNewProjectTemplate(list[0].id);
            setNewProjectIcon(list[0].icon);
            setNewProjectRule(list[0].projectRule || "");
          }
        })
        .catch((e) => console.error("Failed to load templates:", e));
    }
  }, [visible, locale]);

  const selectedTmpl = templates.find((tmpl) => tmpl.id === newProjectTemplate) || null;

  const handleClose = () => {
    setNewProjectName("");
    setNewProjectDesc("");
    setNewProjectIcon("💼");
    setNewProjectRule("");
    setNewProjectTemplate("");
    setIsCustomProject(false);
    setNewProjectTheme("cozy");
    setPreviewTab("roles");
    onClose();
  };

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    try {
      if (isCustomProject) {
        await invoke("create_empty_project", {
          req: {
            name: newProjectName.trim(),
            description: newProjectDesc.trim() || undefined,
            icon: newProjectIcon,
            officeTheme: newProjectTheme,
          },
        });
      } else if (selectedTmpl) {
        await invoke("create_project_from_template", {
          req: {
            name: newProjectName.trim(),
            description: newProjectDesc.trim() || undefined,
            icon: newProjectIcon,
            templateId: selectedTmpl.id,
            officeTheme: newProjectTheme,
          },
          locale,
        });
      } else {
        await invoke("create_project", {
          req: {
            name: newProjectName.trim(),
            description: newProjectDesc.trim() || undefined,
            icon: newProjectIcon,
            projectRule: newProjectRule.trim() || undefined,
            officeTheme: newProjectTheme,
          },
        });
      }

      handleClose();
      onCreated();
    } catch (err) {
      // console.error("Failed to create project:", err);
      toast.error(t("studio.createFailed") + ": " + err);
    }
  };

  if (!visible) return null;

  const hoverTmpl = hoverTip ? templates.find((t) => t.id === hoverTip.id) : null;

  return (
    <div className={styles.studioModalOverlay} onClick={handleClose}>
      {hoverTmpl && hoverTip && (
        <div
          className={styles.studioTemplateHelpTip}
          style={{ position: "fixed", left: hoverTip.x, top: hoverTip.y, zIndex: 9999 }}
          onMouseEnter={() => {
            setHoverTip({ id: hoverTmpl.id, x: hoverTip.x, y: hoverTip.y });
          }}
          onMouseLeave={handleHelpLeave}
        >
          <span className={styles.studioTemplateHelpTipDesc}>{hoverTmpl.description}</span>
          <span className={styles.studioTemplateHelpTipRoles}>
            {hoverTmpl.roles.map((role) => (
              <span
                key={role.id}
                className={styles.studioTemplateRoleTag}
                style={{ borderColor: role.avatarColor }}
              >
                <span className={styles.studioTemplateRoleIcon}>{role.icon}</span>
                {role.name}
              </span>
            ))}
          </span>
        </div>
      )}
      <div className={styles.studioNewProjectModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.studioModalHeader}>
          <h3>{t("studio.newProject")}</h3>
          <button className={styles.studioModalClose} onClick={handleClose}>
            ✕
          </button>
        </div>
        <div className={styles.studioNewProjectBody}>
          <div className={styles.studioNewProjectForm}>
            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>
                {t("studio.projectName")} <span className={styles.studioRequired}>*</span>
              </label>
              <input
                className={styles.studioFormInput}
                placeholder={t("studio.projectNamePlaceholder")}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>
                {t("studio.projectDesc")} <span className={styles.studioRequired}>*</span>
              </label>
              <textarea
                className={styles.studioFormTextarea}
                placeholder={t("studio.projectDescPlaceholder")}
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                rows={2}
              />
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>{t("studio.projectRule")}</label>
              <textarea
                className={styles.studioFormTextarea}
                placeholder={
                  isCustomProject
                    ? "自定义项目，由项目创建者自主定义协作规范与交付标准。"
                    : selectedTmpl
                      ? selectedTmpl.projectRule
                      : t("studio.projectRulePlaceholder")
                }
                value={newProjectRule}
                onChange={(e) => setNewProjectRule(e.target.value)}
                rows={2}
                disabled={!!selectedTmpl && !isCustomProject}
              />
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>
                {t("studio.projectIcon")}
                <span className={styles.studioFormLabelSub}> & 主题</span>
              </label>
              <div className={styles.studioNewProjectRow}>
                <div className={styles.studioIconList}>
                  {projectIcons.map((icon) => (
                    <button
                      key={icon}
                      className={
                        styles.studioIconOption +
                        " " +
                        (newProjectIcon === icon ? styles.selected : "")
                      }
                      onClick={() => setNewProjectIcon(icon)}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <div className={styles.studioNewThemeRow}>
                  {[
                    { key: "cozy", name: "温馨", icon: "🏠" },
                    { key: "tech", name: "科技", icon: "🚀" },
                    { key: "minimal", name: "极简", icon: "⬜" },
                  ].map((theme) => (
                    <button
                      key={theme.key}
                      className={
                        styles.studioNewThemeBtn +
                        " " +
                        (newProjectTheme === theme.key ? styles.selected : "")
                      }
                      onClick={() => setNewProjectTheme(theme.key)}
                    >
                      <span className={styles.studioNewThemeIcon}>{theme.icon}</span>
                      <span className={styles.studioNewThemeName}>{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.studioNewProjectTemplate}>
            <div className={styles.studioNewProjectTemplateHeader}>
              <label className={styles.studioFormLabel}>项目模板</label>
              <span className={styles.studioNewProjectTemplateHint}>
                选择模板可自动创建角色和工作流
              </span>
            </div>
            <div className={styles.studioTemplateGrid}>
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  className={
                    styles.studioTemplateCard +
                    " " +
                    (newProjectTemplate === tmpl.id ? styles.selected : "")
                  }
                  onClick={() => {
                    setIsCustomProject(false);
                    setNewProjectTemplate(newProjectTemplate === tmpl.id ? "" : tmpl.id);
                    if (newProjectTemplate !== tmpl.id) {
                      setNewProjectIcon(tmpl.icon);
                      setNewProjectRule(tmpl.projectRule || "");
                      setPreviewTab("roles");
                    }
                  }}
                >
                  <div className={styles.studioTemplateCardHeader}>
                    <span className={styles.studioTemplateIcon}>{tmpl.icon}</span>
                    <span className={styles.studioTemplateName}>{tmpl.name}</span>
                    <span
                      className={styles.studioTemplateHelp}
                      onMouseEnter={(e) => handleHelpEnter(tmpl.id, e)}
                      onMouseLeave={handleHelpLeave}
                      onClick={(e) => e.stopPropagation()}
                    >
                      ?
                    </span>
                    {newProjectTemplate === tmpl.id && (
                      <span className={styles.studioTemplateCheck}>✓</span>
                    )}
                  </div>
                </button>
              ))}
              <button
                className={
                  styles.studioTemplateCard + " " + (isCustomProject ? styles.selected : "")
                }
                onClick={() => {
                  setIsCustomProject(!isCustomProject);
                  if (!isCustomProject) {
                    setNewProjectTemplate("");
                    setNewProjectRule("");
                    setPreviewTab("roles");
                  }
                }}
              >
                <div className={styles.studioTemplateCardHeader}>
                  <span className={styles.studioTemplateIcon}>✨</span>
                  <span className={styles.studioTemplateName}>自定义</span>
                  {isCustomProject && <span className={styles.studioTemplateCheck}>✓</span>}
                </div>
              </button>
            </div>

            {selectedTmpl && (
              <div className={styles.studioTemplatePreview}>
                <div className={styles.studioTemplatePreviewTabs}>
                  <button
                    className={
                      styles.studioTemplatePreviewTab +
                      (previewTab === "roles" ? " " + styles.active : "")
                    }
                    onClick={() => setPreviewTab("roles")}
                  >
                    🎭 角色阵容
                  </button>
                  <button
                    className={
                      styles.studioTemplatePreviewTab +
                      (previewTab === "workflows" ? " " + styles.active : "")
                    }
                    onClick={() => setPreviewTab("workflows")}
                  >
                    🔄 工作流
                  </button>
                </div>

                {previewTab === "roles" && (
                  <div className={styles.studioTemplatePreviewContent}>
                    {selectedTmpl.roles.map((role) => (
                      <div key={role.id} className={styles.studioTemplatePreviewRole}>
                        <div
                          className={styles.studioTemplatePreviewRoleIcon}
                          style={{ background: role.avatarColor + "20", color: role.avatarColor }}
                        >
                          {role.icon}
                        </div>
                        <div className={styles.studioTemplatePreviewRoleInfo}>
                          <strong>{role.name}</strong>
                          <span>{role.responsibilities.split("、").slice(0, 3).join("、")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {previewTab === "workflows" && (
                  <div className={styles.studioTemplatePreviewContent}>
                    {selectedTmpl.workflows.map((wf) => {
                      const fromName =
                        wf.fromRoleId !== "start" && wf.fromRoleId !== "end"
                          ? (() => {
                              const r = selectedTmpl.roles.find((r) => r.id === wf.fromRoleId);
                              return r ? r.name : "?";
                            })()
                          : "启动";
                      const toName = (() => {
                        if (wf.toRoleId === "end" || wf.toRoleId === "start") return "结束";
                        const r = selectedTmpl.roles.find((r) => r.id === wf.toRoleId);
                        return r ? r.name : "?";
                      })();
                      const tType =
                        TRANSITION_TYPE_LABELS[wf.transitionType] ||
                        TRANSITION_TYPE_LABELS.auto_push;
                      const hasReject =
                        wf.transitionType === "need_confirm" &&
                        wf.rejectToRoleId &&
                        wf.rejectToRoleId.length > 0;
                      const rejectToName = hasReject
                        ? (() => {
                            const r = selectedTmpl.roles.find((r) => r.id === wf.rejectToRoleId);
                            return r ? r.name : "?";
                          })()
                        : "";
                      return (
                        <div key={wf.id}>
                          <div className={styles.studioTemplatePreviewWf}>
                            <span className={styles.studioTemplatePreviewWfFrom}>{fromName}</span>
                            <span
                              className={styles.studioTemplatePreviewWfArrow}
                              style={{ color: tType.color }}
                            >
                              {tType.label}
                            </span>
                            <span className={styles.studioTemplatePreviewWfTo}>{toName}</span>
                            <span className={styles.studioTemplatePreviewWfArtifact}>
                              {wf.artifactType}
                            </span>
                          </div>
                          {hasReject && (
                            <div className={styles.studioTemplatePreviewWfReject}>
                              <span className={styles.studioTemplatePreviewWfRejectLabel}>
                                驳回 →
                              </span>
                              <span className={styles.studioTemplatePreviewWfRejectTo}>
                                {rejectToName}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={styles.studioModalFooter}>
          <button className={styles.studioBtnSecondary} onClick={handleClose}>
            {t("studio.cancel")}
          </button>
          <button
            className={styles.studioBtnPrimary}
            onClick={handleCreate}
            disabled={!newProjectName.trim()}
          >
            {t("studio.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
