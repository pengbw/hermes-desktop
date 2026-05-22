export interface ProjectIcon {
  name: string;
  label: string;
  svg: string;
}

const projectIcons: ProjectIcon[] = [
  {
    name: "web",
    label: "Web",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#3B82F6"/><ellipse cx="12" cy="12" rx="4" ry="10" fill="none" stroke="#fff" stroke-width="1.5"/><line x1="2" y1="12" x2="22" y2="12" stroke="#fff" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="22" stroke="#fff" stroke-width="1.5"/></svg>`,
  },
  {
    name: "mobile",
    label: "Mobile",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="1" width="14" height="22" rx="2.5" ry="2.5" fill="#10B981"/><rect x="8" y="3" width="8" height="1.5" rx="0.75" fill="#fff" opacity="0.5"/><rect x="8" y="19" width="8" height="3" rx="1.5" fill="#fff" opacity="0.4"/></svg>`,
  },
  {
    name: "database",
    label: "Database",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="5" rx="8" ry="3" fill="#F97316"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" fill="none" stroke="#F97316" stroke-width="2"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.5"/></svg>`,
  },
  {
    name: "cloud",
    label: "Cloud",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 19C3.46 19 1 16.54 1 13.5S3.46 8 6.5 8c.37 0 .73.04 1.08.11A5.5 5.5 0 0117.5 7a5.5 5.5 0 010 11H6.5z" fill="#0EA5E9"/></svg>`,
  },
  {
    name: "security",
    label: "Security",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="#EF4444"/><path d="M12 22c-4.48-1.1-8-5.62-8-10V7.5l8-4 8 4V12c0 4.38-3.52 8.9-8 10z" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.4"/></svg>`,
  },
  {
    name: "chart",
    label: "Chart",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="12" width="5" height="10" rx="1" fill="#14B8A6"/><rect x="9.5" y="7" width="5" height="15" rx="1" fill="#14B8A6"/><rect x="17" y="3" width="5" height="19" rx="1" fill="#14B8A6"/></svg>`,
  },
  {
    name: "ai",
    label: "AI",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#8B5CF6"/><path d="M8.5 10.5L12 7l3.5 3.5v5L12 19l-3.5-3.5z" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" fill="#fff"/></svg>`,
  },
  {
    name: "document",
    label: "Document",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" fill="#F59E0B"/><path d="M14 2v6h6" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.5"/><rect x="7" y="12" width="8" height="2" rx="0.5" fill="#fff" opacity="0.5"/><rect x="7" y="16" width="5" height="2" rx="0.5" fill="#fff" opacity="0.4"/></svg>`,
  },
  {
    name: "folder",
    label: "Folder",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 4h8l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H2V4z" fill="#EAB308"/></svg>`,
  },
  {
    name: "settings",
    label: "Settings",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3" fill="#6B7280"/><circle cx="12" cy="12" r="3" fill="none" stroke="#6B7280" stroke-width="4"/></svg>`,
  },
  {
    name: "game",
    label: "Game",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="6" width="20" height="12" rx="4" fill="#EC4899"/><circle cx="8" cy="12" r="1.2" fill="#fff"/><circle cx="12" cy="10" r="1.2" fill="#fff"/><circle cx="16" cy="12" r="1.2" fill="#fff"/><rect x="8" y="14.5" width="4" height="1.2" rx="0.6" fill="#fff" opacity="0.6"/></svg>`,
  },
  {
    name: "camera",
    label: "Camera",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="20" height="15" rx="3" fill="#FB7185"/><circle cx="12" cy="12.5" r="4" fill="#fff"/><circle cx="12" cy="12.5" r="2.5" fill="none" stroke="#FB7185" stroke-width="1.2"/></svg>`,
  },
  {
    name: "chat",
    label: "Chat",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="3" width="16" height="13" rx="3" fill="#6366F1"/><polygon points="5.5,19 8,16 11,16" fill="#6366F1"/><polygon points="5.5,19 7,16 10.5,16" fill="#fff" opacity="0.2"/></svg>`,
  },
  {
    name: "search",
    label: "Search",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7" fill="#818CF8"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#818CF8" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  {
    name: "heart",
    label: "Health",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#F43F5E"/></svg>`,
  },
  {
    name: "star",
    label: "Favorite",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="#FBBF24"/></svg>`,
  },
  {
    name: "book",
    label: "Education",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 3h6a4 4 0 014 4v14a2 2 0 00-2-2H4V3z" fill="#92400E"/><path d="M20 3h-6a4 4 0 00-4 4v14a2 2 0 012-2h8V3z" fill="#92400E"/></svg>`,
  },
  {
    name: "music",
    label: "Music",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="17" cy="17" r="5" fill="#A855F7"/><circle cx="17" cy="17" r="2" fill="#fff" opacity="0.4"/><path d="M17 12V5l4 2v5" fill="none" stroke="#A855F7" stroke-width="2.5"/></svg>`,
  },
  {
    name: "video",
    label: "Video",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#DC2626"/><polygon points="10,8 17,12 10,16" fill="#fff"/></svg>`,
  },
  {
    name: "cart",
    label: "Commerce",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="20" r="2" fill="#EA580C"/><circle cx="18" cy="20" r="2" fill="#EA580C"/><path d="M2 3h3l2.5 12H19l3-8H7" fill="none" stroke="#EA580C" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  {
    name: "map",
    label: "Location",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#22C55E"/><circle cx="12" cy="9" r="3" fill="#fff"/></svg>`,
  },
  {
    name: "calendar",
    label: "Calendar",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="20" height="18" rx="3" fill="#3B82F6"/><rect x="2" y="4" width="20" height="6" rx="3" fill="#2563EB"/><rect x="6" y="14" width="4" height="3" rx="0.5" fill="#fff" opacity="0.5"/><rect x="14" y="14" width="4" height="3" rx="0.5" fill="#fff" opacity="0.5"/></svg>`,
  },
  {
    name: "mail",
    label: "Mail",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="20" height="14" rx="3" fill="#38BDF8"/><polyline points="3,6 12,14 21,6" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.5"/></svg>`,
  },
  {
    name: "users",
    label: "Team",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="7" r="4" fill="#0D9488"/><path d="M1 20v-1a7 7 0 017-7h2a7 7 0 017 7v1" fill="#0D9488"/><circle cx="15" cy="7" r="3" fill="#0D9488"/><path d="M13 13h2a5.5 5.5 0 015.5 5.5V20" fill="none" stroke="#0D9488" stroke-width="2"/></svg>`,
  },
  {
    name: "idea",
    label: "Idea",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 18h6M10 22h4" stroke="#EAB308" stroke-width="2" stroke-linecap="round"/><path d="M12 2C8.5 2 5 4.5 5 9c0 2.5 1 4 2 5.5V16h10v-1.5c1-1.5 2-3 2-5.5 0-4.5-3.5-7-7-7z" fill="#FACC15"/></svg>`,
  },
  {
    name: "rocket",
    label: "Rocket",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l-3 9h6l-3-9z" fill="#EF4444"/><circle cx="18" cy="18" r="4" fill="#EF4444"/><circle cx="6" cy="18" r="4" fill="#EF4444"/><rect x="10" y="12" width="4" height="2" rx="1" fill="#EF4444"/></svg>`,
  },
  {
    name: "package",
    label: "Package",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7v10l10 5 10-5V7L12 2z" fill="#B45309"/><path d="M12 2v20" stroke="#fff" stroke-width="1" opacity="0.3"/><path d="M2 7l10 5 10-5" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/></svg>`,
  },
  {
    name: "palette",
    label: "Design",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#F472B6"/><circle cx="8" cy="9" r="2" fill="#fff" opacity="0.7"/><circle cx="16" cy="9" r="2" fill="#fff" opacity="0.7"/><path d="M12 22A10 10 0 0110 3" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.3"/><ellipse cx="12" cy="17" rx="4" ry="2.5" fill="#fff" opacity="0.6"/></svg>`,
  },
  {
    name: "terminal",
    label: "Terminal",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="20" height="16" rx="3" fill="#1E293B"/><polyline points="7,10 10,13 7,16" fill="none" stroke="#22D3EE" stroke-width="1.5" stroke-linecap="round"/><line x1="13" y1="16" x2="17" y2="16" stroke="#22D3EE" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  },
  {
    name: "git",
    label: "Git",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3" fill="#EA580C"/><circle cx="19" cy="5" r="3" fill="#EA580C"/><circle cx="12" cy="18" r="3" fill="#EA580C"/><line x1="7.5" y1="6.5" x2="10.5" y2="15.5" stroke="#EA580C" stroke-width="2"/><line x1="16.5" y1="6.5" x2="13.5" y2="15.5" stroke="#EA580C" stroke-width="2"/></svg>`,
  },
  {
    name: "home",
    label: "Home",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 10l9-7 9 7v11a1 1 0 01-1 1H4a1 1 0 01-1-1V10z" fill="#92400E"/><rect x="9" y="15" width="6" height="7" fill="#fff" opacity="0.3"/></svg>`,
  },
  {
    name: "flask",
    label: "Science",
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6M10 3v5l-5 12a2 2 0 002 2h10a2 2 0 002-2l-5-12V3" fill="none" stroke="#A855F7" stroke-width="2"/><ellipse cx="12" cy="16" rx="6" ry="5" fill="#C084FC"/></svg>`,
  },
];

export default projectIcons;
