import styles from "@pages/studio/StudioPanel.module.css";
import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { OfficeScene3D, GameMember, WorkflowStep, MemberStatus } from "./office3d/OfficeScene3D";
import * as THREE from "three";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { useI18n } from "../contexts/I18nContext";

interface OfficeMember {
  id: string;
  name: string;
  icon: string;
  color: string;
  isWorking: boolean;
  status?: "working" | "idle" | "waiting_approval";
  preset?: string;
  roleId?: string;
}

interface VirtualOfficeProps {
  members: OfficeMember[];
  workflows?: WorkflowStep[];
  officeTheme?: string;
  officeLayout?: string;
  onSpeak: (memberId: string, text: string) => void;
  onDeliverComplete?: (fromRoleId: string, toRoleId: string, artifactType: string) => void;
}

export interface VirtualOfficeHandle {
  deliverArtifact: (fromMemberId: string, toMemberId: string, artifactType: string) => void;
  deliverByRoles: (fromRoleId: string, toRoleId: string, artifactType: string) => void;
  setMemberStatusByRoleId: (roleId: string, status: MemberStatus) => void;
}

const VirtualOfficeInner = forwardRef<VirtualOfficeHandle, VirtualOfficeProps>(
  function VirtualOfficeInner(
    { members, workflows, officeTheme, officeLayout, onSpeak, onDeliverComplete },
    ref
  ) {
    const { t } = useI18n();
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<OfficeScene3D | null>(null);
    const isComposingRef = useRef(false);
    const lastCompositionEndRef = useRef(0);
    const [speakingMember, setSpeakingMember] = useState<string | null>(null);
    const [speakText, setSpeakText] = useState("");
    const [zoneInfo, setZoneInfo] = useState<string | null>(null);
    const [selectedMember, setSelectedMember] = useState<string | null>(null);
    const [panelCollapsed, setPanelCollapsed] = useState(false);

    const toGM = useCallback(
      (ms: OfficeMember[]): GameMember[] =>
        ms.map((m) => ({
          id: m.id,
          name: m.name,
          color: m.color,
          isWorking: m.isWorking,
          roleId: m.roleId,
          status: m.status,
        })),
      []
    );

    useImperativeHandle(
      ref,
      () => ({
        deliverArtifact(fromMemberId: string, toMemberId: string, artifactType: string) {
          sceneRef.current?.deliverArtifact(fromMemberId, toMemberId, artifactType);
        },
        deliverByRoles(fromRoleId: string, toRoleId: string, artifactType: string) {
          sceneRef.current?.deliverByRoles(fromRoleId, toRoleId, artifactType);
        },
        setMemberStatusByRoleId(roleId: string, status: MemberStatus) {
          sceneRef.current?.setMemberStatusByRoleId(roleId, status);
        },
      }),
      []
    );

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      let dead = false;

      const init = () => {
        if (sceneRef.current || dead) return;
        if (el.clientWidth === 0 || el.clientHeight === 0) return;
        const scene = new OfficeScene3D(el, toGM(members), officeTheme, officeLayout);
        scene.onZoneClick = (z) => {
          setZoneInfo(z.label);
          setSelectedMember(null);
          setTimeout(() => setZoneInfo(null), 2000);
        };
        scene.onSpeak = (id, txt) => onSpeak(id, txt);
        scene.onDeliverComplete = (fromRoleId, toRoleId, artifactType) => {
          onDeliverComplete?.(fromRoleId, toRoleId, artifactType);
        };
        scene.onMemberClick = (memberId) => {
          setSelectedMember((prev) => (prev === memberId ? null : memberId));
        };
        if (workflows && workflows.length > 0) {
          scene.setWorkflows(workflows);
        }
        sceneRef.current = scene;
      };

      if (el.clientHeight > 0 && el.clientWidth > 0) init();
      else {
        const obs = new ResizeObserver((entries) => {
          for (const e of entries) {
            if (e.contentRect.height > 0 && e.contentRect.width > 0 && !sceneRef.current && !dead) {
              obs.disconnect();
              init();
            }
          }
        });
        obs.observe(el);
      }

      return () => {
        dead = true;
        if (sceneRef.current) {
          sceneRef.current.dispose();
          sceneRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      if (sceneRef.current) {
        sceneRef.current.updateMembers(toGM(members));
      }
    }, [members, toGM]);

    useEffect(() => {
      if (sceneRef.current && workflows) {
        sceneRef.current.setWorkflows(workflows);
      }
    }, [workflows]);

    const handleFocusMember = useCallback((memberId: string) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const group = scene.charGroups.get(memberId);
      if (!group) return;
      const pos = new THREE.Vector3();
      group.getWorldPosition(pos);
      scene.camera.position.set(pos.x + 3, 8, pos.z + 6);
      scene.controls.target.set(pos.x, 1, pos.z);
      scene.controls.update();
    }, []);

    const handleSpeak = useCallback(() => {
      if (!speakText.trim()) return;
      const u = members[0];
      if (u) {
        sceneRef.current?.showBubble(u.id, speakText);
        onSpeak(u.id, speakText);
      }
      setSpeakText("");
      setSpeakingMember(null);
    }, [speakText, members, onSpeak]);

    return (
      <div className={styles.virtualOffice3d}>
        <div className={styles.office3dContainer} ref={containerRef} />

        <div
          className={`${styles.memberPanel} ${panelCollapsed ? styles.memberPanelCollapsed : ""}`}
        >
          <div
            className={styles.memberPanelHeader}
            onClick={() => setPanelCollapsed(!panelCollapsed)}
          >
            <span>👥</span>
            <span className={styles.memberPanelTitle}>人员</span>
            <span className={styles.memberPanelCount}>{members.length}</span>
            <span className={styles.memberPanelToggle}>{panelCollapsed ? "▾" : "▴"}</span>
          </div>
          {!panelCollapsed && (
            <div className={styles.memberPanelList}>
              {members.map((m) => (
                <div
                  key={m.id}
                  className={styles.memberPanelItem}
                  onClick={() => handleFocusMember(m.id)}
                  title={m.name}
                >
                  <div
                    className={styles.memberPanelAvatar}
                    style={{ background: m.color || "#6c5ce7" }}
                  >
                    {m.icon || "🤖"}
                  </div>
                  <div className={styles.memberPanelInfo}>
                    <span className={styles.memberPanelName}>{m.name}</span>
                    <span
                      className={styles.memberPanelStatus}
                      data-status={
                        m.status === "working"
                          ? "working"
                          : m.status === "waiting_approval"
                            ? "waiting"
                            : "idle"
                      }
                    >
                      {m.status === "working"
                        ? "忙碌"
                        : m.status === "waiting_approval"
                          ? "待审批"
                          : "空闲"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {zoneInfo && (
          <div className={styles.office3dZoneToast}>
            <span>📍 {zoneInfo}</span>
          </div>
        )}
        {selectedMember &&
          (() => {
            const m = members.find((mb) => mb.id === selectedMember);
            if (!m) return null;
            const statusText =
              m.status === "working" ? "忙碌" : m.status === "waiting_approval" ? "待审批" : "空闲";
            const statusColor =
              m.status === "working"
                ? "#f39c12"
                : m.status === "waiting_approval"
                  ? "#e67e22"
                  : "#27ae60";
            return (
              <div className={styles.office3dMemberInfo} onClick={() => setSelectedMember(null)}>
                <div className={styles.office3dMemberInfoCard} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.office3dMemberInfoHeader}>
                    <div
                      className={styles.office3dMemberInfoAvatar}
                      style={{ background: m.color || "#6c5ce7" }}
                    >
                      {m.icon || "🤖"}
                    </div>
                    <div className={styles.office3dMemberInfoMain}>
                      <span className={styles.office3dMemberInfoName}>{m.name}</span>
                      <span className={styles.office3dMemberInfoRole}>
                        {m.roleId ? `🎯 ${m.roleId}` : "无角色"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.office3dMemberInfoBody}>
                    <div className={styles.office3dMemberInfoRow}>
                      <span className={styles.office3dMemberInfoLabel}>状态</span>
                      <span
                        className={styles.office3dMemberInfoValue}
                        style={{ color: statusColor }}
                      >
                        ● {statusText}
                      </span>
                    </div>
                    <div className={styles.office3dMemberInfoRow}>
                      <span className={styles.office3dMemberInfoLabel}>工位</span>
                      <span className={styles.office3dMemberInfoValue}>
                        {m.isWorking ? "工作中" : "空闲"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        <div className={styles.office3dControls}>
          <button
            className={styles.office3dCtrlBtn}
            onClick={() => {
              const s = sceneRef.current;
              if (s) s.setTimeOfDay(s.tod >= 0.8 ? 0.1 : s.tod + 0.2);
            }}
            title={t("office.switchTime")}
          >
            🌙
          </button>
          <button
            className={styles.office3dCtrlBtn}
            onClick={() => {
              const s = sceneRef.current;
              if (s) {
                s.camera.position.set(FLOOR_W * 0.6, 24, FLOOR_D * 0.9);
                s.controls.target.set(FLOOR_W / 2, 0, FLOOR_D / 2);
                s.controls.update();
              }
            }}
            title={t("office.resetView")}
          >
            🏠
          </button>
        </div>
        {speakingMember && (
          <div className={styles.officeSpeakOverlay} onClick={() => setSpeakingMember(null)}>
            <div className={styles.officeSpeakDialog} onClick={(e) => e.stopPropagation()}>
              <h4>💬 {t("office.speakTitle")}</h4>
              <textarea
                className={styles.officeSpeakTextarea}
                placeholder={t("office.speakPlaceholder")}
                value={speakText}
                onChange={(e) => setSpeakText(e.target.value)}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  lastCompositionEndRef.current = performance.now();
                  queueMicrotask(() => {
                    isComposingRef.current = false;
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    const timeSinceComposition = performance.now() - lastCompositionEndRef.current;
                    if (timeSinceComposition < 100) {
                      return;
                    }
                    if (e.nativeEvent.isComposing || isComposingRef.current) {
                      isComposingRef.current = false;
                      return;
                    }
                    e.preventDefault();
                    handleSpeak();
                  }
                }}
                autoFocus
              />
              <div className={styles.officeSpeakActions}>
                <button className={styles.officeSpeakSend} onClick={handleSpeak}>
                  {t("office.send")}
                </button>
                <button
                  className={styles.officeSpeakCancel}
                  onClick={() => setSpeakingMember(null)}
                >
                  {t("office.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

const FLOOR_W = 16 * 2;
const FLOOR_D = 14 * 2;

const VirtualOfficeWithRef = forwardRef<VirtualOfficeHandle, VirtualOfficeProps>(
  function VirtualOffice(props, ref) {
    const { t } = useI18n();
    return (
      <ErrorBoundary title={t("office.loadError")}>
        <VirtualOfficeInner {...props} ref={ref} />
      </ErrorBoundary>
    );
  }
);

export default VirtualOfficeWithRef;
