import { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AvatarGesture } from "@core/types";
import styles from "@pages/settings/SettingsPanel.module.css";

interface GestureSettingsProps {
  gestures: AvatarGesture[];
  onRefresh: () => void;
  onShowEditor: (
    gesture: AvatarGesture | null,
    readOnly: boolean,
    form: {
      name: string;
      duration: number;
      lookAtX: number;
      lookAtY: number;
      tilt: number;
      targetJson: string;
    }
  ) => void;
  t: (key: string) => string;
}

export default function GestureSettings({
  gestures,
  onRefresh,
  onShowEditor,
  t,
}: GestureSettingsProps) {
  const gestureFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportGestureJson = async () => {
    const fileInput = gestureFileInputRef.current;
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.accept = ".json";
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);

        let poseData: Record<string, { position: number[]; rotation: number[] }> = {};

        if (imported.pose && imported.vrmMetaVersion !== undefined) {
          poseData = imported.pose;
        } else {
          for (const [key, val] of Object.entries(imported)) {
            if (val && typeof val === "object") {
              const v = val as {
                rotation?: number[];
                position?: number[];
                x?: number;
                y?: number;
                z?: number;
                w?: number;
              };
              if (Array.isArray(v.rotation) && v.rotation.length === 4) {
                poseData[key] = { position: v.position || [0, 0, 0], rotation: v.rotation };
              } else if (typeof v.w === "number") {
                poseData[key] = {
                  position: [0, 0, 0],
                  rotation: [v.x ?? 0, v.y ?? 0, v.z ?? 0, v.w],
                };
              }
            }
          }
        }

        if (Object.keys(poseData).length === 0) {
          alert("未识别到有效的骨骼姿势数据，请检查 JSON 格式");
          return;
        }

        const gestureName = imported.name || file.name.replace(/\.json$/i, "") || "导入的动作";
        const duration = imported.duration || 5000;
        const lookAtX = imported.lookAtX ?? imported.gages?.yaw ?? 0;
        const lookAtY = imported.lookAtY ?? imported.gages?.pitch ?? 0;
        const tilt = imported.tilt ?? 0;
        const targetJson = JSON.stringify(poseData);

        await invoke("create_avatar_gesture", {
          req: { name: gestureName, targetJson, duration, lookAtX, lookAtY, tilt },
        });
        onRefresh();
        alert(`成功导入动作: ${gestureName}`);
      } catch {
        // console.error("导入失败:", e);
        alert("导入失败: " + String(e));
      }
    };
    fileInput.click();
  };

  return (
    <div className={styles.settingsSectionCard}>
      <div className={styles.settingsSection}>
        <div className={styles.gestureSectionHeader}>
          <h3>{t("gesture.title")}</h3>
          <div className={styles.gestureHeaderRight}>
            <button
              className={styles.gestureAddBtn}
              onClick={() => {
                onShowEditor(null, false, {
                  name: "",
                  duration: 1000,
                  lookAtX: 0,
                  lookAtY: 0,
                  tilt: 0,
                  targetJson: "{}",
                });
              }}
            >
              {t("gesture.add")}
            </button>
            <button
              className={styles.gestureAddBtn}
              onClick={handleImportGestureJson}
              title={t("gesture.import")}
            >
              {t("gesture.import")}
            </button>
            <input type="file" ref={gestureFileInputRef} style={{ display: "none" }} />
          </div>
        </div>
        <div>
          {gestures.length === 0 && (
            <div className={styles.gestureEmpty}>
              <span className={styles.gestureEmptyIcon}>🎭</span>
              <p>{t("gesture.empty")}</p>
            </div>
          )}
          <div className={styles.gestureCardList}>
            {gestures.map((g, index) => {
              const isSystem = g.source === "system";
              return (
                <div
                  key={g.id}
                  className={styles.gestureCard}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={styles.gestureCardLeft}>
                    <div className={styles.gestureCardIcon}>
                      {g.name === "greeting" ? "👋" : g.name === "think" ? "🤔" : "🎭"}
                    </div>
                    <div className={styles.gestureCardInfo}>
                      <div className={styles.gestureCardNameRow}>
                        <span className={styles.gestureCardName}>{g.name}</span>
                        <span
                          className={`${styles.gestureSourceTag} ${isSystem ? styles.gestureSourceSystem : styles.gestureSourceCustom}`}
                        >
                          {isSystem ? t("gesture.system") : t("gesture.custom")}
                        </span>
                      </div>
                      <div className={styles.gestureCardTags}>
                        <span className={`${styles.gestureTag} ${styles.gestureTagDuration}`}>
                          ⏱ {g.duration}ms
                        </span>
                        {(g.lookAtX !== 0 || g.lookAtY !== 0) && (
                          <span className={`${styles.gestureTag} ${styles.gestureTagLookat}`}>
                            👁 {g.lookAtX},{g.lookAtY}
                          </span>
                        )}
                        {g.tilt !== 0 && (
                          <span className={`${styles.gestureTag} ${styles.gestureTagTilt}`}>
                            ↗ {g.tilt}
                          </span>
                        )}
                        {(() => {
                          try {
                            const bones = JSON.parse(g.targetJson || "{}");
                            const activeBones = Object.entries(bones).filter(([, v]) => {
                              if (!v || typeof v !== "object") return false;
                              const bone = v as {
                                rotation?: number[];
                                position?: number[];
                                x?: number;
                                y?: number;
                                z?: number;
                                w?: number;
                              };
                              if (Array.isArray(bone.rotation) && bone.rotation.length === 4) {
                                return (
                                  bone.rotation[0] !== 0 ||
                                  bone.rotation[1] !== 0 ||
                                  bone.rotation[2] !== 0 ||
                                  bone.rotation[3] !== 1
                                );
                              }
                              if (typeof bone.w === "number") {
                                return bone.x !== 0 || bone.y !== 0 || bone.z !== 0 || bone.w !== 1;
                              }
                              return false;
                            });
                            return activeBones.map(([key]: [string, unknown]) => (
                              <span
                                key={key}
                                className={`${styles.gestureTag} ${styles.gestureTagBone}`}
                              >
                                🦴 {key}
                              </span>
                            ));
                          } catch {
                            return null;
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className={styles.gestureCardActions}>
                    <button
                      className={`${styles.gestureActionBtn} ${styles.gestureActionView}`}
                      onClick={() => {
                        onShowEditor(g, true, {
                          name: g.name,
                          duration: g.duration,
                          lookAtX: g.lookAtX,
                          lookAtY: g.lookAtY,
                          tilt: g.tilt,
                          targetJson: g.targetJson,
                        });
                      }}
                      title={t("gesture.view")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      {t("gesture.view")}
                    </button>
                    <button
                      className={`${styles.gestureActionBtn} ${styles.gestureActionEdit}`}
                      disabled={isSystem}
                      onClick={() => {
                        onShowEditor(g, false, {
                          name: g.name,
                          duration: g.duration,
                          lookAtX: g.lookAtX,
                          lookAtY: g.lookAtY,
                          tilt: g.tilt,
                          targetJson: g.targetJson,
                        });
                      }}
                      title={isSystem ? "系统动作不可编辑" : t("gesture.edit")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      {t("gesture.edit")}
                    </button>
                    <button
                      className={`${styles.gestureActionBtn} ${styles.gestureActionDelete}`}
                      disabled={isSystem}
                      onClick={async () => {
                        if (confirm(`删除动作「${g.name}」吗？`)) {
                          await invoke("delete_avatar_gesture", { id: g.id });
                          onRefresh();
                        }
                      }}
                      title={isSystem ? "系统动作不可删除" : t("gesture.delete")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      {t("gesture.delete")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
