import { useState } from "react";
import projectIcons from "@assets/project-icons";

interface Props {
  value: string;
  onChange: (icon: string) => void;
}

export default function ProjectIconPicker({ value, onChange }: Props) {
  const [showPicker, setShowPicker] = useState(false);

  const selectedIcon = projectIcons.find((p) => p.name === value);
  const isProjectIcon = !!selectedIcon;

  const inputStyle = {
    flex: 1,
    padding: "7px 10px",
    border: "1px solid var(--color-border)",
    borderRight: "none",
    borderRadius: "8px 0 0 8px",
    fontSize: 12,
    background: "var(--color-surface)",
    color: "var(--color-text)",
    outline: "none",
    minWidth: 0,
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 0, width: "100%" }}>
        {isProjectIcon ? (
          <div style={{ ...inputStyle, display: "flex", alignItems: "center", paddingLeft: 10 }}>
            <span
              dangerouslySetInnerHTML={{ __html: selectedIcon.svg }}
              style={{ width: 16, height: 16, display: "flex" }}
            />
          </div>
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="or type emoji"
            style={inputStyle}
          />
        )}
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          style={{
            padding: "0 8px",
            borderRadius: "0 8px 8px 0",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxSizing: "border-box",
          }}
        >
          {selectedIcon ? (
            <span
              dangerouslySetInnerHTML={{ __html: selectedIcon.svg }}
              style={{ width: 16, height: 16, display: "flex" }}
            />
          ) : (
            <span style={{ fontSize: 14 }}>{value || "📚"}</span>
          )}
        </button>
      </div>

      {showPicker && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
            onClick={() => setShowPicker(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              zIndex: 1000,
              background: "#fff",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              padding: 12,
              width: 320,
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(8, 1fr)",
                gap: 4,
              }}
            >
              {projectIcons.map((icon) => (
                <button
                  key={icon.name}
                  type="button"
                  onClick={() => {
                    onChange(icon.name);
                    setShowPicker(false);
                  }}
                  title={icon.label}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    border: icon.name === value ? "2px solid #6366f1" : "2px solid transparent",
                    background: icon.name === value ? "#eef2ff" : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 2,
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (icon.name !== value) {
                      e.currentTarget.style.background = "#f3f4f6";
                      e.currentTarget.style.borderColor = "#d1d5db";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (icon.name !== value) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }
                  }}
                >
                  <span
                    dangerouslySetInnerHTML={{ __html: icon.svg }}
                    style={{ width: 20, height: 20, display: "flex" }}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
