import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

interface ArtifactReviewReminderProps {
  projectId: string;
  onGoToReview: () => void;
}

export default function ArtifactReviewReminder({
  projectId,
  onGoToReview,
}: ArtifactReviewReminderProps) {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const unlisten = listen("artifact_status_changed", (event: any) => {
      const data = event.payload as any;
      if (data.projectId === projectId && data.newStatus === "submitted") {
        setCount((c) => c + 1);
        setVisible(true);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [projectId]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#fff",
        border: "1px solid #e9ecef",
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        padding: "14px 18px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 360,
        animation: "slideInRight 0.3s ease",
      }}
    >
      <span style={{ fontSize: 24 }}>🔔</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>新产物待审核</div>
        <div style={{ fontSize: 12, color: "#888" }}>有 {count} 个产物等待您的审核</div>
      </div>
      <button
        onClick={() => {
          setVisible(false);
          setCount(0);
          onGoToReview();
        }}
        style={{
          padding: "6px 14px",
          background: "#6c5ce7",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        前往审核
      </button>
      <button
        onClick={() => {
          setVisible(false);
        }}
        style={{
          padding: "6px 10px",
          background: "transparent",
          color: "#999",
          border: "1px solid #ddd",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        稍后
      </button>
    </div>
  );
}
