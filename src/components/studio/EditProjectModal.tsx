import type { ProjectItem } from "@core/types";
import styles from "@pages/studio/StudioPanel.module.css";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { projectIcons } from "../../constants/projectTemplates";

interface EditProjectModalProps {
  visible: boolean;
  project: ProjectItem | null;
  onClose: () => void;
  onSaved: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export default function EditProjectModal({
  visible,
  project,
  onClose,
  onSaved,
  t,
}: EditProjectModalProps) {
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDesc, setEditProjectDesc] = useState("");
  const [editProjectIcon, setEditProjectIcon] = useState("💼");
  const [editProjectRule, setEditProjectRule] = useState("");

  useEffect(() => {
    if (visible && project) {
      setEditProjectName(project.name || "");
      setEditProjectDesc(project.description || "");
      setEditProjectIcon(project.icon || "💼");
      setEditProjectRule(project.projectRule || "");
    }
  }, [visible, project?.id]);

  const handleClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!project?.id || !editProjectName.trim()) return;
    try {
      await invoke("update_project", {
        req: {
          id: project.id,
          name: editProjectName.trim(),
          description: editProjectDesc.trim(),
          icon: editProjectIcon,
          projectRule: editProjectRule.trim(),
        },
      });
      handleClose();
      onSaved();
    } catch (err) {
      alert(err);
    }
  };

  if (!visible) return null;

  return (
    <div className={styles.studioModalOverlay} onClick={handleClose}>
      <div className={styles.studioModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.studioModalHeader}>
          <h3>{t("studio.editProject")}</h3>
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
                value={editProjectName}
                onChange={(e) => setEditProjectName(e.target.value)}
              />
              <span className={styles.studioFormHint}>{t("studio.projectNameHint")}</span>
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>{t("studio.projectRule")}</label>
              <textarea
                className={styles.studioFormTextarea}
                placeholder={t("studio.projectRulePlaceholder")}
                value={editProjectRule}
                onChange={(e) => setEditProjectRule(e.target.value)}
                rows={4}
              />
              <span className={styles.studioFormHint}>{t("studio.projectRuleHint")}</span>
            </div>

            <div className={styles.studioFormGroup}>
              <label className={styles.studioFormLabel}>{t("studio.projectDesc")}</label>
              <textarea
                className={styles.studioFormTextarea}
                placeholder={t("studio.projectDescPlaceholder")}
                value={editProjectDesc}
                onChange={(e) => setEditProjectDesc(e.target.value)}
                rows={4}
              />
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
                      (editProjectIcon === icon ? styles.selected : "")
                    }
                    onClick={() => setEditProjectIcon(icon)}
                  >
                    {icon}
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
          <button className={styles.studioBtnPrimary} onClick={handleSave}>
            {t("studio.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
