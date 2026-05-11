import { useEffect, useRef, useState, useCallback, Component, useImperativeHandle, forwardRef } from "react";
import { OfficeScene3D, GameMember, WorkflowStep } from "./office3d/OfficeScene3D";

interface OfficeMember {
  id: string;
  name: string;
  icon: string;
  color: string;
  isUser: boolean;
  isWorking: boolean;
  preset?: string;
  roleId?: string;
}

interface VirtualOfficeProps {
  members: OfficeMember[];
  workflows?: WorkflowStep[];
  onSpeak: (memberId: string, text: string) => void;
  onDeliverComplete?: (fromRoleId: string | null, toRoleId: string, artifactType: string) => void;
}

export interface VirtualOfficeHandle {
  deliverArtifact: (fromMemberId: string, toMemberId: string, artifactType: string) => void;
  deliverByRoles: (fromRoleId: string | null, toRoleId: string, artifactType: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: string;
}

class ThreeErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: "#e17055", textAlign: "center" }}>
          <p>3D虚拟办公加载失败</p>
          <p style={{ fontSize: 12, color: "#999" }}>{this.state.error}</p>
          <button style={{ marginTop: 8, padding: "4px 12px", cursor: "pointer" }} onClick={() => this.setState({ hasError: false, error: "" })}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const VirtualOfficeInner = forwardRef<VirtualOfficeHandle, VirtualOfficeProps>(function VirtualOfficeInner({ members, workflows, onSpeak, onDeliverComplete }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficeScene3D | null>(null);
  const [speakingMember, setSpeakingMember] = useState<string | null>(null);
  const [speakText, setSpeakText] = useState("");
  const [zoneInfo, setZoneInfo] = useState<string | null>(null);

  const toGM = useCallback((ms: OfficeMember[]): GameMember[] =>
    ms.map(m => ({ id: m.id, name: m.name, color: m.color, isUser: m.isUser, isWorking: m.isWorking, roleId: m.roleId })), []);

  useImperativeHandle(ref, () => ({
    deliverArtifact(fromMemberId: string, toMemberId: string, artifactType: string) {
      sceneRef.current?.deliverArtifact(fromMemberId, toMemberId, artifactType);
    },
    deliverByRoles(fromRoleId: string | null, toRoleId: string, artifactType: string) {
      sceneRef.current?.deliverByRoles(fromRoleId, toRoleId, artifactType);
    },
  }), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let dead = false;

    const init = () => {
      if (sceneRef.current || dead) return;
      const scene = new OfficeScene3D(el, toGM(members));
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
    const u = members.find(m => m.isUser);
    if (u) {
      sceneRef.current?.showBubble(u.id, speakText);
      onSpeak(u.id, speakText);
    }
    setSpeakText("");
    setSpeakingMember(null);
  }, [speakText, members, onSpeak]);

  return (
    <div className="virtual-office-3d">
      <div className="office3d-container" ref={containerRef} />
      {zoneInfo && <div className="office3d-zone-toast"><span>📍 {zoneInfo}</span></div>}
      <div className="office3d-controls">
        <button className="office3d-ctrl-btn" onClick={() => setSpeakingMember(members.find(m => m.isUser)?.id || null)} title="发言">🎤</button>
        <button className="office3d-ctrl-btn" onClick={() => {
          const s = sceneRef.current;
          if (s) s.setTimeOfDay(s.tod >= 0.8 ? 0.1 : s.tod + 0.2);
        }} title="切换时间">🌙</button>
        <button className="office3d-ctrl-btn" onClick={() => {
          const s = sceneRef.current;
          if (s) {
            s.camera.position.set(FLOOR_W * 0.6, 24, FLOOR_D * 0.9);
            s.controls.target.set(FLOOR_W / 2, 0, FLOOR_D / 2);
            s.controls.update();
          }
        }} title="重置视角">🏠</button>
      </div>
      {speakingMember && (
        <div className="office-speak-overlay" onClick={() => setSpeakingMember(null)}>
          <div className="office-speak-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>💬 发言</h4>
            <textarea className="office-speak-textarea" placeholder="输入你想说的话..." value={speakText} onChange={(e) => setSpeakText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSpeak(); } }} autoFocus />
            <div className="office-speak-actions">
              <button className="office-speak-send" onClick={handleSpeak}>发送</button>
              <button className="office-speak-cancel" onClick={() => setSpeakingMember(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const FLOOR_W = 16 * 2;
const FLOOR_D = 14 * 2;

const VirtualOfficeWithRef = forwardRef<VirtualOfficeHandle, VirtualOfficeProps>((props, ref) => (
  <ThreeErrorBoundary><VirtualOfficeInner {...props} ref={ref} /></ThreeErrorBoundary>
));

export default VirtualOfficeWithRef;
