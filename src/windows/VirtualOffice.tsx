import styles from "@pages/studio/StudioPanel.module.css";
import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { OfficeScene3D, GameMember, WorkflowStep, MemberStatus } from "./office3d/OfficeScene3D";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { useI18n } from "../contexts/I18nContext";

interface OfficeMember {
  id: string;
  name: string;
  icon: string;
  color: string;
  isWorking: boolean;
  preset?: string;
  roleId?: string;
}

interface VirtualOfficeProps {
  members: OfficeMember[];
  workflows?: WorkflowStep[];
  officeTheme?: string;
  officeLayout?: string;
  onSpeak: (memberId: string, text: string) => void;
  onDeliverComplete?: (fromRoleId: string | null, toRoleId: string, artifactType: string) => void;
}

export interface VirtualOfficeHandle {
  deliverArtifact: (fromMemberId: string, toMemberId: string, artifactType: string) => void;
  deliverByRoles: (fromRoleId: string | null, toRoleId: string, artifactType: string) => void;
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
    const [speakingMember, setSpeakingMember] = useState<string | null>(null);
    const [speakText, setSpeakText] = useState("");
    const [zoneInfo, setZoneInfo] = useState<string | null>(null);

    const toGM = useCallback(
      (ms: OfficeMember[]): GameMember[] =>
        ms.map((m) => ({
          id: m.id,
          name: m.name,
          color: m.color,
          isWorking: m.isWorking,
          roleId: m.roleId,
        })),
      []
    );

    useImperativeHandle(
      ref,
      () => ({
        deliverArtifact(fromMemberId: string, toMemberId: string, artifactType: string) {
          sceneRef.current?.deliverArtifact(fromMemberId, toMemberId, artifactType);
        },
        deliverByRoles(fromRoleId: string | null, toRoleId: string, artifactType: string) {
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
        const scene = new OfficeScene3D(el, toGM(members), officeTheme, officeLayout);
        scene.onZoneClick = (z) => {
          setZoneInfo(z.label);
          setTimeout(() => setZoneInfo(null), 2000);
        };
        scene.onSpeak = (id, txt) => onSpeak(id, txt);
        scene.onDeliverComplete = (fromRoleId, toRoleId, artifactType) => {
          onDeliverComplete?.(fromRoleId, toRoleId, artifactType);
        };
        if (workflows && workflows.length > 0) {
          scene.setWorkflows(workflows);
        }
        sceneRef.current = scene;
      };

      if (el.clientHeight > 0) init();
      else {
        const obs = new ResizeObserver((entries) => {
          for (const e of entries) {
            if (e.contentRect.height > 0 && !sceneRef.current && !dead) {
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
        {zoneInfo && (
          <div className={styles.office3dZoneToast}>
            <span>📍 {zoneInfo}</span>
          </div>
        )}
        <div className={styles.office3dControls}>
          <button
            className={styles.office3dCtrlBtn}
            onClick={() => setSpeakingMember(members[0]?.id || null)}
            title={t("office.speak")}
          >
            🎤
          </button>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
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
