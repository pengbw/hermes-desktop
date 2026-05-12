import type { AiRoleItem } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { projectIcons, PROJECT_TEMPLATES } from "../../constants/projectTemplates";

interface NewProjectModalProps {
  visible: boolean;
  allRoles: AiRoleItem[];
  onClose: () => void;
  onCreated: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export default function NewProjectModal({
  visible,
  allRoles,
  onClose,
  onCreated,
  t,
}: NewProjectModalProps) {
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newProjectIcon, setNewProjectIcon] = useState("💼");
  const [newProjectRule, setNewProjectRule] = useState("");
  const [newProjectTemplate, setNewProjectTemplate] = useState<string>("");
  const [newProjectTheme, setNewProjectTheme] = useState("cozy");

  const handleClose = () => {
    setNewProjectName("");
    setNewProjectDesc("");
    setNewProjectIcon("💼");
    setNewProjectRule("");
    setNewProjectTemplate("");
    setNewProjectTheme("cozy");
    onClose();
  };

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    try {
      const tmpl =
        newProjectTemplate && PROJECT_TEMPLATES[newProjectTemplate]
          ? PROJECT_TEMPLATES[newProjectTemplate]
          : null;

      const project = await invoke<any>("create_project", {
        req: {
          name: newProjectName.trim(),
          description: newProjectDesc.trim() || undefined,
          icon: newProjectIcon,
          projectRule: newProjectRule.trim() || tmpl?.projectRule || undefined,
          projectGuidelines: tmpl?.projectGuidelines || undefined,
          officeTheme: newProjectTheme,
        },
      });

      if (tmpl) {
        const createdRoleIds: string[] = [];

        for (const roleDef of tmpl.roles) {
          try {
            const existingRole = allRoles.find((r) => r.name === roleDef.name);
            if (existingRole) {
              createdRoleIds.push(existingRole.id);
            } else {
              const newRole = await invoke<any>("create_ai_role", {
                req: {
                  name: roleDef.name,
                  icon: roleDef.icon,
                  nickname: roleDef.nickname,
                  description: roleDef.description,
                  responsibilities: roleDef.responsibilities,
                  soulContent: roleDef.soulContent,
                  avatarPreset: roleDef.avatarPreset,
                  avatarColor: roleDef.avatarColor,
                },
              });
              createdRoleIds.push(newRole.id);
            }
          } catch (e) {
            console.error("Failed to create role for template:", e);
          }
        }

        for (const roleId of createdRoleIds) {
          try {
            await invoke("add_project_member", {
              req: { projectId: project.id, roleId },
            });
          } catch (e) {
            console.error("Failed to add member:", e);
          }
        }

        for (const wf of tmpl.workflows) {
          try {
            await invoke("add_project_workflow", {
              req: {
                projectId: project.id,
                fromRoleId: wf.fromIdx !== null ? createdRoleIds[wf.fromIdx] : null,
                toRoleId: createdRoleIds[wf.toIdx],
                artifactType: wf.artifactType,
                transitionType: wf.transitionType,
              },
            });
          } catch (e) {
            console.error("Failed to add workflow:", e);
          }
        }
      }

      handleClose();
      onCreated();
    } catch (err) {
      console.error("Failed to create project:", err);
      alert(t("studio.createFailed") + ": " + err);
    }
  };

  if (!visible) return null;

  return (
    <div className={styles.studioModalOverlay} onClick={handleClose}>
      <div className={styles.studioModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.studioModalHeader}>
          <h3>{t("studio.newProject")}</h3>
          <button className={styles.studioModalClose} onClick={handleClose}>
            ✕
          </button>
        </div>
        <div className={styles.studioModalBody}>
          <div className={styles.studioFormLeft}>
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
              <span className={styles.studioFormHint}>{t("studio.projectNameHint")}</span>
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>{t("studio.projectDesc")}</label>
              <textarea
                className={styles.studioFormTextarea}
                placeholder={t("studio.projectDescPlaceholder")}
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                rows={4}
              />
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>{t("studio.projectRule")}</label>
              <textarea
                className={styles.studioFormTextarea}
                placeholder={t("studio.projectRulePlaceholder")}
                value={newProjectRule}
                onChange={(e) => setNewProjectRule(e.target.value)}
                rows={4}
              />
              <span className={styles.studioFormHint}>{t("studio.projectRuleHint")}</span>
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>项目模板</label>
              <div className={styles.studioTemplateGrid}>
                {Object.entries(PROJECT_TEMPLATES).map(([key, tmpl]) => (
                  <button
                    key={key}
                    className={
                      styles.studioTemplateCard +
                      " " +
                      (newProjectTemplate === key ? styles.selected : "")
                    }
                    onClick={() => {
                      setNewProjectTemplate(newProjectTemplate === key ? "" : key);
                      if (newProjectTemplate !== key) {
                        setNewProjectIcon(tmpl.icon);
                        setNewProjectRule(tmpl.projectRule || "");
                      }
                    }}
                  >
                    <span className={styles.studioTemplateIcon}>{tmpl.icon}</span>
                    <span className={styles.studioTemplateName}>{tmpl.name}</span>
                    <span className={styles.studioTemplateDesc}>{tmpl.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>{t("studio.projectIcon")}</label>
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
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>办公室主题</label>
              <div className={styles.studioNewThemeRow}>
                {[
                  { key: "cozy", name: "温馨风", icon: "🏠" },
                  { key: "tech", name: "科技风", icon: "🚀" },
                  { key: "minimal", name: "极简风", icon: "⬜" },
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
                    <span>{theme.icon}</span>
                    <span>{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className={styles.studioModalFooter}>
          <button className={styles.studioBtnSecondary} onClick={handleClose}>
            {t("studio.cancel")}
          </button>
          <button className={styles.studioBtnPrimary} onClick={handleCreate}>
            {t("studio.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
