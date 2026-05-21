import { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AvatarGesture } from "@core/types";

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
      } catch (e) {
        alert("导入失败: " + String(e));
      }
    };
    fileInput.click();
  };

  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="bg-card rounded-xl p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-foreground m-0">{t("gesture.title")}</h3>
          <div className="flex items-center gap-3">
            <button
              className="px-3.5 py-1.5 border border-primary rounded-md bg-transparent text-primary text-xs cursor-pointer transition-all hover:bg-primary/5 whitespace-nowrap"
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
              className="px-3.5 py-1.5 border border-primary rounded-md bg-transparent text-primary text-xs cursor-pointer transition-all hover:bg-primary/5 whitespace-nowrap"
              onClick={handleImportGestureJson}
              title={t("gesture.import")}
            >
              {t("gesture.import")}
            </button>
            <input type="file" ref={gestureFileInputRef} className="hidden" />
          </div>
        </div>
        <div>
          {gestures.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <span className="text-4xl opacity-50">🎭</span>
              <p className="text-[13px] m-0">{t("gesture.empty")}</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {gestures.map((g, index) => {
              const isSystem = g.source === "system";
              return (
                <div
                  key={g.id}
                  className="group flex items-center justify-between px-4 py-3.5 bg-muted/50 border border-border rounded-xl transition-all hover:bg-card hover:border-primary/30 hover:shadow-md hover:-translate-y-px animate-[fadeIn_0.3s_ease_both]"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center text-xl shrink-0">
                      {g.name === "greeting" ? "👋" : g.name === "think" ? "🤔" : "🎭"}
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground leading-tight truncate">{g.name}</span>
                        <span
                          className={`text-[10px] font-medium px-2 py-px rounded-full leading-relaxed tracking-wide shrink-0 ${
                            isSystem
                              ? "bg-sky-500/10 text-sky-500"
                              : "bg-purple-500/10 text-purple-500"
                          }`}
                        >
                          {isSystem ? t("gesture.system") : t("gesture.custom")}
                        </span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          ⏱ {g.duration}ms
                        </span>
                        {(g.lookAtX !== 0 || g.lookAtY !== 0) && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            👁 {g.lookAtX},{g.lookAtY}
                          </span>
                        )}
                        {g.tilt !== 0 && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-orange-500/10 text-orange-600 dark:text-orange-400">
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
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-green-500/10 text-green-600 dark:text-green-400"
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
                  <div className="flex gap-1.5 shrink-0 opacity-0 translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                    <button
                      className="flex items-center gap-1 px-3 py-1.5 border rounded-md text-xs font-medium cursor-pointer transition-all whitespace-nowrap bg-violet-500/5 text-violet-600 dark:text-violet-400 border-violet-500/20 hover:bg-violet-500/15 hover:border-violet-500/40"
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
                      className="flex items-center gap-1 px-3 py-1.5 border rounded-md text-xs font-medium cursor-pointer transition-all whitespace-nowrap bg-sky-500/5 text-sky-600 dark:text-sky-400 border-sky-500/20 hover:bg-sky-500/15 hover:border-sky-500/40 disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none"
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
                      className="flex items-center gap-1 px-3 py-1.5 border rounded-md text-xs font-medium cursor-pointer transition-all whitespace-nowrap bg-transparent text-muted-foreground border-black/5 hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/8 disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none"
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
