import projectIcons from "@assets/project-icons";

interface Props {
  icon: string;
  size?: number;
}

export default function KbIcon({ icon, size = 28 }: Props) {
  const projectIcon = projectIcons.find((p) => p.name === icon);

  if (projectIcon) {
    const sizedSvg = projectIcon.svg.replace("<svg", `<svg width="${size}" height="${size}"`);
    return (
      <span
        dangerouslySetInnerHTML={{ __html: sizedSvg }}
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span style={{ fontSize: size * 0.72, lineHeight: 1, flexShrink: 0 }}>{icon || "📚"}</span>
  );
}
