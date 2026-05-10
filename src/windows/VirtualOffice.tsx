import { useState, useEffect, useRef, useCallback } from "react";

interface OfficeMember {
  id: string;
  name: string;
  icon: string;
  color: string;
  isUser: boolean;
  isWorking: boolean;
  preset?: string;
}

interface VirtualOfficeProps {
  members: OfficeMember[];
  onSpeak: (memberId: string, text: string) => void;
}

const PRESET_ICONS: Record<string, string> = {
  office_worker: "📋", explorer: "🔍", scholar: "📊", creative: "📝",
  artist: "🎨", architect: "🏗️", coder: "💻", engineer: "⚙️",
  tester: "🧪", boss: "👤",
};

const DESK_POSITIONS = [
  { x: 15, y: 20 },
  { x: 40, y: 20 },
  { x: 65, y: 20 },
  { x: 15, y: 55 },
  { x: 40, y: 55 },
  { x: 65, y: 55 },
  { x: 15, y: 85 },
  { x: 40, y: 85 },
  { x: 65, y: 85 },
];

export default function VirtualOffice({ members, onSpeak }: VirtualOfficeProps) {
  const [bubbles, setBubbles] = useState<Map<string, string>>(new Map());
  const [speakingMember, setSpeakingMember] = useState<string | null>(null);
  const [speakText, setSpeakText] = useState("");
  const bubbleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showBubble = useCallback((memberId: string, text: string) => {
    setBubbles((prev) => {
      const next = new Map(prev);
      next.set(memberId, text);
      return next;
    });

    if (bubbleTimers.current.has(memberId)) {
      clearTimeout(bubbleTimers.current.get(memberId)!);
    }

    const timer = setTimeout(() => {
      setBubbles((prev) => {
        const next = new Map(prev);
        next.delete(memberId);
        return next;
      });
      bubbleTimers.current.delete(memberId);
    }, 5000);

    bubbleTimers.current.set(memberId, timer);
  }, []);

  useEffect(() => {
    return () => {
      bubbleTimers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const handleUserSpeak = () => {
    if (!speakText.trim()) return;
    const userMember = members.find((m) => m.isUser);
    if (userMember) {
      showBubble(userMember.id, speakText);
      onSpeak(userMember.id, speakText);
    }
    setSpeakText("");
    setSpeakingMember(null);
  };

  const getMemberIcon = (member: OfficeMember) => {
    if (member.isUser) return "👤";
    if (member.preset && PRESET_ICONS[member.preset]) return PRESET_ICONS[member.preset];
    return member.icon || "🤖";
  };

  return (
    <div className="virtual-office">
      <div className="office-floor">
        <div className="office-wall-back" />
        <div className="office-wall-left" />
        <div className="office-wall-right" />

        <div className="office-whiteboard">
          <span className="office-whiteboard-text">📋 项目看板</span>
        </div>

        {members.map((member, index) => {
          const pos = DESK_POSITIONS[index % DESK_POSITIONS.length];
          const bubble = bubbles.get(member.id);
          return (
            <div
              key={member.id}
              className="office-desk-unit"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className="office-desk" style={{ borderColor: member.color }}>
                <div className="office-monitor">
                  <div
                    className={`office-screen ${member.isWorking ? "screen-active" : ""}`}
                    style={{ borderColor: member.color }}
                  >
                    <span className="office-screen-icon">{member.isWorking ? "⚡" : "💤"}</span>
                  </div>
                </div>
              </div>
              <div
                className="office-character"
                style={{ borderColor: member.color, background: `${member.color}22` }}
              >
                <span className="office-character-icon">{getMemberIcon(member)}</span>
                {member.isUser && <span className="office-character-you">YOU</span>}
                {member.isWorking && <span className="office-working-indicator" />}
              </div>
              <span className="office-character-name" style={{ color: member.color }}>
                {member.name}
              </span>

              {bubble && (
                <div className="office-speech-bubble">
                  <p>{bubble}</p>
                </div>
              )}

              {member.isUser && (
                <button
                  className="office-speak-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSpeakingMember(speakingMember === member.id ? null : member.id);
                  }}
                >
                  🎤
                </button>
              )}
            </div>
          );
        })}
      </div>

      {speakingMember && (
        <div className="office-speak-overlay" onClick={() => setSpeakingMember(null)}>
          <div className="office-speak-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>💬 发言</h4>
            <textarea
              className="office-speak-textarea"
              placeholder="输入你想说的话..."
              value={speakText}
              onChange={(e) => setSpeakText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleUserSpeak();
                }
              }}
              autoFocus
            />
            <div className="office-speak-actions">
              <button className="office-speak-send" onClick={handleUserSpeak}>
                发送
              </button>
              <button className="office-speak-cancel" onClick={() => setSpeakingMember(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
